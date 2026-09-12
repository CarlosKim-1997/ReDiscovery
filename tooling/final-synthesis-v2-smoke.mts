import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFinalSynthesisV2VerifierInput } from "@/application/play/final-synthesis-proof-v2";
import {
  OpenAIResponsesFinalSynthesisV2Transport,
  executeOpenAIFinalSynthesisV2Attempt,
  serializeFinalSynthesisV2SemanticInput,
  type FinalSynthesisV2TransportExecutionObserver,
  type OpenAIFinalSynthesisV2Transport,
} from "@/adapters/openai-final-synthesis-verifier-v2/openai-final-synthesis-verifier-v2";
import { FinalSynthesisV2ExecutionError, type FinalSynthesisVerifierV2Attempt, type FinalSynthesisVerifierV2Input } from "@/ports/final-synthesis-verifier-v2";
import { FINAL_SYNTHESIS_V2_SYSTEM_PROMPT } from "@/shared/final-synthesis-verifier-v2-prompt";
import {
  validateFinalSynthesisV2RunContract,
  type FinalSynthesisV2RunSealDependencies,
  type ValidatedFinalSynthesisV2RunContract,
} from "./final-synthesis-v2-eval.mts";

export const FINAL_SYNTHESIS_V2_SMOKE_FIXTURE_VERSION = "final-synthesis-v2-provider-smoke-v1" as const;
export const FINAL_SYNTHESIS_V2_SMOKE_FIXTURE_INPUT_SHA256 = "30460738d3ae115bbc5597a4ba7108ec4f64425a5955831b9f57cbd67a768afc" as const;
const syntheticSubmission = "각 작업 집단의 소통 경계가 설계 경계를 만들고, 그 경계가 결과물의 구조에 같은 모양으로 남는다.";
const persistentCredentialFiles = [".env.txt", ".env", ".env.local", ".env.development.local", ".env.production.local", ".env.test.local"] as const;

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export class FinalSynthesisV2SmokeExecutionAuthority implements FinalSynthesisV2TransportExecutionObserver {
  private total = 0;
  recordTransportExecution(): void {
    if (this.total >= 1) throw new Error("FINAL_SYNTHESIS_V2_SMOKE_REQUEST_LIMIT_EXCEEDED");
    this.total += 1;
  }
  snapshot(): number { return this.total; }
}

export function buildFinalSynthesisV2SmokeFixture(requiredNodes: FinalSynthesisVerifierV2Input["requiredNodes"]): FinalSynthesisVerifierV2Input {
  return buildFinalSynthesisV2VerifierInput(requiredNodes, syntheticSubmission);
}

export function finalSynthesisV2SmokeFixtureInputSha256(input: FinalSynthesisVerifierV2Input): string {
  return sha(serializeFinalSynthesisV2SemanticInput(input));
}

