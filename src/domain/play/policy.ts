import type { JudgeVerdict } from "./judgment";
import type { EvidenceRef, GuidanceEvent, NodeDiscovery, PlaySession, SubmittedThought } from "./session";
import { PlayRuleError } from "./errors";

export const M1_MAX_TURNS = 2;

const guidanceCopy = {
  REFLECT: "이미 짚은 소통의 차이를 한 걸음 더 밀어보세요. 그 차이가 설계 결정을 어디에 모이게 할까요?",
  NUDGE: "사람들이 누구와 자주 이야기할 수 있는지 살펴보세요. 그 소통 경계가 설계에 어떤 흔적을 남길까요?",
  CORRECTION: "기술 선택만으로는 반복되는 경계의 모양을 설명하기 어렵습니다. 팀 사이의 소통 비용도 함께 생각해보세요.",
  RESCUE: "팀 안의 소통은 쉽고 팀 사이의 소통은 어렵습니다. 그래서 설계 결정도 팀 경계 안에서 모이고, 결과물의 구조가 조직 구조를 닮을 수 있습니다.",
} as const;

export interface PolicyResult {
  readonly session: PlaySession;
  readonly outcome: "GUIDED" | "LOCKABLE";
}

export function beginEvaluation(session: PlaySession, thought: SubmittedThought): PlaySession {
  if (session.status !== "THINKING") throw new PlayRuleError("INVALID_SESSION_STATE");
  if (thought.text.trim().length === 0) throw new PlayRuleError("EMPTY_THOUGHT");
  return {
    ...session,
    status: "EVALUATING",
    thoughts: [...session.thoughts, thought],
    turnCount: session.turnCount + 1,
  };
}

function mergeDiscoveries(session: PlaySession, verdict: JudgeVerdict, thought: SubmittedThought): readonly NodeDiscovery[] {
  return session.discoveries.map((current) => {
    const incoming = verdict.nodes.find(({ nodeId }) => nodeId === current.nodeId);
    if (!incoming || incoming.status === "ABSENT") return current;
    if (incoming.status === "CONTRADICTED") return { ...current, status: "CONTRADICTED" };
    if (current.status === "DISCOVERED") return current;
    const evidence: EvidenceRef | undefined = incoming.evidence
      ? { answerId: thought.id, spanStart: incoming.evidence.start, spanEnd: incoming.evidence.end }
      : undefined;
    const firstStage = incoming.status === "DISCOVERED" ? thought.stage : current.firstStage;
    return {
      nodeId: current.nodeId,
      status: incoming.status,
      ...(firstStage ? { firstStage } : {}),
      ...(evidence ? { evidence } : {}),
    };
  });
}

function hasEnough(discoveries: readonly NodeDiscovery[]) {
  const discovered = discoveries.filter(({ status }) => status === "DISCOVERED");
  return discovered.length >= 3 && discovered.some(({ nodeId }) => nodeId === "SYSTEM_RESEMBLANCE");
}

function chooseGuidance(session: PlaySession, verdict: JudgeVerdict): Exclude<GuidanceEvent["stage"], never> {
  if (session.turnCount >= M1_MAX_TURNS) return "RESCUE";
  if (verdict.nodes.some(({ status }) => status === "CONTRADICTED")) return "CORRECTION";
  if (verdict.nodes.some(({ status }) => status === "PARTIAL" || status === "DISCOVERED")) return "REFLECT";
  return "NUDGE";
}

export function applyJudgeVerdict(evaluating: PlaySession, verdict: JudgeVerdict): PolicyResult {
  if (evaluating.status !== "EVALUATING") throw new PlayRuleError("INVALID_SESSION_STATE");
  const thought = evaluating.thoughts.at(-1);
  if (!thought) throw new PlayRuleError("INVALID_SESSION_STATE");
  const discoveries = mergeDiscoveries(evaluating, verdict, thought);

  if (hasEnough(discoveries)) {
    return { session: { ...evaluating, discoveries, status: "LOCKABLE" }, outcome: "LOCKABLE" };
  }

  const stage = chooseGuidance(evaluating, verdict);
  const guidance = { stage, text: guidanceCopy[stage] } as const;
  const guidanceEvents = evaluating.guidance.some((event) => event.text === guidance.text)
    ? evaluating.guidance
    : [...evaluating.guidance, guidance];

  if (stage === "RESCUE") {
    return {
      session: { ...evaluating, discoveries, guidance: guidanceEvents, stage, status: "LOCKABLE" },
      outcome: "LOCKABLE",
    };
  }

  return {
    session: { ...evaluating, discoveries, guidance: guidanceEvents, stage, status: "THINKING" },
    outcome: "GUIDED",
  };
}

export function selectRepresentativeEvidence(session: PlaySession): EvidenceRef {
  const strong = [...session.discoveries].reverse().find(({ status, evidence }) => status === "DISCOVERED" && evidence)?.evidence;
  if (strong) return strong;
  const thought = [...session.thoughts].reverse().find(({ text }) => text.trim().length > 0);
  if (!thought) throw new PlayRuleError("INVALID_SESSION_STATE");
  return { answerId: thought.id, spanStart: 0, spanEnd: thought.text.length };
}

export function lockPlaySession(session: PlaySession): PlaySession {
  if (session.status !== "LOCKABLE") throw new PlayRuleError("INVALID_SESSION_STATE");
  return { ...session, status: "LOCKED", lockEvidence: selectRepresentativeEvidence(session) };
}

export function completeReveal(session: PlaySession): PlaySession {
  if (session.status !== "LOCKED" && session.status !== "REVEALED") throw new PlayRuleError("REVEAL_NOT_ALLOWED");
  return { ...session, status: "REVEALED", revealCompleted: true };
}
