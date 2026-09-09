import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { approvedContentSchema } from "@/domain/content/schema";
import { LOCK_VERIFIER_V2_SYSTEM_PROMPT } from "@/shared/lock-verifier-v2-prompts";
import { LOCK_VERIFIER_V3_SYSTEM_PROMPT } from "@/shared/lock-verifier-v3-prompts";
import { assertLockVerifierReportRedacted } from "../../tooling/lock-verifier-eval.mts";
import { loadLockVerifierV2Cases, loadLockVerifierV2Manifest } from "../../tooling/lock-verifier-v2-eval.mts";
import {
  buildLockVerifierV3Acceptance,
  loadLockVerifierV3Cases,
  loadLockVerifierV3Manifest,
} from "../../tooling/lock-verifier-v3-eval.mts";

describe("M3 Lock Verifier v3 development evaluation", () => {
  it("pins the 164 + 6 composition and hard cap", async () => {
    const manifest = await loadLockVerifierV3Manifest();
    expect(manifest).toMatchObject({ dataset_version: "lock-verifier-dev-v3", prompt_version: "lock-verify-v3", proof_contract_version: "lock-proof-v3", evaluator_version: "lock-verifier-eval-v3", content_slug: "conway-law", content_version: 4, expected_inherited_case_count: 164, expected_targeted_case_count: 6, expected_total_case_count: 170, hard_case_cap: 170, inherited_v2_case_identity_sha256: "40f618bb942354802fbcd30d63444bfd396862fc3a1f59fcef0fdcb9347bbc57" });
    const cases = await loadLockVerifierV3Cases();
    expect(cases).toHaveLength(170);
    expect(cases.filter(({ source }) => source === "inherited-v2")).toHaveLength(164);
    expect(cases.filter(({ source }) => source === "targeted-v3")).toHaveLength(6);
  });

  it("preserves every v2 surface answer and node expectation", async () => {
    const v2 = await loadLockVerifierV2Cases();
    const inherited = (await loadLockVerifierV3Cases()).filter(({ source }) => source === "inherited-v2");
    expect(inherited.map(({ id, input, expectedSupports }) => ({ id, answers: input.answers, expectedSupports }))).toEqual(v2.map(({ id, input, expectedSupports }) => ({ id, answers: input.answers, expectedSupports })));
    expect(inherited.map(({ provenance, rationale }) => ({ source: provenance.source, category: provenance.category, rationale }))).toEqual(v2.map(({ source, category, rationale }) => ({ source, category, rationale })));
    const v2Required = (await loadLockVerifierV2Manifest()).required_regression_case_ids;
    const v3Required = (await loadLockVerifierV3Manifest()).required_regression_case_ids;
    expect(v2Required.every((id) => v3Required.includes(id))).toBe(true);
    for (const testCase of inherited) expect(testCase.id.startsWith("v3-")).toBe(false);
  });

  it("adds exactly six bounded development cases with distinct approved purposes", async () => {
    const targeted = (await loadLockVerifierV3Cases()).filter(({ source }) => source === "targeted-v3");
    expect(targeted.map(({ id }) => id)).toEqual([
      "v3-reference-same-answer-unique-01",
      "v3-reference-same-answer-ambiguous-01",
      "v3-reference-omitted-antecedent-01",
      "v3-component-generic-influence-01",
      "v3-component-noncanonical-mapping-01",
      "v3-component-distributed-evidence-01",
    ]);
    expect(targeted.map(({ category }) => category)).toEqual(["reference", "reference", "reference", "component-boundary", "component-boundary", "distribution"]);
    for (const testCase of targeted) {
      expect(testCase.rationale.trim()).not.toBe("");
      expect(JSON.stringify(testCase.input.answers)).not.toMatch(/messy-|seed-020|prior-state-02|rejected-quote-04|spacing-full-04/);
    }
    expect(targeted.find(({ id }) => id === "v3-component-generic-influence-01")!.expectedSupports.SYSTEM_RESEMBLANCE).toBe("INSUFFICIENT");
  });

  it("parses historical schema v1 unchanged and makes v4 an explicit schema v2 extension", async () => {
    const v1 = approvedContentSchema.parse(JSON.parse(await readFile(path.resolve("content/approved/conway-law.v1.json"), "utf8")));
    const v2 = approvedContentSchema.parse(JSON.parse(await readFile(path.resolve("content/approved/conway-law.v2.json"), "utf8")));
    const v3 = approvedContentSchema.parse(JSON.parse(await readFile(path.resolve("content/approved/conway-law.v3.json"), "utf8")));
    const v4 = approvedContentSchema.parse(JSON.parse(await readFile(path.resolve("content/approved/conway-law.v4.json"), "utf8")));
    expect([v1.schema_version, v2.schema_version, v3.schema_version, v4.schema_version]).toEqual([1, 1, 1, 2]);
    expect(v4.version).toBe(4);
    expect(v4.PUBLIC_PLAY).toEqual(v3.PUBLIC_PLAY);
    expect(v4.JUDGE_RUBRIC).toEqual(v3.JUDGE_RUBRIC);
    expect(v4.REVEAL_CONTENT).toEqual(v3.REVEAL_CONTENT);
    if (v4.schema_version !== 2) throw new Error("Expected schema v2");
    const { lock_verifier, ...v4GameplayPolicy } = v4.SERVER_POLICY;
    expect(lock_verifier.contract_version).toBe("proof-components-v1");
    expect(v4GameplayPolicy).toEqual(v3.SERVER_POLICY);
    expect(JSON.stringify(v4.PUBLIC_PLAY)).not.toContain("lock_verifier");
  });

  it("validates complete generic verifier coverage and rejects malformed policies", async () => {
    const rawV4 = JSON.parse(await readFile(path.resolve("content/approved/conway-law.v4.json"), "utf8"));
    const parsed = approvedContentSchema.parse(rawV4);
    if (parsed.schema_version !== 2) throw new Error("Expected schema v2");
    expect(parsed.SERVER_POLICY.lock_verifier).toMatchObject({ contract_version: "proof-components-v1" });
    expect(parsed.SERVER_POLICY.lock_verifier.nodes.map(({ node_id, required_components }) => [node_id, required_components.map(({ id }) => id)])).toEqual([
      ["TEAM_BOUNDARIES", ["ACTOR_GROUPING"]],
      ["COMMUNICATION_FRICTION", ["COMMUNICATION_DIFFERENCE"]],
      ["SYSTEM_RESEMBLANCE", ["SOURCE_BOUNDARY", "OUTPUT_STRUCTURE", "STRUCTURAL_CORRESPONDENCE"]],
    ]);
    const system = parsed.SERVER_POLICY.lock_verifier.nodes.find(({ node_id }) => node_id === "SYSTEM_RESEMBLANCE")!;
    expect(system.required_components.find(({ id }) => id === "OUTPUT_STRUCTURE")!.description).toMatch(/Merely naming a product or output/);
    expect(system.required_components.find(({ id }) => id === "STRUCTURAL_CORRESPONDENCE")!.description).toMatch(/Generic influence, causation, relatedness, continuation/);

    const missing = structuredClone(rawV4);
    missing.SERVER_POLICY.lock_verifier.nodes = missing.SERVER_POLICY.lock_verifier.nodes.slice(1);
    expect(() => approvedContentSchema.parse(missing)).toThrow(/Missing verifier coverage/);
    const duplicate = structuredClone(rawV4);
    duplicate.SERVER_POLICY.lock_verifier.nodes[0].required_components.push(structuredClone(duplicate.SERVER_POLICY.lock_verifier.nodes[0].required_components[0]));
    expect(() => approvedContentSchema.parse(duplicate)).toThrow(/Duplicate verifier component/);
    const unknown = structuredClone(rawV4);
    unknown.SERVER_POLICY.lock_verifier.nodes[0].node_id = "UNKNOWN_NODE";
    expect(() => approvedContentSchema.parse(unknown)).toThrow(/Unknown verifier node/);
    const empty = structuredClone(rawV4);
    empty.SERVER_POLICY.lock_verifier.nodes[0].required_components = [];
    expect(() => approvedContentSchema.parse(empty)).toThrow();

    const historicalWithVerifier = JSON.parse(await readFile(path.resolve("content/approved/conway-law.v3.json"), "utf8"));
    historicalWithVerifier.SERVER_POLICY.lock_verifier = rawV4.SERVER_POLICY.lock_verifier;
    expect(() => approvedContentSchema.parse(historicalWithVerifier)).toThrow();
  });

  it("keeps the Lock verifier contract out of pre-Reveal projections", async () => {
    for (const file of ["src/application/play/daily-game.ts", "src/application/play/session-view.ts", "src/app/api/daily/route.ts", "src/app/api/play-sessions/route.ts"]) {
      expect(await readFile(path.resolve(file), "utf8"), file).not.toMatch(/lock_verifier|proof-components-v1|ACTOR_GROUPING|STRUCTURAL_CORRESPONDENCE/);
    }
  });

  it("reports the eleven exact future v3 hard gates", () => {
    const passing = buildLockVerifierV3Acceptance({ caseCount: 170, approval: { precision: 1, recall: .85, false_approval_count: 0 }, overallVerifiedPrecision: .95, perNodeVerifiedPrecision: { A: .95, B: 1 }, requiredRegressionSupportsExactMatch: true, schemaApplicationValidCount: 170, unrecoveredVerificationFailureCount: 0, leakageCount: 0, retryCaseCount: 8 });
    expect(passing.development_live_gate).toBe("PASS");
    expect(Object.keys(passing.hard_gates)).toHaveLength(11);
    const failing = buildLockVerifierV3Acceptance({ caseCount: 170, approval: { precision: .99, recall: 1, false_approval_count: 1 }, overallVerifiedPrecision: 1, perNodeVerifiedPrecision: { A: 1 }, requiredRegressionSupportsExactMatch: true, schemaApplicationValidCount: 170, unrecoveredVerificationFailureCount: 0, leakageCount: 0, retryCaseCount: 0 });
    expect(failing).toMatchObject({ development_live_gate: "FAIL", hard_gates: { false_approval_count_equals_0: false, approval_precision_equals_1: false } });
  });

  it("allows safe rejected-proof fields but rejects raw material", () => {
    const safe = { rejected_proof_diagnostics: [{ caseId: "case", attempt: 1, nodeId: "N", componentId: "C", endorsementStatus: "ENDORSED", referenceStatus: "SELF_CONTAINED", componentMatch: "COMPLETE_COMPONENT_MATCH", evidenceUnitIds: ["a:u1"], antecedentEvidenceUnitIds: [], failureCategory: "PROOF_RECORD_INVALID", validationReason: "MISSING_COMPONENT" }] };
    expect(() => assertLockVerifierReportRedacted(safe, ["private answer"])).not.toThrow();
    expect(() => assertLockVerifierReportRedacted({ ...safe, providerPayload: "secret" }, ["private answer"])).toThrow(/forbidden raw field/);
    expect(() => assertLockVerifierReportRedacted({ ...safe, note: "private answer" }, ["private answer"])).toThrow(/raw answer/);
  });

  it("pins historical v2 identities and keeps v3 evaluator-only", async () => {
    expect(createHash("sha256").update(LOCK_VERIFIER_V2_SYSTEM_PROMPT).digest("hex")).toBe("7f0735a9bcffe3d96c327db0d9b00f6edd2bd5ea3a7cfb7d77589467195a6b2d");
    expect(createHash("sha256").update(await readFile(path.resolve("eval/lock-verifier/v2/manifest.json"))).digest("hex")).toBe("2d3011131b7f590503478fd017d2ade88f3deeee63a67da03bb40af7a509ea3f");
    expect(createHash("sha256").update(await readFile(path.resolve("eval/lock-verifier/v2/targeted-cases.json"))).digest("hex")).toBe("8d38c03a674640a60b3df8957c827122762ca659c6d6df87d840483a104d5341");
    expect(createHash("sha256").update(LOCK_VERIFIER_V3_SYSTEM_PROMPT).digest("hex")).toBe("a6a698a889085e7f6b4a5fc95a0cce119b0acce03d2d06ea92fa0c080a11fc36");
    expect(createHash("sha256").update(await readFile(path.resolve("eval/lock-verifier/v3/manifest.json"))).digest("hex")).toBe("f41f8a964ee90309712af700e84a8708a60507beb1ca3663efb590af962a0382");
    expect(createHash("sha256").update(await readFile(path.resolve("eval/lock-verifier/v3/targeted-cases.json"))).digest("hex")).toBe("b2474b471a10bcc6637a0ce0cbc36d550f353b0f7645232443369762bc9e5047");
    expect(createHash("sha256").update(await readFile(path.resolve("content/approved/conway-law.v4.json"))).digest("hex")).toBe("c57fb6171c0fc281c495c8d6500ae81cb2eec72ed7a54c77f1a17295e53c747b");
    expect(LOCK_VERIFIER_V3_SYSTEM_PROMPT).not.toMatch(/messy-|seed-020|Conway|콘웨이/);
    for (const file of ["src/application/play/daily-game.ts", "src/domain/play/policy.ts", "src/server/container.ts", "src/adapters/postgres-primary-store/postgres-primary-store.ts"]) {
      expect(await readFile(path.resolve(file), "utf8"), file).not.toMatch(/LockVerifierV3|lock-verify-v3|lock-verifier-dev-v3/);
    }
  });
});
