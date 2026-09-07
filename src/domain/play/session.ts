import type { AttemptType, NodeStatus, PlayStage, PlayStatus } from "./vocabulary";

export const CONWAY_NODE_IDS = Object.freeze([
  "TEAM_BOUNDARIES",
  "COMMUNICATION_FRICTION",
  "DECISION_CLUSTERING",
  "SYSTEM_RESEMBLANCE",
] as const);
export type ConwayNodeId = (typeof CONWAY_NODE_IDS)[number];

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
  readonly nodeId: ConwayNodeId;
  readonly status: NodeStatus;
  readonly firstStage?: PlayStage;
  readonly evidence?: EvidenceRef;
  readonly contradictionEvidence?: EvidenceRef;
}

export interface GuidanceEvent {
  readonly stage: Exclude<PlayStage, "BLIND">;
  readonly text: string;
}

export interface PlaySession {
  readonly id: string;
  readonly attemptType: AttemptType;
  readonly status: PlayStatus;
  readonly stage: PlayStage;
  readonly turnCount: number;
  readonly thoughts: readonly SubmittedThought[];
  readonly discoveries: readonly NodeDiscovery[];
  readonly guidance: readonly GuidanceEvent[];
  readonly lockEvidence?: EvidenceRef;
  readonly revealCompleted: boolean;
}

export function createPlaySession(id: string): PlaySession {
  return {
    id,
    attemptType: "PRACTICE",
    status: "THINKING",
    stage: "BLIND",
    turnCount: 0,
    thoughts: [],
    discoveries: CONWAY_NODE_IDS.map((nodeId) => ({ nodeId, status: "ABSENT" })),
    guidance: [],
    revealCompleted: false,
  };
}

export function resolveEvidence(session: PlaySession, evidence: EvidenceRef): string {
  const thought = session.thoughts.find(({ id }) => id === evidence.answerId);
  if (!thought) throw new Error("EVIDENCE_NOT_FOUND");
  return thought.text.slice(evidence.spanStart, evidence.spanEnd);
}
