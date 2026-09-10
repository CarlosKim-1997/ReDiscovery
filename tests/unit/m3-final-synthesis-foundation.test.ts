import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFinalSynthesisEvidenceUnits,
  FINAL_SYNTHESIS_MAX_CHARS,
} from "@/application/play/final-synthesis-evidence-units";
import {
  deriveFinalSynthesisVerification,
  isFinalSynthesisEligible,
} from "@/application/play/final-synthesis-proof";
import { approvedContentSchema } from "@/domain/content/schema";
import {
  FINAL_SYNTHESIS_PROOF_CONTRACT_VERSION,
  validateFinalSynthesisProofStructure,
  type FinalSynthesisVerifierInput,
  type UnvalidatedFinalSynthesisComponentProof,
  type UnvalidatedFinalSynthesisProof,
} from "@/ports/final-synthesis-verifier";
import { LOCK_VERIFIER_V3_SYSTEM_PROMPT } from "@/shared/lock-verifier-v3-prompts";

const requiredNodes: FinalSynthesisVerifierInput["requiredNodes"] = [{
  nodeId: "NODE",
  requiredComponents: [
    { componentId: "SOURCE", description: "An explicit source structure." },
    { componentId: "MAPPING", description: "An explicit structural mapping." },
  ],
}];

function input(text = "Source. Mapping."): FinalSynthesisVerifierInput {
  return { requiredNodes, submission: { text }, evidenceUnits: buildFinalSynthesisEvidenceUnits(text) };
}

function component(
  componentId: string,
  overrides: Partial<UnvalidatedFinalSynthesisComponentProof> = {},
): UnvalidatedFinalSynthesisComponentProof {
  return {
    componentId,
    endorsementStatus: "ENDORSED",
    referenceStatus: "SELF_CONTAINED",
    componentMatch: "COMPLETE_COMPONENT_MATCH",
    evidenceUnitIds: ["synthesis:u1"],
    antecedentEvidenceUnitIds: [],
    ...overrides,
  };
}

function proof(
  components = [component("SOURCE"), component("MAPPING")],
  nodeId = "NODE",
): UnvalidatedFinalSynthesisProof {
  return { nodes: [{ nodeId, components }] };
}

describe("M3 Final Synthesis content foundation", () => {
  it("keeps historical schemas unchanged and adds only schema v3 policy to Conway v5", async () => {
    const parseVersion = async (version: number) => approvedContentSchema.parse(JSON.parse(await readFile(path.resolve(`content/approved/conway-law.v${version}.json`), "utf8")));
    const v1 = await parseVersion(1);
    const v2 = await parseVersion(2);
    const v3 = await parseVersion(3);
    const v4 = await parseVersion(4);
    const v5 = await parseVersion(5);
    expect([v1.schema_version, v2.schema_version, v3.schema_version, v4.schema_version, v5.schema_version]).toEqual([1, 1, 1, 2, 3]);
    expect(v5.version).toBe(5);
    if (v4.schema_version !== 2 || v5.schema_version !== 3) throw new Error("Expected component and synthesis schemas");
    const { final_synthesis, ...v5ExistingPolicy } = v5.SERVER_POLICY;
    expect({ slug: v5.slug, status: v5.status, approved_at: v5.approved_at }).toEqual({ slug: v4.slug, status: v4.status, approved_at: v4.approved_at });
    expect(v5.PUBLIC_PLAY).toEqual(v4.PUBLIC_PLAY);
    expect(v5.JUDGE_RUBRIC).toEqual(v4.JUDGE_RUBRIC);
    expect(v5.REVEAL_CONTENT).toEqual(v4.REVEAL_CONTENT);
    expect(v5ExistingPolicy).toEqual(v4.SERVER_POLICY);
    expect(final_synthesis).toEqual({ contract_version: "final-synthesis-v1", max_chars: 500, max_submissions: 2 });
    expect(FINAL_SYNTHESIS_MAX_CHARS).toBe(500);
  });

  it("rejects silent Final Synthesis injection into schema v1 and v2", async () => {
    const historical = JSON.parse(await readFile(path.resolve("content/approved/conway-law.v1.json"), "utf8"));
    historical.SERVER_POLICY.final_synthesis = { contract_version: "final-synthesis-v1", max_chars: 500, max_submissions: 2 };
    expect(() => approvedContentSchema.parse(historical)).toThrow();

    const componentVersion = JSON.parse(await readFile(path.resolve("content/approved/conway-law.v4.json"), "utf8"));
    componentVersion.SERVER_POLICY.final_synthesis = { contract_version: "final-synthesis-v1", max_chars: 500, max_submissions: 2 };
    expect(() => approvedContentSchema.parse(componentVersion)).toThrow();
  });

  it("rejects non-positive or non-contract Final Synthesis limits", async () => {
    const raw = JSON.parse(await readFile(path.resolve("content/approved/conway-law.v5.json"), "utf8"));
    for (const maxChars of [0, -1, 499, 500.5]) {
      const candidate = structuredClone(raw);
      candidate.SERVER_POLICY.final_synthesis.max_chars = maxChars;
      expect(() => approvedContentSchema.parse(candidate)).toThrow();
    }
    for (const maxSubmissions of [0, -1, 1, 3, 2.5]) {
      const candidate = structuredClone(raw);
      candidate.SERVER_POLICY.final_synthesis.max_submissions = maxSubmissions;
      expect(() => approvedContentSchema.parse(candidate)).toThrow();
    }
  });

  it("keeps Final Synthesis server-only and leaves v5 unscheduled", async () => {
    const v5 = approvedContentSchema.parse(JSON.parse(await readFile(path.resolve("content/approved/conway-law.v5.json"), "utf8")));
    expect(JSON.stringify(v5.PUBLIC_PLAY)).not.toMatch(/final_synthesis|final-synthesis|ACTOR_GROUPING|STRUCTURAL_CORRESPONDENCE/);
    expect(JSON.stringify(v5.REVEAL_CONTENT)).not.toMatch(/final_synthesis|final-synthesis/);
    const schedule = JSON.parse(await readFile(path.resolve("content/schedule/daily.v1.json"), "utf8")) as { entries: { content: { version: number } }[] };
    expect(schedule.entries.every(({ content }) => content.version !== 5)).toBe(true);
  });
});

