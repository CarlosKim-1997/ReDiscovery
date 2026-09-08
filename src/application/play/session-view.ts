import { resolveEvidence, type PlaySession } from "@/domain/play/session";
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
}

export function toPublicSessionView(session: PlaySession, policy: ServerPolicy): PublicSessionView {
  const representativeEvidence = session.lockEvidence
    ?? (session.status === "LOCKABLE" ? selectRepresentativeEvidence(session) : undefined);
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
  };
}
