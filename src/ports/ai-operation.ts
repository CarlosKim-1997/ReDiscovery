import type { PlaySession, SubmittedThought } from "@/domain/play/session";
import type { JudgeAttempt } from "@/ports/judge";

export type JudgeOperationStatus = "EVALUATING" | "RECOVERABLE" | "COMPLETED" | "RECOVERY_EXHAUSTED";
export interface JudgeOperation {
  readonly id: string;
  readonly answerId: string;
  readonly status: JudgeOperationStatus;
  readonly recoveryCount: 0 | 1;
  readonly leaseExpiresAt?: Date;
}
export interface JudgeAdmissionMetadata {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
}
export interface JudgeExecutionOwner {
  readonly session: PlaySession;
  readonly answer: SubmittedThought;
  readonly operation: JudgeOperation;
  readonly runId: string;
}
export type ReserveJudgeResult =
  | { readonly kind: "NEW"; readonly owner: JudgeExecutionOwner }
  | { readonly kind: "REPLAY"; readonly session: PlaySession }
  | { readonly kind: "SESSION_NOT_FOUND" | "IDEMPOTENCY_CONFLICT" | "TURN_ALREADY_SUBMITTED" | "INVALID_SESSION_STATE" | "STALE_STATE_VERSION" | "RECOVERY_EXHAUSTED" };
export interface JudgeOperationStorePort {
  reserveJudgeSubmission(input: {
    readonly sessionId: string; readonly deviceId: string; readonly expectedVersion: number;
    readonly answer: SubmittedThought & { readonly submissionId: string };
    readonly payloadHash: string; readonly operationId: string; readonly runId: string;
    readonly at: Date; readonly leaseDurationMs: number; readonly metadata: JudgeAdmissionMetadata;
  }): Promise<ReserveJudgeResult>;
  reserveJudgeRecovery(input: {
    readonly sessionId: string; readonly deviceId: string; readonly submissionId: string;
    readonly expectedVersion: number; readonly runId: string; readonly at: Date;
    readonly leaseDurationMs: number; readonly metadata: JudgeAdmissionMetadata;
  }): Promise<ReserveJudgeResult>;
  getJudgeOperation(sessionId: string, deviceId: string): Promise<JudgeOperation | undefined>;
  verifyJudgeAdmission(owner: JudgeExecutionOwner, at: Date): Promise<void>;
  admitJudgeRetry(owner: JudgeExecutionOwner, runId: string, at: Date, metadata: JudgeAdmissionMetadata): Promise<void>;
  settleJudgeFailure(owner: JudgeExecutionOwner, runId: string, attempt: JudgeAttempt, ambiguous: boolean, at: Date): Promise<void>;
  pauseJudgeOperation(owner: JudgeExecutionOwner, at: Date): Promise<PlaySession>;
  completeJudgeOperation(owner: JudgeExecutionOwner, runId: string, attempt: JudgeAttempt, next: PlaySession, at: Date): Promise<PlaySession>;
}
