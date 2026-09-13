import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import rawV7 from "../../content/approved/conway-law.v7.json";
import rawV6 from "../../content/approved/conway-law.v6.json";
import schedule from "../../content/schedule/daily.v1.json";
import { approvedContentSchema } from "@/domain/content/schema";
import { projectPersonalizedConnection } from "@/domain/reveal/personalized-connection";
import type { NodeDiscovery, PlaySession } from "@/domain/play/session";
import type { NodeStatus } from "@/domain/play/vocabulary";
import { finishReveal, getOwned, reveal, startOfficial } from "@/application/play/daily-game";
import { answer } from "../support/judge-submission";
import { personalizedRevealFixture } from "../support/personalized-reveal-fixture";
import { adaptiveRuntimeFixture, fixtureAttempt } from "../support/adaptive-runtime-fixture";

const content = approvedContentSchema.parse(rawV7);
if (!("personalized_reveal" in content.REVEAL_CONTENT)) throw new Error("Expected personalized Reveal");
const copy = content.REVEAL_CONTENT.personalized_reveal.by_node;
const thoughts = [{ id: "a1", turn: 1, stage: "BLIND" as const, text: "사람들 묶음 / 소통 차이 / 설계 결정 / 결과물 구조 😀 / 반대 방향" }];
function node(nodeId: string, status: NodeStatus, text: string): NodeDiscovery {
  const start = thoughts[0]!.text.indexOf(text);
  const evidence = { answerId: "a1", spanStart: start, spanEnd: start + text.length };
  return { nodeId, status, ...(status === "CONTRADICTED" ? { contradictionEvidence: evidence } : { evidence }) };
}
const project = (discoveries: readonly NodeDiscovery[]) => projectPersonalizedConnection({ thoughts, discoveries }, content.REVEAL_CONTENT, content.SERVER_POLICY)!;

