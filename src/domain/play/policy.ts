import type { JudgeVerdict } from "./judgment";
import type { EvidenceRef, GuidanceEvent, NodeDiscovery, PlaySession, SubmittedThought } from "./session";
import { PlayRuleError } from "./errors";
import type { ServerPolicy } from "@/domain/content/schema";

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
    if (incoming.status === "CONTRADICTED") {
      const contradictionEvidence: EvidenceRef | undefined = incoming.evidence
        ? { answerId: thought.id, spanStart: incoming.evidence.start, spanEnd: incoming.evidence.end }
        : undefined;
      return {
        ...current,
        status: "CONTRADICTED",
        ...(contradictionEvidence ? { contradictionEvidence } : {}),
      };
    }
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

function hasEnough(discoveries: readonly NodeDiscovery[], policy: ServerPolicy) {
  const discovered = discoveries.filter(({ status, nodeId }) => status === "DISCOVERED" && policy.required_nodes.includes(nodeId));
  return discovered.length >= policy.lock_threshold;
}

function chooseGuidance(session: PlaySession, discoveries: readonly NodeDiscovery[], verdict: JudgeVerdict, policy: ServerPolicy): Exclude<GuidanceEvent["stage"], never> {
  if (discoveries.some(({ status, nodeId }) => status === "CONTRADICTED" && policy.blocking_nodes.includes(nodeId))) return "CORRECTION";
  if (session.turnCount >= policy.max_turns) return "RESCUE";
  if (verdict.nodes.some(({ status }) => status === "PARTIAL" || status === "DISCOVERED")) return "REFLECT";
  return "NUDGE";
}

export function hasUnresolvedBlockingContradiction(session: PlaySession, policy: ServerPolicy): boolean {
  if (!session.discoveries.some(({ status, nodeId }) => status === "CONTRADICTED" && policy.blocking_nodes.includes(nodeId))) return false;
  const lastCorrection = session.guidance.findLastIndex(({ stage }) => stage === "CORRECTION");
  const lastRescue = session.guidance.findLastIndex(({ stage }) => stage === "RESCUE");
  return lastCorrection < 0 || lastRescue <= lastCorrection;
}

export function canApplyCorrectiveRescue(session: PlaySession, policy: ServerPolicy): boolean {
  return session.status === "THINKING"
    && session.stage === "CORRECTION"
    && session.turnCount >= policy.max_turns
    && hasUnresolvedBlockingContradiction(session, policy);
}

export function applyJudgeVerdict(evaluating: PlaySession, verdict: JudgeVerdict, policy: ServerPolicy): PolicyResult {
  if (evaluating.status !== "EVALUATING") throw new PlayRuleError("INVALID_SESSION_STATE");
  const thought = evaluating.thoughts.at(-1);
  if (!thought) throw new PlayRuleError("INVALID_SESSION_STATE");
  const discoveries = mergeDiscoveries(evaluating, verdict, thought);

  if (hasEnough(discoveries, policy) && !discoveries.some(({ status, nodeId }) => status === "CONTRADICTED" && policy.blocking_nodes.includes(nodeId))) {
    return { session: { ...evaluating, discoveries, status: "LOCKABLE" }, outcome: "LOCKABLE" };
  }

  const stage = chooseGuidance(evaluating, discoveries, verdict, policy);
  const guidance = { stage, key: stage, text: policy.guidance[stage] } as const;
  const guidanceEvents = evaluating.guidance.some((event) => event.key === guidance.key)
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

export function applyCorrectiveRescue(session: PlaySession, policy: ServerPolicy): PlaySession {
  if (!canApplyCorrectiveRescue(session, policy)) throw new PlayRuleError("INVALID_SESSION_STATE");
  const guidance = { stage: "RESCUE", key: "RESCUE", text: policy.guidance.RESCUE } as const;
  return {
    ...session,
    status: "LOCKABLE",
    stage: "RESCUE",
    guidance: [...session.guidance, guidance],
  };
}

export function selectRepresentativeEvidence(session: PlaySession): EvidenceRef {
  const strong = [...session.discoveries].reverse().find(({ status, evidence }) => status === "DISCOVERED" && evidence)?.evidence;
  if (strong) return strong;
  const thought = [...session.thoughts].reverse().find(({ text }) => text.trim().length > 0);
  if (!thought) throw new PlayRuleError("INVALID_SESSION_STATE");
  return { answerId: thought.id, spanStart: 0, spanEnd: thought.text.length };
}

export function lockPlaySession(session: PlaySession, policy: ServerPolicy): PlaySession {
  if (session.status !== "LOCKABLE") throw new PlayRuleError("INVALID_SESSION_STATE");
  if (hasUnresolvedBlockingContradiction(session, policy)) throw new PlayRuleError("INVALID_SESSION_STATE");
  return { ...session, status: "LOCKED", lockEvidence: selectRepresentativeEvidence(session) };
}

export function completeReveal(session: PlaySession): PlaySession {
  if (session.status !== "LOCKED" && session.status !== "REVEALED") throw new PlayRuleError("REVEAL_NOT_ALLOWED");
  return { ...session, status: "REVEALED", revealCompleted: true };
}
