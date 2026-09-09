import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { approvedContentSchema } from "../src/domain/content/schema.ts";
import { buildLockEvidenceUnits } from "../src/application/play/lock-evidence-units.ts";
import {
  deriveLockVerificationFromProof,
  isDerivedLockVerificationApproved,
  LockProofV2ValidationError,
} from "../src/application/play/lock-proof-v2.ts";
import {
  OpenAILockVerifierV2Adapter,
  OpenAIResponsesLockVerifierV2Transport,
} from "../src/adapters/openai-lock-verifier-v2/openai-lock-verifier-v2.ts";
import {
  LOCK_VERIFIER_V2_FAILURE_CATEGORIES,
  LockVerifierV2ExecutionError,
  type LockVerifierV2FailureCategory,
  type LockVerifierV2Input,
  type UnvalidatedLockProof,
} from "../src/ports/lock-verifier-v2.ts";
import { LOCK_VERIFIER_V2_PROMPT_VERSION } from "../src/shared/lock-verifier-v2-prompts.ts";
import {
  assertLockVerifierReportRedacted,
  loadLockVerifierCases,
  summarizeLockVerifierResults,
  type ExpectedSupports,
  type LockVerifierEvalResult,
} from "./lock-verifier-eval.mts";
import { contentVersionHash } from "./content-tools.mts";

type Category = "reference" | "relation-strength" | "endorsement" | "evidence-format";
type V2Case = {
  id: string;
  source: "inherited-v1" | "targeted-v2";
  category?: Category;
  input: LockVerifierV2Input;
  expectedSupports: ExpectedSupports;
  rationale: string;
};
type V2Manifest = {
  dataset_version: string;
  prompt_version: string;
  content_slug: string;
  content_version: number;
  base_suite: string;
  targeted_cases_file: string;
  expected_inherited_case_count: number;
  expected_targeted_case_count: number;
  expected_total_case_count: number;
  candidate_model: string;
  pricing_usd_per_million: { input: number; output: number; checked_at: string };
  targeted_category_counts: Record<Category, number>;
  required_regression_case_ids: string[];
};
type TargetedFixture = {
  id: string;
  category: Category;
  answers: { answerId: string; text: string }[];
  expected_supports: ExpectedSupports;
  rationale: string;
};

export const LOCK_VERIFIER_V2_DEVELOPMENT_ACCEPTANCE_CONTRACT = Object.freeze({
  expectedCaseCount: 164,
  approvalPrecision: 1,
  approvalRecallMinimum: 0.85,
  overallVerifiedPrecisionMinimum: 0.95,
  eachRequiredNodeVerifiedPrecisionMinimum: 0.95,
  retryCaseRateMaximum: 0.05,
});

const suiteRoot = path.resolve("eval/lock-verifier/v2");
const supports = ["VERIFIED", "INSUFFICIENT"] as const;
const ratio = (n: number, d: number) => d === 0 ? null : n / d;
const round = (n: number | null) => n === null ? null : Number(n.toFixed(4));
const percentile = (values: number[], q: number) => values.length === 0 ? null : [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(q * values.length) - 1)]!;

export async function loadLockVerifierV2Manifest(directory = suiteRoot): Promise<V2Manifest> {
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as V2Manifest;
  if (manifest.dataset_version !== "lock-verifier-dev-v2" || manifest.prompt_version !== LOCK_VERIFIER_V2_PROMPT_VERSION) throw new Error("Lock verifier v2 manifest identity mismatch");
  if (manifest.expected_inherited_case_count !== 140 || manifest.expected_targeted_case_count !== 24 || manifest.expected_total_case_count !== 164) throw new Error("Lock verifier v2 composition mismatch");
  return manifest;
}

