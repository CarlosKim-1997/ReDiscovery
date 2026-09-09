export const PROOF_ENDORSEMENT_STATUSES = [
  "ENDORSED",
  "REJECTED_OR_QUOTED",
  "CONTRADICTED_OR_REPLACED",
  "MIXED_OR_UNRESOLVED",
] as const;
export type ProofEndorsementStatus = (typeof PROOF_ENDORSEMENT_STATUSES)[number];

export const PROOF_REFERENCE_STATUSES = [
  "SELF_CONTAINED",
  "UNIQUE_WITHIN_SUPPLIED_ANSWERS",
  "UNRESOLVED",
  "AMBIGUOUS",
] as const;
export type ProofReferenceStatus = (typeof PROOF_REFERENCE_STATUSES)[number];

export const PROOF_SEMANTIC_MATCHES = [
  "COMPLETE_NODE_MATCH",
  "WEAKER_THAN_NODE_REQUIREMENT",
  "PARTIAL_NODE_MATCH",
  "CONTRADICTS_NODE",
  "NO_NODE_SUPPORT",
] as const;
export type ProofSemanticMatch = (typeof PROOF_SEMANTIC_MATCHES)[number];

export interface LockEvidenceUnit {
  readonly unitId: string;
  readonly answerId: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface LockVerifierV2Input {
  readonly requiredNodes: readonly {
    readonly nodeId: string;
    readonly description: string;
  }[];
  readonly answers: readonly {
    readonly answerId: string;
    readonly text: string;
  }[];
  readonly evidenceUnits: readonly LockEvidenceUnit[];
}

export interface UnvalidatedNodeProof {
  readonly nodeId: string;
  readonly endorsementStatus: ProofEndorsementStatus;
  readonly referenceStatus: ProofReferenceStatus;
  readonly semanticMatch: ProofSemanticMatch;
  readonly evidenceUnitIds: readonly string[];
  readonly antecedentEvidenceUnitIds: readonly string[];
}

export interface UnvalidatedLockProof {
  readonly nodes: readonly UnvalidatedNodeProof[];
}

export const LOCK_VERIFIER_V2_FAILURE_CATEGORIES = [
  "STRUCTURED_OUTPUT_INVALID",
  "NODE_SET_INVALID",
  "PROOF_RECORD_INVALID",
  "EVIDENCE_UNIT_INVALID",
] as const;
export type LockVerifierV2FailureCategory = (typeof LOCK_VERIFIER_V2_FAILURE_CATEGORIES)[number];

export interface LockVerifierV2Attempt {
  readonly attempt: number;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaValid: boolean;
  readonly resultStatus: "SUCCEEDED" | "PROVIDER_ERROR" | "SCHEMA_ERROR";
  readonly failureCategory?: LockVerifierV2FailureCategory;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly latencyMs: number;
  readonly providerRequestId?: string;
}

export interface LockVerifierV2Execution {
  readonly proof: UnvalidatedLockProof;
  readonly attempts: readonly LockVerifierV2Attempt[];
}

export class LockVerifierV2ExecutionError extends Error {
  readonly code = "LOCK_VERIFIER_V2_UNAVAILABLE";
  constructor(readonly attempts: readonly LockVerifierV2Attempt[]) {
    super("LOCK_VERIFIER_V2_UNAVAILABLE");
  }
}

export class LockProofV2ValidationError extends Error {
  constructor(readonly category: LockVerifierV2FailureCategory) {
    super(category);
  }
}

export function validateLockProofV2Structure(
  proof: UnvalidatedLockProof,
  input: LockVerifierV2Input,
): void {
  const expectedNodeIds = input.requiredNodes.map(({ nodeId }) => nodeId);
  const actualNodeIds = proof.nodes.map(({ nodeId }) => nodeId);
  if (
    actualNodeIds.length !== expectedNodeIds.length
    || new Set(actualNodeIds).size !== actualNodeIds.length
    || actualNodeIds.some((id) => !expectedNodeIds.includes(id))
    || expectedNodeIds.some((id) => !actualNodeIds.includes(id))
  ) failProofStructure("NODE_SET_INVALID");

  const answerOrder = new Map(input.answers.map(({ answerId }, index) => [answerId, index]));
  if (answerOrder.size !== input.answers.length) failProofStructure("EVIDENCE_UNIT_INVALID");
  const units = new Map(input.evidenceUnits.map((unit) => [unit.unitId, unit]));
  if (units.size !== input.evidenceUnits.length) failProofStructure("EVIDENCE_UNIT_INVALID");
  for (const unit of input.evidenceUnits) {
    const answer = input.answers[answerOrder.get(unit.answerId) ?? -1];
    if (!answer || answer.text.slice(unit.start, unit.end) !== unit.text) {
      failProofStructure("EVIDENCE_UNIT_INVALID");
    }
  }

  for (const node of proof.nodes) validateNodeProofStructure(node, units, answerOrder);
}

function validateNodeProofStructure(
  node: UnvalidatedNodeProof,
  units: ReadonlyMap<string, LockEvidenceUnit>,
  answerOrder: ReadonlyMap<string, number>,
) {
  if (new Set(node.evidenceUnitIds).size !== node.evidenceUnitIds.length) failProofStructure("PROOF_RECORD_INVALID");
  if (new Set(node.antecedentEvidenceUnitIds).size !== node.antecedentEvidenceUnitIds.length) failProofStructure("PROOF_RECORD_INVALID");
  if (node.evidenceUnitIds.some((id) => node.antecedentEvidenceUnitIds.includes(id))) failProofStructure("PROOF_RECORD_INVALID");
  const evidence = resolveProofUnits(node.evidenceUnitIds, units);
  const antecedents = resolveProofUnits(node.antecedentEvidenceUnitIds, units);
  if (node.semanticMatch === "COMPLETE_NODE_MATCH" && evidence.length === 0) failProofStructure("PROOF_RECORD_INVALID");

  if (node.referenceStatus === "SELF_CONTAINED") {
    if (antecedents.length > 0) failProofStructure("PROOF_RECORD_INVALID");
    if (evidence.length > 0 && new Set(evidence.map(({ answerId }) => answerId)).size !== 1) failProofStructure("PROOF_RECORD_INVALID");
    return;
  }
  if (node.referenceStatus !== "UNIQUE_WITHIN_SUPPLIED_ANSWERS") {
    if (antecedents.length > 0) failProofStructure("PROOF_RECORD_INVALID");
    return;
  }

  if (evidence.length === 0 || antecedents.length === 0) failProofStructure("PROOF_RECORD_INVALID");
  const referringAnswers = new Set(evidence.map(({ answerId }) => answerId));
  const antecedentAnswers = new Set(antecedents.map(({ answerId }) => answerId));
  if (referringAnswers.size !== 1 || antecedentAnswers.size !== 1) failProofStructure("PROOF_RECORD_INVALID");
  const referringAnswer = [...referringAnswers][0]!;
  const antecedentAnswer = [...antecedentAnswers][0]!;
  if (referringAnswer === antecedentAnswer) failProofStructure("PROOF_RECORD_INVALID");
  if (answerOrder.get(antecedentAnswer)! >= answerOrder.get(referringAnswer)!) failProofStructure("PROOF_RECORD_INVALID");
}

function resolveProofUnits(
  ids: readonly string[],
  units: ReadonlyMap<string, LockEvidenceUnit>,
): LockEvidenceUnit[] {
  return ids.map((id) => {
    const unit = units.get(id);
    if (!unit) failProofStructure("EVIDENCE_UNIT_INVALID");
    return unit;
  });
}

function failProofStructure(category: LockVerifierV2FailureCategory): never {
  throw new LockProofV2ValidationError(category);
}

export interface LockVerifierV2Port {
  extractProof(input: LockVerifierV2Input): Promise<LockVerifierV2Execution>;
}
