import { CONWAY_NODE_IDS, type ConwayNodeId } from "@/domain/play/session";
import type { JudgeNodeResult, JudgeVerdict } from "@/domain/play/judgment";
import type { JudgePort } from "@/ports/judge";

function result(nodeId: ConwayNodeId, status: JudgeNodeResult["status"], answer: string): JudgeNodeResult {
  return status === "ABSENT" || status === "CONTRADICTED"
    ? { nodeId, status }
    : { nodeId, status, evidence: { start: 0, end: answer.length } };
}

export class FakeJudgeAdapter implements JudgePort {
  async evaluate({ currentAnswer }: Parameters<JudgePort["evaluate"]>[0]): Promise<JudgeVerdict> {
    const answer = currentAnswer.trim();
    const compact = answer.toLocaleLowerCase("ko-KR").replaceAll(/\s/g, "");
    const misconception = compact.includes("기술만") || compact.includes("소통은상관없") || compact.includes("조직은상관없");
    const mentionsCommunication = compact.includes("소통") || compact.includes("의사소통") || compact.includes("대화");
    const mentionsOrganization = compact.includes("팀") || compact.includes("조직");
    const mentionsBoundary = compact.includes("경계") || compact.includes("나뉘");
    const mentionsDesign = compact.includes("설계") || compact.includes("결정");
    const mentionsSystem = compact.includes("시스템") || compact.includes("결과물") || compact.includes("구조");
    const full = mentionsCommunication && mentionsOrganization && mentionsDesign && mentionsSystem && mentionsBoundary;

    if (misconception) {
      return {
        answerType: "REASONING",
        ambiguity: "NONE",
        nodes: CONWAY_NODE_IDS.map((nodeId) => result(nodeId, nodeId === "SYSTEM_RESEMBLANCE" ? "CONTRADICTED" : "ABSENT", answer)),
      };
    }
    if (full) {
      return { answerType: "REASONING", ambiguity: "NONE", nodes: CONWAY_NODE_IDS.map((nodeId) => result(nodeId, "DISCOVERED", answer)) };
    }
    if (mentionsCommunication || (mentionsOrganization && mentionsBoundary)) {
      return {
        answerType: "REASONING",
        ambiguity: answer.length < 15 ? "TOO_SHORT" : "NONE",
        nodes: [
          result("TEAM_BOUNDARIES", mentionsOrganization ? "DISCOVERED" : "PARTIAL", answer),
          result("COMMUNICATION_FRICTION", mentionsCommunication ? "DISCOVERED" : "PARTIAL", answer),
          result("DECISION_CLUSTERING", mentionsDesign ? "PARTIAL" : "ABSENT", answer),
          result("SYSTEM_RESEMBLANCE", mentionsSystem ? "PARTIAL" : "ABSENT", answer),
        ],
      };
    }
    return {
      answerType: answer.length === 0 ? "EMPTY" : "REASONING",
      ambiguity: answer.length < 15 ? "TOO_SHORT" : "NONE",
      nodes: CONWAY_NODE_IDS.map((nodeId) => result(nodeId, "ABSENT", answer)),
    };
  }
}
