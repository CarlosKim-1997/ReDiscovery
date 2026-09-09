import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { approvedContentSchema } from "../src/domain/content/schema.ts";
import {
  isLockVerificationApproved,
  LockVerifierValidationError,
  validateLockVerification,
} from "../src/application/play/lock-verification.ts";
import {
  OpenAILockVerifierAdapter,
  OpenAIResponsesLockVerifierTransport,
} from "../src/adapters/openai-lock-verifier/openai-lock-verifier.ts";
import {
  LOCK_SUPPORTS,
  LOCK_VERIFIER_FAILURE_CATEGORIES,
  LockVerifierExecutionError,
  type LockSupport,
  type LockVerifierFailureCategory,
  type LockVerifierInput,
} from "../src/ports/lock-verifier.ts";
import { LOCK_VERIFIER_PROMPT_VERSION } from "../src/shared/lock-verifier-prompts.ts";
import { contentVersionHash } from "./content-tools.mts";
import { loadCases, loadEvalManifest } from "./judge-eval.mts";

type Counts = { tp: number; fp: number; fn: number };
type ExpectedSupports = Record<string, LockSupport>;
type VerifierCase = {
  id: string;
  source: "single" | "multi";
  regressionSubset?: string;
  input: LockVerifierInput;
  expectedSupports: ExpectedSupports;
  rationale: string;
};
type Manifest = {
  dataset_version: string;
  prompt_version: string;
  content_slug: string;
  content_version: number;
  source_judge_suite: string;
  multi_answer_file: string;
  expected_single_case_count: number;
  expected_multi_case_count: number;
  expected_total_case_count: number;
  candidate_model: string;
  pricing_usd_per_million: { input: number; output: number; checked_at: string };
  regression_subsets: string[];
  required_regression_case_ids: string[];
};
type MultiFixture = {
  id: string;
  answers: { answerId: string; text: string }[];
  expected_supports: ExpectedSupports;
  rationale: string;
};

const suiteRoot = path.resolve("eval/lock-verifier/v1");

export async function loadLockVerifierManifest(directory = suiteRoot): Promise<Manifest> {
  return JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as Manifest;
}

export async function loadLockVerifierCases(directory = suiteRoot): Promise<VerifierCase[]> {
  const manifest = await loadLockVerifierManifest(directory);
  if (manifest.dataset_version !== "lock-verifier-dev-v1" || manifest.prompt_version !== LOCK_VERIFIER_PROMPT_VERSION) {
    throw new Error("Lock verifier manifest identity mismatch");
  }
  const sourceDirectory = path.resolve(directory, manifest.source_judge_suite);
  if (sourceDirectory !== path.resolve("eval/judge/v3")) throw new Error("Lock verifier source must be frozen judge-dev-v3");
  const sourceManifest = await loadEvalManifest(sourceDirectory);
  if (sourceManifest.dataset_version !== "judge-dev-v3" || sourceManifest.content_version !== 3 || sourceManifest.prompt_version !== "judge-v3") {
    throw new Error("Lock verifier source Judge identity mismatch");
  }
  const content = approvedContentSchema.parse(JSON.parse(await readFile(path.resolve("content/approved/conway-law.v3.json"), "utf8")));
  if (content.slug !== manifest.content_slug || content.version !== manifest.content_version) throw new Error("Lock verifier content identity mismatch");
  const required = content.SERVER_POLICY.required_nodes.map((nodeId) => {
    const node = content.JUDGE_RUBRIC.nodes.find(({ id }) => id === nodeId);
    if (!node) throw new Error(`Required node missing from rubric: ${nodeId}`);
    return { nodeId, description: node.description };
  });
  const requiredIds = required.map(({ nodeId }) => nodeId);
  const sourceCases = await loadCases(sourceDirectory);
  const single: VerifierCase[] = sourceCases.map((testCase) => {
    const regressionSubset = testCase.id.startsWith("messy-") ? matchingSubset(testCase.id, manifest.regression_subsets) : undefined;
    return {
      id: testCase.id,
      source: "single",
      ...(regressionSubset ? { regressionSubset } : {}),
      input: { requiredNodes: required, answers: [{ answerId: "answer-1", text: testCase.current_answer }] },
      expectedSupports: Object.fromEntries(requiredIds.map((nodeId) => [nodeId, testCase.expected_node_statuses[nodeId] === "DISCOVERED" ? "VERIFIED" : "INSUFFICIENT"])) as ExpectedSupports,
      rationale: "Mechanically derived from frozen judge-dev-v3 required-node statuses.",
    };
  });
  if (single.length !== manifest.expected_single_case_count) throw new Error("Lock verifier single-answer count mismatch");

  const multiFile = JSON.parse(await readFile(path.join(directory, manifest.multi_answer_file), "utf8")) as { schema_version: number; fixtures: MultiFixture[] };
  if (multiFile.schema_version !== 1) throw new Error("Unsupported lock verifier multi-answer schema");
  const multi: VerifierCase[] = multiFile.fixtures.map((fixture) => {
    validateMultiFixture(fixture, requiredIds);
    return {
      id: fixture.id,
      source: "multi",
      input: { requiredNodes: required, answers: fixture.answers },
      expectedSupports: fixture.expected_supports,
      rationale: fixture.rationale,
    };
  });
  if (multi.length !== manifest.expected_multi_case_count) throw new Error("Lock verifier multi-answer count mismatch");
  const cases = [...single, ...multi];
  if (cases.length !== manifest.expected_total_case_count || new Set(cases.map(({ id }) => id)).size !== cases.length) {
    throw new Error("Lock verifier total case identity mismatch");
  }
  for (const id of manifest.required_regression_case_ids) if (!cases.some((testCase) => testCase.id === id)) throw new Error(`Missing required regression case: ${id}`);
  return cases;
}

