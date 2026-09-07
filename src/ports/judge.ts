import type { JudgeVerdict } from "@/domain/play/judgment";
import type { NodeDiscovery } from "@/domain/play/session";

export interface JudgePort {
  evaluate(input: {
    readonly currentAnswer: string;
    readonly priorConfirmedState: readonly NodeDiscovery[];
    readonly lastGuidance?: string;
  }): Promise<JudgeVerdict>;
}