describe("M3 Final Synthesis evidence units", () => {
  it("segments one synthesis deterministically with exact UTF-16 spans and stable IDs", () => {
    const text = "  첫째😀.  둘째\r\n셋째!  ";
    const first = buildFinalSynthesisEvidenceUnits(text);
    expect(first).toEqual([
      { unitId: "synthesis:u1", start: 2, end: 7, text: "첫째😀." },
      { unitId: "synthesis:u2", start: 9, end: 11, text: "둘째" },
      { unitId: "synthesis:u3", start: 13, end: 16, text: "셋째!" },
    ]);
    expect(buildFinalSynthesisEvidenceUnits(text)).toEqual(first);
    for (const unit of first) expect(text.slice(unit.start, unit.end)).toBe(unit.text);
  });

  it("preserves spacing and Unicode while enforcing the 500 UTF-16-unit boundary", () => {
    expect(buildFinalSynthesisEvidenceUnits("가  나")[0]!.text).toBe("가  나");
    expect(buildFinalSynthesisEvidenceUnits("가".repeat(500))).toHaveLength(1);
    expect(() => buildFinalSynthesisEvidenceUnits("가".repeat(501))).toThrow(/FINAL_SYNTHESIS_TOO_LONG/);
    expect(() => buildFinalSynthesisEvidenceUnits(" \r\n ")).toThrow(/FINAL_SYNTHESIS_EMPTY/);
  });
});

