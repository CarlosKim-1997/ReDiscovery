import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import rawV5 from "../../content/approved/conway-law.v5.json";
import rawV6 from "../../content/approved/conway-law.v6.json";
import { approvedContentSchema } from "@/domain/content/schema";
import { resolveLearnerState, selectAdaptiveGuidance } from "@/domain/play/adaptive-guidance";
import type { SemanticNodeState } from "@/domain/play/semantic-state";

const v6 = approvedContentSchema.parse(rawV6);
if (v6.schema_version !== 4) throw new Error("Expected adaptive guidance schema");
const policy = v6.SERVER_POLICY;
const adaptive = policy.adaptive_guidance;
const ids = policy.required_nodes;
const states = (...statuses: SemanticNodeState["status"][]): readonly SemanticNodeState[] => ids.map((nodeId, index) => ({ nodeId, status: statuses[index] ?? "ABSENT" }));

describe("M4-A learner state", () => {
  it.each([
    ["no signal", states(), "OFF_TRACK"],
    ["one partial", states("PARTIAL"), "ON_TRACK"],
    ["one discovered", states("DISCOVERED"), "ON_TRACK"],
    ["threshold minus one with partial", states("DISCOVERED", "DISCOVERED", "PARTIAL"), "NEAR_COMPLETE"],
    ["lock eligible", states("DISCOVERED", "DISCOVERED", "DISCOVERED"), "COMPLETE_LIKELY"],
    ["contradiction overrides progress", states("DISCOVERED", "DISCOVERED", "CONTRADICTED"), "MISCONCEPTION"],
  ] as const)("resolves %s", (_name, semanticStates, expected) => {
    expect(resolveLearnerState(semanticStates, policy)).toBe(expected);
  });
});

describe("M4-A approved guidance selection", () => {
  it.each([
    [states(), "OFF_TRACK", "REDIRECT", undefined, adaptive.redirect],
    [states("DISCOVERED", "DISCOVERED", "CONTRADICTED"), "MISCONCEPTION", "CORRECT", "SYSTEM_RESEMBLANCE", adaptive.by_node.SYSTEM_RESEMBLANCE!.correction],
    [states("DISCOVERED"), "ON_TRACK", "TARGET", "COMMUNICATION_FRICTION", adaptive.by_node.COMMUNICATION_FRICTION!.target],
    [states("DISCOVERED", "DISCOVERED", "PARTIAL"), "NEAR_COMPLETE", "BRIDGE", "SYSTEM_RESEMBLANCE", adaptive.by_node.SYSTEM_RESEMBLANCE!.bridge],
    [states("DISCOVERED", "DISCOVERED", "DISCOVERED"), "COMPLETE_LIKELY", "CONSOLIDATE", undefined, adaptive.consolidate],
  ] as const)("selects %s guidance", (semanticStates, learnerState, guidanceAction, targetNode, text) => {
    expect(selectAdaptiveGuidance(semanticStates, policy, adaptive)).toEqual({ learnerState, guidanceAction, ...(targetNode ? { targetNode } : {}), text });
  });

  it("uses concept order rather than Judge output order", () => {
    const reordered = [states("PARTIAL", "PARTIAL", "ABSENT")[1]!, states("PARTIAL", "PARTIAL", "ABSENT")[0]!, states("PARTIAL", "PARTIAL", "ABSENT")[2]!];
    expect(selectAdaptiveGuidance(reordered, policy, adaptive).targetNode).toBe("TEAM_BOUNDARIES");
  });
});

describe("M4-A adaptive content", () => {
  it("parses Conway v6 with two turns and complete required-node ladders", () => {
    expect(v6.version).toBe(6);
    expect(policy.max_turns).toBe(2);
    expect(adaptive.contract_version).toBe("adaptive-guidance-v1");
    expect(adaptive.concept_order).toEqual(policy.required_nodes);
    expect(Object.keys(adaptive.by_node).sort()).toEqual([...policy.required_nodes].sort());
    for (const nodeId of policy.required_nodes) expect(adaptive.by_node[nodeId]).toMatchObject({ target: expect.any(String), bridge: expect.any(String), correction: expect.any(String) });
    expect("lock_verifier" in policy).toBe(false);
    expect("final_synthesis" in policy).toBe(false);
  });

  it.each([
    ["missing concept", (candidate: typeof rawV6) => { candidate.SERVER_POLICY.adaptive_guidance.concept_order.pop(); }],
    ["unknown concept", (candidate: typeof rawV6) => { candidate.SERVER_POLICY.adaptive_guidance.concept_order[0] = "UNKNOWN_NODE"; }],
    ["missing ladder", (candidate: typeof rawV6) => { delete (candidate.SERVER_POLICY.adaptive_guidance.by_node as Record<string, unknown>).TEAM_BOUNDARIES; }],
  ] as const)("rejects %s", (_name, mutate) => {
    const candidate = structuredClone(rawV6);
    mutate(candidate);
    expect(() => approvedContentSchema.parse(candidate)).toThrow();
  });

  it.each(["Conway's Law", "Melvin Conway", "1968", "콘웨이의 법칙"])("rejects Reveal leakage: %s", (identity) => {
    const candidate = structuredClone(rawV6);
    candidate.SERVER_POLICY.adaptive_guidance.redirect += ` ${identity}`;
    expect(() => approvedContentSchema.parse(candidate)).toThrow(/leaks Reveal identity/);
  });

  it("keeps Conway v5 parseable and byte-for-byte unchanged", async () => {
    expect(approvedContentSchema.parse(rawV5).version).toBe(5);
    const bytes = await readFile(path.resolve("content/approved/conway-law.v5.json"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("b4203b560c2bedb2272b1ea9dc4808cada1a4267f41e260a0e62b447e2e6f746");
    const schedule = JSON.parse(await readFile(path.resolve("content/schedule/daily.v1.json"), "utf8")) as { entries: { content: { version: number } }[] };
    expect(schedule.entries.every(({ content }) => content.version !== 6)).toBe(true);
  });
});
