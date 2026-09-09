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

export interface LockVerifierV2Port {
  extractProof(input: LockVerifierV2Input): Promise<LockVerifierV2Execution>;
}
