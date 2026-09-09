import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildOpenAILockVerifierV2ClientOptions,
  buildOpenAILockVerifierV2ResponseRequest,
  OpenAILockVerifierV2Adapter,
  providerLockProofSchema,
  type OpenAILockVerifierV2Transport,
  type OpenAILockVerifierV2TransportRequest,
} from "@/adapters/openai-lock-verifier-v2/openai-lock-verifier-v2";
import { buildLockEvidenceUnits } from "@/application/play/lock-evidence-units";
import {
  deriveLockVerificationFromProof,
  isDerivedLockVerificationApproved,
  LockProofV2ValidationError,
} from "@/application/play/lock-proof-v2";
import {
  LockVerifierV2ExecutionError,
  type LockVerifierV2Input,
  type UnvalidatedLockProof,
  type UnvalidatedNodeProof,
} from "@/ports/lock-verifier-v2";
import {
  LOCK_VERIFIER_V2_PROMPT_VERSION,
  LOCK_VERIFIER_V2_SYSTEM_PROMPT,
} from "@/shared/lock-verifier-v2-prompts";

const requiredNodes = [{ nodeId: "NODE", description: "A complete supplied relationship." }];

function inputFor(answers: LockVerifierV2Input["answers"]): LockVerifierV2Input {
  return { requiredNodes, answers, evidenceUnits: buildLockEvidenceUnits(answers) };
}

function proof(overrides: Partial<UnvalidatedNodeProof> = {}): UnvalidatedLockProof {
  return {
    nodes: [{
      nodeId: "NODE",
      endorsementStatus: "ENDORSED",
      referenceStatus: "SELF_CONTAINED",
      semanticMatch: "COMPLETE_NODE_MATCH",
      evidenceUnitIds: ["answer-1:u1"],
      antecedentEvidenceUnitIds: [],
      ...overrides,
    }],
  };
}

class ScriptedTransport implements OpenAILockVerifierV2Transport {
  readonly requests: OpenAILockVerifierV2TransportRequest[] = [];
  constructor(private readonly script: unknown[]) {}
  async extract(request: OpenAILockVerifierV2TransportRequest) {
    this.requests.push(request);
    const next = this.script.shift();
    if (next instanceof Error) throw next;
    return { output: next, inputTokens: 10, outputTokens: 5, totalTokens: 15, providerRequestId: `req-${this.requests.length}` };
  }
}