function matchingSubset(id: string, subsets: readonly string[]): string | undefined {
  return subsets.find((subset) => id.startsWith(`messy-${subset}-`));
}

function validateMultiFixture(fixture: MultiFixture, requiredIds: readonly string[]) {
  if (!fixture.id.startsWith("multi-") || !fixture.rationale.trim()) throw new Error("Multi-answer fixture requires stable ID and rationale");
  if (fixture.answers.length < 2 || fixture.answers.length > 2) throw new Error(`${fixture.id}: expected exactly two current-session answers`);
  if (new Set(fixture.answers.map(({ answerId }) => answerId)).size !== fixture.answers.length) throw new Error(`${fixture.id}: duplicate answer ID`);
  if (fixture.answers.some(({ answerId, text }) => !answerId.trim() || !text.trim())) throw new Error(`${fixture.id}: empty answer source`);
  if (Object.keys(fixture.expected_supports).sort().join("|") !== [...requiredIds].sort().join("|")) throw new Error(`${fixture.id}: expected support node mismatch`);
  if (Object.values(fixture.expected_supports).some((support) => !LOCK_SUPPORTS.includes(support))) throw new Error(`${fixture.id}: invalid support value`);
}

const ratio = (n: number, d: number) => d === 0 ? null : n / d;
const f1 = (precision: number | null, recall: number | null) => precision === null || recall === null || precision + recall === 0 ? null : 2 * precision * recall / (precision + recall);
const round = (value: number | null) => value === null ? null : Number(value.toFixed(4));
const percentile = (values: number[], q: number) => values.length === 0 ? null : [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(q * values.length) - 1)]!;
const emptyCounts = (): Record<LockSupport, Counts> => ({ VERIFIED: { tp: 0, fp: 0, fn: 0 }, INSUFFICIENT: { tp: 0, fp: 0, fn: 0 } });
function metric(counts: Counts) { const precision = ratio(counts.tp, counts.tp + counts.fp), recall = ratio(counts.tp, counts.tp + counts.fn); return { ...counts, precision: round(precision), recall: round(recall), f1: round(f1(precision, recall)) }; }

export function assertLockVerifierReportRedacted(report: unknown, answers: readonly string[]) {
  const forbidden = new Set(["answers", "text", "answerText", "evidenceText", "literalEvidence", "fullPrompt", "providerOutput", "providerResponse"]);
  const inspect = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.has(key)) throw new Error(`Lock verifier report contains forbidden raw field: ${key}`);
      inspect(nested);
    }
  };
  inspect(report);
  const serialized = JSON.stringify(report);
  for (const answer of answers) if (answer.trim() && serialized.includes(answer)) throw new Error("Lock verifier report contains a raw answer");
}

