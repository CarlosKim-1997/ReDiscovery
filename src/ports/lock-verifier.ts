export const LOCK_SUPPORTS = ["VERIFIED", "INSUFFICIENT"] as const;
export type LockSupport = (typeof LOCK_SUPPORTS)[number];

export interface LockVerifierInput {
  readonly requiredNodes: readonly {
    readonly nodeId: string;
    readonly description: string;
  }[];
  readonly answers: readonly {
    readonly answerId: string;
    readonly text: string;
  }[];
}

export interface UnvalidatedLockVerification {
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly support: LockSupport;
    readonly answerId?: string;
    readonly evidenceText?: string;
  }[];
}

export const LOCK_VERIFIER_FAILURE_CATEGORIES = [
  "STRUCTURED_OUTPUT_INVALID",
  "NODE_SET_INVALID",
  "STATUS_EVIDENCE_INVALID",
  "ANSWER_ID_INVALID",
  "EVIDENCE_NOT_LITERAL",
  "EVIDENCE_NOT_UNIQUE",
] as const;
export type LockVerifierFailureCategory = (typeof LOCK_VERIFIER_FAILURE_CATEGORIES)[number];

export interface LockVerifierAttempt {
  readonly attempt: number;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaValid: boolean;
  readonly resultStatus: "SUCCEEDED" | "PROVIDER_ERROR" | "SCHEMA_ERROR";
  readonly failureCategory?: LockVerifierFailureCategory;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly latencyMs: number;
  readonly providerRequestId?: string;
}

export interface LockVerifierExecution {
  readonly verification: UnvalidatedLockVerification;
  readonly attempts: readonly LockVerifierAttempt[];
}

export class LockVerifierExecutionError extends Error {
  readonly code = "LOCK_VERIFIER_UNAVAILABLE";
  constructor(readonly attempts: readonly LockVerifierAttempt[]) {
    super("LOCK_VERIFIER_UNAVAILABLE");
  }
}

export interface LockVerifierPort {
  verify(input: LockVerifierInput): Promise<LockVerifierExecution>;
}
