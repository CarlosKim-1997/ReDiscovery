import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { APIConnectionError, APIError } from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFinalSynthesisV2VerifierInput } from "@/application/play/final-synthesis-proof-v2";
import {
  OpenAIResponsesFinalSynthesisV2Transport,
  executeOpenAIFinalSynthesisV2Attempt,
  type OpenAIFinalSynthesisV2RequestInvoker,
} from "@/adapters/openai-final-synthesis-verifier-v2/openai-final-synthesis-verifier-v2";
import { FinalSynthesisV2ExecutionError } from "@/ports/final-synthesis-verifier-v2";
import {
  loadFinalSynthesisV2DevelopmentSuite,
  validateFinalSynthesisV2LiveEntry,
  type FinalSynthesisV2GitResult,
  type FinalSynthesisV2RunContract,
  type FinalSynthesisV2RunSealDependencies,
} from "../../tooling/final-synthesis-v2-eval.mts";
import {
  FINAL_SYNTHESIS_V2_SMOKE_FIXTURE_INPUT_SHA256,
  FinalSynthesisV2SmokeExecutionAuthority,
  assertFinalSynthesisV2SmokeArtifactPrivacy,
  buildFinalSynthesisV2SmokeFixture,
  finalSynthesisV2SmokeFixtureInputSha256,
  runFinalSynthesisV2ProviderSmoke,
  writeFinalSynthesisV2SmokeArtifact,
  type FinalSynthesisV2SmokeArtifact,
} from "../../tooling/final-synthesis-v2-smoke.mts";

const gitSha = "488f26d5b503fa52fff8bb7f993a0be4e6568513";
const temporaryRoots: string[] = [];
afterEach(async () => { await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function sealFixture() {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "rediscovery-v2-smoke-"));
  temporaryRoots.push(repoRoot);
  const contractRoot = path.join(repoRoot, "artifacts/eval/final-synthesis/run-contracts");
  await mkdir(contractRoot, { recursive: true });
  const suite = await loadFinalSynthesisV2DevelopmentSuite();
  const contract: FinalSynthesisV2RunContract = { schema_version: 2, git_sha: gitSha, dataset_version: suite.manifest.dataset_version, corpus_sha256: suite.corpusHash, revision_ledger_sha256: suite.ledgerHash, prompt_version: suite.manifest.prompt_version, prompt_sha256: suite.promptHash, proof_contract_version: suite.manifest.proof_contract_version, product_contract_version: suite.manifest.product_contract_version, evaluator_version: suite.manifest.evaluator_version, content_slug: suite.manifest.content_slug, content_version: suite.manifest.content_version, content_sha256: suite.contentHash, candidate_model: "test-model" };
  const contractFile = path.join(contractRoot, "candidate.json");
  await writeFile(contractFile, JSON.stringify(contract));
  const git = (overrides: Partial<Record<string, FinalSynthesisV2GitResult>> = {}) => (args: readonly string[]) => {
    const command = args.join(" ");
    return overrides[command] ?? (command === "status --porcelain --untracked-files=all" ? { status: 0, stdout: "" } : command.startsWith("ls-files --") ? { status: 0, stdout: "" } : command.startsWith("check-ignore --quiet --") ? { status: 0, stdout: "" } : command === "rev-parse HEAD" || command === "rev-parse origin/main" ? { status: 0, stdout: `${gitSha}\n` } : command === "rev-list --left-right --count HEAD...origin/main" ? { status: 0, stdout: "0\t0\n" } : { status: 1, stdout: "" });
  };
  const deps = (overrides: Partial<FinalSynthesisV2RunSealDependencies> = {}): FinalSynthesisV2RunSealDependencies => ({ repoRoot, runGit: git(), pathExists: async () => false, ...overrides });
  const env = { FINAL_SYNTHESIS_V2_SMOKE_RUN: "1", FINAL_SYNTHESIS_V2_RUN_CONTRACT: contractFile, FINAL_SYNTHESIS_V2_MODEL: "test-model", OPENAI_API_KEY: "opaque-process-secret" };
  return { repoRoot, contractFile, contract, suite, deps, git, env };
}

function noSupportOutput(requiredNodes: Awaited<ReturnType<typeof loadFinalSynthesisV2DevelopmentSuite>>["requiredNodes"]) {
  return { nodes: requiredNodes.map((node) => ({ nodeId: node.nodeId, components: node.requiredComponents.map((component) => ({ componentId: component.componentId, endorsementStatus: "NOT_APPLICABLE", referenceStatus: "NOT_APPLICABLE", componentMatch: "NO_COMPONENT_SUPPORT", evidenceUnitIds: [], antecedentEvidenceUnitIds: [] })) })) };
}

const fakeWriter = vi.fn(async (artifact: FinalSynthesisV2SmokeArtifact) => ({ file: "fake-smoke.json", sha256: createHash("sha256").update(JSON.stringify(artifact)).digest("hex") }));

