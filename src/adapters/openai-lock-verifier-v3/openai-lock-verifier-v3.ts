import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  LockProofV3ValidationError,
  LockVerifierV3ExecutionError,
  PROOF_COMPONENT_MATCHES,
  PROOF_V3_ENDORSEMENT_STATUSES,
  PROOF_V3_REFERENCE_STATUSES,
  type LockProofV3ValidationReason,
  type LockVerifierV3Attempt,
  type LockVerifierV3FailureCategory,
  type LockVerifierV3Input,
  type LockVerifierV3Port,
  type RedactedLockProofV3,
  type UnvalidatedLockProofV3,
  validateLockProofV3Structure,
} from "@/ports/lock-verifier-v3";
import {
  LOCK_VERIFIER_V3_PROMPT_VERSION,
  LOCK_VERIFIER_V3_SYSTEM_PROMPT,
} from "@/shared/lock-verifier-v3-prompts";

const componentProofSchema = z.object({
  componentId: z.string().min(1),
  endorsementStatus: z.enum(PROOF_V3_ENDORSEMENT_STATUSES),
  referenceStatus: z.enum(PROOF_V3_REFERENCE_STATUSES),
  componentMatch: z.enum(PROOF_COMPONENT_MATCHES),
  evidenceUnitIds: z.array(z.string().min(1)).max(8),
  antecedentEvidenceUnitIds: z.array(z.string().min(1)).max(8),
}).strict();

const nodeProofSchema = z.object({
  nodeId: z.string().min(1),
  components: z.array(componentProofSchema).min(1).max(16),
}).strict();

export const providerLockProofV3Schema = z.object({
  nodes: z.array(nodeProofSchema).min(1),
}).strict();

export interface ExpectedV3ProofContract {
  readonly nodeId: string;
  readonly componentIds: readonly string[];
}

export function buildProviderLockProofV3Schema(contract: readonly ExpectedV3ProofContract[]) {
  const nodeIds = contract.map(({ nodeId }) => nodeId) as [string, ...string[]];
  const componentIds = contract.flatMap(({ componentIds: ids }) => ids) as [string, ...string[]];
  if (nodeIds.length === 0 || componentIds.length === 0) throw new Error("Required proof contract is empty");
  const dynamicComponent = componentProofSchema.extend({ componentId: z.enum(componentIds) }).strict();
  const dynamicNode = nodeProofSchema.extend({
    nodeId: z.enum(nodeIds),
    components: z.array(dynamicComponent).min(1).max(16),
  }).strict();
  return z.object({ nodes: z.array(dynamicNode).length(nodeIds.length) }).strict();
}

export interface OpenAILockVerifierV3TransportRequest {
  readonly model: string;
  readonly promptVersion: typeof LOCK_VERIFIER_V3_PROMPT_VERSION;
  readonly systemPrompt: string;
  readonly input: string;
  readonly expectedProofContract: readonly ExpectedV3ProofContract[];
}

export interface OpenAILockVerifierV3TransportResult {
  readonly output: unknown;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly providerRequestId?: string;
}

export interface OpenAILockVerifierV3Transport {
  extract(request: OpenAILockVerifierV3TransportRequest): Promise<OpenAILockVerifierV3TransportResult>;
}

export function buildOpenAILockVerifierV3ClientOptions(apiKey: string): ConstructorParameters<typeof OpenAI>[0] {
  return { apiKey, maxRetries: 0, logLevel: "off" };
}

export function buildOpenAILockVerifierV3ResponseRequest(request: OpenAILockVerifierV3TransportRequest) {
  return {
    model: request.model,
    instructions: request.systemPrompt,
    input: request.input,
    text: { format: zodTextFormat(buildProviderLockProofV3Schema(request.expectedProofContract), "g1_lock_verify_v3") },
    store: false as const,
    tools: [],
    tool_choice: "none" as const,
  };
}

