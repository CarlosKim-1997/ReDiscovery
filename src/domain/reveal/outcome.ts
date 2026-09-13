import type { ServerPolicy } from "@/domain/content/schema";
import type { PlaySession } from "@/domain/play/session";
import { resolveLearnerState } from "@/domain/play/adaptive-guidance";
import { storedGuidanceText } from "@/domain/play/adaptive-runtime";

export const REVEAL_OUTCOME_CODES = [
  "INDEPENDENT_REDISCOVERY", "GUIDED_ARRIVAL", "PARTIAL_CAPTURE", "REVEAL_CONNECTION",
] as const;
export type RevealOutcomeCode = typeof REVEAL_OUTCOME_CODES[number];

export interface RevealOutcomeView {
  readonly code: RevealOutcomeCode;
  readonly label: string;
  readonly explanation: string;
}

const copy: Readonly<Record<RevealOutcomeCode, Omit<RevealOutcomeView, "code">>> = {
  INDEPENDENT_REDISCOVERY: { label: "독립 재발견", explanation: "핵심 관계를 힌트 전에 스스로 연결했습니다." },
  GUIDED_ARRIVAL: { label: "힌트 후 도달", explanation: "단서를 바탕으로 핵심 관계까지 연결했습니다." },
  PARTIAL_CAPTURE: { label: "핵심 일부 포착", explanation: "중요한 요소들을 스스로 발견했습니다." },
  REVEAL_CONNECTION: { label: "Reveal에서 연결", explanation: "이번에는 Reveal을 통해 새로운 연결을 만납니다." },
};

/** Adaptive outcomes use the persisted Turn 1 decision, never the final state as a proxy. */
export function resolveAdaptiveRevealOutcome(
  session: Pick<PlaySession, "guidance" | "discoveries" | "turnCount">,
  policy: ServerPolicy,
): RevealOutcomeView | undefined {
  if (!("adaptive_guidance" in policy)) return undefined;
  if (session.turnCount !== 2) throw new Error("REVEAL_OUTCOME_REQUIRES_TWO_TURNS");
  const firstTurn = session.guidance.filter(event => event.key.startsWith("adaptive-v1:1:"));
  if (firstTurn.length !== 1) throw new Error("REVEAL_OUTCOME_PROVENANCE_REQUIRED");
  const key = firstTurn[0]!.key;
  // Existing rehydration validates the key's state/action/target invariant.
  storedGuidanceText(key, policy);
  const independent = key.split(":")[2] === "COMPLETE_LIKELY";
  const finalComplete = resolveLearnerState(session.discoveries, policy) === "COMPLETE_LIKELY";
  const statuses = new Map(session.discoveries.map(node => [node.nodeId, node.status]));
  const discovered = policy.required_nodes.some(id => statuses.get(id) === "DISCOVERED");
  const partialCount = new Set(policy.required_nodes.filter(id => statuses.get(id) === "PARTIAL")).size;
  const code: RevealOutcomeCode = independent ? "INDEPENDENT_REDISCOVERY"
    : finalComplete ? "GUIDED_ARRIVAL"
    : discovered || partialCount >= 2 ? "PARTIAL_CAPTURE" : "REVEAL_CONNECTION";
  return { code, ...copy[code] };
}