describe("M3 final-synthesis-proof-v1", () => {
  it("keeps semantic input authority limited to component metadata and one synthesis", () => {
    const candidate = input();
    expect(Object.keys(candidate).sort()).toEqual(["evidenceUnits", "requiredNodes", "submission"]);
    expect(Object.keys(candidate.submission)).toEqual(["text"]);
    expect(JSON.stringify(candidate)).not.toMatch(/previousAnswer|judge|priorConfirmedState|guidance|reveal|historical|expected|rationale|previousProof/i);
    expect(FINAL_SYNTHESIS_PROOF_CONTRACT_VERSION).toBe("final-synthesis-proof-v1");
  });

  it("accepts SELF_CONTAINED and RESOLVED_WITHIN_SYNTHESIS with multiple earlier local antecedents", () => {
    const candidate = input("Source. Output. Those correspond.");
    const result = deriveFinalSynthesisVerification(proof([
      component("SOURCE", { evidenceUnitIds: ["synthesis:u1"] }),
      component("MAPPING", {
        referenceStatus: "RESOLVED_WITHIN_SYNTHESIS",
        evidenceUnitIds: ["synthesis:u3"],
        antecedentEvidenceUnitIds: ["synthesis:u1", "synthesis:u2"],
      }),
    ]), candidate);
    expect(result.nodes[0]).toMatchObject({ support: "VERIFIED", components: [{ satisfied: true }, { satisfied: true }] });
    expect(isFinalSynthesisEligible(result)).toBe(true);
  });

  it.each(["UNRESOLVED", "AMBIGUOUS"] as const)("derives %s references as insufficient", (referenceStatus) => {
    const result = deriveFinalSynthesisVerification(proof([
      component("SOURCE"),
      component("MAPPING", { referenceStatus, evidenceUnitIds: ["synthesis:u2"] }),
    ]), input());
    expect(result.nodes[0]!.support).toBe("INSUFFICIENT");
    expect(isFinalSynthesisEligible(result)).toBe(false);
  });

  it("requires every component for a node and every node for eligibility", () => {
    const incomplete = deriveFinalSynthesisVerification(proof([
      component("SOURCE"),
      component("MAPPING", { componentMatch: "PARTIAL_COMPONENT_MATCH" }),
    ]), input());
    expect(incomplete.nodes[0]!.support).toBe("INSUFFICIENT");

    const twoNodeInput: FinalSynthesisVerifierInput = {
      requiredNodes: [
        { nodeId: "ONE", requiredComponents: [{ componentId: "A", description: "A" }] },
        { nodeId: "TWO", requiredComponents: [{ componentId: "B", description: "B" }] },
      ],
      submission: { text: "Complete." },
      evidenceUnits: buildFinalSynthesisEvidenceUnits("Complete."),
    };
    const complete = deriveFinalSynthesisVerification({ nodes: [
      { nodeId: "ONE", components: [component("A")] },
      { nodeId: "TWO", components: [component("B")] },
    ] }, twoNodeInput);
    expect(complete.nodes.every(({ support }) => support === "VERIFIED")).toBe(true);
    expect(isFinalSynthesisEligible(complete)).toBe(true);
  });

  it("rejects missing, unknown, and duplicate nodes or components", () => {
    const candidate = input();
    expect(() => deriveFinalSynthesisVerification({ nodes: [] }, candidate)).toThrow(/MISSING_NODE/);
    expect(() => deriveFinalSynthesisVerification(proof(undefined, "OTHER"), candidate)).toThrow(/UNKNOWN_NODE/);
    expect(() => deriveFinalSynthesisVerification({ nodes: [proof().nodes[0], proof().nodes[0]] }, candidate)).toThrow(/DUPLICATE_NODE_ID/);
    expect(() => deriveFinalSynthesisVerification(proof([component("SOURCE")]), candidate)).toThrow(/MISSING_COMPONENT/);
    expect(() => deriveFinalSynthesisVerification(proof([component("SOURCE"), component("OTHER")]), candidate)).toThrow(/UNKNOWN_COMPONENT/);
    expect(() => deriveFinalSynthesisVerification(proof([component("SOURCE"), component("SOURCE")]), candidate)).toThrow(/DUPLICATE_COMPONENT_ID/);
  });

  it("rejects invalid evidence identity, overlap, and reference structure", () => {
    const candidate = input("Earlier. Later.");
    const resolved = (overrides: Partial<UnvalidatedFinalSynthesisComponentProof>) => proof([
      component("SOURCE"),
      component("MAPPING", {
        referenceStatus: "RESOLVED_WITHIN_SYNTHESIS",
        evidenceUnitIds: ["synthesis:u2"],
        antecedentEvidenceUnitIds: ["synthesis:u1"],
        ...overrides,
      }),
    ]);
    expect(() => deriveFinalSynthesisVerification(resolved({ evidenceUnitIds: ["missing"] }), candidate)).toThrow(/UNKNOWN_EVIDENCE_UNIT/);
    expect(() => deriveFinalSynthesisVerification(resolved({ evidenceUnitIds: ["synthesis:u2", "synthesis:u2"] }), candidate)).toThrow(/DUPLICATE_EVIDENCE_UNIT_ID/);
    expect(() => deriveFinalSynthesisVerification(resolved({ antecedentEvidenceUnitIds: ["synthesis:u1", "synthesis:u1"] }), candidate)).toThrow(/DUPLICATE_ANTECEDENT_EVIDENCE_UNIT_ID/);
    expect(() => deriveFinalSynthesisVerification(resolved({ evidenceUnitIds: ["synthesis:u1"], antecedentEvidenceUnitIds: ["synthesis:u1"] }), candidate)).toThrow(/EVIDENCE_ANTECEDENT_OVERLAP/);
    expect(() => deriveFinalSynthesisVerification(resolved({ evidenceUnitIds: ["synthesis:u1"], antecedentEvidenceUnitIds: ["synthesis:u2"] }), candidate)).toThrow(/ANTECEDENT_NOT_EARLIER/);
    expect(() => deriveFinalSynthesisVerification(resolved({ evidenceUnitIds: [], componentMatch: "PARTIAL_COMPONENT_MATCH" }), candidate)).toThrow(/RESOLVED_EVIDENCE_REQUIRED/);
    expect(() => deriveFinalSynthesisVerification(resolved({ antecedentEvidenceUnitIds: [] }), candidate)).toThrow(/RESOLVED_ANTECEDENT_REQUIRED/);
    expect(() => deriveFinalSynthesisVerification(proof([component("SOURCE"), component("MAPPING", { antecedentEvidenceUnitIds: ["synthesis:u2"] })]), candidate)).toThrow(/SELF_CONTAINED_ANTECEDENT_FORBIDDEN/);
    expect(() => deriveFinalSynthesisVerification(proof([component("SOURCE"), component("MAPPING", { referenceStatus: "UNRESOLVED", antecedentEvidenceUnitIds: ["synthesis:u2"] })]), candidate)).toThrow(/NON_RESOLVED_ANTECEDENT_FORBIDDEN/);
    expect(() => deriveFinalSynthesisVerification(proof([component("SOURCE"), component("MAPPING", { evidenceUnitIds: [] })]), candidate)).toThrow(/COMPLETE_MATCH_EVIDENCE_REQUIRED/);
  });

  it("rejects span/list drift and binary support escape hatches", () => {
    const candidate = input();
    const spanDrift = { ...candidate, evidenceUnits: [{ ...candidate.evidenceUnits[0]!, text: "copied" }, candidate.evidenceUnits[1]!] };
    expect(() => validateFinalSynthesisProofStructure(proof(), spanDrift)).toThrow(/EVIDENCE_UNIT_SPAN_MISMATCH/);
    const listDrift = { ...candidate, evidenceUnits: candidate.evidenceUnits.slice(0, 1) };
    expect(() => deriveFinalSynthesisVerification(proof(), listDrift)).toThrow(/EVIDENCE_UNIT_LIST_MISMATCH/);
    expect(() => deriveFinalSynthesisVerification({ ...proof(), support: "VERIFIED" }, candidate)).toThrow(/PROOF_SHAPE_INVALID/);
    expect(() => deriveFinalSynthesisVerification({ nodes: [{ ...proof().nodes[0], lock: true }] }, candidate)).toThrow(/PROOF_SHAPE_INVALID/);
    expect(() => deriveFinalSynthesisVerification({ nodes: [{ nodeId: "NODE", components: [{ ...component("SOURCE"), score: 1 }, component("MAPPING")] }] }, candidate)).toThrow(/PROOF_SHAPE_INVALID/);
  });
});

