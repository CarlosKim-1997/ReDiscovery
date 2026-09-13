import { describe, expect, it, vi } from "vitest";
import raw from "../../content/approved/conway-law.v6.json";
import { approvedContentSchema } from "@/domain/content/schema";
import { answer, finishReveal, getOwned, reveal, type DailyGameDeps } from "@/application/play/daily-game";
import { createPlaySession, type PlaySession } from "@/domain/play/session";
import { storedGuidanceText, terminalAdaptiveFeedback } from "@/domain/play/adaptive-runtime";
import { LEARNER_STATES, type NodeStatus } from "@/domain/play/vocabulary";
import type { PrimaryStorePort } from "@/ports/primary-store";
import type { JudgePort } from "@/ports/judge";
import { canonicalSessionRoute } from "@/app/_components/session-routing";

const content = approvedContentSchema.parse(raw);
const policy = content.SERVER_POLICY;
if (!("adaptive_guidance" in policy)) throw new Error("Expected adaptive content");
const cases = [
  [[], "OFF_TRACK", "REDIRECT", undefined, policy.adaptive_guidance.redirect],
  [["ABSENT", "ABSENT", "CONTRADICTED"], "MISCONCEPTION", "CORRECT", "SYSTEM_RESEMBLANCE", policy.adaptive_guidance.by_node.SYSTEM_RESEMBLANCE!.correction],
  [["DISCOVERED"], "ON_TRACK", "TARGET", "COMMUNICATION_FRICTION", policy.adaptive_guidance.by_node.COMMUNICATION_FRICTION!.target],
  [["DISCOVERED", "DISCOVERED", "PARTIAL"], "NEAR_COMPLETE", "BRIDGE", "SYSTEM_RESEMBLANCE", policy.adaptive_guidance.by_node.SYSTEM_RESEMBLANCE!.bridge],
  [["DISCOVERED", "DISCOVERED", "DISCOVERED"], "COMPLETE_LIKELY", "CONSOLIDATE", undefined, policy.adaptive_guidance.consolidate],
] as const;

function fixture(turns: readonly (readonly NodeStatus[])[]) {
  let session = createPlaySession({ id: "s", dailyId: "d", contentVersionId: "v6", anonymousDeviceId: "device", nodeIds: content.JUDGE_RUBRIC.nodes.map(n => n.id) });
  let sequence = 0;
  let evaluations = 0;
  const evaluate = vi.fn<JudgePort["evaluate"]>(async input => {
    const statuses = turns[evaluations++] ?? [];
    return { verdict: { answerType: "REASONING", ambiguity: "NONE", nodes: content.JUDGE_RUBRIC.nodes.map(node => {
      const index = policy.required_nodes.indexOf(node.id);
      const status = index < 0 ? "ABSENT" : statuses[index] ?? "ABSENT";
      return { nodeId: node.id, status, ...(status !== "ABSENT" ? { evidenceText: input.currentAnswer } : {}) };
    }) }, attempts: [] };
  });
  const store = {
    getOwnedSession: async () => session,
    getContentVersion: async () => ({ id: "v6", version: 6, schemaVersion: 4, contentHash: "fixture", publicPlay: content.PUBLIC_PLAY, judgeRubric: content.JUDGE_RUBRIC, serverPolicy: policy, revealContent: content.REVEAL_CONTENT }),
    getDaily: async () => undefined,
    reserveAnswerEvaluation: async (version: number, _thought: unknown, next: PlaySession) => { if (session.stateVersion !== version) return false; session = next; return true; },
    completeAnswerEvaluation: async (version: number, next: PlaySession) => { if (session.stateVersion !== version) return false; session = next; return true; },
    abortAnswerEvaluation: async (_version: number, prior: PlaySession) => { session = prior; return true; },
    recordAiRuns: async () => {},
    completeReveal: async (_version: number, next: PlaySession) => { session = next; return true; },
  } as unknown as PrimaryStorePort;
  const deps: DailyGameDeps = { store, judge: { evaluate }, clock: { now: () => new Date("2026-09-13T00:00:00Z") }, identity: { randomId: () => `a${++sequence}`, randomToken: () => "unused", hashToken: text => text } };
  return { deps, evaluate, stored: () => session, submit: () => answer(deps, "device", "s", `생각 ${sequence + 1}`) };
}