export async function runLockVerifierEval() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.ADJUDICATION_MODEL;
  if (!apiKey || !model) throw new Error("OPENAI_API_KEY and ADJUDICATION_MODEL are required for real Lock Verifier evaluation");
  const manifest = await loadLockVerifierManifest();
  const cases = await loadLockVerifierCases();
  const content = approvedContentSchema.parse(JSON.parse(await readFile(path.resolve("content/approved/conway-law.v3.json"), "utf8")));
  const verifier = new OpenAILockVerifierAdapter(new OpenAIResponsesLockVerifierTransport(apiKey), model);
  const perNode = Object.fromEntries(content.SERVER_POLICY.required_nodes.map((nodeId) => [nodeId, emptyCounts()])) as Record<string, Record<LockSupport, Counts>>;
  const total = emptyCounts();
  const results: { id: string; subset?: string; expectedApproval: boolean; predictedApproval: boolean; predictedSupports?: ExpectedSupports }[] = [];
  const failures: Record<string, unknown>[] = [];
  const failureCategories = Object.fromEntries(LOCK_VERIFIER_FAILURE_CATEGORIES.map((category) => [category, 0])) as Record<LockVerifierFailureCategory, number>;
  let approvalTp = 0, approvalFp = 0, approvalFn = 0, approvalTn = 0, schemaValidCases = 0, retries = 0, providerFailures = 0;
  let inputTokens = 0, outputTokens = 0, totalTokens = 0;
  const latencies: number[] = [];

  for (const testCase of cases) {
    const expectedApproval = Object.values(testCase.expectedSupports).every((support) => support === "VERIFIED");
    try {
      const execution = await verifier.verify(testCase.input);
      retries += Math.max(0, execution.attempts.length - 1);
      collectAttempts(execution.attempts);
      const verification = validateLockVerification(execution.verification, testCase.input);
      schemaValidCases += 1;
      const predictedSupports = Object.fromEntries(verification.nodes.map(({ nodeId, support }) => [nodeId, support])) as ExpectedSupports;
      const predictedApproval = isLockVerificationApproved(verification);
      recordApproval(expectedApproval, predictedApproval);
      results.push({ id: testCase.id, ...(testCase.regressionSubset ? { subset: testCase.regressionSubset } : {}), expectedApproval, predictedApproval, predictedSupports });
      for (const [nodeId, expected] of Object.entries(testCase.expectedSupports)) {
        const predicted = predictedSupports[nodeId]!;
        for (const support of LOCK_SUPPORTS) {
          const global = total[support], node = perNode[nodeId]![support];
          if (expected === support && predicted === support) { global.tp += 1; node.tp += 1; }
          else if (predicted === support) { global.fp += 1; node.fp += 1; }
          else if (expected === support) { global.fn += 1; node.fn += 1; }
        }
      }
    } catch (error) {
      const attempts = error instanceof LockVerifierExecutionError ? error.attempts : [];
      retries += Math.max(0, attempts.length - 1);
      collectAttempts(attempts);
      const category = error instanceof LockVerifierValidationError ? error.category : undefined;
      if (category) failureCategories[category] += 1;
      recordApproval(expectedApproval, false);
      results.push({ id: testCase.id, ...(testCase.regressionSubset ? { subset: testCase.regressionSubset } : {}), expectedApproval, predictedApproval: false });
      failures.push({ id: testCase.id, kind: "verification-unavailable", ...(category ? { failureCategory: category } : {}), attempts: attempts.map((attempt) => ({ resultStatus: attempt.resultStatus, ...(attempt.failureCategory ? { failureCategory: attempt.failureCategory } : {}) })) });
    }
  }

  function collectAttempts(attempts: readonly { resultStatus: string; failureCategory?: LockVerifierFailureCategory; latencyMs: number; inputTokens?: number; outputTokens?: number; totalTokens?: number }[]) {
    for (const attempt of attempts) {
      latencies.push(attempt.latencyMs);
      inputTokens += attempt.inputTokens ?? 0;
      outputTokens += attempt.outputTokens ?? 0;
      totalTokens += attempt.totalTokens ?? 0;
      if (attempt.resultStatus === "PROVIDER_ERROR") providerFailures += 1;
      if (attempt.failureCategory) failureCategories[attempt.failureCategory] += 1;
    }
  }
  function recordApproval(expected: boolean, predicted: boolean) {
    if (expected && predicted) approvalTp += 1;
    else if (!expected && predicted) approvalFp += 1;
    else if (expected) approvalFn += 1;
    else approvalTn += 1;
  }

  const approvalPrecision = round(ratio(approvalTp, approvalTp + approvalFp));
  const approvalRecall = round(ratio(approvalTp, approvalTp + approvalFn));
  const verifiedMetric = metric(total.VERIFIED);
  const falseApprovals = results.filter((result) => !result.expectedApproval && result.predictedApproval).map(({ id }) => id);
  const falseRejections = results.filter((result) => result.expectedApproval && !result.predictedApproval).map(({ id }) => id);
  const subsetResults = Object.fromEntries(manifest.regression_subsets.map((subset) => {
    const selected = results.filter((result) => result.subset === subset);
    return [subset, approvalMetrics(selected)];
  }));
  const knownRegressions = Object.fromEntries(manifest.required_regression_case_ids.map((id) => {
    const result = results.find((item) => item.id === id)!;
    return [id, { rejected: !result.predictedApproval, predicted_supports: result.predictedSupports ?? null }];
  }));
  const report = {
    timestamp: new Date().toISOString(),
    git_sha: gitSha(),
    dataset_version: manifest.dataset_version,
    content_slug: manifest.content_slug,
    content_version: manifest.content_version,
    content_hash: contentVersionHash(content),
    prompt_version: manifest.prompt_version,
    model,
    case_count: cases.length,
    composition: { single_answer_cases: manifest.expected_single_case_count, multi_answer_cases: manifest.expected_multi_case_count },
    metrics: {
      support: {
        overall: Object.fromEntries(LOCK_SUPPORTS.map((support) => [support, metric(total[support])])),
        per_node: Object.fromEntries(Object.entries(perNode).map(([nodeId, counts]) => [nodeId, Object.fromEntries(LOCK_SUPPORTS.map((support) => [support, metric(counts[support])]))])),
      },
      approval: {
        precision: approvalPrecision,
        recall: approvalRecall,
        tp: approvalTp,
        fp: approvalFp,
        fn: approvalFn,
        tn: approvalTn,
        false_approval_count: falseApprovals.length,
        false_approval_case_ids: falseApprovals,
        false_rejection_count: falseRejections.length,
        false_rejection_case_ids: falseRejections,
      },
      regression_subsets: subsetResults,
      required_regression_cases: knownRegressions,
      operational: {
        schema_valid_rate: round(ratio(schemaValidCases, cases.length)),
        failure_categories: failureCategories,
        retry_count: retries,
        provider_failure_count: providerFailures,
        latency_ms: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: latencies.length ? Math.max(...latencies) : null },
        tokens: { input: inputTokens, output: outputTokens, total: totalTokens },
        estimated_cost_usd: model === manifest.candidate_model ? Number(((inputTokens * manifest.pricing_usd_per_million.input + outputTokens * manifest.pricing_usd_per_million.output) / 1_000_000).toFixed(8)) : null,
        pricing_basis: model === manifest.candidate_model ? manifest.pricing_usd_per_million : null,
      },
    },
    acceptance: {
      false_approvals_zero: falseApprovals.length === 0,
      approval_precision_one: approvalPrecision === 1,
      verified_precision_at_least_098: verifiedMetric.precision !== null && verifiedMetric.precision >= 0.98,
      approval_recall_at_least_085: approvalRecall !== null && approvalRecall >= 0.85,
      ready_for_runtime_design: falseApprovals.length === 0 && approvalPrecision === 1 && verifiedMetric.precision !== null && verifiedMetric.precision >= 0.98 && approvalRecall !== null && approvalRecall >= 0.85,
    },
    failures,
  };
  assertLockVerifierReportRedacted(report, cases.flatMap(({ input }) => input.answers.map(({ text }) => text)));
  const outputDirectory = path.resolve("artifacts/eval/lock-verifier");
  await mkdir(outputDirectory, { recursive: true });
  const outputFile = path.join(outputDirectory, `${manifest.dataset_version}-${Date.now()}.json`);
  await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Lock verifier ${cases.length} cases | VERIFIED precision ${verifiedMetric.precision} | approval ${approvalPrecision}/${approvalRecall} | false approvals ${falseApprovals.length}`);
  console.log(`Report: ${outputFile}`);
}

function approvalMetrics(results: readonly { id: string; expectedApproval: boolean; predictedApproval: boolean }[]) {
  const tp = results.filter((result) => result.expectedApproval && result.predictedApproval).length;
  const fp = results.filter((result) => !result.expectedApproval && result.predictedApproval).length;
  const fn = results.filter((result) => result.expectedApproval && !result.predictedApproval).length;
  return {
    case_count: results.length,
    precision: round(ratio(tp, tp + fp)),
    recall: round(ratio(tp, tp + fn)),
    false_approval_case_ids: results.filter((result) => !result.expectedApproval && result.predictedApproval).map(({ id }) => id),
    false_rejection_case_ids: results.filter((result) => result.expectedApproval && !result.predictedApproval).map(({ id }) => id),
  };
}

function gitSha() {
  try {
    return execFileSync("git", ["-c", "safe.directory=C:/Users/김성하/Desktop/PJT/ReDiscovery", "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
