import { resolveEvidence, type FinalSynthesisAttempt, type PlaySession } from "@/domain/play/session";
import { canApplyCorrectiveRescue, selectRepresentativeEvidence } from "@/domain/play/policy";
import type { ServerPolicy } from "@/domain/content/schema";

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
