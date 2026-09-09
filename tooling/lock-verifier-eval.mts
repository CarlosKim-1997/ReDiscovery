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

type Counts = {
  tp: number;
  fp: number;
  fn: number;
  falsePositiveCaseIds: string[];
  falseNegativeCaseIds: string[];
};
export type ExpectedSupports = Record<string, LockSupport>;
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

export type LockVerifierEvalResult = {
  id: string;
  subset?: string;
  expectedApproval: boolean;
  expectedSupports: ExpectedSupports;
  outcome: "EVALUATED" | "UNAVAILABLE";
  predictedApproval?: boolean;
  predictedSupports?: ExpectedSupports;
};

export const LOCK_VERIFIER_DEVELOPMENT_ACCEPTANCE_CONTRACT = Object.freeze({
  expectedCaseCount: 140,
  approvalPrecision: 1,
  approvalRecallMinimum: 0.85,
  overallVerifiedPrecisionMinimum: 0.95,
  eachRequiredNodeVerifiedPrecisionMinimum: 0.95,
  retryCaseRateMaximum: 0.05,
});

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
const emptyCount = (): Counts => ({ tp: 0, fp: 0, fn: 0, falsePositiveCaseIds: [], falseNegativeCaseIds: [] });
const emptyCounts = (): Record<LockSupport, Counts> => ({ VERIFIED: emptyCount(), INSUFFICIENT: emptyCount() });
function metric(counts: Counts) {
  const precision = ratio(counts.tp, counts.tp + counts.fp);
  const recall = ratio(counts.tp, counts.tp + counts.fn);
  return {
    tp: counts.tp,
    fp: counts.fp,
    fn: counts.fn,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1(precision, recall)),
    false_positive_case_ids: [...new Set(counts.falsePositiveCaseIds)].sort(),
    false_negative_case_ids: [...new Set(counts.falseNegativeCaseIds)].sort(),
  };
}

export function summarizeLockVerifierResults(
  results: readonly LockVerifierEvalResult[],
  requiredNodeIds: readonly string[],
) {
  const evaluated = results.filter((result) => result.outcome === "EVALUATED");
  const unavailable = results.filter((result) => result.outcome === "UNAVAILABLE");
  const perNode = Object.fromEntries(requiredNodeIds.map((nodeId) => [nodeId, emptyCounts()])) as Record<string, Record<LockSupport, Counts>>;
  const total = emptyCounts();

  for (const result of evaluated) {
    if (!result.predictedSupports) throw new Error(`${result.id}: evaluated result lacks predicted supports`);
    for (const nodeId of requiredNodeIds) {
      const expected = result.expectedSupports[nodeId];
      const predicted = result.predictedSupports[nodeId];
      if (!expected || !predicted) throw new Error(`${result.id}: support node mismatch`);
      for (const support of LOCK_SUPPORTS) {
        const global = total[support];
        const node = perNode[nodeId]![support];
        if (expected === support && predicted === support) {
          global.tp += 1;
          node.tp += 1;
        } else if (predicted === support) {
          global.fp += 1;
          node.fp += 1;
          global.falsePositiveCaseIds.push(result.id);
          node.falsePositiveCaseIds.push(result.id);
        } else if (expected === support) {
          global.fn += 1;
          node.fn += 1;
          global.falseNegativeCaseIds.push(result.id);
          node.falseNegativeCaseIds.push(result.id);
        }
      }
    }
  }

  return {
    availability: {
      evaluated_case_count: evaluated.length,
      unavailable_case_count: unavailable.length,
      unavailable_case_ids: unavailable.map(({ id }) => id).sort(),
    },
    approval: approvalMetrics(evaluated),
    support: {
      overall: Object.fromEntries(LOCK_SUPPORTS.map((support) => [support, metric(total[support])])),
      per_node: Object.fromEntries(Object.entries(perNode).map(([nodeId, counts]) => [nodeId, Object.fromEntries(LOCK_SUPPORTS.map((support) => [support, metric(counts[support])]))])),
    },
  };
}

