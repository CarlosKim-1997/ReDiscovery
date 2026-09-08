import type { NodeDiscovery } from "@/domain/play/session";
import type { JudgeRubric } from "@/domain/content/schema";
import type { AnswerType, Ambiguity, NodeStatus } from "@/domain/play/vocabulary";

export interface UnvalidatedJudgeNodeResult {
  readonly nodeId: string;
  readonly status: NodeStatus;
  readonly evidenceText?: string;
}

export interface UnvalidatedJudgeVerdict {
  readonly answerType: AnswerType;
  readonly ambiguity: Ambiguity;
  readonly nodes: readonly UnvalidatedJudgeNodeResult[];
}

export interface JudgeAttempt {
  readonly attempt: number;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaValid: boolean;
  readonly resultStatus: "SUCCEEDED" | "PROVIDER_ERROR" | "SCHEMA_ERROR";
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCost?: string;
  readonly latencyMs: number;
  readonly providerRequestId?: string;
}

export interface JudgeExecution {
  readonly verdict: UnvalidatedJudgeVerdict;
  readonly attempts: readonly JudgeAttempt[];
}

export class JudgeExecutionError extends Error {
  readonly code = "JUDGE_UNAVAILABLE";
  constructor(readonly attempts: readonly JudgeAttempt[]) { super("JUDGE_UNAVAILABLE"); }
}

export interface JudgePort {
  evaluate(input: {
    readonly rubric: JudgeRubric;
    readonly currentAnswer: string;
    readonly priorConfirmedState: readonly NodeDiscovery[];
    readonly lastGuidance?: string;
  }): Promise<JudgeExecution>;
}
