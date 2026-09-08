import type { JudgeVerdict } from "@/domain/play/judgment";
import type { NodeDiscovery } from "@/domain/play/session";
import type { JudgeRubric } from "@/domain/content/schema";

export interface JudgePort {
  evaluate(input: {
    readonly rubric: JudgeRubric;
    readonly currentAnswer: string;
    readonly priorConfirmedState: readonly NodeDiscovery[];
    readonly lastGuidance?: string;
  }): Promise<JudgeVerdict>;
}