export async function loadLockVerifierV2Cases(directory = suiteRoot): Promise<V2Case[]> {
  const manifest = await loadLockVerifierV2Manifest(directory);
  const content = approvedContentSchema.parse(JSON.parse(await readFile(path.resolve("content/approved/conway-law.v3.json"), "utf8")));
  if (content.slug !== manifest.content_slug || content.version !== manifest.content_version) throw new Error("Lock verifier v2 content identity mismatch");
  const requiredNodes = content.SERVER_POLICY.required_nodes.map((nodeId) => ({
    nodeId,
    description: content.JUDGE_RUBRIC.nodes.find((node) => node.id === nodeId)!.description,
  }));
  const requiredIds = requiredNodes.map(({ nodeId }) => nodeId).sort();
  const baseDirectory = path.resolve(directory, manifest.base_suite);
  if (baseDirectory !== path.resolve("eval/lock-verifier/v1")) throw new Error("Lock verifier v2 must inherit frozen v1");
  const inherited = (await loadLockVerifierCases(baseDirectory)).map((testCase): V2Case => ({
    id: testCase.id,
    source: "inherited-v1",
    input: {
      requiredNodes,
      answers: testCase.input.answers,
      evidenceUnits: buildLockEvidenceUnits(testCase.input.answers),
    },
    expectedSupports: testCase.expectedSupports,
    rationale: testCase.rationale,
  }));
  if (inherited.length !== manifest.expected_inherited_case_count) throw new Error("Lock verifier v2 inherited count mismatch");

  const file = JSON.parse(await readFile(path.join(directory, manifest.targeted_cases_file), "utf8")) as { schema_version: number; provenance: string; cases: TargetedFixture[] };
  if (file.schema_version !== 1 || file.provenance !== "failure-taxonomy-derived-development-regressions") throw new Error("Lock verifier v2 targeted provenance mismatch");
  const targeted = file.cases.map((fixture): V2Case => {
    if (!fixture.id.startsWith("v2-") || !fixture.rationale.trim() || fixture.answers.length < 1) throw new Error(`${fixture.id}: invalid targeted fixture`);
    if (new Set(fixture.answers.map(({ answerId }) => answerId)).size !== fixture.answers.length || fixture.answers.some(({ answerId, text }) => !answerId.trim() || !text.trim())) throw new Error(`${fixture.id}: invalid answer source`);
    if (Object.keys(fixture.expected_supports).sort().join("|") !== requiredIds.join("|") || Object.values(fixture.expected_supports).some((value) => !supports.includes(value))) throw new Error(`${fixture.id}: expected support mismatch`);
    return { id: fixture.id, source: "targeted-v2", category: fixture.category, input: { requiredNodes, answers: fixture.answers, evidenceUnits: buildLockEvidenceUnits(fixture.answers) }, expectedSupports: fixture.expected_supports, rationale: fixture.rationale };
  });
  if (targeted.length !== manifest.expected_targeted_case_count) throw new Error("Lock verifier v2 targeted count mismatch");
  for (const [category, count] of Object.entries(manifest.targeted_category_counts)) if (targeted.filter((testCase) => testCase.category === category).length !== count) throw new Error(`Lock verifier v2 ${category} count mismatch`);
  const cases = [...inherited, ...targeted];
  if (cases.length !== manifest.expected_total_case_count || new Set(cases.map(({ id }) => id)).size !== cases.length) throw new Error("Lock verifier v2 total identity mismatch");
  for (const id of manifest.required_regression_case_ids) if (!cases.some((testCase) => testCase.id === id)) throw new Error(`Missing required regression case: ${id}`);
  return cases;
}

type AcceptanceInput = {
  caseCount: number;
  approval: { precision: number | null; recall: number | null; false_approval_count: number };
  overallVerifiedPrecision: number | null;
  perNodeVerifiedPrecision: Record<string, number | null>;
  requiredRegressionSupportsExactMatch: boolean;
  schemaApplicationValidCount: number;
  unrecoveredVerificationFailureCount: number;
  leakageCount: number;
  retryCaseCount: number;
};

export function buildLockVerifierV2Acceptance(input: AcceptanceInput) {
  const contract = LOCK_VERIFIER_V2_DEVELOPMENT_ACCEPTANCE_CONTRACT;
  const retryCaseRate = round(ratio(input.retryCaseCount, input.caseCount));
  const perNode = Object.fromEntries(Object.entries(input.perNodeVerifiedPrecision).map(([id, value]) => [id, value !== null && value >= contract.eachRequiredNodeVerifiedPrecisionMinimum]));
  const hardGates = {
    case_count_equals_164: input.caseCount === contract.expectedCaseCount,
    false_approval_count_equals_0: input.approval.false_approval_count === 0,
    approval_precision_equals_1: input.approval.precision === contract.approvalPrecision,
    approval_recall_at_least_085: input.approval.recall !== null && input.approval.recall >= contract.approvalRecallMinimum,
    overall_verified_precision_at_least_095: input.overallVerifiedPrecision !== null && input.overallVerifiedPrecision >= contract.overallVerifiedPrecisionMinimum,
    each_required_node_verified_precision_at_least_095: { per_node: perNode, pass: Object.values(perNode).every(Boolean) },
    required_regression_supports_exact_match: input.requiredRegressionSupportsExactMatch,
    schema_application_valid_count_equals_164: input.schemaApplicationValidCount === contract.expectedCaseCount,
    unrecovered_verification_failure_count_equals_0: input.unrecoveredVerificationFailureCount === 0,
    raw_answer_prompt_provider_payload_leakage_count_equals_0: input.leakageCount === 0,
    retry_case_rate_at_most_005: retryCaseRate !== null && retryCaseRate <= contract.retryCaseRateMaximum,
  };
  const all = Object.values(hardGates).every((gate) => typeof gate === "boolean" ? gate : gate.pass);
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
      raw_answer_prompt_provider_payload_leakage_count_equals: 0,
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
    all_hard_gates_pass: all,
    development_live_gate: all ? "PASS" : "FAIL",
  };
}

