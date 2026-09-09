import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildOpenAILockVerifierClientOptions,
  buildOpenAILockVerifierResponseRequest,
  buildProviderLockVerificationSchema,
  OpenAILockVerifierAdapter,
  OpenAIResponsesLockVerifierTransport,
  type OpenAILockVerifierTransport,
  type OpenAILockVerifierTransportRequest,
} from "@/adapters/openai-lock-verifier/openai-lock-verifier";
import {
  isLockVerificationApproved,
  LockVerifierValidationError,
  validateLockVerification,
} from "@/application/play/lock-verification";
import {
  LOCK_SUPPORTS,
  LockVerifierExecutionError,
  type LockVerifierInput,
  type UnvalidatedLockVerification,
} from "@/ports/lock-verifier";
import {
  LOCK_VERIFIER_PROMPT_VERSION,
  LOCK_VERIFIER_SYSTEM_PROMPT,
} from "@/shared/lock-verifier-prompts";

const answer = "팀 안에서는 자주 대화하고 밖과는 어려워서 제품 경계가 팀 경계를 반영한다.";
const input: LockVerifierInput = {
  requiredNodes: [
    { nodeId: "TEAM_BOUNDARIES", description: "Complete grouping relationship." },
    { nodeId: "COMMUNICATION_FRICTION", description: "Complete communication relationship." },
    { nodeId: "SYSTEM_RESEMBLANCE", description: "Complete downstream structure relationship." },
  ],
  answers: [{ answerId: "answer-1", text: answer }],
};
const valid: UnvalidatedLockVerification = {
  nodes: input.requiredNodes.map(({ nodeId }) => ({ nodeId, support: "VERIFIED", answerId: "answer-1", evidenceText: answer })),
};

class ScriptedTransport implements OpenAILockVerifierTransport {
  readonly requests: OpenAILockVerifierTransportRequest[] = [];
  constructor(private readonly script: unknown[]) {}
  async classify(request: OpenAILockVerifierTransportRequest) {
    this.requests.push(request);
    const next = this.script.shift();
    if (next instanceof Error) throw next;
    return { output: next, inputTokens: 12, outputTokens: 4, totalTokens: 16, providerRequestId: `req-${this.requests.length}` };
  }
}

const run = (transport: ScriptedTransport, verifierInput = input) => new OpenAILockVerifierAdapter(transport, "candidate-model", () => 0).verify(verifierInput);