describe("M4-B actual answer orchestration", () => {
  it.each(cases)("Turn 1 %s returns approved guidance and keeps Turn 2 open", async (statuses, learnerState, guidanceAction, targetNode, text) => {
    const f = fixture([statuses]);
    await expect(reveal(f.deps, "device", "s")).rejects.toThrow("REVEAL_NOT_ALLOWED");
    const result = await f.submit();
    expect(result).toMatchObject({ outcome: "GUIDED", session: { status: "THINKING", turnCount: 1, adaptive: { learnerState, guidanceAction, text, canAnswer: true, canReveal: false } } });
    if (targetNode) expect(result!.session.adaptive).toHaveProperty("targetNode", targetNode);
    else expect(result!.session.adaptive).not.toHaveProperty("targetNode");
    expect(result!.session.synthesis).toBeUndefined();
    expect(f.evaluate).toHaveBeenCalledTimes(1);
    const event = f.stored().guidance.at(-1)!;
    expect(event.text).toBe(text);
    expect(storedGuidanceText(event.key, policy)).toBe(text);
    expect((await getOwned(f.deps, "device", "s"))!.session.adaptive).toEqual(result!.session.adaptive);
    await expect(reveal(f.deps, "device", "s")).rejects.toThrow("REVEAL_NOT_ALLOWED");
  });

  it.each(cases)("Turn 2 %s is judged and ends in explicit Reveal-ready", async (statuses, state) => {
    const f = fixture([[], statuses]);
    await f.submit();
    const result = await f.submit();
    expect(result).toMatchObject({ outcome: "REVEAL_READY", session: { status: "REVEAL_READY", turnCount: 2, adaptive: { learnerState: state, text: terminalAdaptiveFeedback(state), canAnswer: false, canReveal: true } } });
    expect(f.evaluate).toHaveBeenCalledTimes(2);
    expect(result!.session.synthesis).toBeUndefined();
    expect(storedGuidanceText(f.stored().guidance.at(-1)!.key, policy)).toBe(terminalAdaptiveFeedback(state));
    expect((await getOwned(f.deps, "device", "s"))!.session.adaptive).toEqual(result!.session.adaptive);
    await expect(f.submit()).rejects.toThrow("INVALID_SESSION_STATE");
    expect(f.evaluate).toHaveBeenCalledTimes(2);
    expect(await reveal(f.deps, "device", "s")).toMatchObject({ theory: content.REVEAL_CONTENT.theory, discoveryOutcome: "UNVERIFIED_REVEAL" });
    expect(await finishReveal(f.deps, "device", "s")).toMatchObject({ status: "REVEALED", turnCount: 2 });
    const serialized = JSON.stringify(result!.session);
    expect(serialized).not.toMatch(/Conway|Melvin|1968|콘웨이|rubric|evidence|confidence|score/i);
  });

  it("retains Turn 1 discoveries and still invokes Turn 2 Judge after completion", async () => {
    const f = fixture([["DISCOVERED", "DISCOVERED", "DISCOVERED"], []]);
    await f.submit();
    const result = await f.submit();
    expect(f.evaluate).toHaveBeenCalledTimes(2);
    expect(f.evaluate.mock.calls[1]![0].priorConfirmedState.filter(n => n.status === "DISCOVERED")).toHaveLength(3);
    expect(f.evaluate.mock.calls[1]![0].lastGuidance).toBe(policy.adaptive_guidance.consolidate);
    expect(result!.session.adaptive!.learnerState).toBe("COMPLETE_LIKELY");
    expect(f.stored().thoughts).toHaveLength(2);
    expect(f.stored().stateVersion).toBe(4);
  });

  it("merges a later contradiction before resolving final state", async () => {
    const f = fixture([["DISCOVERED", "DISCOVERED", "DISCOVERED"], ["ABSENT", "ABSENT", "CONTRADICTED"]]);
    await f.submit();
    expect((await f.submit())!.session.adaptive!.learnerState).toBe("MISCONCEPTION");
  });

  it("provider failure uses existing recovery without consuming Turn 2 or forcing Reveal", async () => {
    const f = fixture([[]]);
    await f.submit();
    f.evaluate.mockRejectedValueOnce(new Error("fake provider unavailable"));
    await expect(f.submit()).rejects.toThrow("JUDGE_UNAVAILABLE");
    expect(f.stored()).toMatchObject({ status: "THINKING", turnCount: 1 });
    expect(f.stored().thoughts).toHaveLength(1);
    expect(f.stored().guidance).toHaveLength(1);
  });

  it("rehydrates legacy keys unchanged and rejects malformed adaptive keys", () => {
    expect(storedGuidanceText("NUDGE", policy)).toBe(policy.guidance.NUDGE);
    expect(() => storedGuidanceText("adaptive-v1:1:OFF_TRACK:TARGET:", policy)).toThrow("INVALID_ADAPTIVE_GUIDANCE_KEY");
    expect(() => storedGuidanceText("adaptive-v1:2:UNKNOWN", policy)).toThrow("INVALID_ADAPTIVE_GUIDANCE_KEY");
  });

  it("keeps adaptive terminal feedback on play while legacy routing remains unchanged", () => {
    expect(canonicalSessionRoute("REVEAL_READY", "s", true)).toBeUndefined();
    expect(canonicalSessionRoute("REVEAL_READY", "s")).toBe("/reveal/s");
    expect(canonicalSessionRoute("REVEALED", "s", true)).toBe("/result/s");
  });

  it.each(LEARNER_STATES)("terminal %s has no hidden identity or correctness assertion", state => {
    expect(terminalAdaptiveFeedback(state)).not.toMatch(/correct|incorrect|right answer|wrong answer|정답|오답|맞았|틀렸|Conway|Melvin|1968|콘웨이|\d/i);
  });
});
