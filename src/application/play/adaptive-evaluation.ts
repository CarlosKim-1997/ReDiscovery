import type { DailyGameDeps } from "./daily-game";
import type { PublicSessionView } from "./session-view";
import { resumeJudgeOperation } from "./judge-operations";

export class SemanticAiUnavailableError extends Error {
  constructor() { super("SEMANTIC_AI_UNAVAILABLE"); }
}
export class AdaptiveEvaluationPausedError extends Error {
  constructor(readonly session: PublicSessionView) { super("SEMANTIC_FEEDBACK_PAUSED"); }
}
export async function requireSemanticAiReadiness(deps: DailyGameDeps): Promise<void> {
  if (!deps.readiness || await deps.readiness.check() !== "READY") throw new SemanticAiUnavailableError();
}
/** Compatibility name; lifecycle is shared by legacy and adaptive content. */
export const resumeAdaptiveEvaluation = resumeJudgeOperation;
