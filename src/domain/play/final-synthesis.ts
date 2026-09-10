import type { PlaySession } from "./session";
import { PlayRuleError } from "./errors";

export type RevealOutcome = "VERIFIED_LEGACY" | "VERIFIED_FINAL_SYNTHESIS" | "UNVERIFIED_REVEAL";

export function completeSynthesisVerification(
  session: PlaySession,
  input: { readonly attemptNumber: 1 | 2; readonly attemptId: string; readonly verified: boolean; readonly evaluatedAt: Date },
): PlaySession {
  if (session.status !== "SYNTHESIZING") throw new PlayRuleError("INVALID_SESSION_STATE");
  if (input.verified) return {
    ...session,
    status: "LOCKED",
    verifiedSynthesisAttemptId: input.attemptId,
    lockedAt: input.evaluatedAt,
  };
  if (input.attemptNumber === 2) return {
    ...session,
    status: "REVEAL_READY",
  };
  return session;
}

export function skipSynthesis(session: PlaySession, skippedAt: Date, activeEvaluation: boolean): PlaySession {
  if (session.status !== "SYNTHESIZING" || activeEvaluation) throw new PlayRuleError("INVALID_SESSION_STATE");
  return { ...session, status: "REVEAL_READY", synthesisSkippedAt: skippedAt };
}

export function deriveRevealOutcome(session: PlaySession): RevealOutcome {
  if (session.lockEvidence) return "VERIFIED_LEGACY";
  if (session.verifiedSynthesisAttemptId) return "VERIFIED_FINAL_SYNTHESIS";
  return "UNVERIFIED_REVEAL";
}
