import type { AnswerType, Ambiguity, NodeStatus } from "./vocabulary";

export interface JudgeEvidence {
  readonly start: number;
  readonly end: number;
}

export interface JudgeNodeResult {
  readonly nodeId: string;
  readonly status: NodeStatus;
  readonly evidence?: JudgeEvidence;
}

export interface JudgeVerdict {
  readonly answerType: AnswerType;
  readonly ambiguity: Ambiguity;
  readonly nodes: readonly JudgeNodeResult[];
}
