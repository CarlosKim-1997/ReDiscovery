import { describe, expect, it } from "vitest";
import {
  buildOpenAILockVerifierV3ClientOptions,
  buildOpenAILockVerifierV3ResponseRequest,
  OpenAILockVerifierV3Adapter,
  providerLockProofV3Schema,
  type OpenAILockVerifierV3Transport,
  type OpenAILockVerifierV3TransportRequest,
} from "@/adapters/openai-lock-verifier-v3/openai-lock-verifier-v3";
import { buildLockEvidenceUnits } from "@/application/play/lock-evidence-units";
import {
  deriveLockVerificationFromProofV3,
  isDerivedLockVerificationV3Approved,
} from "@/application/play/lock-proof-v3";
import {
  LockVerifierV3ExecutionError,
  type LockVerifierV3Input,
  type UnvalidatedComponentProof,
  type UnvalidatedLockProofV3,
} from "@/ports/lock-verifier-v3";
import { LOCK_VERIFIER_V3_PROMPT_VERSION, LOCK_VERIFIER_V3_SYSTEM_PROMPT } from "@/shared/lock-verifier-v3-prompts";

const requiredNodes = [{
  nodeId: "NODE",
  requiredComponents: [
    { componentId: "SOURCE", description: "An explicit source structure." },
    { componentId: "MAPPING", description: "An explicit structural mapping." },
  ],
}];

function inputFor(answers: LockVerifierV3Input["answers"]): LockVerifierV3Input {
  return { requiredNodes, answers, evidenceUnits: buildLockEvidenceUnits(answers) };
}

function component(componentId: string, overrides: Partial<UnvalidatedComponentProof> = {}): UnvalidatedComponentProof {
  return {
    componentId,
    endorsementStatus: "ENDORSED",
    referenceStatus: "SELF_CONTAINED",
    componentMatch: "COMPLETE_COMPONENT_MATCH",
    evidenceUnitIds: ["answer-1:u1"],
    antecedentEvidenceUnitIds: [],
    ...overrides,
  };
}

function proof(components = [component("SOURCE"), component("MAPPING")]): UnvalidatedLockProofV3 {
  return { nodes: [{ nodeId: "NODE", components }] };
}

class ScriptedTransport implements OpenAILockVerifierV3Transport {
  readonly requests: OpenAILockVerifierV3TransportRequest[] = [];
  constructor(private readonly script: unknown[]) {}
  async extract(request: OpenAILockVerifierV3TransportRequest) {
    this.requests.push(request);
    const next = this.script.shift();
    if (next instanceof Error) throw next;
    return { output: next, inputTokens: 10, outputTokens: 5, totalTokens: 15 };
  }
}