describe("M3 Lock Evidence Verifier", () => {
  it("pins its binary support vocabulary and immutable prompt contract", () => {
    expect(LOCK_SUPPORTS).toEqual(["VERIFIED", "INSUFFICIENT"]);
    expect(LOCK_VERIFIER_PROMPT_VERSION).toBe("lock-verify-v1");
    expect(LOCK_VERIFIER_SYSTEM_PROMPT).toMatch(/only what the user actually wrote/);
    expect(LOCK_VERIFIER_SYSTEM_PROMPT).toMatch(/Do not fill in a missing final step/);
    expect(LOCK_VERIFIER_SYSTEM_PROMPT).toMatch(/hidden-theory knowledge/);
    expect(LOCK_VERIFIER_SYSTEM_PROMPT).toMatch(/literally.*unique occurrence/);
    expect(LOCK_VERIFIER_SYSTEM_PROMPT).toMatch(/uncertain.*INSUFFICIENT/);
    expect(LOCK_VERIFIER_SYSTEM_PROMPT).toMatch(/every required node exactly once/);
    expect(LOCK_VERIFIER_SYSTEM_PROMPT).toMatch(/Never decide Lock, Reveal/);
    expect(createHash("sha256").update(LOCK_VERIFIER_SYSTEM_PROMPT).digest("hex")).toBe("bd6dc56f74c39016c61048fc4f437a63bdb6d15a9ad5bc59ac782e62f4e7607f");
  });

  it("uses strict Structured Outputs with storage and tools disabled", () => {
    expect(buildOpenAILockVerifierClientOptions("secret")).toMatchObject({ apiKey: "secret", maxRetries: 0, logLevel: "off" });
    const transport = new OpenAIResponsesLockVerifierTransport("secret");
    expect((transport as unknown as { client: { logLevel: string } }).client.logLevel).toBe("off");
    const request = buildOpenAILockVerifierResponseRequest({ model: "model", promptVersion: LOCK_VERIFIER_PROMPT_VERSION, systemPrompt: "prompt", input: "fixture", expectedNodeIds: input.requiredNodes.map(({ nodeId }) => nodeId) });
    expect(request).toMatchObject({ model: "model", store: false, tools: [], tool_choice: "none" });
    expect(request.text.format).toBeDefined();
  });

  it("builds a strict schema covering every required node", () => {
    const schema = buildProviderLockVerificationSchema(input.requiredNodes.map(({ nodeId }) => nodeId));
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ nodes: valid.nodes.slice(1) }).success).toBe(false);
    expect(schema.safeParse({ nodes: [...valid.nodes, { nodeId: "UNKNOWN", support: "INSUFFICIENT", answerId: null, evidenceText: null }] }).success).toBe(false);
  });

  it("sends exactly requiredNodes and answers without Judge anchoring or hidden content", async () => {
    const transport = new ScriptedTransport([valid]);
    await run(transport);
    const payload = JSON.parse(transport.requests[0]!.input) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["answers", "requiredNodes"]);
    expect(payload).toEqual(input);
    const serialized = JSON.stringify(transport.requests[0]);
    expect(serialized).not.toMatch(/NodeStatus|priorConfirmedState|lastGuidance|SERVER_POLICY|REVEAL_CONTENT|recognition_aliases|Conway|Melvin|1968|sessionId|userId|lockable/);
  });

  it("returns evidence support only and never Lock authority", async () => {
    const execution = await run(new ScriptedTransport([valid]));
    expect(execution.attempts[0]).toMatchObject({ promptVersion: "lock-verify-v1", resultStatus: "SUCCEEDED", totalTokens: 16 });
    expect(execution.verification).toEqual(valid);
    expect(Object.keys(execution.verification)).toEqual(["nodes"]);
    expect(JSON.stringify(execution.verification)).not.toMatch(/NO_LOCK|APPROVE|REVEAL/);
  });

  it.each([
    ["structured output", { bad: true }, "STRUCTURED_OUTPUT_INVALID"],
    ["node set", { nodes: valid.nodes.slice(1) }, "NODE_SET_INVALID"],
    ["support/evidence", { nodes: valid.nodes.map((node, index) => index === 0 ? { ...node, support: "INSUFFICIENT" } : node) }, "STATUS_EVIDENCE_INVALID"],
    ["answer ID", { nodes: valid.nodes.map((node, index) => index === 0 ? { ...node, answerId: "missing" } : node) }, "ANSWER_ID_INVALID"],
    ["non-literal evidence", { nodes: valid.nodes.map((node, index) => index === 0 ? { ...node, evidenceText: "fabricated" } : node) }, "EVIDENCE_NOT_LITERAL"],
  ] as const)("classifies %s failures and retries once", async (_name, bad, category) => {
    const error = await run(new ScriptedTransport([bad, bad])).catch((caught) => caught) as LockVerifierExecutionError;
    expect(error).toBeInstanceOf(LockVerifierExecutionError);
    expect(error.attempts.map((attempt) => attempt.failureCategory)).toEqual([category, category]);
    expect(JSON.stringify(error)).not.toContain(answer);
  });

  it("classifies ambiguous repeated evidence", async () => {
    const repeatedInput = { ...input, answers: [{ answerId: "answer-1", text: "팀 팀" }] };
    const bad = { nodes: valid.nodes.map((node, index) => index === 0 ? { ...node, evidenceText: "팀" } : { ...node, evidenceText: "팀 팀" }) };
    const error = await run(new ScriptedTransport([bad, bad]), repeatedInput).catch((caught) => caught) as LockVerifierExecutionError;
    expect(error.attempts.map((attempt) => attempt.failureCategory)).toEqual(["EVIDENCE_NOT_UNIQUE", "EVIDENCE_NOT_UNIQUE"]);
  });

  it("retries provider failures without retaining their raw body", async () => {
    const error = await run(new ScriptedTransport([new Error("raw secret"), new Error("raw secret")])).catch((caught) => caught) as LockVerifierExecutionError;
    expect(error.code).toBe("LOCK_VERIFIER_UNAVAILABLE");
    expect(error.attempts.map((attempt) => attempt.resultStatus)).toEqual(["PROVIDER_ERROR", "PROVIDER_ERROR"]);
    expect(JSON.stringify(error)).not.toContain("raw secret");
  });

  it("validates exact answer-local literal spans and deterministic approval", () => {
    const validated = validateLockVerification(valid, input);
    expect(validated.nodes.every((node) => node.support === "VERIFIED" && answer.slice(node.evidence.start, node.evidence.end) === answer)).toBe(true);
    expect(isLockVerificationApproved(validated)).toBe(true);
    const insufficient = validateLockVerification({ nodes: input.requiredNodes.map(({ nodeId }) => ({ nodeId, support: "INSUFFICIENT" })) }, input);
    expect(isLockVerificationApproved(insufficient)).toBe(false);
  });

  it.each([
    ["missing node", { nodes: valid.nodes.slice(1) }, "NODE_SET_INVALID"],
    ["duplicate node", { nodes: valid.nodes.map((node, index) => index === 1 ? { ...node, nodeId: valid.nodes[0]!.nodeId } : node) }, "NODE_SET_INVALID"],
    ["unknown node", { nodes: valid.nodes.map((node, index) => index === 0 ? { ...node, nodeId: "UNKNOWN" } : node) }, "NODE_SET_INVALID"],
    ["fabricated answer", { nodes: valid.nodes.map((node, index) => index === 0 ? { ...node, answerId: "missing" } : node) }, "ANSWER_ID_INVALID"],
    ["fabricated evidence", { nodes: valid.nodes.map((node, index) => index === 0 ? { ...node, evidenceText: "fabricated" } : node) }, "EVIDENCE_NOT_LITERAL"],
    ["missing verified evidence", { nodes: valid.nodes.map((node, index) => index === 0 ? { nodeId: node.nodeId, support: "VERIFIED" as const } : node) }, "STATUS_EVIDENCE_INVALID"],
    ["insufficient with evidence", { nodes: valid.nodes.map((node, index) => index === 0 ? { ...node, support: "INSUFFICIENT" as const } : node) }, "STATUS_EVIDENCE_INVALID"],
  ] as const)("application validation rejects %s", (_name, raw, category) => {
    try {
      validateLockVerification(raw as UnvalidatedLockVerification, input);
      throw new Error("expected verifier validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(LockVerifierValidationError);
      expect((error as LockVerifierValidationError).category).toBe(category);
    }
  });
});
