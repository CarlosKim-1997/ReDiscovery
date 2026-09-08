import type { JudgeVerdict } from "@/domain/play/judgment";
import type { JudgeRubric } from "@/domain/content/schema";
import type { UnvalidatedJudgeVerdict } from "@/ports/judge";
import type { JudgeFailureCategory } from "@/ports/judge";

export class JudgeVerdictValidationError extends Error {
  constructor(readonly category: JudgeFailureCategory) {
    super(category);
  }
}

export function validateJudgeVerdict(raw: UnvalidatedJudgeVerdict, rubric: JudgeRubric, currentAnswer: string): JudgeVerdict {
  const expected = rubric.nodes.map(({ id }) => id);
  const actual = raw.nodes.map(({ nodeId }) => nodeId);
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) throw new JudgeVerdictValidationError("NODE_SET_INVALID");
  if (actual.some((id) => !expected.includes(id)) || expected.some((id) => !actual.includes(id))) throw new JudgeVerdictValidationError("NODE_SET_INVALID");

  return {
    answerType: raw.answerType,
    ambiguity: raw.ambiguity,
    nodes: raw.nodes.map((node) => {
      if (node.status === "ABSENT") {
        if (node.evidenceText !== undefined) throw new JudgeVerdictValidationError("STATUS_EVIDENCE_INVALID");
        return { nodeId: node.nodeId, status: node.status };
      }
      if (!node.evidenceText) throw new JudgeVerdictValidationError("STATUS_EVIDENCE_INVALID");
      const first = currentAnswer.indexOf(node.evidenceText);
      if (first < 0) throw new JudgeVerdictValidationError("EVIDENCE_NOT_LITERAL");
      if (currentAnswer.indexOf(node.evidenceText, first + 1) >= 0) throw new JudgeVerdictValidationError("EVIDENCE_NOT_UNIQUE");
      return { nodeId: node.nodeId, status: node.status, evidence: { start: first, end: first + node.evidenceText.length } };
    }),
  };
}