type AcceptanceInput = {
  caseCount: number;
  approval: ReturnType<typeof approvalMetrics>;
  overallVerifiedPrecision: number | null;
  perNodeVerifiedPrecision: Readonly<Record<string, number | null>>;
  requiredRegressionSupportsExactMatch: boolean;
  schemaApplicationValidCount: number;
  unrecoveredVerificationFailureCount: number;
  leakageCount: number;
  retryCaseCount: number;
};

export function buildLockVerifierAcceptance(input: AcceptanceInput) {
  const contract = LOCK_VERIFIER_DEVELOPMENT_ACCEPTANCE_CONTRACT;
  const retryCaseRate = round(ratio(input.retryCaseCount, input.caseCount));
  const perNodePass = Object.fromEntries(Object.entries(input.perNodeVerifiedPrecision).map(([nodeId, precision]) => [
    nodeId,
    precision !== null && precision >= contract.eachRequiredNodeVerifiedPrecisionMinimum,
  ]));
  const hardGates = {
    case_count_equals_140: input.caseCount === contract.expectedCaseCount,
    false_approval_count_equals_0: input.approval.false_approval_count === 0,
    approval_precision_equals_1: input.approval.precision === contract.approvalPrecision,
    approval_recall_at_least_085: input.approval.recall !== null && input.approval.recall >= contract.approvalRecallMinimum,
    overall_verified_precision_at_least_095: input.overallVerifiedPrecision !== null && input.overallVerifiedPrecision >= contract.overallVerifiedPrecisionMinimum,
    each_required_node_verified_precision_at_least_095: {
      per_node: perNodePass,
      pass: Object.values(perNodePass).every(Boolean),
    },
    required_regression_supports_exact_match: input.requiredRegressionSupportsExactMatch,
    schema_application_valid_count_equals_140: input.schemaApplicationValidCount === contract.expectedCaseCount,
    unrecovered_verification_failure_count_equals_0: input.unrecoveredVerificationFailureCount === 0,
    raw_answer_literal_evidence_prompt_provider_payload_leakage_count_equals_0: input.leakageCount === 0,
    retry_case_rate_at_most_005: retryCaseRate !== null && retryCaseRate <= contract.retryCaseRateMaximum,
  };
  const allHardGatesPass = Object.values(hardGates).every((gate) => typeof gate === "boolean" ? gate : gate.pass);
  return {
    contract: {
      case_count_equals: contract.expectedCaseCount,
      false_approval_count_equals: 0,
      approval_precision_equals: contract.approvalPrecision,
      approval_recall_minimum: contract.approvalRecallMinimum,
      overall_verified_precision_minimum: contract.overallVerifiedPrecisionMinimum,
      each_required_node_verified_precision_minimum: contract.eachRequiredNodeVerifiedPrecisionMinimum,
      required_regression_supports_exact_match: true,
      schema_application_valid_count_equals: contract.expectedCaseCount,
      unrecovered_verification_failure_count_equals: 0,
      raw_answer_literal_evidence_prompt_provider_payload_leakage_count_equals: 0,
      retry_case_rate_maximum: contract.retryCaseRateMaximum,
      false_approval_is_non_compensable: true,
      latency_tokens_estimated_cost_are_observational_only: true,
    },
    actual: {
      retry_case_count: input.retryCaseCount,
      retry_case_rate: retryCaseRate,
      schema_application_valid_count: input.schemaApplicationValidCount,
      unrecovered_verification_failure_count: input.unrecoveredVerificationFailureCount,
      leakage_count: input.leakageCount,
    },
    hard_gates: hardGates,
    all_hard_gates_pass: allHardGatesPass,
    development_live_gate: allHardGatesPass ? "PASS" : "FAIL",
  };
}

