import type { JudgeExecution, JudgePort, UnvalidatedJudgeNodeResult } from "@/ports/judge";

function result(nodeId: string, status: UnvalidatedJudgeNodeResult["status"], evidenceText: string): UnvalidatedJudgeNodeResult {
  return status === "ABSENT"
    ? { nodeId, status }
    : { nodeId, status, evidenceText };
}

export class FakeJudgeAdapter implements JudgePort {
  async evaluate({ currentAnswer, rubric }: Parameters<JudgePort["evaluate"]>[0]):Promise<JudgeExecution> {
    if (rubric.discriminator !== "organizational-communication-structure-v1") throw new Error("UNSUPPORTED_FAKE_RUBRIC");
    const nodeIds = rubric.nodes.map(({ id }) => id);
    const answer = currentAnswer.trim();
    const evidence = answer;
    const compact = answer.toLocaleLowerCase("ko-KR").replaceAll(/\s/g, "");
    const misconception = compact.includes("기술만") || compact.includes("소통은상관없") || compact.includes("조직은상관없");
    const mentionsCommunication = compact.includes("소통") || compact.includes("의사소통") || compact.includes("대화");
    const mentionsOrganization = compact.includes("팀") || compact.includes("조직");
    const mentionsBoundary = compact.includes("경계") || compact.includes("나뉘");
    const mentionsDesign = compact.includes("설계") || compact.includes("결정");
    const mentionsSystem = compact.includes("시스템") || compact.includes("결과물") || compact.includes("구조");
    const full = mentionsCommunication && mentionsOrganization && mentionsDesign && mentionsSystem && mentionsBoundary;

    if (misconception) {
      return { verdict: {
        answerType: "REASONING",
        ambiguity: "NONE",
        nodes: nodeIds.map((nodeId) => result(nodeId, nodeId === "SYSTEM_RESEMBLANCE" ? "CONTRADICTED" : "ABSENT", evidence)),
      }, attempts: [fakeAttempt()] };
    }
    if (full) {
      return { verdict: { answerType: "REASONING", ambiguity: "NONE", nodes: nodeIds.map((nodeId) => result(nodeId, "DISCOVERED", evidence)) }, attempts: [fakeAttempt()] };
    }
    if (mentionsCommunication || (mentionsOrganization && mentionsBoundary)) {
      return { verdict: {
        answerType: "REASONING",
        ambiguity: answer.length < 15 ? "TOO_SHORT" : "NONE",
        nodes: [
          result("TEAM_BOUNDARIES", mentionsOrganization ? "DISCOVERED" : "PARTIAL", evidence),
          result("COMMUNICATION_FRICTION", mentionsCommunication ? "DISCOVERED" : "PARTIAL", evidence),
          result("DECISION_CLUSTERING", mentionsDesign ? "PARTIAL" : "ABSENT", evidence),
          result("SYSTEM_RESEMBLANCE", mentionsSystem ? "PARTIAL" : "ABSENT", evidence),
        ],
      }, attempts: [fakeAttempt()] };
    }
    return { verdict: {
      answerType: answer.length === 0 ? "EMPTY" : "REASONING",
      ambiguity: answer.length < 15 ? "TOO_SHORT" : "NONE",
      nodes: nodeIds.map((nodeId) => result(nodeId, "ABSENT", evidence)),
    }, attempts: [fakeAttempt()] };
  }
}

function fakeAttempt() {
  return { attempt: 1, provider: "fake", model: "fake-judge-v1", promptVersion: "fake-v1", schemaValid: true, resultStatus: "SUCCEEDED", latencyMs: 0 } as const;
}
