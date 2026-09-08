import type { JudgeVerdict } from "@/domain/play/judgment";
import type { JudgeRubric } from "@/domain/content/schema";
import type { UnvalidatedJudgeVerdict } from "@/ports/judge";

export function validateJudgeVerdict(raw: UnvalidatedJudgeVerdict, rubric: JudgeRubric, currentAnswer: string): JudgeVerdict {
  const expected = rubric.nodes.map(({ id }) => id);
  const actual = raw.nodes.map(({ nodeId }) => nodeId);
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) throw new Error("INVALID_JUDGE_NODES");
  if (actual.some((id) => !expected.includes(id)) || expected.some((id) => !actual.includes(id))) throw new Error("INVALID_JUDGE_NODES");

  return {
    answerType: raw.answerType,
    ambiguity: raw.ambiguity,
    nodes: raw.nodes.map((node) => {
      if (node.status === "ABSENT") {
        if (node.evidenceText !== undefined) throw new Error("INVALID_JUDGE_EVIDENCE");
        return { nodeId: node.nodeId, status: node.status };
      }
      if (!node.evidenceText) throw new Error("INVALID_JUDGE_EVIDENCE");
      const first = currentAnswer.indexOf(node.evidenceText);
      if (first < 0 || currentAnswer.indexOf(node.evidenceText, first + 1) >= 0) throw new Error("INVALID_JUDGE_EVIDENCE");
      return { nodeId: node.nodeId, status: node.status, evidence: { start: first, end: first + node.evidenceText.length } };
    }),
  };
}
