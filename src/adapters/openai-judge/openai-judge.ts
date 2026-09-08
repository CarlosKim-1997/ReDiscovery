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

export const JUDGE_V2_PROMPT_VERSION = "judge-v2";

export const JUDGE_V2_SYSTEM_PROMPT = `You are a narrow semantic evidence classifier.
Classify only the proposition actually expressed in the current answer. The supplied rubric defines each node; priorConfirmedState and lastGuidance are context only and must never upgrade, downgrade, or fabricate a node in the current answer. Historical merge belongs to deterministic application policy.

NodeStatus and Ambiguity are independent dimensions. DISCOVERED means the complete required conceptual relationship is explicitly expressed; terminology, eloquence, and confidence are unnecessary. Hedging such as "maybe", "seems", or "not certain" does not make a complete proposition PARTIAL. PARTIAL is only structural incompleteness: relevant entities without the required relationship, a suggested but unestablished causal link, generic relatedness, or only one side of a comparison. ABSENT means no usable proposition; keywords, a theory/person name, or a vocabulary list alone are ABSENT. CONTRADICTED means the user's currently endorsed meaning is incompatible with the node. Rejected quotations, abandoned claims, explicit self-corrections, and claims mentioned only to deny them are not contradictions.

AnswerType: EMPTY has no substantive answer; ASKING_FOR_ANSWER primarily requests the answer, theory, or hint; META discusses the game, theory naming, keyword matching, evaluation, or answering act without causal reasoning; OFF_TOPIC is substantive but unrelated; REASONING attempts to explain the presented phenomenon. AnswerType never supplies node evidence.

Ambiguity: NONE is sufficiently clear; TOO_SHORT means brevity itself prevents meaningful interpretation; UNCLEAR_REFERENCE means unresolved references prevent determining the proposition; CONFLICTING_CLAIMS means incompatible claims remain simultaneously endorsed; SEMANTIC_BOUNDARY means an interpretable claim is genuinely near a boundary because of qualification, double negation, underspecification, or uncertainty. Prefer the most specific cause; short text is not automatically TOO_SHORT. A complete hedged causal chain may be DISCOVERED with SEMANTIC_BOUNDARY.

For DISCOVERED, PARTIAL, and CONTRADICTED, copy the shortest sufficient unique literal evidenceText from the exact current answer. If a short substring repeats, include enough surrounding text to make it unique. Never paraphrase and never use prior state or guidance as evidence. ABSENT requires null evidenceText.

Return every rubric node exactly once. Never identify, expose, or speculate about hidden theory, person, year, source, or answer identity. Never decide guidance, reveal, winning, score, history, attribution, session transitions, or rescue policy.`;

export const JUDGE_PROMPT_VERSIONS = Object.freeze([PRIMARY_JUDGE_PROMPT_VERSION, JUDGE_V2_PROMPT_VERSION] as const);
export type JudgePromptVersion = (typeof JUDGE_PROMPT_VERSIONS)[number];

export function getJudgeSystemPrompt(version: JudgePromptVersion): string {
  return version === PRIMARY_JUDGE_PROMPT_VERSION ? PRIMARY_JUDGE_SYSTEM_PROMPT : JUDGE_V2_SYSTEM_PROMPT;
}

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
  readonly promptVersion: JudgePromptVersion;
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

export function buildOpenAIJudgeClientOptions(apiKey: string): ConstructorParameters<typeof OpenAI>[0] {
  return { apiKey, maxRetries: 0, logLevel: "off" };
}

export function buildOpenAIResponseRequest(request: OpenAIJudgeTransportRequest) {
  const schema = buildProviderVerdictSchema(request.expectedNodeIds);
  return {
    model: request.model,
    instructions: request.systemPrompt,
    input: request.input,
    text: { format: zodTextFormat(schema, `g1_${request.promptVersion.replaceAll("-", "_")}`) },
    store: false as const,
    tools: [],
    tool_choice: "none" as const,
  };
}

export class OpenAIResponsesJudgeTransport implements OpenAIJudgeTransport {
  private readonly client: OpenAI;
  constructor(apiKey: string) { this.client = new OpenAI(buildOpenAIJudgeClientOptions(apiKey)); }

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
    readonly promptVersion: JudgePromptVersion = PRIMARY_JUDGE_PROMPT_VERSION,
  ) {}

  async evaluate(input: Parameters<JudgePort["evaluate"]>[0]) {
    const attempts: JudgeAttempt[] = [];
    const request: OpenAIJudgeTransportRequest = {
      model: this.model,
      promptVersion: this.promptVersion,
      systemPrompt: getJudgeSystemPrompt(this.promptVersion),
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
          attempt, provider: "openai", model: this.model, promptVersion: this.promptVersion,
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
          attempt, provider: "openai", model: this.model, promptVersion: this.promptVersion,
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
