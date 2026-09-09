import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  LOCK_SUPPORTS,
  LockVerifierExecutionError,
  type LockVerifierAttempt,
  type LockVerifierFailureCategory,
  type LockVerifierInput,
  type LockVerifierPort,
  type UnvalidatedLockVerification,
} from "@/ports/lock-verifier";
import {
  LOCK_VERIFIER_PROMPT_VERSION,
  LOCK_VERIFIER_SYSTEM_PROMPT,
} from "@/shared/lock-verifier-prompts";

const providerNodeSchema = z.object({
  nodeId: z.string(),
  support: z.enum(LOCK_SUPPORTS),
  answerId: z.string().min(1).nullable(),
  evidenceText: z.string().min(1).nullable(),
}).strict();

export const providerLockVerificationSchema = z.object({
  nodes: z.array(providerNodeSchema),
}).strict();

export function buildProviderLockVerificationSchema(expectedNodeIds: readonly string[]) {
  const nodeIds = expectedNodeIds as [string, ...string[]];
  return providerLockVerificationSchema.extend({
    nodes: z.array(providerNodeSchema.extend({ nodeId: z.enum(nodeIds) }).strict()).length(nodeIds.length),
  }).strict();
}

export interface OpenAILockVerifierTransportRequest {
  readonly model: string;
  readonly promptVersion: typeof LOCK_VERIFIER_PROMPT_VERSION;
  readonly systemPrompt: string;
  readonly input: string;
  readonly expectedNodeIds: readonly string[];
}

export interface OpenAILockVerifierTransportResult {
  readonly output: unknown;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly providerRequestId?: string;
}

export interface OpenAILockVerifierTransport {
  classify(request: OpenAILockVerifierTransportRequest): Promise<OpenAILockVerifierTransportResult>;
}

export function buildOpenAILockVerifierClientOptions(apiKey: string): ConstructorParameters<typeof OpenAI>[0] {
  return { apiKey, maxRetries: 0, logLevel: "off" };
}

export function buildOpenAILockVerifierResponseRequest(request: OpenAILockVerifierTransportRequest) {
  return {
    model: request.model,
    instructions: request.systemPrompt,
    input: request.input,
    text: { format: zodTextFormat(buildProviderLockVerificationSchema(request.expectedNodeIds), "g1_lock_verify_v1") },
    store: false as const,
    tools: [],
    tool_choice: "none" as const,
  };
}

export class OpenAIResponsesLockVerifierTransport implements OpenAILockVerifierTransport {
  private readonly client: OpenAI;
  constructor(apiKey: string) {
    this.client = new OpenAI(buildOpenAILockVerifierClientOptions(apiKey));
  }

  async classify(request: OpenAILockVerifierTransportRequest): Promise<OpenAILockVerifierTransportResult> {
    const result = await this.client.responses.parse(buildOpenAILockVerifierResponseRequest(request)).withResponse();
    if (!result.data.output_parsed) throw new Error("SCHEMA_INVALID");
    const usage = result.data.usage;
    return {
      output: result.data.output_parsed,
      ...(usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens } : {}),
      ...(result.request_id ? { providerRequestId: result.request_id } : {}),
    };
  }
}

export class OpenAILockVerifierAdapter implements LockVerifierPort {
  readonly promptVersion = LOCK_VERIFIER_PROMPT_VERSION;

  constructor(
    private readonly transport: OpenAILockVerifierTransport,
    private readonly model: string,
    private readonly nowMs: () => number = () => performance.now(),
  ) {}

  async verify(input: LockVerifierInput) {
    const attempts: LockVerifierAttempt[] = [];
    const expectedNodeIds = input.requiredNodes.map(({ nodeId }) => nodeId);
    const request: OpenAILockVerifierTransportRequest = {
      model: this.model,
      promptVersion: this.promptVersion,
      systemPrompt: LOCK_VERIFIER_SYSTEM_PROMPT,
      expectedNodeIds,
      input: JSON.stringify({ requiredNodes: input.requiredNodes, answers: input.answers }),
    };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const started = this.nowMs();
      try {
        const response = await this.transport.classify(request);
        const parsed = providerLockVerificationSchema.parse(response.output);
        validateProviderVerification(parsed, input);
        const verification: UnvalidatedLockVerification = {
          nodes: parsed.nodes.map((node) => node.support === "INSUFFICIENT"
            ? { nodeId: node.nodeId, support: node.support }
            : { nodeId: node.nodeId, support: node.support, answerId: node.answerId!, evidenceText: node.evidenceText! }),
        };
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
        return { verification, attempts };
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
    throw new LockVerifierExecutionError(attempts);
  }
}

class LockVerifierSchemaError extends Error {
  constructor(readonly category: LockVerifierFailureCategory) {
    super(category);
  }
}

function classifyFailure(error: unknown): LockVerifierFailureCategory | undefined {
  if (error instanceof LockVerifierSchemaError) return error.category;
  if (error instanceof z.ZodError || (error instanceof Error && error.message === "SCHEMA_INVALID")) return "STRUCTURED_OUTPUT_INVALID";
  return undefined;
}

function validateProviderVerification(
  verification: z.infer<typeof providerLockVerificationSchema>,
  input: LockVerifierInput,
) {
  const expected = input.requiredNodes.map(({ nodeId }) => nodeId);
  const actual = verification.nodes.map(({ nodeId }) => nodeId);
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) fail("NODE_SET_INVALID");
  if (actual.some((id) => !expected.includes(id)) || expected.some((id) => !actual.includes(id))) fail("NODE_SET_INVALID");
  const answers = new Map(input.answers.map((answer) => [answer.answerId, answer.text]));
  for (const node of verification.nodes) {
    if (node.support === "INSUFFICIENT") {
      if (node.answerId !== null || node.evidenceText !== null) fail("STATUS_EVIDENCE_INVALID");
      continue;
    }
    if (node.answerId === null || node.evidenceText === null) fail("STATUS_EVIDENCE_INVALID");
    const answer = answers.get(node.answerId);
    if (answer === undefined) fail("ANSWER_ID_INVALID");
    const first = answer.indexOf(node.evidenceText);
    if (first < 0) fail("EVIDENCE_NOT_LITERAL");
    if (answer.indexOf(node.evidenceText, first + 1) >= 0) fail("EVIDENCE_NOT_UNIQUE");
  }
}

function fail(category: LockVerifierFailureCategory): never {
  throw new LockVerifierSchemaError(category);
}