describe("M3 Lock Verifier v3 component proof contract", () => {
  it("derives a node only from every complete required component", () => {
    const input = inputFor([{ answerId: "answer-1", text: "Source and mapping." }]);
    const verified = deriveLockVerificationFromProofV3(proof(), input);
    expect(verified.nodes[0]).toMatchObject({ support: "VERIFIED", components: [{ componentId: "SOURCE", satisfied: true }, { componentId: "MAPPING", satisfied: true }] });
    expect(isDerivedLockVerificationV3Approved(verified)).toBe(true);

    for (const incomplete of [
      component("MAPPING", { componentMatch: "WEAKER_THAN_COMPONENT_REQUIREMENT" }),
      component("MAPPING", { componentMatch: "PARTIAL_COMPONENT_MATCH" }),
      component("MAPPING", { endorsementStatus: "REJECTED_OR_QUOTED" }),
      component("MAPPING", { referenceStatus: "AMBIGUOUS" }),
      component("MAPPING", { referenceStatus: "UNRESOLVED" }),
    ]) {
      const result = deriveLockVerificationFromProofV3(proof([component("SOURCE"), incomplete]), input);
      expect(result.nodes[0]!.support).toBe("INSUFFICIENT");
      expect(isDerivedLockVerificationV3Approved(result)).toBe(false);
    }
  });

  it("fails SYSTEM proof when output structure or structural correspondence is incomplete", () => {
    const answers = [{ answerId: "answer-1", text: "Source, output, and relation." }];
    const systemInput: LockVerifierV3Input = {
      requiredNodes: [{ nodeId: "SYSTEM_RESEMBLANCE", requiredComponents: [
        { componentId: "SOURCE_BOUNDARY", description: "Explicit source boundary." },
        { componentId: "OUTPUT_STRUCTURE", description: "Explicit output-side structure, not product existence." },
        { componentId: "STRUCTURAL_CORRESPONDENCE", description: "Explicit structural mapping, not generic influence." },
      ] }],
      answers,
      evidenceUnits: buildLockEvidenceUnits(answers),
    };
    const systemProof = (outputMatch: UnvalidatedComponentProof["componentMatch"], mappingMatch: UnvalidatedComponentProof["componentMatch"]): UnvalidatedLockProofV3 => ({ nodes: [{ nodeId: "SYSTEM_RESEMBLANCE", components: [
      component("SOURCE_BOUNDARY"),
      component("OUTPUT_STRUCTURE", { componentMatch: outputMatch }),
      component("STRUCTURAL_CORRESPONDENCE", { componentMatch: mappingMatch }),
    ] }] });
    expect(deriveLockVerificationFromProofV3(systemProof("PARTIAL_COMPONENT_MATCH", "COMPLETE_COMPONENT_MATCH"), systemInput).nodes[0]!.support).toBe("INSUFFICIENT");
    expect(deriveLockVerificationFromProofV3(systemProof("COMPLETE_COMPONENT_MATCH", "WEAKER_THAN_COMPONENT_REQUIREMENT"), systemInput).nodes[0]!.support).toBe("INSUFFICIENT");
    expect(deriveLockVerificationFromProofV3(systemProof("COMPLETE_COMPONENT_MATCH", "COMPLETE_COMPONENT_MATCH"), systemInput).nodes[0]!.support).toBe("VERIFIED");
  });

  it("fails closed for missing, unknown, or duplicate components", () => {
    const input = inputFor([{ answerId: "answer-1", text: "Source and mapping." }]);
    expect(() => deriveLockVerificationFromProofV3(proof([component("SOURCE")]), input)).toThrow(/MISSING_COMPONENT/);
    expect(() => deriveLockVerificationFromProofV3(proof([component("SOURCE"), component("OTHER")]), input)).toThrow(/UNKNOWN_COMPONENT/);
    expect(() => deriveLockVerificationFromProofV3(proof([component("SOURCE"), component("SOURCE")]), input)).toThrow(/DUPLICATE_COMPONENT_ID/);
  });

  it("allows SELF_CONTAINED multiple units in one answer but not across answers", () => {
    const input = inputFor([
      { answerId: "answer-1", text: "First. Second." },
      { answerId: "answer-2", text: "Third." },
    ]);
    expect(deriveLockVerificationFromProofV3(proof([
      component("SOURCE", { evidenceUnitIds: ["answer-1:u1", "answer-1:u2"] }),
      component("MAPPING"),
    ]), input).nodes[0]!.support).toBe("VERIFIED");
    expect(() => deriveLockVerificationFromProofV3(proof([
      component("SOURCE", { evidenceUnitIds: ["answer-1:u1", "answer-2:u1"] }),
      component("MAPPING"),
    ]), input)).toThrow(/SELF_CONTAINED_MULTI_ANSWER/);
  });

  it("accepts same-answer and earlier-answer UNIQUE antecedents in canonical order", () => {
    const same = inputFor([{ answerId: "answer-1", text: "Antecedent. That completes it." }]);
    const sameProof = proof([
      component("SOURCE"),
      component("MAPPING", { referenceStatus: "UNIQUE_WITHIN_SUPPLIED_EVIDENCE", evidenceUnitIds: ["answer-1:u2"], antecedentEvidenceUnitIds: ["answer-1:u1"] }),
    ]);
    expect(deriveLockVerificationFromProofV3(sameProof, same).nodes[0]!.support).toBe("VERIFIED");

    const cross = inputFor([
      { answerId: "answer-1", text: "Antecedent." },
      { answerId: "answer-2", text: "That completes it." },
    ]);
    const crossProof = proof([
      component("SOURCE"),
      component("MAPPING", { referenceStatus: "UNIQUE_WITHIN_SUPPLIED_EVIDENCE", evidenceUnitIds: ["answer-2:u1"], antecedentEvidenceUnitIds: ["answer-1:u1"] }),
    ]);
    expect(deriveLockVerificationFromProofV3(crossProof, cross).nodes[0]!.support).toBe("VERIFIED");
  });

  it("rejects missing, overlapping, or non-earlier UNIQUE antecedents", () => {
    const input = inputFor([{ answerId: "answer-1", text: "Earlier. Later." }]);
    const unique = (overrides: Partial<UnvalidatedComponentProof>) => proof([
      component("SOURCE"),
      component("MAPPING", { referenceStatus: "UNIQUE_WITHIN_SUPPLIED_EVIDENCE", evidenceUnitIds: ["answer-1:u2"], antecedentEvidenceUnitIds: ["answer-1:u1"], ...overrides }),
    ]);
    expect(() => deriveLockVerificationFromProofV3(unique({ antecedentEvidenceUnitIds: [] }), input)).toThrow(/UNIQUE_ANTECEDENT_REQUIRED/);
    expect(() => deriveLockVerificationFromProofV3(unique({ evidenceUnitIds: ["answer-1:u1"], antecedentEvidenceUnitIds: ["answer-1:u2"] }), input)).toThrow(/ANTECEDENT_NOT_EARLIER/);
    expect(() => deriveLockVerificationFromProofV3(unique({ evidenceUnitIds: ["answer-1:u1"], antecedentEvidenceUnitIds: ["answer-1:u1"] }), input)).toThrow(/EVIDENCE_ANTECEDENT_OVERLAP/);
  });

  it("retains a redacted rejected proof and stable structural reason", async () => {
    const input = inputFor([{ answerId: "answer-1", text: "Earlier. Later." }]);
    const malformed = proof([
      component("SOURCE"),
      component("MAPPING", { referenceStatus: "UNIQUE_WITHIN_SUPPLIED_EVIDENCE", evidenceUnitIds: ["answer-1:u1"], antecedentEvidenceUnitIds: ["answer-1:u2"] }),
    ]);
    const error = await new OpenAILockVerifierV3Adapter(new ScriptedTransport([malformed, malformed]), "candidate", () => 0).extractProof(input).catch((caught) => caught) as LockVerifierV3ExecutionError;
    expect(error).toBeInstanceOf(LockVerifierV3ExecutionError);
    expect(error.attempts).toHaveLength(2);
    expect(error.attempts[0]).toMatchObject({ failureCategory: "PROOF_RECORD_INVALID", validationReason: "ANTECEDENT_NOT_EARLIER", rejectedProof: malformed });
    expect(JSON.stringify(error.attempts)).not.toContain("Earlier. Later.");
    expect(JSON.stringify(error.attempts)).not.toContain(LOCK_VERIFIER_V3_SYSTEM_PROMPT);
  });

  it("keeps provider output component-only and request authority minimal", async () => {
    const input = inputFor([{ answerId: "answer-1", text: "Source and mapping." }]);
    expect(providerLockProofV3Schema.safeParse(proof()).success).toBe(true);
    expect(providerLockProofV3Schema.safeParse({ nodes: [{ ...proof().nodes[0], support: "VERIFIED" }] }).success).toBe(false);
    const transport = new ScriptedTransport([proof()]);
    await new OpenAILockVerifierV3Adapter(transport, "candidate", () => 0).extractProof(input);
    const payload = JSON.parse(transport.requests[0]!.input) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["evidenceUnits", "requiredNodes"]);
    expect(JSON.stringify(payload)).not.toMatch(/support|score|Lock|expected|rationale|caseId/);
    expect(transport.requests[0]).not.toHaveProperty("answers");
    expect(buildOpenAILockVerifierV3ClientOptions("secret")).toMatchObject({ apiKey: "secret", maxRetries: 0, logLevel: "off" });
    const request = buildOpenAILockVerifierV3ResponseRequest(transport.requests[0]!);
    expect(request).toMatchObject({ model: "candidate", store: false, tools: [], tool_choice: "none" });
    expect(LOCK_VERIFIER_V3_PROMPT_VERSION).toBe("lock-verify-v3");
    expect(LOCK_VERIFIER_V3_SYSTEM_PROMPT).toMatch(/never decide VERIFIED, INSUFFICIENT, Lock/);
  });
});
