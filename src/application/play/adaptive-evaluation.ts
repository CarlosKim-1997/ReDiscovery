import type { ContentVersion } from "@/domain/content/schema";
import { applyJudgeVerdict } from "@/domain/play/policy";
import type { PlaySession, SubmittedThought } from "@/domain/play/session";
import { JudgeExecutionError, type JudgeAttempt } from "@/ports/judge";
import type { DailyGameDeps } from "./daily-game";
import { JudgeVerdictValidationError, validateJudgeVerdict } from "./judge-verdict";
import { toPublicSessionView, type PublicSessionView } from "./session-view";

export class SemanticAiUnavailableError extends Error {
  constructor() { super("SEMANTIC_AI_UNAVAILABLE"); }
}

export class AdaptiveEvaluationPausedError extends Error {
  constructor(readonly session: PublicSessionView) { super("SEMANTIC_FEEDBACK_PAUSED"); }
}

export async function requireSemanticAiReadiness(deps: DailyGameDeps): Promise<void> {
  if (!deps.readiness || await deps.readiness.check() !== "READY") throw new SemanticAiUnavailableError();
}

export async function evaluateAdaptiveAnswer(
  deps: DailyGameDeps, evaluating: PlaySession, content: ContentVersion, thought: SubmittedThought,
) {
  let attempts: readonly JudgeAttempt[] = [];
  let recorded = false;
  let judgeSucceeded = false;
  try {
    const execution = await deps.judge.evaluate({ rubric: content.judgeRubric, currentAnswer: thought.text,
      priorConfirmedState: evaluating.discoveries,
      ...(evaluating.guidance.at(-1)?.text ? { lastGuidance: evaluating.guidance.at(-1)!.text } : {}),
    });
    attempts = execution.attempts;
    let verdict;
    try { verdict = validateJudgeVerdict(execution.verdict, content.judgeRubric, thought.text); }
    catch (error) {
      const failureCategory = error instanceof JudgeVerdictValidationError ? error.category : "STRUCTURED_OUTPUT_INVALID";
      attempts = attempts.map((run, index) => index === attempts.length - 1 ? { ...run, schemaValid: false, resultStatus: "SCHEMA_ERROR", failureCategory } : run);
      throw new JudgeExecutionError(attempts);
    }
    judgeSucceeded = true;
    deps.readiness?.recordSuccess();
    await recordAttempts(deps, evaluating, thought.id, attempts); recorded = true;
    const result = applyJudgeVerdict(evaluating, verdict, content.serverPolicy);
    const next = { ...result.session, stateVersion: evaluating.stateVersion + 1 };
    if (!await deps.store.completeAnswerEvaluation(evaluating.stateVersion, next)) throw new Error("STALE_STATE_VERSION");
    return { outcome: result.outcome, session: toPublicSessionView(next, content.serverPolicy) };
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_STATE_VERSION") throw error;
    const failed = error instanceof JudgeExecutionError ? error.attempts : attempts;
    if (!judgeSucceeded && failed.at(-1)?.resultStatus === "PROVIDER_ERROR") deps.readiness?.recordProviderFailure();
    if (!recorded && failed.length) {
      // Operational recording failure must never delete the persisted answer.
      try { await recordAttempts(deps, evaluating, thought.id, failed); } catch { /* Session still pauses. */ }
    }
    const paused = { ...evaluating, status: "ERROR_RECOVERABLE" as const, stateVersion: evaluating.stateVersion + 1 };
    if (!await deps.store.saveTransition(evaluating.stateVersion, paused)) throw new Error("STALE_STATE_VERSION", { cause: error });
    throw new AdaptiveEvaluationPausedError(toPublicSessionView(paused, content.serverPolicy));
  }
}

export async function resumeAdaptiveEvaluation(deps: DailyGameDeps, deviceId: string, id: string, expectedStateVersion: number) {
  const session = await deps.store.getOwnedSession(id, deviceId);
  if (!session) return undefined;
  if (session.stateVersion !== expectedStateVersion) throw new Error("STALE_STATE_VERSION");
  const content = await deps.store.getContentVersion(session.contentVersionId);
  if (!content || !("adaptive_guidance" in content.serverPolicy) || session.status !== "ERROR_RECOVERABLE") throw new Error("INVALID_SESSION_STATE");
  const pending = session.thoughts.filter(answer => answer.turn === session.turnCount);
  if (pending.length !== 1 || !pending[0]!.text.trim() || session.thoughts.at(-1)?.id !== pending[0]!.id
    || pending[0]!.stage !== session.stage || (session.turnCount !== 1 && session.turnCount !== 2)) throw new Error("INVALID_SESSION_STATE");
  await requireSemanticAiReadiness(deps);
  const evaluating = { ...session, status: "EVALUATING" as const, stateVersion: session.stateVersion + 1 };
  // Existing CAS changes status only; no second INSERT or extra turn on retry.
  if (!await deps.store.saveTransition(session.stateVersion, evaluating)) throw new Error("STALE_STATE_VERSION");
  return evaluateAdaptiveAnswer(deps, evaluating, content, pending[0]!);
}

async function recordAttempts(deps: DailyGameDeps, session: PlaySession, answerId: string, attempts: readonly JudgeAttempt[]) {
  const createdAt = deps.clock.now();
  await deps.store.recordAiRuns(attempts.map(run => ({ ...run, id: deps.identity.randomId(), sessionId: session.id, answerId,
    purpose: "JUDGE", contentVersionId: session.contentVersionId, createdAt,
  })));
}