export async function runLockVerifierV2Eval() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.ADJUDICATION_MODEL;
  if (!apiKey || !model) throw new Error("OPENAI_API_KEY and ADJUDICATION_MODEL are required for explicit real Lock Verifier v2 evaluation");
  const manifest = await loadLockVerifierV2Manifest();
  const cases = await loadLockVerifierV2Cases();
  const content = approvedContentSchema.parse(JSON.parse(await readFile(path.resolve("content/approved/conway-law.v3.json"), "utf8")));
  const verifier = new OpenAILockVerifierV2Adapter(new OpenAIResponsesLockVerifierV2Transport(apiKey), model);
  const results: LockVerifierEvalResult[] = [];
  const proofDiagnostics: Record<string, unknown>[] = [];
  const failures: Record<string, unknown>[] = [];
  const failureAttemptCategories = Object.fromEntries(LOCK_VERIFIER_V2_FAILURE_CATEGORIES.map((x) => [x, 0])) as Record<LockVerifierV2FailureCategory, number>;
  const unrecoveredFailureCategories = Object.fromEntries(LOCK_VERIFIER_V2_FAILURE_CATEGORIES.map((x) => [x, 0])) as Record<LockVerifierV2FailureCategory, number>;
  const retriedCaseIds = new Set<string>();
  const latencies: number[] = [];
  let schemaValidCases = 0, retryCount = 0, providerFailures = 0, inputTokens = 0, outputTokens = 0, totalTokens = 0;

  for (const testCase of cases) {
    const expectedApproval = Object.values(testCase.expectedSupports).every((value) => value === "VERIFIED");
    try {
      const execution = await verifier.extractProof(testCase.input);
      collect(testCase.id, execution.attempts);
      const derived = deriveLockVerificationFromProof(execution.proof, testCase.input);
      schemaValidCases += 1;
      const predictedSupports = Object.fromEntries(derived.nodes.map((node) => [node.nodeId, node.support])) as ExpectedSupports;
      const predictedApproval = isDerivedLockVerificationApproved(derived);
      results.push({ id: testCase.id, expectedApproval, expectedSupports: testCase.expectedSupports, outcome: "EVALUATED", predictedApproval, predictedSupports });
      if (Object.keys(testCase.expectedSupports).some((id) => predictedSupports[id] !== testCase.expectedSupports[id])) proofDiagnostics.push(redactedProof(testCase.id, execution.proof));
    } catch (error) {
      const attempts = error instanceof LockVerifierV2ExecutionError ? error.attempts : [];
      collect(testCase.id, attempts);
      const category = error instanceof LockProofV2ValidationError ? error.category : [...attempts].reverse().find((attempt) => attempt.failureCategory)?.failureCategory;
      if (category) unrecoveredFailureCategories[category] += 1;
      results.push({ id: testCase.id, expectedApproval, expectedSupports: testCase.expectedSupports, outcome: "UNAVAILABLE" });
      failures.push({ id: testCase.id, kind: "verification-unavailable", ...(category ? { failureCategory: category } : {}), attempts: attempts.map((attempt) => ({ resultStatus: attempt.resultStatus, ...(attempt.failureCategory ? { failureCategory: attempt.failureCategory } : {}) })) });
    }
  }

  function collect(caseId: string, attempts: readonly { resultStatus: string; failureCategory?: LockVerifierV2FailureCategory; latencyMs: number; inputTokens?: number; outputTokens?: number; totalTokens?: number }[]) {
    retryCount += Math.max(0, attempts.length - 1);
    if (attempts.length > 1) retriedCaseIds.add(caseId);
    for (const attempt of attempts) {
      latencies.push(attempt.latencyMs); inputTokens += attempt.inputTokens ?? 0; outputTokens += attempt.outputTokens ?? 0; totalTokens += attempt.totalTokens ?? 0;
      if (attempt.resultStatus === "PROVIDER_ERROR") providerFailures += 1;
      if (attempt.failureCategory) failureAttemptCategories[attempt.failureCategory] += 1;
    }
  }
  const requiredNodeIds = content.SERVER_POLICY.required_nodes;
  const summary = summarizeLockVerifierResults(results, requiredNodeIds);
  const regressions = Object.fromEntries(manifest.required_regression_case_ids.map((id) => {
    const result = results.find((entry) => entry.id === id)!;
    const exact = result.outcome === "EVALUATED" && requiredNodeIds.every((nodeId) => result.predictedSupports?.[nodeId] === result.expectedSupports[nodeId]);
    return [id, { outcome: result.outcome, expected_supports: result.expectedSupports, predicted_supports: result.predictedSupports ?? null, exact_match: exact }];
  }));
  const leakageCount = 0;
  const acceptance = buildLockVerifierV2Acceptance({ caseCount: cases.length, approval: summary.approval, overallVerifiedPrecision: summary.support.overall.VERIFIED!.precision, perNodeVerifiedPrecision: Object.fromEntries(requiredNodeIds.map((id) => [id, summary.support.per_node[id]!.VERIFIED!.precision])), requiredRegressionSupportsExactMatch: Object.values(regressions).every((x) => x.exact_match), schemaApplicationValidCount: schemaValidCases, unrecoveredVerificationFailureCount: failures.length, leakageCount, retryCaseCount: retriedCaseIds.size });
  const report = {
    timestamp: new Date().toISOString(), git_sha: gitSha(), dataset_version: manifest.dataset_version, prompt_version: manifest.prompt_version, content_slug: manifest.content_slug, content_version: manifest.content_version, content_hash: contentVersionHash(content), model, case_count: cases.length,
    composition: { inherited_v1_cases: manifest.expected_inherited_case_count, targeted_v2_cases: manifest.expected_targeted_case_count, targeted_categories: manifest.targeted_category_counts },
    metrics: { availability: summary.availability, support: summary.support, approval: summary.approval, required_regression_cases: regressions, operational: { schema_application_valid_count: schemaValidCases, unrecovered_verification_failure_count: failures.length, failure_attempt_categories: failureAttemptCategories, unrecovered_failure_categories: unrecoveredFailureCategories, retry_count: retryCount, retry_case_count: retriedCaseIds.size, retry_case_rate: round(ratio(retriedCaseIds.size, cases.length)), retried_case_ids: [...retriedCaseIds].sort(), provider_failure_attempt_count: providerFailures, latency_ms: { p50: percentile(latencies, .5), p95: percentile(latencies, .95), max: latencies.length ? Math.max(...latencies) : null }, tokens: { input: inputTokens, output: outputTokens, total: totalTokens }, estimated_cost_usd: model === manifest.candidate_model ? Number(((inputTokens * manifest.pricing_usd_per_million.input + outputTokens * manifest.pricing_usd_per_million.output) / 1_000_000).toFixed(8)) : null }, privacy: { raw_answer_prompt_provider_payload_leakage_count: leakageCount } },
    proof_diagnostics: proofDiagnostics, acceptance, failures,
  };
  assertLockVerifierReportRedacted(report, cases.flatMap((testCase) => testCase.input.answers.map(({ text }) => text)));
  const outputDirectory = path.resolve("artifacts/eval/lock-verifier-v2");
  await mkdir(outputDirectory, { recursive: true });
  const outputFile = path.join(outputDirectory, `${manifest.dataset_version}-${Date.now()}.json`);
  await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Lock verifier v2 ${cases.length} cases | evaluated ${summary.availability.evaluated_case_count} | unavailable ${summary.availability.unavailable_case_count} | gate ${acceptance.development_live_gate}`);
  console.log(`Report: ${outputFile}`);
}

function redactedProof(id: string, proof: UnvalidatedLockProof) {
  return { id, nodes: proof.nodes.map((node) => ({ nodeId: node.nodeId, endorsementStatus: node.endorsementStatus, referenceStatus: node.referenceStatus, semanticMatch: node.semanticMatch, evidenceUnitIds: node.evidenceUnitIds, antecedentEvidenceUnitIds: node.antecedentEvidenceUnitIds })) };
}
function gitSha() {
  try { return execFileSync("git", ["-c", "safe.directory=C:/Users/김성하/Desktop/PJT/ReDiscovery", "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return null; }
}
