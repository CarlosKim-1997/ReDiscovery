import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import rawV3 from "../../content/approved/conway-law.v3.json";
import { approvedContentSchema } from "@/domain/content/schema";
import { JUDGE_V3_SYSTEM_PROMPT } from "@/shared/judge-prompts";
import { LOCK_VERIFIER_PROMPT_VERSION } from "@/shared/lock-verifier-prompts";
import { loadCases } from "../../tooling/judge-eval.mts";
import {
  assertLockVerifierReportRedacted,
  loadLockVerifierCases,
  loadLockVerifierManifest,
} from "../../tooling/lock-verifier-eval.mts";

describe("M3 Lock Verifier development evaluation", () => {
  it("pins the verifier dataset identity and composition", async () => {
    const manifest = await loadLockVerifierManifest();
    expect(manifest).toMatchObject({ dataset_version: "lock-verifier-dev-v1", prompt_version: LOCK_VERIFIER_PROMPT_VERSION, content_slug: "conway-law", content_version: 3, expected_single_case_count: 124, expected_multi_case_count: 16, expected_total_case_count: 140, candidate_model: "gpt-5.6-luna" });
    const cases = await loadLockVerifierCases();
    expect(cases).toHaveLength(140);
    expect(cases.filter(({ source }) => source === "single")).toHaveLength(124);
    expect(cases.filter(({ source }) => source === "multi")).toHaveLength(16);
    expect(createHash("sha256").update(await readFile(path.resolve("eval/lock-verifier/v1/manifest.json"))).digest("hex")).toBe("5a7905877ec9d27cabdd7eaf90a04d51286e0c7414aba32eb74e02fdcf3350d3");
    expect(createHash("sha256").update(await readFile(path.resolve("eval/lock-verifier/v1/multi-answer.json"))).digest("hex")).toBe("d4016b1b7e0f8ca06fb81eb3e44b3fc981ce0335ff288ea541cbf3e9c1c8e45a");
  });

  it("mechanically derives every single-answer required-node support from frozen v3", async () => {
    const content = approvedContentSchema.parse(rawV3);
    const required = content.SERVER_POLICY.required_nodes;
    const judgeCases = await loadCases(path.resolve("eval/judge/v3"));
    const verifierCases = (await loadLockVerifierCases()).filter(({ source }) => source === "single");
    for (const [index, verifierCase] of verifierCases.entries()) {
      const judgeCase = judgeCases[index]!;
      expect(verifierCase.id).toBe(judgeCase.id);
      expect(verifierCase.input.answers).toEqual([{ answerId: "answer-1", text: judgeCase.current_answer }]);
      expect(verifierCase.expectedSupports).toEqual(Object.fromEntries(required.map((nodeId) => [nodeId, judgeCase.expected_node_statuses[nodeId] === "DISCOVERED" ? "VERIFIED" : "INSUFFICIENT"])));
    }
  });

  it("keeps multi-answer fixtures bounded, reviewed, complete, and free of Reveal identities", async () => {
    const content = approvedContentSchema.parse(rawV3);
    const multi = (await loadLockVerifierCases()).filter(({ source }) => source === "multi");
    for (const testCase of multi) {
      expect(testCase.input.answers).toHaveLength(2);
      expect(testCase.rationale.trim()).not.toBe("");
      expect(Object.keys(testCase.expectedSupports).sort()).toEqual([...content.SERVER_POLICY.required_nodes].sort());
      const serialized = JSON.stringify(testCase.input.answers);
      expect(serialized).not.toContain(content.REVEAL_CONTENT.theory);
      expect(serialized).not.toContain(content.REVEAL_CONTENT.person);
      expect(serialized).not.toContain(content.REVEAL_CONTENT.year);
      for (const alias of content.SERVER_POLICY.recognition_aliases ?? []) expect(serialized).not.toContain(alias);
    }
  });

  it("includes every dedicated regression subset and safety spot check", async () => {
    const manifest = await loadLockVerifierManifest();
    const cases = await loadLockVerifierCases();
    for (const subset of manifest.regression_subsets) expect(cases.filter((testCase) => testCase.regressionSubset === subset), subset).toHaveLength(4);
    for (const id of manifest.required_regression_case_ids) {
      const testCase = cases.find((candidate) => candidate.id === id)!;
      expect(Object.values(testCase.expectedSupports).every((support) => support === "VERIFIED"), id).toBe(false);
    }
  });

  it("rejects raw answer and evidence fields in reports", () => {
    expect(() => assertLockVerifierReportRedacted({ case_count: 1, failures: [{ id: "case-1" }] }, ["private answer"])).not.toThrow();
    expect(() => assertLockVerifierReportRedacted({ answers: ["private answer"] }, ["private answer"])).toThrow(/forbidden raw field/);
    expect(() => assertLockVerifierReportRedacted({ note: "private answer" }, ["private answer"])).toThrow(/raw answer/);
    expect(() => assertLockVerifierReportRedacted({ evidenceText: "fragment" }, ["private answer"])).toThrow(/forbidden raw field/);
  });

  it("freezes every v3 comparison identity", async () => {
    expect(createHash("sha256").update(JUDGE_V3_SYSTEM_PROMPT).digest("hex")).toBe("b53c1955a225e44a3fd2e40c98fbd07ab413d0e73d325fbaf49650899a3a927f");
    for (const [file, expected] of Object.entries({
      "content/approved/conway-law.v3.json": "f0e17aa32ee429e0d37d55b29cc353d13514993aeda8f1854973c2f9d9434d9e",
      "eval/judge/v3/manifest.json": "9232f2aa2637c86b28cac0ddf319edbba6bd391881741ae6ed5fa66f0ddb23ab",
      "eval/judge/v3/label-overrides.json": "ce2e0a4acfb95e00ffe5a5bd588e27b9dfaf026591dfae99dcf90d4b21bce2bb",
    })) {
      expect(createHash("sha256").update(await readFile(path.resolve(file))).digest("hex")).toBe(expected);
    }
  });

  it("keeps the verifier out of gameplay, persistence, and runtime composition", async () => {
    for (const file of [
      "src/application/play/daily-game.ts",
      "src/domain/play/policy.ts",
      "src/server/container.ts",
      "src/adapters/postgres-primary-store/postgres-primary-store.ts",
    ]) {
      const source = await readFile(path.resolve(file), "utf8");
      expect(source, file).not.toMatch(/LockVerifier|LOCK_VERIFY|ADJUDICATION_MODEL/);
    }
  });
});
