import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { AMBIGUITIES, ANSWER_TYPES, NODE_STATUSES } from "@/domain/play/vocabulary";
import type { JudgePort, JudgeAttempt, UnvalidatedJudgeVerdict } from "@/ports/judge";
import { JudgeExecutionError } from "@/ports/judge";

export const PRIMARY_JUDGE_PROMPT_VERSION = "judge-v1";

export const PRIMARY_JUDGE_SYSTEM_PROMPT = `You are a narrow semantic evidence classifier.
Classify only the current answer using only the supplied rubric, prior confirmed structured node state, and optional last guidance.
Do not infer hidden intent beyond literal semantic evidence. Do not reward eloquence or require special terminology; conceptually equivalent wording counts.
Prefer precision over recall. At uncertain semantic boundaries choose PARTIAL or ABSENT instead of optimistic DISCOVERED.
CONTRADICTED means the current answer actively asserts a claim incompatible with the rubric; quoted claims that the user rejects are not contradictions.
For DISCOVERED, PARTIAL, and CONTRADICTED, copy evidenceText literally from one unique occurrence in the current answer. For ABSENT, evidenceText must be null.
Return every rubric node exactly once. Do not identify, expose, or speculate about any hidden theory, person, year, or answer identity.
Do not decide guidance, reveal, winning, score, history, attribution, session transitions, or rescue policy.`;

const providerNodeSchema = z.object({
  nodeId: z.string(),
  status: z.enum(NODE_STATUSES),
  evidenceText: z.string().min(1).nullable(),
}).strict();

export const providerVerdictSchema = z.object({
  answerType: z.enum(ANSWER_TYPES),
  ambiguity: z.enum(AMBIGUITIES),
  nodes: z.array(providerNodeSchema),
}).strict();

export function buildProviderVerdictSchema(expectedNodeIds: readonly string[]) {
  const nodeIds = expectedNodeIds as [string, ...string[]];
  return providerVerdictSchema.extend({
    nodes: z.array(providerNodeSchema.extend({ nodeId: z.enum(nodeIds) }).strict()).length(nodeIds.length),
  }).strict();
}

export interface OpenAIJudgeTransportRequest {
  readonly model: string;
  readonly systemPrompt: string;
  readonly input: string;
  readonly expectedNodeIds: readonly string[];
}

export interface OpenAIJudgeTransportResult {
  readonly output: unknown;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly providerRequestId?: string;
}

export interface OpenAIJudgeTransport {
  classify(request: OpenAIJudgeTransportRequest): Promise<OpenAIJudgeTransportResult>;
}

export function buildOpenAIResponseRequest(request: OpenAIJudgeTransportRequest) {
  const schema = buildProviderVerdictSchema(request.expectedNodeIds);
  return {
    model: request.model,
    instructions: request.systemPrompt,
    input: request.input,
    text: { format: zodTextFormat(schema, `g1_${PRIMARY_JUDGE_PROMPT_VERSION.replaceAll("-", "_")}`) },
    store: false as const,
    tools: [],
    tool_choice: "none" as const,
  };
}

export class OpenAIResponsesJudgeTransport implements OpenAIJudgeTransport {
  private readonly client: OpenAI;
  constructor(apiKey: string) { this.client = new OpenAI({ apiKey, maxRetries: 0 }); }

  async classify(request: OpenAIJudgeTransportRequest): Promise<OpenAIJudgeTransportResult> {
    const result = await this.client.responses.parse(buildOpenAIResponseRequest(request)).withResponse();
    if (!result.data.output_parsed) throw new Error("SCHEMA_INVALID");
    const usage = result.data.usage;
    return {
      output: result.data.output_parsed,
      ...(usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens } : {}),
      ...(result.request_id ? { providerRequestId: result.request_id } : {}),
    };
  }
}

export class OpenAIJudgeAdapter implements JudgePort {
  constructor(
    private readonly transport: OpenAIJudgeTransport,
    private readonly model: string,
    private readonly nowMs: () => number = () => performance.now(),
  ) {}

  async evaluate(input: Parameters<JudgePort["evaluate"]>[0]) {
    const attempts: JudgeAttempt[] = [];
    const request: OpenAIJudgeTransportRequest = {
      model: this.model,
      systemPrompt: PRIMARY_JUDGE_SYSTEM_PROMPT,
      expectedNodeIds: input.rubric.nodes.map(({ id }) => id),
      input: JSON.stringify({
        rubric: input.rubric,
        currentAnswer: input.currentAnswer,
        priorConfirmedState: input.priorConfirmedState.map(({ nodeId, status }) => ({ nodeId, status })),
        ...(input.lastGuidance ? { lastGuidance: input.lastGuidance } : {}),
      }),
    };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const started = this.nowMs();
      try {
        const response = await this.transport.classify(request);
        const parsed = providerVerdictSchema.parse(response.output);
        validateNodeSet(parsed, request.expectedNodeIds, input.currentAnswer);
        const verdict: UnvalidatedJudgeVerdict = {
          answerType: parsed.answerType,
          ambiguity: parsed.ambiguity,
          nodes: parsed.nodes.map((node) => node.evidenceText === null
            ? { nodeId: node.nodeId, status: node.status }
            : { nodeId: node.nodeId, status: node.status, evidenceText: node.evidenceText }),
        };
        attempts.push({
          attempt, provider: "openai", model: this.model, promptVersion: PRIMARY_JUDGE_PROMPT_VERSION,
          schemaValid: true, resultStatus: "SUCCEEDED", latencyMs: Math.max(0, Math.round(this.nowMs() - started)),
          ...(response.inputTokens !== undefined ? { inputTokens: response.inputTokens } : {}),
          ...(response.outputTokens !== undefined ? { outputTokens: response.outputTokens } : {}),
          ...(response.totalTokens !== undefined ? { totalTokens: response.totalTokens } : {}),
          ...(response.providerRequestId ? { providerRequestId: response.providerRequestId } : {}),
        });
        return { verdict, attempts };
      } catch (error) {
        const schemaError = error instanceof z.ZodError || (error instanceof Error && error.message === "SCHEMA_INVALID");
        attempts.push({
          attempt, provider: "openai", model: this.model, promptVersion: PRIMARY_JUDGE_PROMPT_VERSION,
          schemaValid: false, resultStatus: schemaError ? "SCHEMA_ERROR" : "PROVIDER_ERROR",
          latencyMs: Math.max(0, Math.round(this.nowMs() - started)),
        });
      }
    }
    throw new JudgeExecutionError(attempts);
  }
}

function validateNodeSet(verdict: z.infer<typeof providerVerdictSchema>, expected: readonly string[], currentAnswer: string) {
  const actual = verdict.nodes.map(({ nodeId }) => nodeId);
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) throw new z.ZodError([]);
  if (actual.some((id) => !expected.includes(id)) || expected.some((id) => !actual.includes(id))) throw new z.ZodError([]);
  for (const node of verdict.nodes) {
    if ((node.status === "ABSENT") !== (node.evidenceText === null)) throw new z.ZodError([]);
    if (node.evidenceText !== null) {
      const first=currentAnswer.indexOf(node.evidenceText);
      if(first<0||currentAnswer.indexOf(node.evidenceText,first+1)>=0)throw new z.ZodError([]);
    }
  }
}
