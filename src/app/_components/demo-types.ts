import type { PublicDemoDaily } from "@/application/play/demo-content";
import type { PublicSessionView } from "@/application/play/session-view";

export interface DemoPayload {
  readonly daily: PublicDemoDaily;
  readonly session: PublicSessionView;
}

export interface RevealView {
  readonly year: string;
  readonly person: string;
  readonly theory: string;
  readonly explanation: string;
  readonly representativeThought: string;
  readonly substantialGuidanceUsed: boolean;
  readonly connection: string;
}
