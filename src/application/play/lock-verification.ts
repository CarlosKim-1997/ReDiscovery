import type {
  LockVerifierFailureCategory,
  LockVerifierInput,
  UnvalidatedLockVerification,
} from "@/ports/lock-verifier";

export type ValidatedLockVerification = Readonly<{
  nodes: readonly (
    | Readonly<{ nodeId: string; support: "INSUFFICIENT" }>
    | Readonly<{ nodeId: string; support: "VERIFIED"; evidence: Readonly<{ answerId: string; start: number; end: number }> }>
  )[];
}>;

export class LockVerifierValidationError extends Error {
  constructor(readonly category: LockVerifierFailureCategory) {
    super(category);
  }
}

export function validateLockVerification(
  raw: UnvalidatedLockVerification,
  input: LockVerifierInput,
): ValidatedLockVerification {
  const expected = input.requiredNodes.map(({ nodeId }) => nodeId);
  const actual = raw.nodes.map(({ nodeId }) => nodeId);
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) fail("NODE_SET_INVALID");
  if (actual.some((id) => !expected.includes(id)) || expected.some((id) => !actual.includes(id))) fail("NODE_SET_INVALID");
  const answers = new Map(input.answers.map((answer) => [answer.answerId, answer.text]));

  return {
    nodes: raw.nodes.map((node) => {
      if (node.support === "INSUFFICIENT") {
        if (node.answerId !== undefined || node.evidenceText !== undefined) fail("STATUS_EVIDENCE_INVALID");
        return { nodeId: node.nodeId, support: node.support };
      }
      if (!node.answerId || !node.evidenceText) fail("STATUS_EVIDENCE_INVALID");
      const answer = answers.get(node.answerId);
      if (answer === undefined) fail("ANSWER_ID_INVALID");
      const first = answer.indexOf(node.evidenceText);
      if (first < 0) fail("EVIDENCE_NOT_LITERAL");
      if (answer.indexOf(node.evidenceText, first + 1) >= 0) fail("EVIDENCE_NOT_UNIQUE");
      return {
        nodeId: node.nodeId,
        support: node.support,
        evidence: { answerId: node.answerId, start: first, end: first + node.evidenceText.length },
      };
    }),
  };
}

function fail(category: LockVerifierFailureCategory): never {
  throw new LockVerifierValidationError(category);
}

export function isLockVerificationApproved(verification: ValidatedLockVerification): boolean {
  return verification.nodes.every(({ support }) => support === "VERIFIED");
}
