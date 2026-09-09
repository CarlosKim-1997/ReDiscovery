import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  LockProofV2ValidationError,
  LockVerifierV2ExecutionError,
  PROOF_ENDORSEMENT_STATUSES,
  PROOF_REFERENCE_STATUSES,
  PROOF_SEMANTIC_MATCHES,
  type LockVerifierV2Attempt,
  type LockVerifierV2FailureCategory,
  type LockVerifierV2Input,
  type LockVerifierV2Port,
  validateLockProofV2Structure,
  type UnvalidatedLockProof,
} from "@/ports/lock-verifier-v2";
import {
  LOCK_VERIFIER_V2_PROMPT_VERSION,
  LOCK_VERIFIER_V2_SYSTEM_PROMPT,
} from "@/shared/lock-verifier-v2-prompts";

const providerNodeProofSchema = z.object({
  nodeId: z.string(),
  endorsementStatus: z.enum(PROOF_ENDORSEMENT_STATUSES),
  referenceStatus: z.enum(PROOF_REFERENCE_STATUSES),
  semanticMatch: z.enum(PROOF_SEMANTIC_MATCHES),
  evidenceUnitIds: z.array(z.string().min(1)).max(8),
  antecedentEvidenceUnitIds: z.array(z.string().min(1)).max(8),
}).strict();

export const providerLockProofSchema = z.object({
  nodes: z.array(providerNodeProofSchema),
}).strict();

export function buildProviderLockProofSchema(expectedNodeIds: readonly string[]) {
  if (expectedNodeIds.length === 0) throw new Error("At least one required node is required");
  const nodeIds = expectedNodeIds as [string, ...string[]];
  return providerLockProofSchema.extend({
    nodes: z.array(providerNodeProofSchema.extend({ nodeId: z.enum(nodeIds) }).strict()).length(nodeIds.length),
  }).strict();
}

export interface OpenAILockVerifierV2TransportRequest {
  readonly model: string;
  readonly promptVersion: typeof LOCK_VERIFIER_V2_PROMPT_VERSION;
  readonly systemPrompt: string;
  readonly input: string;
  readonly expectedNodeIds: readonly string[];
}

export interface OpenAILockVerifierV2TransportResult {
  readonly output: unknown;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly providerRequestId?: string;
}

export interface OpenAILockVerifierV2Transport {
  extract(request: OpenAILockVerifierV2TransportRequest): Promise<OpenAILockVerifierV2TransportResult>;
}

export function buildOpenAILockVerifierV2ClientOptions(apiKey: string): ConstructorParameters<typeof OpenAI>[0] {
  return { apiKey, maxRetries: 0, logLevel: "off" };
}

export function buildOpenAILockVerifierV2ResponseRequest(request: OpenAILockVerifierV2TransportRequest) {
  return {
    model: request.model,
    instructions: request.systemPrompt,
    input: request.input,
    text: { format: zodTextFormat(buildProviderLockProofSchema(request.expectedNodeIds), "g1_lock_verify_v2") },
    store: false as const,
    tools: [],
    tool_choice: "none" as const,
  };
}

export class OpenAIResponsesLockVerifierV2Transport implements OpenAILockVerifierV2Transport {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI(buildOpenAILockVerifierV2ClientOptions(apiKey));
  }

  async extract(request: OpenAILockVerifierV2TransportRequest): Promise<OpenAILockVerifierV2TransportResult> {
    const result = await this.client.responses.parse(buildOpenAILockVerifierV2ResponseRequest(request)).withResponse();
    if (!result.data.output_parsed) throw new Error("SCHEMA_INVALID");
    const usage = result.data.usage;
    return {
      output: result.data.output_parsed,
      ...(usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens } : {}),
      ...(result.request_id ? { providerRequestId: result.request_id } : {}),
    };
  }
}

export class OpenAILockVerifierV2Adapter implements LockVerifierV2Port {
  readonly promptVersion = LOCK_VERIFIER_V2_PROMPT_VERSION;

  constructor(
    private readonly transport: OpenAILockVerifierV2Transport,
    private readonly model: string,
    private readonly nowMs: () => number = () => performance.now(),
  ) {}

  async extractProof(input: LockVerifierV2Input) {
    const attempts: LockVerifierV2Attempt[] = [];
    const expectedNodeIds = input.requiredNodes.map(({ nodeId }) => nodeId);
    const request: OpenAILockVerifierV2TransportRequest = {
      model: this.model,
      promptVersion: this.promptVersion,
      systemPrompt: LOCK_VERIFIER_V2_SYSTEM_PROMPT,
      expectedNodeIds,
      input: JSON.stringify({ requiredNodes: input.requiredNodes, evidenceUnits: input.evidenceUnits }),
    };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const started = this.nowMs();
      try {
        const response = await this.transport.extract(request);
        const parsed = providerLockProofSchema.parse(response.output);
        validateLockProofV2Structure(parsed, input);
        const proof: UnvalidatedLockProof = { nodes: parsed.nodes };
        attempts.push({
          attempt,
          provider: "openai",
          model: this.model,
          promptVersion: this.promptVersion,
          schemaValid: true,
          resultStatus: "SUCCEEDED",
          latencyMs: Math.max(0, Math.round(this.nowMs() - started)),
          ...(response.inputTokens !== undefined ? { inputTokens: response.inputTokens } : {}),
          ...(response.outputTokens !== undefined ? { outputTokens: response.outputTokens } : {}),
          ...(response.totalTokens !== undefined ? { totalTokens: response.totalTokens } : {}),
          ...(response.providerRequestId ? { providerRequestId: response.providerRequestId } : {}),
        });
        return { proof, attempts };
      } catch (error) {
        const failureCategory = classifyFailure(error);
        attempts.push({
          attempt,
          provider: "openai",
          model: this.model,
          promptVersion: this.promptVersion,
          schemaValid: false,
          resultStatus: failureCategory ? "SCHEMA_ERROR" : "PROVIDER_ERROR",
          latencyMs: Math.max(0, Math.round(this.nowMs() - started)),
          ...(failureCategory ? { failureCategory } : {}),
        });
      }
    }
    throw new LockVerifierV2ExecutionError(attempts);
  }
}

function classifyFailure(error: unknown): LockVerifierV2FailureCategory | undefined {
  if (error instanceof LockProofV2ValidationError) return error.category;
  if (error instanceof z.ZodError || (error instanceof Error && error.message === "SCHEMA_INVALID")) return "STRUCTURED_OUTPUT_INVALID";
  return undefined;
}