describe("M3 Lock Verifier v2 evidence and proof contract", () => {
  it("creates deterministic exact UTF-16 units without normalizing spaces or Unicode", () => {
    const answers = [{ answerId: "answer-1", text: "  가  나!\n다😀라？  끝  " }];
    const first = buildLockEvidenceUnits(answers);
    expect(first).toEqual([
      { unitId: "answer-1:u1", answerId: "answer-1", start: 2, end: 7, text: "가  나!" },
      { unitId: "answer-1:u2", answerId: "answer-1", start: 8, end: 13, text: "다😀라？" },
      { unitId: "answer-1:u3", answerId: "answer-1", start: 15, end: 16, text: "끝" },
    ]);
    expect(buildLockEvidenceUnits(answers)).toEqual(first);
    for (const unit of first) expect(answers[0]!.text.slice(unit.start, unit.end)).toBe(unit.text);
  });

  it("uses the whole trimmed answer when punctuation is absent and splits CRLF lines", () => {
    expect(buildLockEvidenceUnits([{ answerId: "a", text: "  내부  공백 유지  " }])).toEqual([
      { unitId: "a:u1", answerId: "a", start: 2, end: 11, text: "내부  공백 유지" },
    ]);
    expect(buildLockEvidenceUnits([{ answerId: "a", text: "첫 줄\r\n둘째 줄" }])).toEqual([
      { unitId: "a:u1", answerId: "a", start: 0, end: 3, text: "첫 줄" },
      { unitId: "a:u2", answerId: "a", start: 5, end: 9, text: "둘째 줄" },
    ]);
  });

  it("derives VERIFIED only when every admissibility condition passes", () => {
    const input = inputFor([{ answerId: "answer-1", text: "Complete claim." }]);
    const verified = deriveLockVerificationFromProof(proof(), input);
    expect(verified.nodes[0]).toEqual({ nodeId: "NODE", support: "VERIFIED", evidence: [{ unitId: "answer-1:u1", answerId: "answer-1", start: 0, end: 15 }], antecedentEvidence: [] });
    expect(isDerivedLockVerificationApproved(verified)).toBe(true);

    for (const overrides of [
      { endorsementStatus: "REJECTED_OR_QUOTED" as const },
      { endorsementStatus: "CONTRADICTED_OR_REPLACED" as const },
      { referenceStatus: "UNRESOLVED" as const },
      { referenceStatus: "AMBIGUOUS" as const },
      { semanticMatch: "WEAKER_THAN_NODE_REQUIREMENT" as const },
      { semanticMatch: "PARTIAL_NODE_MATCH" as const },
    ]) {
      const result = deriveLockVerificationFromProof(proof(overrides), input);
      expect(result.nodes).toEqual([{ nodeId: "NODE", support: "INSUFFICIENT" }]);
      expect(isDerivedLockVerificationApproved(result)).toBe(false);
    }
  });

  it("fails closed for invalid evidence units and inconsistent proof records", () => {
    const input = inputFor([{ answerId: "answer-1", text: "Complete claim." }]);
    expect(() => deriveLockVerificationFromProof(proof({ evidenceUnitIds: ["missing"] }), input)).toThrowError(expect.objectContaining({ category: "EVIDENCE_UNIT_INVALID" }));
    expect(() => deriveLockVerificationFromProof(proof({ evidenceUnitIds: [] }), input)).toThrowError(expect.objectContaining({ category: "PROOF_RECORD_INVALID" }));
    const tampered = { ...input, evidenceUnits: [{ ...input.evidenceUnits[0]!, text: "normalized" }] };
    expect(() => deriveLockVerificationFromProof(proof(), tampered)).toThrowError(LockProofV2ValidationError);
  });

  it("allows only explicit unique cross-answer antecedent evidence", () => {
    const input = inputFor([
      { answerId: "answer-1", text: "The earlier proposition is explicit." },
      { answerId: "answer-2", text: "That proposition completes this relation." },
    ]);
    const valid = proof({
      referenceStatus: "UNIQUE_WITHIN_SUPPLIED_ANSWERS",
      evidenceUnitIds: ["answer-2:u1"],
      antecedentEvidenceUnitIds: ["answer-1:u1"],
    });
    expect(deriveLockVerificationFromProof(valid, input).nodes[0]).toMatchObject({ support: "VERIFIED", antecedentEvidence: [{ answerId: "answer-1" }] });
    expect(() => deriveLockVerificationFromProof(proof({ referenceStatus: "UNIQUE_WITHIN_SUPPLIED_ANSWERS", evidenceUnitIds: ["answer-2:u1"], antecedentEvidenceUnitIds: [] }), input)).toThrowError(expect.objectContaining({ category: "PROOF_RECORD_INVALID" }));
    expect(() => deriveLockVerificationFromProof(proof({ referenceStatus: "UNIQUE_WITHIN_SUPPLIED_ANSWERS", evidenceUnitIds: ["answer-2:u1"], antecedentEvidenceUnitIds: ["missing"] }), input)).toThrowError(expect.objectContaining({ category: "EVIDENCE_UNIT_INVALID" }));
    expect(deriveLockVerificationFromProof(proof({ referenceStatus: "AMBIGUOUS", evidenceUnitIds: ["answer-2:u1"] }), input).nodes[0]).toMatchObject({ support: "INSUFFICIENT" });
  });

  it("enforces one-answer SELF_CONTAINED scope", () => {
    const input = inputFor([
      { answerId: "answer-1", text: "First unit. Second unit." },
      { answerId: "answer-2", text: "Other unit." },
    ]);
    expect(deriveLockVerificationFromProof(proof({ evidenceUnitIds: ["answer-1:u1", "answer-1:u2"] }), input).nodes[0]).toMatchObject({ support: "VERIFIED" });
    expect(() => deriveLockVerificationFromProof(proof({ evidenceUnitIds: ["answer-1:u1", "answer-2:u1"] }), input)).toThrowError(expect.objectContaining({ category: "PROOF_RECORD_INVALID" }));
    expect(() => deriveLockVerificationFromProof(proof({ antecedentEvidenceUnitIds: ["answer-2:u1"] }), input)).toThrowError(expect.objectContaining({ category: "PROOF_RECORD_INVALID" }));
  });

  it("enforces ordered, single-answer UNIQUE proof roles", () => {
    const input = inputFor([
      { answerId: "answer-1", text: "Antecedent one. Antecedent two." },
      { answerId: "answer-2", text: "Referring one. Referring two." },
      { answerId: "answer-3", text: "Third one. Third two." },
    ]);
    const unique = (overrides: Partial<UnvalidatedNodeProof> = {}) => proof({
      referenceStatus: "UNIQUE_WITHIN_SUPPLIED_ANSWERS",
      evidenceUnitIds: ["answer-2:u1", "answer-2:u2"],
      antecedentEvidenceUnitIds: ["answer-1:u1", "answer-1:u2"],
      ...overrides,
    });
    expect(deriveLockVerificationFromProof(unique(), input).nodes[0]).toMatchObject({ support: "VERIFIED" });
    for (const malformed of [
      unique({ antecedentEvidenceUnitIds: ["answer-1:u1", "answer-3:u1"] }),
      unique({ evidenceUnitIds: ["answer-2:u1", "answer-3:u1"] }),
      unique({ evidenceUnitIds: ["answer-2:u1"], antecedentEvidenceUnitIds: ["answer-2:u2"] }),
      unique({ evidenceUnitIds: ["answer-1:u1"], antecedentEvidenceUnitIds: ["answer-2:u1"] }),
      unique({ evidenceUnitIds: ["answer-2:u1"], antecedentEvidenceUnitIds: ["answer-2:u1"] }),
      unique({ antecedentEvidenceUnitIds: [] }),
    ]) {
      expect(() => deriveLockVerificationFromProof(malformed, input)).toThrowError(expect.objectContaining({ category: "PROOF_RECORD_INVALID" }));
    }
  });

  it("uses the same structural validator in adapter and application", async () => {
    const input = inputFor([
      { answerId: "answer-1", text: "First one. First two." },
      { answerId: "answer-2", text: "Second one. Second two." },
      { answerId: "answer-3", text: "Third one. Third two." },
    ]);
    const unique = (overrides: Partial<UnvalidatedNodeProof>) => proof({
      referenceStatus: "UNIQUE_WITHIN_SUPPLIED_ANSWERS",
      evidenceUnitIds: ["answer-2:u1"],
      antecedentEvidenceUnitIds: ["answer-1:u1"],
      ...overrides,
    });
    const malformedProofs = [
      proof({ evidenceUnitIds: ["answer-1:u1", "answer-2:u1"] }),
      proof({ antecedentEvidenceUnitIds: ["answer-2:u1"] }),
      unique({ antecedentEvidenceUnitIds: ["answer-1:u1", "answer-3:u1"] }),
      unique({ evidenceUnitIds: ["answer-2:u1", "answer-3:u1"] }),
      unique({ evidenceUnitIds: ["answer-2:u1"], antecedentEvidenceUnitIds: ["answer-2:u2"] }),
      unique({ evidenceUnitIds: ["answer-1:u1"], antecedentEvidenceUnitIds: ["answer-2:u1"] }),
      unique({ evidenceUnitIds: ["answer-2:u1"], antecedentEvidenceUnitIds: ["answer-2:u1"] }),
      unique({ antecedentEvidenceUnitIds: [] }),
    ];
    for (const malformed of malformedProofs) {
      expect(() => deriveLockVerificationFromProof(malformed, input)).toThrowError(expect.objectContaining({ category: "PROOF_RECORD_INVALID" }));
      const error = await new OpenAILockVerifierV2Adapter(
        new ScriptedTransport([malformed, malformed]),
        "candidate-model",
        () => 0,
      ).extractProof(input).catch((caught) => caught) as LockVerifierV2ExecutionError;
      expect(error).toBeInstanceOf(LockVerifierV2ExecutionError);
      expect(error.attempts.map(({ failureCategory }) => failureCategory)).toEqual([
        "PROOF_RECORD_INVALID",
        "PROOF_RECORD_INVALID",
      ]);
    }
  });

  it("keeps v2 provider output proof-only with no support escape hatch", () => {
    expect(providerLockProofSchema.safeParse(proof()).success).toBe(true);
    expect(providerLockProofSchema.safeParse({ nodes: [{ ...proof().nodes[0], support: "VERIFIED" }] }).success).toBe(false);
    expect(LOCK_VERIFIER_V2_PROMPT_VERSION).toBe("lock-verify-v2");
    expect(LOCK_VERIFIER_V2_SYSTEM_PROMPT).toMatch(/never decide VERIFIED, INSUFFICIENT, Lock/);
    expect(LOCK_VERIFIER_V2_SYSTEM_PROMPT).toMatch(/WEAKER_THAN_NODE_REQUIREMENT/);
    expect(LOCK_VERIFIER_V2_SYSTEM_PROMPT).not.toMatch(/messy-|prior-state-02|rejected-quote-04|spacing-full-04/);
    expect(createHash("sha256").update(LOCK_VERIFIER_V2_SYSTEM_PROMPT).digest("hex")).toHaveLength(64);
  });

  it("sends only required nodes and deterministic evidence units", async () => {
    const input = inputFor([{ answerId: "answer-1", text: "Complete claim." }]);
    const transport = new ScriptedTransport([proof()]);
    const execution = await new OpenAILockVerifierV2Adapter(transport, "candidate-model", () => 0).extractProof(input);
    expect(execution.proof).toEqual(proof());
    expect(execution.attempts[0]).toMatchObject({ promptVersion: "lock-verify-v2", resultStatus: "SUCCEEDED", totalTokens: 15 });
    const payload = JSON.parse(transport.requests[0]!.input) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["evidenceUnits", "requiredNodes"]);
    expect(JSON.stringify(payload)).not.toContain("support");
  });

  it("preserves strict provider controls and one bounded retry", async () => {
    expect(buildOpenAILockVerifierV2ClientOptions("secret")).toMatchObject({ apiKey: "secret", maxRetries: 0, logLevel: "off" });
    const request = buildOpenAILockVerifierV2ResponseRequest({ model: "model", promptVersion: LOCK_VERIFIER_V2_PROMPT_VERSION, systemPrompt: "prompt", input: "fixture", expectedNodeIds: ["NODE"] });
    expect(request).toMatchObject({ model: "model", store: false, tools: [], tool_choice: "none" });
    const input = inputFor([{ answerId: "answer-1", text: "Complete claim." }]);
    const transport = new ScriptedTransport([{ bad: true }, { bad: true }]);
    const error = await new OpenAILockVerifierV2Adapter(transport, "candidate-model", () => 0).extractProof(input).catch((caught) => caught) as LockVerifierV2ExecutionError;
    expect(error).toBeInstanceOf(LockVerifierV2ExecutionError);
    expect(error.attempts).toHaveLength(2);
    expect(error.attempts.map(({ failureCategory }) => failureCategory)).toEqual(["STRUCTURED_OUTPUT_INVALID", "STRUCTURED_OUTPUT_INVALID"]);
  });
});
