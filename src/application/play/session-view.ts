import { resolveEvidence, type PlaySession } from "@/domain/play/session";
import { canApplyCorrectiveRescue, M1_MAX_TURNS, selectRepresentativeEvidence } from "@/domain/play/policy";

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

export function toPublicSessionView(session: PlaySession): PublicSessionView {
  const representativeEvidence = session.lockEvidence
    ?? (session.status === "LOCKABLE" ? selectRepresentativeEvidence(session) : undefined);
  return {
    id: session.id,
    status: session.status,
    stage: session.stage,
    turnCount: session.turnCount,
    maxTurns: M1_MAX_TURNS,
    correctiveRescueAvailable: canApplyCorrectiveRescue(session),
    thoughts: session.thoughts,
    guidance: session.guidance,
    ...(representativeEvidence ? { representativeThought: resolveEvidence(session, representativeEvidence) } : {}),
    revealCompleted: session.revealCompleted,
  };
}