export interface FinalSynthesisV2SmokeArtifact {
  readonly schemaVersion: 1;
  readonly smokeFixtureVersion: typeof FINAL_SYNTHESIS_V2_SMOKE_FIXTURE_VERSION;
  readonly smokeFixtureSemanticInputSha256: string;
  readonly gitSha: string;
  readonly runContractSha256: string;
  readonly model: string;
  readonly evaluatorVersion: string;
  readonly timestamp: string;
  readonly outcome: "PARSED_SUCCESS" | "PARSED_INVALID" | "LOCAL_FAILURE" | "REMOTE_FAILURE";
  readonly providerExecutionTotal: number;
  readonly latencyMs: number;
  readonly structuredOutputParsed: boolean;
  readonly failureCategory?: string;
  readonly errorClass?: string;
  readonly errorCode?: string;
  readonly httpStatus?: number;
  readonly retryAfter?: string;
  readonly requestId?: string;
  readonly errorMessage?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface ValidatedFinalSynthesisV2SmokeEntry extends ValidatedFinalSynthesisV2RunContract {
  readonly model: string;
  readonly apiKey: string;
}

export async function validateFinalSynthesisV2SmokeEntry(options: {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly sealDependencies?: FinalSynthesisV2RunSealDependencies;
} = {}): Promise<ValidatedFinalSynthesisV2SmokeEntry> {
  const env = options.env ?? process.env;
  if (env.FINAL_SYNTHESIS_V2_SMOKE_RUN === "1" && env.FINAL_SYNTHESIS_V2_LIVE_RUN === "1") throw new Error("FINAL_SYNTHESIS_V2_AMBIGUOUS_LIVE_OPT_IN");
  if (env.FINAL_SYNTHESIS_V2_SMOKE_RUN !== "1") throw new Error("FINAL_SYNTHESIS_V2_SMOKE_OPT_IN_REQUIRED");
  const contractFile = env.FINAL_SYNTHESIS_V2_RUN_CONTRACT;
  if (!contractFile) throw new Error("FINAL_SYNTHESIS_V2_RUN_CONTRACT_REQUIRED");
  const model = env.FINAL_SYNTHESIS_V2_MODEL;
  if (!model) throw new Error("FINAL_SYNTHESIS_V2_MODEL_REQUIRED");
  const checked = await validateFinalSynthesisV2RunContract({
    contractFile,
    expectedCandidateModel: model,
    ...(options.sealDependencies ? { sealDependencies: options.sealDependencies } : {}),
  });
  const exists = options.sealDependencies?.pathExists ?? (async (value: string) => readFile(value).then(() => true, () => false));
  for (const file of persistentCredentialFiles) {
    if (await exists(path.join(checked.repoRoot, file))) throw new Error(`FINAL_SYNTHESIS_V2_PERSISTENT_CREDENTIAL_FILE:${file}`);
  }
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_REQUIRED");
  return Object.freeze({ ...checked, model, apiKey: env.OPENAI_API_KEY });
}

export function assertFinalSynthesisV2SmokeArtifactPrivacy(
  artifact: FinalSynthesisV2SmokeArtifact,
  forbidden: readonly string[],
): void {
  const serialized = JSON.stringify(artifact);
  if (forbidden.some((value) => value.length > 0 && serialized.includes(value))) throw new Error("FINAL_SYNTHESIS_V2_SMOKE_ARTIFACT_LEAKAGE");
}

function sanitizeSmokeMessage(value: string | undefined, forbidden: readonly string[]): string | undefined {
  if (!value) return undefined;
  let sanitized = value;
  for (const secret of forbidden) if (secret) sanitized = sanitized.split(secret).join("[REDACTED]");
  return sanitized.slice(0, 512);
}

export async function writeFinalSynthesisV2SmokeArtifact(artifact: FinalSynthesisV2SmokeArtifact, artifactRoot = path.resolve("artifacts/eval/final-synthesis/smoke")): Promise<{ readonly file: string; readonly sha256: string }> {
  const root = artifactRoot;
  await mkdir(root, { recursive: true });
  const file = path.join(root, `final-synthesis-v2-smoke-${Date.now()}.json`);
  const bytes = Buffer.from(JSON.stringify(artifact, null, 2));
  await writeFile(file, bytes, { flag: "wx" });
  return { file, sha256: sha(await readFile(file)) };
}

export interface FinalSynthesisV2SmokeOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly sealDependencies?: FinalSynthesisV2RunSealDependencies;
  readonly makeTransport?: (apiKey: string, authority: FinalSynthesisV2SmokeExecutionAuthority) => OpenAIFinalSynthesisV2Transport;
  readonly buildFixture?: typeof buildFinalSynthesisV2SmokeFixture;
  readonly writeArtifact?: (artifact: FinalSynthesisV2SmokeArtifact) => Promise<{ readonly file: string; readonly sha256: string }>;
  readonly now?: () => Date;
  readonly nowMs?: () => number;
}

