export const PROOF_V3_ENDORSEMENT_STATUSES = [
  "ENDORSED",
  "REJECTED_OR_QUOTED",
  "CONTRADICTED_OR_REPLACED",
  "MIXED_OR_UNRESOLVED",
] as const;
export type ProofV3EndorsementStatus = (typeof PROOF_V3_ENDORSEMENT_STATUSES)[number];

export const PROOF_V3_REFERENCE_STATUSES = [
  "SELF_CONTAINED",
  "UNIQUE_WITHIN_SUPPLIED_EVIDENCE",
  "UNRESOLVED",
  "AMBIGUOUS",
] as const;
export type ProofV3ReferenceStatus = (typeof PROOF_V3_REFERENCE_STATUSES)[number];

export const PROOF_COMPONENT_MATCHES = [
  "COMPLETE_COMPONENT_MATCH",
  "WEAKER_THAN_COMPONENT_REQUIREMENT",
  "PARTIAL_COMPONENT_MATCH",
  "CONTRADICTS_COMPONENT",
  "NO_COMPONENT_SUPPORT",
] as const;
export type ProofComponentMatch = (typeof PROOF_COMPONENT_MATCHES)[number];

export interface LockEvidenceUnitV3 {
  readonly unitId: string;
  readonly answerId: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface LockVerifierV3Input {
  readonly requiredNodes: readonly {
    readonly nodeId: string;
    readonly requiredComponents: readonly {
      readonly componentId: string;
      readonly description: string;
    }[];
  }[];
  readonly answers: readonly { readonly answerId: string; readonly text: string }[];
  readonly evidenceUnits: readonly LockEvidenceUnitV3[];
}

export interface UnvalidatedComponentProof {
  readonly componentId: string;
  readonly endorsementStatus: ProofV3EndorsementStatus;
  readonly referenceStatus: ProofV3ReferenceStatus;
  readonly componentMatch: ProofComponentMatch;
  readonly evidenceUnitIds: readonly string[];
  readonly antecedentEvidenceUnitIds: readonly string[];
}

export interface UnvalidatedNodeProofV3 {
  readonly nodeId: string;
  readonly components: readonly UnvalidatedComponentProof[];
}

export interface UnvalidatedLockProofV3 {
  readonly nodes: readonly UnvalidatedNodeProofV3[];
}

export const LOCK_VERIFIER_V3_FAILURE_CATEGORIES = [
  "STRUCTURED_OUTPUT_INVALID",
  "NODE_SET_INVALID",
  "PROOF_RECORD_INVALID",
  "EVIDENCE_UNIT_INVALID",
] as const;
export type LockVerifierV3FailureCategory = (typeof LOCK_VERIFIER_V3_FAILURE_CATEGORIES)[number];

export const LOCK_PROOF_V3_VALIDATION_REASONS = [
  "DUPLICATE_NODE_ID",
  "UNKNOWN_NODE",
  "MISSING_NODE",
  "DUPLICATE_COMPONENT_ID",
  "UNKNOWN_COMPONENT",
  "MISSING_COMPONENT",
  "DUPLICATE_EVIDENCE_UNIT_ID",
  "DUPLICATE_ANTECEDENT_EVIDENCE_UNIT_ID",
  "EVIDENCE_ANTECEDENT_OVERLAP",
  "COMPLETE_MATCH_EVIDENCE_REQUIRED",
  "SELF_CONTAINED_ANTECEDENT_FORBIDDEN",
  "SELF_CONTAINED_MULTI_ANSWER",
  "NON_UNIQUE_ANTECEDENT_FORBIDDEN",
  "UNIQUE_EVIDENCE_REQUIRED",
  "UNIQUE_ANTECEDENT_REQUIRED",
  "UNIQUE_MULTI_REFERRING_ANSWER",
  "UNIQUE_MULTI_ANTECEDENT_ANSWER",
  "ANTECEDENT_NOT_EARLIER",
  "DUPLICATE_INPUT_ANSWER_ID",
  "DUPLICATE_INPUT_EVIDENCE_UNIT_ID",
  "UNKNOWN_EVIDENCE_UNIT",
  "EVIDENCE_UNIT_SPAN_MISMATCH",
  "EVIDENCE_UNIT_LIST_MISMATCH",
] as const;
export type LockProofV3ValidationReason = (typeof LOCK_PROOF_V3_VALIDATION_REASONS)[number];

export interface RedactedLockProofV3 {
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly components: readonly UnvalidatedComponentProof[];
  }[];
}