export class OpenAIResponsesLockVerifierV3Transport implements OpenAILockVerifierV3Transport {
  private readonly client: OpenAI;
  constructor(apiKey: string) { this.client = new OpenAI(buildOpenAILockVerifierV3ClientOptions(apiKey)); }
  async extract(request: OpenAILockVerifierV3TransportRequest): Promise<OpenAILockVerifierV3TransportResult> {
    const result = await this.client.responses.parse(buildOpenAILockVerifierV3ResponseRequest(request)).withResponse();
    if (!result.data.output_parsed) throw new Error("SCHEMA_INVALID");
    const usage = result.data.usage;
    return {
      output: result.data.output_parsed,
      ...(usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens } : {}),
      ...(result.request_id ? { providerRequestId: result.request_id } : {}),
    };
  }
}

export class OpenAILockVerifierV3Adapter implements LockVerifierV3Port {
  readonly promptVersion = LOCK_VERIFIER_V3_PROMPT_VERSION;
  constructor(
    private readonly transport: OpenAILockVerifierV3Transport,
    private readonly model: string,
    private readonly nowMs: () => number = () => performance.now(),
  ) {}

  async extractProof(input: LockVerifierV3Input) {
    const attempts: LockVerifierV3Attempt[] = [];
    const request: OpenAILockVerifierV3TransportRequest = {
      model: this.model,
      promptVersion: this.promptVersion,
      systemPrompt: LOCK_VERIFIER_V3_SYSTEM_PROMPT,
      expectedProofContract: input.requiredNodes.map(({ nodeId, requiredComponents }) => ({
        nodeId,
        componentIds: requiredComponents.map(({ componentId }) => componentId),
      })),
      input: JSON.stringify({ requiredNodes: input.requiredNodes, evidenceUnits: input.evidenceUnits }),
    };
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const started = this.nowMs();
      let parsed: UnvalidatedLockProofV3 | undefined;
      try {
        const response = await this.transport.extract(request);
        parsed = providerLockProofV3Schema.parse(response.output);
        validateLockProofV3Structure(parsed, input);
        attempts.push({
          attempt, provider: "openai", model: this.model, promptVersion: this.promptVersion,
          schemaValid: true, resultStatus: "SUCCEEDED", latencyMs: Math.max(0, Math.round(this.nowMs() - started)),
          ...(response.inputTokens !== undefined ? { inputTokens: response.inputTokens } : {}),
          ...(response.outputTokens !== undefined ? { outputTokens: response.outputTokens } : {}),
          ...(response.totalTokens !== undefined ? { totalTokens: response.totalTokens } : {}),
          ...(response.providerRequestId ? { providerRequestId: response.providerRequestId } : {}),
        });
        return { proof: parsed, attempts };
      } catch (error) {
        const classified = classifyFailure(error);
        attempts.push({
          attempt, provider: "openai", model: this.model, promptVersion: this.promptVersion,
          schemaValid: classified?.category !== "STRUCTURED_OUTPUT_INVALID",
          resultStatus: classified ? "SCHEMA_ERROR" : "PROVIDER_ERROR",
          latencyMs: Math.max(0, Math.round(this.nowMs() - started)),
          ...(classified ? { failureCategory: classified.category, ...(classified.reason ? { validationReason: classified.reason } : {}) } : {}),
          ...(parsed && classified ? { rejectedProof: redactProof(parsed) } : {}),
        });
      }
    }
    throw new LockVerifierV3ExecutionError(attempts);
  }
}

function redactProof(proof: UnvalidatedLockProofV3): RedactedLockProofV3 {
  return {
    nodes: proof.nodes.map((node) => ({
      nodeId: node.nodeId,
      components: node.components.map((component) => ({ ...component })),
    })),
  };
}

function classifyFailure(error: unknown): { category: LockVerifierV3FailureCategory; reason?: LockProofV3ValidationReason } | undefined {
  if (error instanceof LockProofV3ValidationError) return { category: error.category, reason: error.reason };
  if (error instanceof z.ZodError || (error instanceof Error && error.message === "SCHEMA_INVALID")) return { category: "STRUCTURED_OUTPUT_INVALID" };
  return undefined;
}