export async function runFinalSynthesisV2ProviderSmoke(options: FinalSynthesisV2SmokeOptions = {}) {
  const checked = await validateFinalSynthesisV2SmokeEntry({
    ...(options.env ? { env: options.env } : {}),
    ...(options.sealDependencies ? { sealDependencies: options.sealDependencies } : {}),
  });
  const fixture = (options.buildFixture ?? buildFinalSynthesisV2SmokeFixture)(checked.suite.requiredNodes);
  const fixtureSha256 = finalSynthesisV2SmokeFixtureInputSha256(fixture);
  if (fixtureSha256 !== FINAL_SYNTHESIS_V2_SMOKE_FIXTURE_INPUT_SHA256) throw new Error("FINAL_SYNTHESIS_V2_SMOKE_FIXTURE_IDENTITY_MISMATCH");
  const readBytes = options.sealDependencies?.readBytes ?? (async (value: string) => readFile(value));
  if (sha(await readBytes(checked.contractFile)) !== checked.contractSha256) throw new Error("FINAL_SYNTHESIS_V2_RUN_CONTRACT_MUTATED");

  const authority = new FinalSynthesisV2SmokeExecutionAuthority();
  const transport = (options.makeTransport ?? ((apiKey, observer) => new OpenAIResponsesFinalSynthesisV2Transport(apiKey, observer)))(checked.apiKey, authority);
  let attempt: FinalSynthesisVerifierV2Attempt;
  let parsed = false;
  try {
    const result = await executeOpenAIFinalSynthesisV2Attempt({ transport, model: checked.model, input: fixture, ...(options.nowMs ? { nowMs: options.nowMs } : {}) });
    attempt = result.attempt;
    parsed = true;
  } catch (error) {
    if (!(error instanceof FinalSynthesisV2ExecutionError) || error.attempts.length !== 1) throw error;
    attempt = error.attempts[0]!;
  }
  const providerExecutionTotal = authority.snapshot();
  if (providerExecutionTotal > 1) throw new Error("FINAL_SYNTHESIS_V2_SMOKE_REQUEST_LIMIT_EXCEEDED");
  const structuredOutputParsed = parsed || attempt.schemaValid;
  const outcome = parsed ? "PARSED_SUCCESS" : structuredOutputParsed ? "PARSED_INVALID" : providerExecutionTotal === 0 ? "LOCAL_FAILURE" : "REMOTE_FAILURE";
  const forbiddenRaw = [
    checked.apiKey,
    FINAL_SYNTHESIS_V2_SYSTEM_PROMPT,
    fixture.submission.text,
    serializeFinalSynthesisV2SemanticInput(fixture),
    ...fixture.evidenceUnits.map((unit) => unit.text),
  ];
  const errorMessage = sanitizeSmokeMessage(attempt.errorMessage, forbiddenRaw);
  const artifact: FinalSynthesisV2SmokeArtifact = {
    schemaVersion: 1,
    smokeFixtureVersion: FINAL_SYNTHESIS_V2_SMOKE_FIXTURE_VERSION,
    smokeFixtureSemanticInputSha256: fixtureSha256,
    gitSha: checked.contract.git_sha,
    runContractSha256: checked.contractSha256,
    model: checked.model,
    evaluatorVersion: checked.contract.evaluator_version,
    timestamp: (options.now ?? (() => new Date()))().toISOString(),
    outcome,
    providerExecutionTotal,
    latencyMs: attempt.latencyMs,
    structuredOutputParsed,
    ...(attempt.failureCategory ? { failureCategory: attempt.failureCategory } : {}),
    ...(attempt.errorClass ? { errorClass: attempt.errorClass } : {}),
    ...(attempt.errorCode ? { errorCode: attempt.errorCode } : {}),
    ...(attempt.httpStatus !== undefined ? { httpStatus: attempt.httpStatus } : {}),
    ...(attempt.retryAfter ? { retryAfter: attempt.retryAfter } : {}),
    ...(attempt.providerRequestId ? { requestId: attempt.providerRequestId } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...(attempt.inputTokens !== undefined ? { inputTokens: attempt.inputTokens } : {}),
    ...(attempt.outputTokens !== undefined ? { outputTokens: attempt.outputTokens } : {}),
    ...(attempt.totalTokens !== undefined ? { totalTokens: attempt.totalTokens } : {}),
  };
  assertFinalSynthesisV2SmokeArtifactPrivacy(artifact, forbiddenRaw);
  const written = await (options.writeArtifact ?? writeFinalSynthesisV2SmokeArtifact)(artifact);
  return { artifact, ...written };
}
