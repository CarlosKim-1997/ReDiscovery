import { describe, expect, it } from "vitest";
import { REVEAL_OUTCOME_CODES, resolveAdaptiveRevealOutcome } from "@/domain/reveal/outcome";
import { answer, getOwned, reveal, startOfficial } from "@/application/play/daily-game";
import { adaptiveRuntimeFixture, fixtureAttempt } from "../support/adaptive-runtime-fixture";
import { createPlaySession, type NodeDiscovery } from "@/domain/play/session";
import type { LearnerState, NodeStatus } from "@/domain/play/vocabulary";
import { guidanceActionForLearnerState } from "@/domain/play/adaptive-guidance";

const fixture = adaptiveRuntimeFixture();
const policy = fixture.content.SERVER_POLICY;
if (!("adaptive_guidance" in policy)) throw new Error("Expected adaptive policy");
function snapshot(first: LearnerState, statuses: readonly NodeStatus[]) {
  const action = guidanceActionForLearnerState(first);
  const target = action === "CONSOLIDATE" || action === "REDIRECT" ? "" : policy.required_nodes[0];
  return { turnCount: 2, guidance: [{ stage: "REFLECT" as const, key: `adaptive-v1:1:${first}:${action}:${target}`, text: "not used as provenance" }],
    discoveries: policy.required_nodes.map((nodeId, index): NodeDiscovery => ({ nodeId, status: statuses[index] ?? "ABSENT" })) };
}
const cases = [
  ["COMPLETE_LIKELY", ["DISCOVERED", "DISCOVERED", "DISCOVERED"], "INDEPENDENT_REDISCOVERY", "독립 재발견"],
  ["ON_TRACK", ["DISCOVERED", "DISCOVERED", "DISCOVERED"], "GUIDED_ARRIVAL", "힌트 후 도달"],
  ["ON_TRACK", ["DISCOVERED", "ABSENT", "ABSENT"], "PARTIAL_CAPTURE", "핵심 일부 포착"],
  ["MISCONCEPTION", ["DISCOVERED", "ABSENT", "CONTRADICTED"], "PARTIAL_CAPTURE", "핵심 일부 포착"],
  ["ON_TRACK", ["PARTIAL", "PARTIAL", "ABSENT"], "PARTIAL_CAPTURE", "핵심 일부 포착"],
  ["ON_TRACK", ["PARTIAL", "ABSENT", "ABSENT"], "REVEAL_CONNECTION", "Reveal에서 연결"],
  ["OFF_TRACK", ["ABSENT", "ABSENT", "ABSENT"], "REVEAL_CONNECTION", "Reveal에서 연결"],
  ["MISCONCEPTION", ["CONTRADICTED", "ABSENT", "ABSENT"], "REVEAL_CONNECTION", "Reveal에서 연결"],
] as const;

