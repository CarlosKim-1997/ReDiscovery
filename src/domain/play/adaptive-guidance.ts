import type { AdaptiveGuidancePolicy, ServerPolicy } from "@/domain/content/schema";
import { isSemanticLockEligible, type SemanticNodeState } from "./semantic-state";
import type { GuidanceAction, LearnerState } from "./vocabulary";

type SemanticPolicy = Pick<ServerPolicy, "required_nodes" | "blocking_nodes" | "lock_threshold">;

export interface AdaptiveGuidanceDecision {
  readonly learnerState: LearnerState;
  readonly guidanceAction: GuidanceAction;
  readonly targetNode?: string;
  readonly text: string;
}

export function resolveLearnerState(
  states: readonly SemanticNodeState[],
  policy: SemanticPolicy,
): LearnerState {
  const required = new Set(policy.required_nodes);
  const requiredStates = states.filter(({ nodeId }) => required.has(nodeId));

  if (requiredStates.some(({ status }) => status === "CONTRADICTED")) return "MISCONCEPTION";
  if (isSemanticLockEligible(states, policy)) return "COMPLETE_LIKELY";

  const discoveredCount = requiredStates.filter(({ status }) => status === "DISCOVERED").length;
  const hasPartialUnmet = requiredStates.some(({ status }) => status === "PARTIAL");
  if (discoveredCount === policy.lock_threshold - 1 && hasPartialUnmet) return "NEAR_COMPLETE";

  if (requiredStates.some(({ status }) => status === "DISCOVERED" || status === "PARTIAL")) return "ON_TRACK";
  return "OFF_TRACK";
}

export function guidanceActionForLearnerState(state: LearnerState): GuidanceAction {
  if (state === "OFF_TRACK") return "REDIRECT";
  if (state === "MISCONCEPTION") return "CORRECT";
  if (state === "ON_TRACK") return "TARGET";
  if (state === "NEAR_COMPLETE") return "BRIDGE";
  return "CONSOLIDATE";
}

export function selectAdaptiveGuidance(
  states: readonly SemanticNodeState[],
  policy: SemanticPolicy,
  content: AdaptiveGuidancePolicy,
): AdaptiveGuidanceDecision {
  const learnerState = resolveLearnerState(states, policy);
  const guidanceAction = guidanceActionForLearnerState(learnerState);

  if (learnerState === "OFF_TRACK") return { learnerState, guidanceAction, text: content.redirect };
  if (learnerState === "COMPLETE_LIKELY") return { learnerState, guidanceAction, text: content.consolidate };

  const byId = new Map(states.map((state) => [state.nodeId, state.status]));
  const targetNode = content.concept_order.find((nodeId) => learnerState === "MISCONCEPTION"
    ? byId.get(nodeId) === "CONTRADICTED"
    : byId.get(nodeId) !== "DISCOVERED");
  if (!targetNode) throw new Error("ADAPTIVE_GUIDANCE_TARGET_MISSING");
  const ladder = content.by_node[targetNode];
  if (!ladder) throw new Error("ADAPTIVE_GUIDANCE_TARGET_MISSING");

  const text = guidanceAction === "CORRECT"
    ? ladder.correction
    : guidanceAction === "BRIDGE" ? ladder.bridge : ladder.target;
  return { learnerState, guidanceAction, targetNode, text };
}