describe("M3 historical Lock Verifier v3 integrity", () => {
  it("keeps prompt, manifest, targeted corpus, and Conway v4 hashes unchanged", async () => {
    expect(createHash("sha256").update(LOCK_VERIFIER_V3_SYSTEM_PROMPT).digest("hex")).toBe("be86c4fe20921d866b9774892b893812d9348acdfa993a9d8256f95d38fbf5bd");
    for (const [file, expected] of [
      ["eval/lock-verifier/v3/manifest.json", "f41f8a964ee90309712af700e84a8708a60507beb1ca3663efb590af962a0382"],
      ["eval/lock-verifier/v3/targeted-cases.json", "b2474b471a10bcc6637a0ce0cbc36d550f353b0f7645232443369762bc9e5047"],
      ["content/approved/conway-law.v4.json", "c57fb6171c0fc281c495c8d6500ae81cb2eec72ed7a54c77f1a17295e53c747b"],
    ] as const) {
      expect(createHash("sha256").update(await readFile(path.resolve(file))).digest("hex"), file).toBe(expected);
    }
    const manifest = JSON.parse(await readFile(path.resolve("eval/lock-verifier/v3/manifest.json"), "utf8"));
    expect(manifest.inherited_v2_case_identity_sha256).toBe("40f618bb942354802fbcd30d63444bfd396862fc3a1f59fcef0fdcb9347bbc57");
  });
});