export interface LockVerifierV3Attempt {
  readonly attempt: number;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaValid: boolean;
  readonly resultStatus: "SUCCEEDED" | "PROVIDER_ERROR" | "SCHEMA_ERROR";
  readonly failureCategory?: LockVerifierV3FailureCategory;
  readonly validationReason?: LockProofV3ValidationReason;
  readonly rejectedProof?: RedactedLockProofV3;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly latencyMs: number;
  readonly providerRequestId?: string;
}

export interface LockVerifierV3Execution {
  readonly proof: UnvalidatedLockProofV3;
  readonly attempts: readonly LockVerifierV3Attempt[];
}

export class LockVerifierV3ExecutionError extends Error {
  readonly code = "LOCK_VERIFIER_V3_UNAVAILABLE";
  constructor(readonly attempts: readonly LockVerifierV3Attempt[]) {
    super("LOCK_VERIFIER_V3_UNAVAILABLE");
  }
}

export class LockProofV3ValidationError extends Error {
  constructor(
    readonly category: LockVerifierV3FailureCategory,
    readonly reason: LockProofV3ValidationReason,
  ) {
    super(`${category}:${reason}`);
  }
}

export function validateLockProofV3Structure(
  proof: UnvalidatedLockProofV3,
  input: LockVerifierV3Input,
): void {
  const expectedNodes = new Map(input.requiredNodes.map((node) => [node.nodeId, node]));
  const actualNodeIds = proof.nodes.map(({ nodeId }) => nodeId);
  if (new Set(actualNodeIds).size !== actualNodeIds.length) fail("NODE_SET_INVALID", "DUPLICATE_NODE_ID");
  if (actualNodeIds.some((id) => !expectedNodes.has(id))) fail("NODE_SET_INVALID", "UNKNOWN_NODE");
  if ([...expectedNodes.keys()].some((id) => !actualNodeIds.includes(id))) fail("NODE_SET_INVALID", "MISSING_NODE");

  const answerOrder = new Map(input.answers.map(({ answerId }, index) => [answerId, index]));
  if (answerOrder.size !== input.answers.length) fail("EVIDENCE_UNIT_INVALID", "DUPLICATE_INPUT_ANSWER_ID");
  const units = new Map(input.evidenceUnits.map((unit) => [unit.unitId, unit]));
  if (units.size !== input.evidenceUnits.length) fail("EVIDENCE_UNIT_INVALID", "DUPLICATE_INPUT_EVIDENCE_UNIT_ID");
  for (const unit of input.evidenceUnits) {
    const answer = input.answers[answerOrder.get(unit.answerId) ?? -1];
    if (!answer || answer.text.slice(unit.start, unit.end) !== unit.text) {
      fail("EVIDENCE_UNIT_INVALID", "EVIDENCE_UNIT_SPAN_MISMATCH");
    }
  }

  for (const node of proof.nodes) {
    const expectedNode = expectedNodes.get(node.nodeId)!;
    const expectedComponents = new Set(expectedNode.requiredComponents.map(({ componentId }) => componentId));
    const actualComponentIds = node.components.map(({ componentId }) => componentId);
    if (new Set(actualComponentIds).size !== actualComponentIds.length) fail("PROOF_RECORD_INVALID", "DUPLICATE_COMPONENT_ID");
    if (actualComponentIds.some((id) => !expectedComponents.has(id))) fail("PROOF_RECORD_INVALID", "UNKNOWN_COMPONENT");
    if ([...expectedComponents].some((id) => !actualComponentIds.includes(id))) fail("PROOF_RECORD_INVALID", "MISSING_COMPONENT");
    for (const component of node.components) validateComponent(component, units, answerOrder);
  }
}