describe("M5-B evidence-grounded personalized Reveal", () => {
  it.each(["DISCOVERED", "PARTIAL", "CONTRADICTED"] as const)("%s uses exact persisted evidence and corresponding approved copy", status => {
    const result = project([node("SYSTEM_RESEMBLANCE", status, "결과물 구조 😀")]);
    expect(result.view.items).toEqual([{ label: copy.SYSTEM_RESEMBLANCE!.label, userExcerpt: "결과물 구조 😀", explanation: copy.SYSTEM_RESEMBLANCE![status === "DISCOVERED" ? "discovered" : status === "PARTIAL" ? "partial" : "contradicted"] }]);
    expect(result.issues).toEqual([]);
  });
  it("prefers deeper DISCOVERED nodes, caps two items and ignores input order", () => {
    const nodes = [node("TEAM_BOUNDARIES", "DISCOVERED", "사람들 묶음"), node("COMMUNICATION_FRICTION", "DISCOVERED", "소통 차이"), node("DECISION_CLUSTERING", "DISCOVERED", "설계 결정"), node("SYSTEM_RESEMBLANCE", "DISCOVERED", "결과물 구조 😀")];
    expect(project(nodes).view.items.map(item => item.label)).toEqual(["결과물의 구조", "설계 결정의 경계"]);
    expect(project([...nodes].reverse())).toEqual(project(nodes));
  });
  it("prioritizes DISCOVERED over a deeper PARTIAL", () => {
    expect(project([node("TEAM_BOUNDARIES", "DISCOVERED", "사람들 묶음"), node("SYSTEM_RESEMBLANCE", "PARTIAL", "결과물 구조 😀")]).view.items.map(item => item.label)).toEqual(["사람들의 경계", "결과물의 구조"]);
  });
  it("deduplicates identical excerpts across nodes and answers, retaining the deeper node", () => {
    const nodes = [node("TEAM_BOUNDARIES", "DISCOVERED", "소통 차이"), node("SYSTEM_RESEMBLANCE", "DISCOVERED", "소통 차이"), node("COMMUNICATION_FRICTION", "PARTIAL", "사람들 묶음")];
    nodes[0] = { ...nodes[0]!, evidence: { ...nodes[0]!.evidence!, answerId: "a2" } };
    const result = projectPersonalizedConnection({ thoughts: [...thoughts, { ...thoughts[0]!, id: "a2", turn: 2 }], discoveries: nodes }, content.REVEAL_CONTENT, content.SERVER_POLICY)!;
    expect(result.view.items.map(item => item.label)).toEqual(["결과물의 구조", "소통의 경계"]);
    expect(new Set(result.view.items.map(item => item.userExcerpt)).size).toBe(2);
  });
  it("reserves at most one required divergence without erasing genuine progress", () => {
    const result = project([node("TEAM_BOUNDARIES", "DISCOVERED", "사람들 묶음"), node("COMMUNICATION_FRICTION", "CONTRADICTED", "소통 차이"), node("SYSTEM_RESEMBLANCE", "CONTRADICTED", "반대 방향")]);
    expect(result.view.items.map(item => item.label)).toEqual(["사람들의 경계", "결과물의 구조"]);
    expect(result.view.items[1]?.explanation).toBe(copy.SYSTEM_RESEMBLANCE!.contradicted);
  });
  it("does not duplicate a shared positive/divergence excerpt", () => {
    const result = project([node("TEAM_BOUNDARIES", "DISCOVERED", "사람들 묶음"), node("SYSTEM_RESEMBLANCE", "CONTRADICTED", "사람들 묶음"), node("COMMUNICATION_FRICTION", "PARTIAL", "소통 차이")]);
    expect(result.view.items.map(item => item.label)).toEqual(["사람들의 경계", "소통의 경계"]);
  });
  it.each([
    undefined,
    { answerId: "missing", spanStart: 0, spanEnd: 2 },
    { answerId: "a1", spanStart: -1, spanEnd: 2 },
    { answerId: "a1", spanStart: 1.5, spanEnd: 2 },
    { answerId: "a1", spanStart: 4, spanEnd: 4 },
    { answerId: "a1", spanStart: 0, spanEnd: 9999 },
    { answerId: "a1", spanStart: thoughts[0]!.text.indexOf("😀") + 1, spanEnd: thoughts[0]!.text.indexOf("😀") + 2 },
  ])("omits missing/invalid evidence without fabricating text: %s", evidence => {
    const result = project([{ nodeId: "TEAM_BOUNDARIES", status: "DISCOVERED", ...(evidence ? { evidence } : {}) }]);
    expect(result.view.items).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(JSON.stringify(result.issues)).not.toContain(thoughts[0]!.text);
  });
  it("does not use stale positive evidence for a currently endorsed contradiction", () => {
    expect(project([{ ...node("SYSTEM_RESEMBLANCE", "DISCOVERED", "結果"), status: "CONTRADICTED" }]).view.items).toEqual([]);
  });
  it("omits long excerpts entirely rather than truncating/summarizing them", () => {
    const text = "가".repeat(2000);
    const result = projectPersonalizedConnection({ thoughts: [{ ...thoughts[0]!, text }], discoveries: [{ nodeId: "TEAM_BOUNDARIES", status: "DISCOVERED", evidence: { answerId: "a1", spanStart: 0, spanEnd: 2000 } }] }, content.REVEAL_CONTENT, content.SERVER_POLICY)!;
    expect(result.view.items).toEqual([]);
    expect(result.issues).toEqual([{ reason: "EXCERPT_TOO_LONG" }]);
  });
  it("allows no personalized evidence and uses only approved canonical insight", () => {
    const result = project([]);
    expect(result.view).toEqual({ items: [], canonicalInsight: content.REVEAL_CONTENT.explanation });
    expect(project([node("TEAM_BOUNDARIES", "ABSENT", "사람들 묶음")]).view.items).toEqual([]);
  });
  it("keeps mapping/node IDs/rubric/diagnostics private and requires Reveal authorization", async () => {
    const f = personalizedRevealFixture();
    const judge = vi.fn(f.deps.judge.evaluate);
    const deps = { ...f.deps, judge: { evaluate: judge } };
    await startOfficial(deps, "device");
    await expect(reveal(deps, "device", "adaptive-fixture")).rejects.toThrow("REVEAL_NOT_ALLOWED");
    f.executions.push({ verdict: { answerType: "REASONING", ambiguity: "NONE", nodes: f.content.JUDGE_RUBRIC.nodes.map(n => ({ nodeId: n.id, status: "DISCOVERED", evidenceText: "사람들 사이 경계가 결과물에 남는다" })) }, attempts: [fixtureAttempt] });
    await answer(deps, "device", "adaptive-fixture", "사람들 사이 경계가 결과물에 남는다");
    await expect(reveal(deps, "device", "adaptive-fixture")).rejects.toThrow("REVEAL_NOT_ALLOWED");
    await answer(deps, "device", "adaptive-fixture", "다시 정리한 생각");
    const play = await getOwned(deps, "device", "adaptive-fixture");
    expect(play?.session).not.toHaveProperty("personalizedConnection");
    expect(JSON.stringify(play)).not.toMatch(/Conway|Melvin|1968|personalized_reveal/);
    expect(await reveal(deps, "other-device", "adaptive-fixture")).toBeUndefined();
    const view = await reveal(deps, "device", "adaptive-fixture");
    expect(view?.personalizedConnection?.items).toHaveLength(1);
    expect(view?.personalizedConnection?.items[0]?.label).toBe("결과물의 구조");
    expect(view?.personalizedConnection?.canonicalInsight).toBe(f.content.REVEAL_CONTENT.explanation);
    expect(JSON.stringify(view)).not.toMatch(/TEAM_BOUNDARIES|SYSTEM_RESEMBLANCE|JUDGE_RUBRIC|by_node|confidence|score|issues|personalized_reveal/);
    expect(judge).toHaveBeenCalledTimes(2);
    await finishReveal(deps, "device", "adaptive-fixture");
    expect((await reveal(deps, "device", "adaptive-fixture"))?.personalizedConnection).toEqual(view?.personalizedConnection);
  });
  it("reports sanitized evidence omissions through an internal hook while returning no fabricated quote", async () => {
    const f = personalizedRevealFixture();
    await startOfficial(f.deps, "device");
    await answer(f.deps, "device", "adaptive-fixture", "없는 진행");
    await answer(f.deps, "device", "adaptive-fixture", "다시 생각");
    await f.deps.store.saveTransition(f.session().stateVersion, { ...f.session(), discoveries: [{ nodeId: "TEAM_BOUNDARIES", status: "DISCOVERED" }] } as PlaySession);
    const onIssue = vi.fn();
    expect((await reveal(f.deps, "device", "adaptive-fixture", onIssue))?.personalizedConnection?.items).toEqual([]);
    expect(onIssue).toHaveBeenCalledWith({ reason: "MISSING_EVIDENCE" });
  });
  it("legacy/v6 Reveal remains compatible without personalized fields", async () => {
    for (const legacy of [true, false]) {
      const f = adaptiveRuntimeFixture(legacy);
      await startOfficial(f.deps, "device");
      if (legacy) await f.deps.store.saveTransition(0, { ...f.session(), status: "REVEAL_READY" });
      else { await answer(f.deps, "device", "adaptive-fixture", "첫 생각"); await answer(f.deps, "device", "adaptive-fixture", "둘째 생각"); }
      expect(await reveal(f.deps, "device", "adaptive-fixture")).not.toHaveProperty("personalizedConnection");
    }
  });
});