describe("Final Synthesis v2 one-request smoke fixture", () => {
  it("freezes a non-corpus canonical semantic input", async () => {
    const suite = await loadFinalSynthesisV2DevelopmentSuite();
    const input = buildFinalSynthesisV2SmokeFixture(suite.requiredNodes);
    expect(finalSynthesisV2SmokeFixtureInputSha256(input)).toBe(FINAL_SYNTHESIS_V2_SMOKE_FIXTURE_INPUT_SHA256);
    expect(suite.cases.some((item) => item.synthesis === input.submission.text)).toBe(false);
  });
});

describe("Final Synthesis v2 smoke seal and opt-in", () => {
  it("rejects opt-in, ambiguity, contract, model, credential-file, and API-key failures before provider construction", async () => {
    const f = await sealFixture();
    const invalidEnvironments = [
      { ...f.env, FINAL_SYNTHESIS_V2_SMOKE_RUN: undefined },
      { ...f.env, FINAL_SYNTHESIS_V2_SMOKE_RUN: "yes" },
      { ...f.env, FINAL_SYNTHESIS_V2_LIVE_RUN: "1" },
      { ...f.env, FINAL_SYNTHESIS_V2_RUN_CONTRACT: undefined },
      { ...f.env, FINAL_SYNTHESIS_V2_MODEL: undefined },
      { ...f.env, FINAL_SYNTHESIS_V2_MODEL: "other" },
      { ...f.env, OPENAI_API_KEY: undefined },
    ];
    for (const env of invalidEnvironments) {
      const factory = vi.fn();
      await expect(runFinalSynthesisV2ProviderSmoke({ env, sealDependencies: f.deps(), makeTransport: factory, writeArtifact: fakeWriter })).rejects.toThrow();
      expect(factory).not.toHaveBeenCalled();
    }
    const factory = vi.fn();
    await expect(runFinalSynthesisV2ProviderSmoke({ env: f.env, sealDependencies: f.deps({ pathExists: async (value) => value.endsWith(".env.local") }), makeTransport: factory, writeArtifact: fakeWriter })).rejects.toThrow(/PERSISTENT_CREDENTIAL/u);
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects stale or invalid contracts and Git state before provider construction", async () => {
    const f = await sealFixture();
    const factory = vi.fn();
    await writeFile(f.contractFile, JSON.stringify({ ...f.contract, extra: true }));
    await expect(runFinalSynthesisV2ProviderSmoke({ env: f.env, sealDependencies: f.deps(), makeTransport: factory, writeArtifact: fakeWriter })).rejects.toThrow(/SCHEMA_INVALID/u);
    await writeFile(f.contractFile, JSON.stringify(f.contract));
    await expect(runFinalSynthesisV2ProviderSmoke({ env: f.env, sealDependencies: f.deps({ runGit: f.git({ "status --porcelain --untracked-files=all": { status: 0, stdout: " M source.ts\n" } }) }), makeTransport: factory, writeArtifact: fakeWriter })).rejects.toThrow(/WORKTREE_NOT_CLEAN/u);
    expect(factory).not.toHaveBeenCalled();
  });

  it("keeps full-live and smoke opt-ins mutually exclusive without changing normal full-live validation", async () => {
    const f = await sealFixture();
    const full = { FINAL_SYNTHESIS_V2_LIVE_RUN: "1", FINAL_SYNTHESIS_V2_RUN_CONTRACT: f.contractFile, FINAL_SYNTHESIS_V2_MODEL: "test-model", OPENAI_API_KEY: "not-used" };
    await expect(validateFinalSynthesisV2LiveEntry({ env: full, sealDependencies: f.deps() })).resolves.toMatchObject({ model: "test-model" });
    await expect(validateFinalSynthesisV2LiveEntry({ env: { ...full, FINAL_SYNTHESIS_V2_SMOKE_RUN: "1" }, sealDependencies: f.deps() })).rejects.toThrow(/AMBIGUOUS/u);
  });
});

