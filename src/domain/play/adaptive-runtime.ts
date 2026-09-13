import type { ServerPolicy } from "@/domain/content/schema";
import { guidanceActionForLearnerState, resolveLearnerState, selectAdaptiveGuidance } from "./adaptive-guidance";
import type { GuidanceEvent, PlaySession } from "./session";
import { LEARNER_STATES, type LearnerState } from "./vocabulary";

const terminalFeedback: Readonly<Record<LearnerState, string>> = {
  COMPLETE_LIKELY: "이제 당신이 정리한 생각을 원래 통찰과 나란히 놓고 비교해볼 차례입니다.",
  NEAR_COMPLETE: "여러 중요한 요소를 연결했습니다. 이제 원래 통찰이 마지막 관계를 어떻게 설명하는지 비교해보세요.",
  ON_TRACK: "중요한 단서를 짚었습니다. 이제 원래 통찰이 그 단서들을 어떻게 연결하는지 확인해보세요.",
  MISCONCEPTION: "이번 설명에는 다른 방향의 관계도 포함되어 있습니다. 원래 통찰과 어디에서 갈라지는지 비교해보세요.",
  OFF_TRACK: "이번에는 다른 관점에서 접근했습니다. Reveal에서 어떤 관점이 새로 추가되는지 확인해보세요.",
};

export function terminalAdaptiveFeedback(state: LearnerState): string {
  return terminalFeedback[state];
}

export function adaptiveFeedback(session: PlaySession, policy: ServerPolicy) {
  if (!("adaptive_guidance" in policy)) throw new Error("ADAPTIVE_POLICY_REQUIRED");
  const learnerState = resolveLearnerState(session.discoveries, policy);
  if (session.turnCount >= 2) return { learnerState, text: terminalAdaptiveFeedback(learnerState) };
  return selectAdaptiveGuidance(session.discoveries, policy, policy.adaptive_guidance);
}

export function adaptiveGuidanceEvent(session: PlaySession, policy: ServerPolicy): GuidanceEvent {
  const feedback = adaptiveFeedback(session, policy);
  if (session.turnCount === 2) return { stage: "REFLECT", key: `adaptive-v1:2:${feedback.learnerState}`, text: feedback.text };
  if (!("guidanceAction" in feedback)) throw new Error("INVALID_ADAPTIVE_TURN");
  const stage = feedback.guidanceAction === "CORRECT" ? "CORRECTION"
    : feedback.guidanceAction === "REDIRECT" ? "NUDGE" : "REFLECT";
  return { stage, key: `adaptive-v1:1:${feedback.learnerState}:${feedback.guidanceAction}:${feedback.targetNode ?? ""}`, text: feedback.text };
}

// Existing persistence stores keys, not text. Rehydrate from immutable content.
export function storedGuidanceText(key: string, policy: ServerPolicy): string {
  if (!key.startsWith("adaptive-v1:")) return policy.guidance[key as keyof ServerPolicy["guidance"]];
  if (!("adaptive_guidance" in policy)) throw new Error("ADAPTIVE_POLICY_REQUIRED");
  const [prefix, turn, rawState, action, target, ...extra] = key.split(":");
  const state = LEARNER_STATES.find(value => value === rawState);
  if (prefix !== "adaptive-v1" || !state || extra.length) throw new Error("INVALID_ADAPTIVE_GUIDANCE_KEY");
  if (turn === "2" && action === undefined) return terminalAdaptiveFeedback(state);
  if (turn !== "1" || action !== guidanceActionForLearnerState(state) || target === undefined) throw new Error("INVALID_ADAPTIVE_GUIDANCE_KEY");
  const content = policy.adaptive_guidance;
  if (action === "REDIRECT" && !target) return content.redirect;
  if (action === "CONSOLIDATE" && !target) return content.consolidate;
  const ladder = content.concept_order.includes(target) ? content.by_node[target] : undefined;
  if (!ladder) throw new Error("INVALID_ADAPTIVE_GUIDANCE_KEY");
  return action === "CORRECT" ? ladder.correction : action === "BRIDGE" ? ladder.bridge : ladder.target;
}
