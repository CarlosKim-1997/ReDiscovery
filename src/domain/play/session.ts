import type { AttemptType, NodeStatus, PlayStage, PlayStatus } from "./vocabulary";

export interface SubmittedThought {
  readonly id: string;
  readonly turn: number;
  readonly stage: PlayStage;
  readonly text: string;
}

export interface EvidenceRef {
  readonly answerId: string;
  readonly spanStart: number;
  readonly spanEnd: number;
}

export interface NodeDiscovery {
  readonly nodeId: string;
  readonly status: NodeStatus;
  readonly firstStage?: PlayStage;
  readonly evidence?: EvidenceRef;
  readonly contradictionEvidence?: EvidenceRef;
}

export interface GuidanceEvent {
  readonly stage: Exclude<PlayStage, "BLIND">;
  readonly key: string;
  readonly text: string;
}

export interface PlaySession {
  readonly id: string;
  readonly dailyId: string;
  readonly contentVersionId: string;
  readonly anonymousDeviceId: string;
  readonly attemptType: AttemptType;
  readonly status: PlayStatus;
  readonly stage: PlayStage;
  readonly turnCount: number;
  readonly thoughts: readonly SubmittedThought[];
  readonly discoveries: readonly NodeDiscovery[];
  readonly guidance: readonly GuidanceEvent[];
  readonly lockEvidence?: EvidenceRef;
  readonly revealCompleted: boolean;
  readonly stateVersion: number;
}

export function createPlaySession(input: { id: string; dailyId: string; contentVersionId: string; anonymousDeviceId: string; nodeIds: readonly string[] }): PlaySession {
  return {
    id: input.id,
    dailyId: input.dailyId,
    contentVersionId: input.contentVersionId,
    anonymousDeviceId: input.anonymousDeviceId,
    attemptType: "OFFICIAL",
    status: "THINKING",
    stage: "BLIND",
    turnCount: 0,
    thoughts: [],
    discoveries: input.nodeIds.map((nodeId) => ({ nodeId, status: "ABSENT" })),
    guidance: [],
    revealCompleted: false,
    stateVersion: 0,
  };
}

export function resolveEvidence(session: PlaySession, evidence: EvidenceRef): string {
  const thought = session.thoughts.find(({ id }) => id === evidence.answerId);
  if (!thought) throw new Error("EVIDENCE_NOT_FOUND");
  return thought.text.slice(evidence.spanStart, evidence.spanEnd);
}