describe("Final Synthesis v2 exact-one-request authority", () => {
  it("records zero provider executions for local request construction failure", async () => {
    const authority = new FinalSynthesisV2SmokeExecutionAuthority();
    const invoke = vi.fn();
    const transport = new OpenAIResponsesFinalSynthesisV2Transport("not-used", authority, invoke);
    const input = buildFinalSynthesisV2VerifierInput([], "synthetic local failure");
    await expect(executeOpenAIFinalSynthesisV2Attempt({ transport, model: "test", input })).rejects.toBeInstanceOf(FinalSynthesisV2ExecutionError);
    expect(authority.snapshot()).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("records one parsed fake request with tokens and never invokes a retry", async () => {
    const f = await sealFixture();
    const invoke = vi.fn(async () => ({ output: noSupportOutput(f.suite.requiredNodes), providerRequestId: "request-safe", inputTokens: 10, outputTokens: 4, totalTokens: 14 }));
    const factory = vi.fn((_apiKey: string, authority: FinalSynthesisV2SmokeExecutionAuthority) => new OpenAIResponsesFinalSynthesisV2Transport("not-used", authority, invoke));
    const result = await runFinalSynthesisV2ProviderSmoke({ env: f.env, sealDependencies: f.deps(), makeTransport: factory, writeArtifact: fakeWriter, now: () => new Date("2026-09-12T12:00:00.000Z"), nowMs: () => 1 });
    expect(factory).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledOnce();
    expect(result.artifact).toMatchObject({ outcome: "PARSED_SUCCESS", providerExecutionTotal: 1, structuredOutputParsed: true, requestId: "request-safe", inputTokens: 10, outputTokens: 4, totalTokens: 14 });
  });

  it.each([
    ["provider", () => new APIError(429, { code: "rate_limit", message: "Bearer bearer-secret sk-secret OPENAI_API_KEY=secret opaque-process-secret" }, undefined, new Headers({ "x-request-id": "request-safe", "retry-after": "7" })), "PROVIDER_REQUEST_ERROR"],
    ["network", () => new APIConnectionError({ message: "network failed" }), "NETWORK_OR_TRANSPORT_ERROR"],
  ])("records one %s failure without retry and with bounded diagnostics", async (_name, makeError, category) => {
    const f = await sealFixture();
    const invoke: OpenAIFinalSynthesisV2RequestInvoker = vi.fn(async () => { throw makeError(); });
    const result = await runFinalSynthesisV2ProviderSmoke({ env: f.env, sealDependencies: f.deps(), makeTransport: (_apiKey, authority) => new OpenAIResponsesFinalSynthesisV2Transport("not-used", authority, invoke), writeArtifact: fakeWriter, nowMs: () => 1 });
    expect(invoke).toHaveBeenCalledOnce();
    expect(result.artifact).toMatchObject({ outcome: "REMOTE_FAILURE", providerExecutionTotal: 1, structuredOutputParsed: false, failureCategory: category });
    expect(result.artifact.errorMessage).not.toMatch(/bearer-secret|sk-secret|OPENAI_API_KEY=secret|opaque-process-secret/u);
  });

  it("cannot authorize a second provider boundary", () => {
    const authority = new FinalSynthesisV2SmokeExecutionAuthority();
    authority.recordTransportExecution();
    expect(() => authority.recordTransportExecution()).toThrow(/REQUEST_LIMIT_EXCEEDED/u);
    expect(authority.snapshot()).toBe(1);
  });
});

describe("Final Synthesis v2 smoke artifact and isolation", () => {
  it("contains no raw secret, prompt, submission, request, response, proof, or development corpus material", async () => {
    const f = await sealFixture();
    const invoke = vi.fn(async () => ({ output: noSupportOutput(f.suite.requiredNodes) }));
    const result = await runFinalSynthesisV2ProviderSmoke({ env: f.env, sealDependencies: f.deps(), makeTransport: (_apiKey, authority) => new OpenAIResponsesFinalSynthesisV2Transport("not-used", authority, invoke), writeArtifact: fakeWriter });
    const fixture = buildFinalSynthesisV2SmokeFixture(f.suite.requiredNodes);
    expect(() => assertFinalSynthesisV2SmokeArtifactPrivacy(result.artifact, [f.env.OPENAI_API_KEY, fixture.submission.text, ...fixture.evidenceUnits.map((unit) => unit.text), ...f.suite.cases.map((item) => item.synthesis)])).not.toThrow();
    expect(Object.keys(result.artifact)).not.toEqual(expect.arrayContaining(["request", "response", "proof", "submission", "evidenceUnits"]));
  });

  it("writes a new artifact once and hashes the bytes read after creation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rediscovery-v2-smoke-artifact-"));
    temporaryRoots.push(root);
    const artifact: FinalSynthesisV2SmokeArtifact = { schemaVersion: 1, smokeFixtureVersion: "final-synthesis-v2-provider-smoke-v1", smokeFixtureSemanticInputSha256: FINAL_SYNTHESIS_V2_SMOKE_FIXTURE_INPUT_SHA256, gitSha, runContractSha256: "a".repeat(64), model: "test", evaluatorVersion: "final-synthesis-eval-v2.1", timestamp: "2026-09-12T12:00:00.000Z", outcome: "PARSED_SUCCESS", providerExecutionTotal: 1, latencyMs: 5, structuredOutputParsed: true };
    const written = await writeFinalSynthesisV2SmokeArtifact(artifact, root);
    expect(written.sha256).toBe(createHash("sha256").update(await readFile(written.file)).digest("hex"));
  });

  it("does not import or call the 96-case evaluator and keeps the manifest candidate-neutral", async () => {
    const source = await readFile(path.resolve("tooling/final-synthesis-v2-smoke.mts"), "utf8");
    const entry = await readFile(path.resolve("tests/eval/final-synthesis-v2-smoke-real.test.ts"), "utf8");
    const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8")) as { scripts: Record<string, string> };
    const manifest = JSON.parse(await readFile(path.resolve("eval/final-synthesis/v2/manifest.json"), "utf8")) as Record<string, unknown>;
    expect(source).not.toMatch(/runFinalSynthesisV2(?:Live)?Evaluation/u);
    expect(entry).toContain("runFinalSynthesisV2ProviderSmoke");
    expect(packageJson.scripts["eval:final-synthesis:v2:smoke"]).toContain("final-synthesis-v2-smoke-real.test.ts");
    expect(manifest).not.toHaveProperty("candidate_model");
  });
});