describe("M5-A deterministic Reveal outcomes", () => {
  it.each(cases)("first %s / final %s resolves %s", (first, statuses, code, label) => {
    const view = resolveAdaptiveRevealOutcome(snapshot(first, statuses), policy);
    expect(view).toMatchObject({ code, label });
    expect(Object.keys(view!)).toEqual(["code", "label", "explanation"]);
    expect(JSON.stringify(view)).not.toMatch(/score|percentage|grade|FAIL|WRONG|정답|오답|실패|패배|\d|%/i);
  });
  it("maps every canonical code to its Korean label", () => {
    const mapped = new Map(cases.map(([first, statuses]) => { const view = resolveAdaptiveRevealOutcome(snapshot(first, statuses), policy)!; return [view.code, view.label]; }));
    expect(REVEAL_OUTCOME_CODES.map(code => mapped.get(code))).toEqual(["독립 재발견", "힌트 후 도달", "핵심 일부 포착", "Reveal에서 연결"]);
  });
  it("retains Turn 1 independence even after a later misconception", () => {
    expect(resolveAdaptiveRevealOutcome(snapshot("COMPLETE_LIKELY", ["CONTRADICTED"]), policy)?.code).toBe("INDEPENDENT_REDISCOVERY");
  });
  it("ignores optional progress and counts distinct required PARTIAL nodes", () => {
    const empty = snapshot("OFF_TRACK", []);
    expect(resolveAdaptiveRevealOutcome({ ...empty, discoveries: [{ nodeId: "optional", status: "DISCOVERED" }] }, policy)?.code).toBe("REVEAL_CONNECTION");
    expect(resolveAdaptiveRevealOutcome(snapshot("ON_TRACK", ["PARTIAL"]), { ...policy, required_nodes: [policy.required_nodes[0]!, policy.required_nodes[0]!] })?.code).toBe("REVEAL_CONNECTION");
  });
  it("requires exact, valid Turn 1 provenance rather than guessing from final completeness", () => {
    const complete = snapshot("ON_TRACK", ["DISCOVERED", "DISCOVERED", "DISCOVERED"]);
    expect(() => resolveAdaptiveRevealOutcome({ ...complete, guidance: [] }, policy)).toThrow("REVEAL_OUTCOME_PROVENANCE_REQUIRED");
    expect(() => resolveAdaptiveRevealOutcome({ ...complete, guidance: [...complete.guidance, ...complete.guidance] }, policy)).toThrow("REVEAL_OUTCOME_PROVENANCE_REQUIRED");
    expect(() => resolveAdaptiveRevealOutcome({ ...complete, guidance: [{ stage: "REFLECT", key: "adaptive-v1:1:ON_TRACK:CONSOLIDATE:", text: "" }] }, policy)).toThrow("INVALID_ADAPTIVE_GUIDANCE_KEY");
    expect(() => resolveAdaptiveRevealOutcome({ ...complete, turnCount: 1 }, policy)).toThrow("REVEAL_OUTCOME_REQUIRES_TWO_TURNS");
  });
  it("returns the same outcome after persisted guidance text is rehydrated", () => {
    const before = snapshot("COMPLETE_LIKELY", ["DISCOVERED", "DISCOVERED", "DISCOVERED"]);
    expect(resolveAdaptiveRevealOutcome({ ...before, guidance: before.guidance.map(event => ({ ...event, text: "" })) }, policy)).toEqual(resolveAdaptiveRevealOutcome(before, policy));
  });
  it("exposes outcomes only on the authorized Reveal path, not Play projections", async () => {
    const f = adaptiveRuntimeFixture();
    for (let turn = 0; turn < 2; turn++) f.executions.push({ verdict: { answerType: "REASONING", ambiguity: "NONE", nodes: f.content.JUDGE_RUBRIC.nodes.map(node => ({ nodeId: node.id, status: "DISCOVERED", evidenceText: "자신의 생각" })) }, attempts: [fixtureAttempt] });
    await startOfficial(f.deps, "device");
    await expect(reveal(f.deps, "device", "adaptive-fixture")).rejects.toThrow("REVEAL_NOT_ALLOWED");
    await answer(f.deps, "device", "adaptive-fixture", "자신의 생각");
    await expect(reveal(f.deps, "device", "adaptive-fixture")).rejects.toThrow("REVEAL_NOT_ALLOWED");
    const final = await answer(f.deps, "device", "adaptive-fixture", "자신의 생각");
    expect(final?.session).not.toHaveProperty("revealOutcome");
    const owned = await getOwned(f.deps, "device", "adaptive-fixture");
    expect(owned?.session).not.toHaveProperty("revealOutcome");
    expect(JSON.stringify(owned)).not.toMatch(/Conway|Melvin|1968|콘웨이|INDEPENDENT_REDISCOVERY|score|percentage/i);
    expect(await reveal(f.deps, "other-device", "adaptive-fixture")).toBeUndefined();
    expect(await reveal(f.deps, "device", "adaptive-fixture")).toMatchObject({ discoveryOutcome: "UNVERIFIED_REVEAL", revealOutcome: { code: "INDEPENDENT_REDISCOVERY", label: "독립 재발견" } });
  });
  it("leaves legacy Reveal semantics and shape unchanged", async () => {
    const f = adaptiveRuntimeFixture(true);
    await startOfficial(f.deps, "device");
    const session = createPlaySession({ id: "legacy", dailyId: "d", contentVersionId: "c", anonymousDeviceId: "device", nodeIds: [] });
    expect(resolveAdaptiveRevealOutcome(session, f.content.SERVER_POLICY)).toBeUndefined();
    await f.deps.store.saveTransition(0, { ...f.session(), status: "REVEAL_READY", stateVersion: 1 });
    const view = await reveal(f.deps, "device", "adaptive-fixture");
    expect(view).not.toHaveProperty("revealOutcome");
    expect(view).toMatchObject({ theory: f.content.REVEAL_CONTENT.theory, discoveryOutcome: "UNVERIFIED_REVEAL" });
  });
});