describe("M5-B versioned Reveal content", () => {
  it("v7 extends v6 only with Reveal-only mapping and remains two-turn/unscheduled", () => {
    const v6 = approvedContentSchema.parse(rawV6);
    expect(content.schema_version).toBe(5);
    expect(content.SERVER_POLICY).toEqual(v6.SERVER_POLICY);
    expect(content.PUBLIC_PLAY).toEqual(v6.PUBLIC_PLAY);
    expect(content.JUDGE_RUBRIC).toEqual(v6.JUDGE_RUBRIC);
    expect(content.SERVER_POLICY).not.toHaveProperty("final_synthesis");
    expect(content.SERVER_POLICY.max_turns).toBe(2);
    expect(schedule.entries.some(entry => entry.content.version === 7)).toBe(false);
    expect(content.REVEAL_CONTENT.explanation).toBe(v6.REVEAL_CONTENT.explanation);
  });
  it.each(["missing", "unknown", "empty", "order", "identity"])("rejects invalid personalized contract/pre-Reveal leak: %s", kind => {
    const bad = structuredClone(rawV7);
    if (kind === "missing") delete (bad.REVEAL_CONTENT.personalized_reveal.by_node as Record<string, unknown>).TEAM_BOUNDARIES;
    if (kind === "unknown") (bad.REVEAL_CONTENT.personalized_reveal.by_node as Record<string, unknown>).UNKNOWN = copy.TEAM_BOUNDARIES!;
    if (kind === "empty") bad.REVEAL_CONTENT.personalized_reveal.by_node.TEAM_BOUNDARIES.label = "  ";
    if (kind === "order") bad.REVEAL_CONTENT.personalized_reveal.concept_order[0] = "SYSTEM_RESEMBLANCE";
    if (kind === "identity") bad.PUBLIC_PLAY.question = "Conway's Law";
    expect(approvedContentSchema.safeParse(bad).success).toBe(false);
  });
  it("allows historical identity only in Reveal copy", () => {
    const changed = structuredClone(rawV7);
    changed.REVEAL_CONTENT.personalized_reveal.by_node.TEAM_BOUNDARIES.discovered = "Conway's Law의 사람 경계를 짚었습니다.";
    expect(approvedContentSchema.safeParse(changed).success).toBe(true);
  });
  it("preserves immutable v6 bytes", () => {
    expect(createHash("sha256").update(readFileSync("content/approved/conway-law.v6.json")).digest("hex")).toBe("4d78713c502d9be37e4523d326e88a7b1e543bba2ed093a55b2403dd9074d98f");
  });
});