export function assertLockVerifierReportRedacted(report: unknown, answers: readonly string[]) {
  const forbidden = new Set(["answers", "text", "answerText", "evidenceText", "literalEvidence", "prompt", "rawPrompt", "fullPrompt", "providerPayload", "providerOutput", "providerResponse"]);
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
  const requiredNodeIds = content.SERVER_POLICY.required_nodes;
  const results: LockVerifierEvalResult[] = [];
  const failures: Record<string, unknown>[] = [];
  const failureAttemptCategories = Object.fromEntries(LOCK_VERIFIER_FAILURE_CATEGORIES.map((category) => [category, 0])) as Record<LockVerifierFailureCategory, number>;
  const unrecoveredFailureCategories = Object.fromEntries(LOCK_VERIFIER_FAILURE_CATEGORIES.map((category) => [category, 0])) as Record<LockVerifierFailureCategory, number>;
  const retriedCaseIds = new Set<string>();
  let schemaValidCases = 0, retries = 0, providerFailures = 0;
  let inputTokens = 0, outputTokens = 0, totalTokens = 0;
  const latencies: number[] = [];

  for (const testCase of cases) {
    const expectedApproval = Object.values(testCase.expectedSupports).every((support) => support === "VERIFIED");
    try {
      const execution = await verifier.verify(testCase.input);
      retries += Math.max(0, execution.attempts.length - 1);
      collectAttempts(testCase.id, execution.attempts);
      const verification = validateLockVerification(execution.verification, testCase.input);
      schemaValidCases += 1;
      const predictedSupports = Object.fromEntries(verification.nodes.map(({ nodeId, support }) => [nodeId, support])) as ExpectedSupports;
      const predictedApproval = isLockVerificationApproved(verification);
      results.push({ id: testCase.id, ...(testCase.regressionSubset ? { subset: testCase.regressionSubset } : {}), expectedApproval, expectedSupports: testCase.expectedSupports, outcome: "EVALUATED", predictedApproval, predictedSupports });
    } catch (error) {
      const attempts = error instanceof LockVerifierExecutionError ? error.attempts : [];
      retries += Math.max(0, attempts.length - 1);
      collectAttempts(testCase.id, attempts);
      const category = error instanceof LockVerifierValidationError
        ? error.category
        : [...attempts].reverse().find((attempt) => attempt.failureCategory)?.failureCategory;
      if (category) unrecoveredFailureCategories[category] += 1;
      results.push({ id: testCase.id, ...(testCase.regressionSubset ? { subset: testCase.regressionSubset } : {}), expectedApproval, expectedSupports: testCase.expectedSupports, outcome: "UNAVAILABLE" });
      failures.push({ id: testCase.id, kind: "verification-unavailable", ...(category ? { failureCategory: category } : {}), attempts: attempts.map((attempt) => ({ resultStatus: attempt.resultStatus, ...(attempt.failureCategory ? { failureCategory: attempt.failureCategory } : {}) })) });
    }
  }

  function collectAttempts(caseId: string, attempts: readonly { resultStatus: string; failureCategory?: LockVerifierFailureCategory; latencyMs: number; inputTokens?: number; outputTokens?: number; totalTokens?: number }[]) {
    if (attempts.length > 1) retriedCaseIds.add(caseId);
    for (const attempt of attempts) {
      latencies.push(attempt.latencyMs);
      inputTokens += attempt.inputTokens ?? 0;
      outputTokens += attempt.outputTokens ?? 0;
      totalTokens += attempt.totalTokens ?? 0;
      if (attempt.resultStatus === "PROVIDER_ERROR") providerFailures += 1;
      if (attempt.failureCategory) failureAttemptCategories[attempt.failureCategory] += 1;
    }
  }

  const summary = summarizeLockVerifierResults(results, requiredNodeIds);
  const verifiedMetric = summary.support.overall.VERIFIED!;
  const subsetResults = Object.fromEntries(manifest.regression_subsets.map((subset) => {
    const selected = results.filter((result) => result.subset === subset && result.outcome === "EVALUATED");
    return [subset, approvalMetrics(selected)];
  }));
  const knownRegressions = Object.fromEntries(manifest.required_regression_case_ids.map((id) => {
    const result = results.find((item) => item.id === id)!;
    const exactMatch = result.outcome === "EVALUATED"
      && requiredNodeIds.every((nodeId) => result.predictedSupports?.[nodeId] === result.expectedSupports[nodeId]);
    return [id, {
      outcome: result.outcome,
      expected_supports: result.expectedSupports,
      predicted_supports: result.predictedSupports ?? null,
      exact_match: exactMatch,
    }];
  }));
  const requiredRegressionSupportsExactMatch = Object.values(knownRegressions).every(({ exact_match }) => exact_match);
  const retryCaseCount = retriedCaseIds.size;
  const leakageCount = 0;
  const acceptance = buildLockVerifierAcceptance({
    caseCount: cases.length,
    approval: summary.approval,
    overallVerifiedPrecision: verifiedMetric.precision,
    perNodeVerifiedPrecision: Object.fromEntries(requiredNodeIds.map((nodeId) => [nodeId, summary.support.per_node[nodeId]!.VERIFIED!.precision])),
    requiredRegressionSupportsExactMatch,
    schemaApplicationValidCount: schemaValidCases,
    unrecoveredVerificationFailureCount: failures.length,
    leakageCount,
    retryCaseCount,
  });
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
      availability: summary.availability,
      support: summary.support,
      approval: summary.approval,
      regression_subsets: subsetResults,
      required_regression_cases: knownRegressions,
      operational: {
        schema_application_valid_count: schemaValidCases,
        schema_valid_rate: round(ratio(schemaValidCases, cases.length)),
        unrecovered_verification_failure_count: failures.length,
        unrecovered_verification_failure_case_ids: summary.availability.unavailable_case_ids,
        failure_attempt_categories: failureAttemptCategories,
        unrecovered_failure_categories: unrecoveredFailureCategories,
        retry_count: retries,
        retry_case_count: retryCaseCount,
        retry_case_rate: round(ratio(retryCaseCount, cases.length)),
        retried_case_ids: [...retriedCaseIds].sort(),
        provider_failure_attempt_count: providerFailures,
        latency_ms: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: latencies.length ? Math.max(...latencies) : null },
        tokens: { input: inputTokens, output: outputTokens, total: totalTokens },
        estimated_cost_usd: model === manifest.candidate_model ? Number(((inputTokens * manifest.pricing_usd_per_million.input + outputTokens * manifest.pricing_usd_per_million.output) / 1_000_000).toFixed(8)) : null,
        pricing_basis: model === manifest.candidate_model ? manifest.pricing_usd_per_million : null,
      },
      privacy: {
        raw_answer_literal_evidence_prompt_provider_payload_leakage_count: leakageCount,
      },
    },
    acceptance,
    failures,
  };
  assertLockVerifierReportRedacted(report, cases.flatMap(({ input }) => input.answers.map(({ text }) => text)));
  const outputDirectory = path.resolve("artifacts/eval/lock-verifier");
  await mkdir(outputDirectory, { recursive: true });
  const outputFile = path.join(outputDirectory, `${manifest.dataset_version}-${Date.now()}.json`);
  await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Lock verifier ${cases.length} cases | evaluated ${summary.availability.evaluated_case_count} | unavailable ${summary.availability.unavailable_case_count} | VERIFIED precision ${verifiedMetric.precision} | approval ${summary.approval.precision}/${summary.approval.recall} | false approvals ${summary.approval.false_approval_count} | gate ${acceptance.development_live_gate}`);
  console.log(`Report: ${outputFile}`);
}

function approvalMetrics(results: readonly { id: string; expectedApproval: boolean; predictedApproval?: boolean }[]) {
  if (results.some((result) => result.predictedApproval === undefined)) throw new Error("Semantic approval metrics require evaluated results");
  const tp = results.filter((result) => result.expectedApproval && result.predictedApproval).length;
  const fp = results.filter((result) => !result.expectedApproval && result.predictedApproval).length;
  const fn = results.filter((result) => result.expectedApproval && !result.predictedApproval).length;
  const tn = results.filter((result) => !result.expectedApproval && !result.predictedApproval).length;
  const falseApprovals = results.filter((result) => !result.expectedApproval && result.predictedApproval).map(({ id }) => id).sort();
  const falseRejections = results.filter((result) => result.expectedApproval && !result.predictedApproval).map(({ id }) => id).sort();
  return {
    case_count: results.length,
    precision: round(ratio(tp, tp + fp)),
    recall: round(ratio(tp, tp + fn)),
    tp,
    fp,
    fn,
    tn,
    false_approval_count: falseApprovals.length,
    false_approval_case_ids: falseApprovals,
    false_rejection_count: falseRejections.length,
    false_rejection_case_ids: falseRejections,
  };
}

function gitSha() {
  try {
    return execFileSync("git", ["-c", "safe.directory=C:/Users/김성하/Desktop/PJT/ReDiscovery", "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
