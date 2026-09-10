import type { JudgePort } from "@/ports/judge";

export const FINAL_SYNTHESIS_ENTRY_FAKE_ANSWER = "테스트 사용자는 팀 경계가 소통을 가르고, 그 경계에 따라 결정과 결과물 구조가 서로 닮는다고 결론 내린다.";

export class FinalSynthesisEntryFakeJudgeAdapter implements JudgePort {
  constructor(private readonly fallback: JudgePort) {}

  async evaluate(input: Parameters<JudgePort["evaluate"]>[0]): ReturnType<JudgePort["evaluate"]> {
    if (input.currentAnswer !== FINAL_SYNTHESIS_ENTRY_FAKE_ANSWER) return this.fallback.evaluate(input);
    return {
      verdict: {
        answerType: "REASONING",
        ambiguity: "NONE",
        nodes: input.rubric.nodes.map(node => ({ nodeId: node.id, status: "DISCOVERED", evidenceText: input.currentAnswer })),
      },
      attempts: [{
        attempt: 1,
        provider: "fake",
        model: "fake-final-synthesis-entry-v1",
        promptVersion: "fake-final-synthesis-entry-v1",
        schemaValid: true,
        resultStatus: "SUCCEEDED",
        latencyMs: 0,
      }],
    };
  }
}
