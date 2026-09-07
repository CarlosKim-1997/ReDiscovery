import { PlayRuleError } from "@/domain/play/errors";
import { resolveEvidence } from "@/domain/play/session";
import type { PrimaryStorePort } from "@/ports/primary-store";

export interface DemoRevealContent {
  readonly year: string;
  readonly person: string;
  readonly theory: string;
  readonly explanation: string;
}

export async function getDemoReveal(store: PrimaryStorePort, content: DemoRevealContent, id: string) {
  const session = await store.getSession(id);
  if (!session) return undefined;
  if ((session.status !== "LOCKED" && session.status !== "REVEALED") || !session.lockEvidence) {
    throw new PlayRuleError("REVEAL_NOT_ALLOWED");
  }
  const representativeThought = resolveEvidence(session, session.lockEvidence);
  return {
    ...content,
    representativeThought,
    substantialGuidanceUsed: session.guidance.some(({ stage }) => stage === "RESCUE" || stage === "CORRECTION"),
    connection: `당신은 “${representativeThought}”라고 보았습니다. 이는 소통의 경계가 설계 결정의 경계가 되고, 결국 시스템 구조가 조직 구조를 닮는다는 통찰과 맞닿아 있습니다.`,
  };
}
