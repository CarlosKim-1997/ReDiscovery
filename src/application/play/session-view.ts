import { resolveEvidence, type FinalSynthesisAttempt, type PlaySession } from "@/domain/play/session";
import { canApplyCorrectiveRescue, selectRepresentativeEvidence } from "@/domain/play/policy";
import type { ServerPolicy } from "@/domain/content/schema";
import { adaptiveFeedback } from "@/domain/play/adaptive-runtime";
import { resolveLearnerState } from "@/domain/play/adaptive-guidance";
import type { GuidanceAction, LearnerState } from "@/domain/play/vocabulary";

export interface PublicSessionView {
  readonly id: string;
  readonly status: PlaySession["status"];
  readonly stage: PlaySession["stage"];
  readonly turnCount: number;
  readonly maxTurns: number;
  readonly correctiveRescueAvailable: boolean;
  readonly thoughts: PlaySession["thoughts"];
  readonly guidance: PlaySession["guidance"];
  readonly representativeThought?: string;
  readonly revealCompleted: boolean;
  readonly stateVersion: number;
  readonly evaluation?: Readonly<{submissionId?: string; inProgress: boolean; paused: boolean; canResume: boolean; recoveryExhausted: boolean}>;
  readonly adaptive?: Readonly<{ learnerState: LearnerState; guidanceAction?: GuidanceAction; targetNode?: string; text?: string; canAnswer: boolean; canReveal: boolean; canResume: boolean; paused: boolean }>;
  readonly synthesis?: Readonly<{
    enabled: true;
    attemptsUsed: number;
    maxSubmissions: number;
    maxChars: number;
    evaluationInProgress: boolean;
    canSubmit: boolean;
    canRetryEvaluation: boolean;
    canSkip: boolean;
    finalRewriteRequired: boolean;
    lastOutcome?: FinalSynthesisAttempt["evaluationState"];
  }>;
}

export function toPublicSessionView(
  session: PlaySession,
  policy: ServerPolicy,
  attempts: readonly FinalSynthesisAttempt[] = [],
  now?: Date,
): PublicSessionView {
  const representativeEvidence = session.lockEvidence
    ?? (session.status === "LOCKABLE" ? selectRepresentativeEvidence(session) : undefined);
  const synthesis = "final_synthesis" in policy
    ? synthesisView(session, policy.final_synthesis, attempts, now)
    : undefined;
  const operation = session.judgeEvaluation;
  const expired = operation?.status === "EVALUATING"
    && Boolean(now && operation.leaseExpiresAt && operation.leaseExpiresAt.getTime() <= now.getTime());
  const paused = operation?.status === "RECOVERABLE" || operation?.status === "RECOVERY_EXHAUSTED" || expired;
  const evaluation: PublicSessionView["evaluation"] = operation ? {
    ...(session.thoughts.at(-1)?.submissionId ? {submissionId: session.thoughts.at(-1)!.submissionId!} : {}),
    inProgress: operation.status === "EVALUATING" && !expired,
    paused,
    canResume: operation.recoveryCount === 0 && (operation.status === "RECOVERABLE" || expired),
    recoveryExhausted: operation.status === "RECOVERY_EXHAUSTED" || (expired && operation.recoveryCount === 1),
  } : undefined;
  return {
    id: session.id,
    status: session.status,
    stage: session.stage,
    turnCount: session.turnCount,
    maxTurns: policy.max_turns,
    correctiveRescueAvailable: canApplyCorrectiveRescue(session, policy),
    thoughts: session.thoughts,
    guidance: session.guidance,
    ...(representativeEvidence ? { representativeThought: resolveEvidence(session, representativeEvidence) } : {}),
    revealCompleted: session.revealCompleted,
    stateVersion: session.stateVersion,
    ...(evaluation ? {evaluation} : {}),
    ...("adaptive_guidance" in policy ? { adaptive: {
      learnerState: resolveLearnerState(session.discoveries, policy),
      ...(session.turnCount > 0 && session.status !== "EVALUATING" && session.status !== "ERROR_RECOVERABLE" ? adaptiveFeedback(session, policy) : {}),
      canAnswer: session.status === "THINKING" && session.turnCount < 2,
      canReveal: session.status === "REVEAL_READY",
      canResume: evaluation?.canResume ?? false,
      paused: evaluation?.paused ?? session.status === "ERROR_RECOVERABLE",
    } } : {}),
    ...(synthesis ? { synthesis } : {}),
  };
}

function synthesisView(
  session: PlaySession,
  policy: Readonly<{ max_chars: number; max_submissions: number }>,
  attempts: readonly FinalSynthesisAttempt[],
  now?: Date,
): NonNullable<PublicSessionView["synthesis"]> {
  const latest = attempts.at(-1);
  const active = latest?.evaluationState === "EVALUATING"
    && (!now || !latest.evaluationLeaseExpiresAt || latest.evaluationLeaseExpiresAt.getTime() > now.getTime());
  const retryable = latest?.evaluationState === "ERROR_RECOVERABLE"
    || (latest?.evaluationState === "EVALUATING" && Boolean(now && latest.evaluationLeaseExpiresAt && latest.evaluationLeaseExpiresAt.getTime() <= now.getTime()));
  const mayCreateSubmission = !latest || latest.evaluationState === "INSUFFICIENT";
  return {
    enabled: true,
    attemptsUsed: attempts.length,
    maxSubmissions: policy.max_submissions,
    maxChars: policy.max_chars,
    evaluationInProgress: Boolean(active),
    canSubmit: session.status === "SYNTHESIZING" && mayCreateSubmission && attempts.length < policy.max_submissions,
    canRetryEvaluation: session.status === "SYNTHESIZING" && Boolean(retryable),
    canSkip: session.status === "SYNTHESIZING" && !active,
    finalRewriteRequired: attempts.length === 1 && latest?.evaluationState === "INSUFFICIENT",
    ...(latest ? { lastOutcome: latest.evaluationState } : {}),
  };
}