function validateComponent(
  component: UnvalidatedComponentProof,
  units: ReadonlyMap<string, LockEvidenceUnitV3>,
  answerOrder: ReadonlyMap<string, number>,
) {
  if (new Set(component.evidenceUnitIds).size !== component.evidenceUnitIds.length) fail("PROOF_RECORD_INVALID", "DUPLICATE_EVIDENCE_UNIT_ID");
  if (new Set(component.antecedentEvidenceUnitIds).size !== component.antecedentEvidenceUnitIds.length) fail("PROOF_RECORD_INVALID", "DUPLICATE_ANTECEDENT_EVIDENCE_UNIT_ID");
  if (component.evidenceUnitIds.some((id) => component.antecedentEvidenceUnitIds.includes(id))) fail("PROOF_RECORD_INVALID", "EVIDENCE_ANTECEDENT_OVERLAP");
  const evidence = resolveUnits(component.evidenceUnitIds, units);
  const antecedents = resolveUnits(component.antecedentEvidenceUnitIds, units);
  if (component.componentMatch === "COMPLETE_COMPONENT_MATCH" && evidence.length === 0) fail("PROOF_RECORD_INVALID", "COMPLETE_MATCH_EVIDENCE_REQUIRED");

  if (component.referenceStatus === "SELF_CONTAINED") {
    if (antecedents.length > 0) fail("PROOF_RECORD_INVALID", "SELF_CONTAINED_ANTECEDENT_FORBIDDEN");
    if (evidence.length > 0 && new Set(evidence.map(({ answerId }) => answerId)).size !== 1) fail("PROOF_RECORD_INVALID", "SELF_CONTAINED_MULTI_ANSWER");
    return;
  }
  if (component.referenceStatus !== "UNIQUE_WITHIN_SUPPLIED_EVIDENCE") {
    if (antecedents.length > 0) fail("PROOF_RECORD_INVALID", "NON_UNIQUE_ANTECEDENT_FORBIDDEN");
    return;
  }
  if (evidence.length === 0) fail("PROOF_RECORD_INVALID", "UNIQUE_EVIDENCE_REQUIRED");
  if (antecedents.length === 0) fail("PROOF_RECORD_INVALID", "UNIQUE_ANTECEDENT_REQUIRED");
  if (new Set(evidence.map(({ answerId }) => answerId)).size !== 1) fail("PROOF_RECORD_INVALID", "UNIQUE_MULTI_REFERRING_ANSWER");
  if (new Set(antecedents.map(({ answerId }) => answerId)).size !== 1) fail("PROOF_RECORD_INVALID", "UNIQUE_MULTI_ANTECEDENT_ANSWER");
  const firstReferring = [...evidence].sort((left, right) => compareUnits(left, right, answerOrder))[0]!;
  if (antecedents.some((unit) => compareUnits(unit, firstReferring, answerOrder) >= 0)) fail("PROOF_RECORD_INVALID", "ANTECEDENT_NOT_EARLIER");
}

function compareUnits(
  left: LockEvidenceUnitV3,
  right: LockEvidenceUnitV3,
  answerOrder: ReadonlyMap<string, number>,
) {
  const byAnswer = answerOrder.get(left.answerId)! - answerOrder.get(right.answerId)!;
  if (byAnswer !== 0) return byAnswer;
  const byStart = left.start - right.start;
  if (byStart !== 0) return byStart;
  return left.end - right.end;
}

function resolveUnits(ids: readonly string[], units: ReadonlyMap<string, LockEvidenceUnitV3>) {
  return ids.map((id) => {
    const unit = units.get(id);
    if (!unit) fail("EVIDENCE_UNIT_INVALID", "UNKNOWN_EVIDENCE_UNIT");
    return unit;
  });
}

function fail(category: LockVerifierV3FailureCategory, reason: LockProofV3ValidationReason): never {
  throw new LockProofV3ValidationError(category, reason);
}

export interface LockVerifierV3Port {
  extractProof(input: LockVerifierV3Input): Promise<LockVerifierV3Execution>;
}
