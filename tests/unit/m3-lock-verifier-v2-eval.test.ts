import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCK_VERIFIER_V2_SYSTEM_PROMPT } from "@/shared/lock-verifier-v2-prompts";
import { assertLockVerifierReportRedacted, loadLockVerifierCases } from "../../tooling/lock-verifier-eval.mts";
import {
  buildLockVerifierV2Acceptance,
  loadLockVerifierV2Cases,
  loadLockVerifierV2Manifest,
} from "../../tooling/lock-verifier-v2-eval.mts";

describe("M3 Lock Verifier v2 development evaluation", () => {
  it("pins distinct identity and exact 140 + 24 composition", async () => {
    const manifest = await loadLockVerifierV2Manifest();
    expect(manifest).toMatchObject({ dataset_version: "lock-verifier-dev-v2", prompt_version: "lock-verify-v2", content_slug: "conway-law", content_version: 3, expected_inherited_case_count: 140, expected_targeted_case_count: 24, expected_total_case_count: 164, targeted_category_counts: { reference: 6, "relation-strength": 6, endorsement: 6, "evidence-format": 6 } });
    const cases = await loadLockVerifierV2Cases();
    expect(cases).toHaveLength(164);
    expect(cases.filter(({ source }) => source === "inherited-v1")).toHaveLength(140);
    expect(cases.filter(({ source }) => source === "targeted-v2")).toHaveLength(24);
    for (const category of ["reference", "relation-strength", "endorsement", "evidence-format"]) expect(cases.filter((testCase) => testCase.category === category), category).toHaveLength(6);
  });

  it("inherits all v1 answers and labels unchanged", async () => {
    const v1 = await loadLockVerifierCases();
    const inherited = (await loadLockVerifierV2Cases()).filter(({ source }) => source === "inherited-v1");
    expect(inherited.map(({ id, input, expectedSupports }) => ({ id, answers: input.answers, expectedSupports }))).toEqual(v1.map(({ id, input, expectedSupports }) => ({ id, answers: input.answers, expectedSupports })));
  });

  it("keeps targeted cases development-only, rationalized, and free of known failure identities", async () => {
    const targeted = (await loadLockVerifierV2Cases()).filter(({ source }) => source === "targeted-v2");
    for (const testCase of targeted) {
      expect(testCase.id).toMatch(/^v2-/);
      expect(testCase.rationale.trim()).not.toBe("");
      expect(JSON.stringify(testCase.input.answers)).not.toMatch(/messy-prior-state-02|messy-rejected-quote-04|messy-spacing-full-04/);
      for (const unit of testCase.input.evidenceUnits) expect(testCase.input.answers.find(({ answerId }) => answerId === unit.answerId)!.text.slice(unit.start, unit.end)).toBe(unit.text);
    }
    expect(LOCK_VERIFIER_V2_SYSTEM_PROMPT).not.toMatch(/messy-prior-state-02|messy-rejected-quote-04|messy-spacing-full-04/);
  });

  it("reports all eleven frozen v2 hard gates at exact boundaries", () => {
    const passing = buildLockVerifierV2Acceptance({ caseCount: 164, approval: { precision: 1, recall: .85, false_approval_count: 0 }, overallVerifiedPrecision: .95, perNodeVerifiedPrecision: { A: .95, B: 1 }, requiredRegressionSupportsExactMatch: true, schemaApplicationValidCount: 164, unrecoveredVerificationFailureCount: 0, leakageCount: 0, retryCaseCount: 8 });
    expect(passing.development_live_gate).toBe("PASS");
    expect(Object.keys(passing.hard_gates)).toHaveLength(11);
    const failing = buildLockVerifierV2Acceptance({ caseCount: 164, approval: { precision: .99, recall: 1, false_approval_count: 1 }, overallVerifiedPrecision: 1, perNodeVerifiedPrecision: { A: 1 }, requiredRegressionSupportsExactMatch: true, schemaApplicationValidCount: 164, unrecoveredVerificationFailureCount: 0, leakageCount: 0, retryCaseCount: 0 });
    expect(failing).toMatchObject({ development_live_gate: "FAIL", hard_gates: { false_approval_count_equals_0: false, approval_precision_equals_1: false } });
  });

  it("permits redacted proof diagnostics but rejects raw answers and payload fields", () => {
    expect(() => assertLockVerifierReportRedacted({ proof_diagnostics: [{ id: "case", nodes: [{ nodeId: "N", endorsementStatus: "ENDORSED", referenceStatus: "SELF_CONTAINED", semanticMatch: "COMPLETE_NODE_MATCH", evidenceUnitIds: ["a:u1"], antecedentEvidenceUnitIds: [] }] }] }, ["private answer"])).not.toThrow();
    expect(() => assertLockVerifierReportRedacted({ providerPayload: "secret" }, ["private answer"])).toThrow(/forbidden raw field/);
    expect(() => assertLockVerifierReportRedacted({ note: "private answer" }, ["private answer"])).toThrow(/raw answer/);
  });

  it("pins v2 prompt and dataset bytes while preserving v1 hash tests independently", async () => {
    expect(createHash("sha256").update(LOCK_VERIFIER_V2_SYSTEM_PROMPT).digest("hex")).toBe("7f0735a9bcffe3d96c327db0d9b00f6edd2bd5ea3a7cfb7d77589467195a6b2d");
    expect(createHash("sha256").update(await readFile(path.resolve("eval/lock-verifier/v2/manifest.json"))).digest("hex")).toBe("2d3011131b7f590503478fd017d2ade88f3deeee63a67da03bb40af7a509ea3f");
    expect(createHash("sha256").update(await readFile(path.resolve("eval/lock-verifier/v2/targeted-cases.json"))).digest("hex")).toBe("8d38c03a674640a60b3df8957c827122762ca659c6d6df87d840483a104d5341");
  });

  it("keeps v2 out of gameplay, persistence, and composition", async () => {
    for (const file of ["src/application/play/daily-game.ts", "src/domain/play/policy.ts", "src/server/container.ts", "src/adapters/postgres-primary-store/postgres-primary-store.ts"]) {
      expect(await readFile(path.resolve(file), "utf8"), file).not.toMatch(/LockVerifierV2|lock-verify-v2|lock-verifier-dev-v2/);
    }
  });
});
