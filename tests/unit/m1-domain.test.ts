import { describe, expect, it } from "vitest";
import { FakeJudgeAdapter } from "@/adapters/fake-judge/fake-judge";
import { InMemoryPrimaryStore } from "@/adapters/in-memory-primary-store/in-memory-primary-store";
import { getDemoReveal } from "@/application/reveal/get-demo-reveal";
import { completeDemoReveal, getDemoSession, lockThought, restoreDemoSession, startDemoSession, submitThought } from "@/application/play/demo-game";
import { applyJudgeVerdict, beginEvaluation, completeReveal, lockPlaySession, selectRepresentativeEvidence } from "@/domain/play/policy";
import { createPlaySession, resolveEvidence, type PlaySession } from "@/domain/play/session";

const full = "팀 경계가 소통 경계를 만들고 설계 결정이 그 경계를 따라 모여 시스템 구조가 조직 구조를 닮는다.";
const partial = "팀 안에서 소통이 더 쉽고, 팀 경계 밖과는 대화하기 어렵기 때문이다.";
const wrong = "사용자가 우연히 그런 구성을 더 좋아했기 때문이다.";
const misconception = "조직이나 소통은 상관없고 기술만 결과를 결정한다.";
const revealContent = {
  year: "1968",
  person: "Melvin Conway",
  theory: "Conway's Law",
  explanation: "verified fixture",
} as const;

function deps() {
  return { judge: new FakeJudgeAdapter(), store: new InMemoryPrimaryStore() };
}

describe("M1 session and deterministic Judge", () => {
  it("starts in authoritative THINKING / BLIND state", () => {
    const session = createPlaySession("session-1");
    expect(session).toMatchObject({ status: "THINKING", stage: "BLIND", turnCount: 0, thoughts: [], guidance: [], revealCompleted: false });
    expect(session.discoveries.every(({ status }) => status === "ABSENT")).toBe(true);
  });

  it.each([
    ["FULL_DISCOVERY", full, ["DISCOVERED", "DISCOVERED", "DISCOVERED", "DISCOVERED"]],
    ["PARTIAL_DISCOVERY", partial, ["DISCOVERED", "DISCOVERED", "ABSENT", "ABSENT"]],
    ["WRONG_OR_ABSENT", wrong, ["ABSENT", "ABSENT", "ABSENT", "ABSENT"]],
    ["MISCONCEPTION", misconception, ["ABSENT", "ABSENT", "ABSENT", "CONTRADICTED"]],
  ])("maps %s deterministically", async (_case, answer, statuses) => {
    const judge = new FakeJudgeAdapter();
    const first = await judge.evaluate({ currentAnswer: answer, priorConfirmedState: [] });
    const second = await judge.evaluate({ currentAnswer: answer, priorConfirmedState: [] });
    expect(first).toEqual(second);
    expect(first.nodes.map(({ status }) => status)).toEqual(statuses);
  });

  it("full discovery becomes immediately LOCKABLE", async () => {
    const game = deps();
    await startDemoSession(game, "full");
    const result = await submitThought(game, "full", full);
    expect(result).toMatchObject({ outcome: "LOCKABLE", session: { status: "LOCKABLE", stage: "BLIND", turnCount: 1 } });
    expect(result?.session.guidance).toEqual([]);
  });

  it("partial discovery gets Reflect and preserves discovered ideas", async () => {
    const game = deps();
    await startDemoSession(game, "partial");
    const first = await submitThought(game, "partial", partial);
    expect(first).toMatchObject({ outcome: "GUIDED", session: { status: "THINKING", stage: "REFLECT" } });
    expect(first?.session.guidance[0]?.text).toContain("설계 결정");
    const second = await submitThought(game, "partial", full);
    const stored = await game.store.getSession("partial");
    expect(second?.outcome).toBe("LOCKABLE");
    expect(stored?.discoveries.filter(({ status }) => status === "DISCOVERED")).toHaveLength(4);
    expect(stored?.discoveries.find(({ nodeId }) => nodeId === "TEAM_BOUNDARIES")?.firstStage).toBe("BLIND");
  });

  it("wrong twice receives Nudge then Rescue and never fails", async () => {
    const game = deps();
    await startDemoSession(game, "rescue");
    const first = await submitThought(game, "rescue", wrong);
    const second = await submitThought(game, "rescue", "아직 잘 모르겠다.");
    expect(first).toMatchObject({ outcome: "GUIDED", session: { stage: "NUDGE", status: "THINKING" } });
    expect(second).toMatchObject({ outcome: "LOCKABLE", session: { stage: "RESCUE", status: "LOCKABLE" } });
    expect(second?.session.guidance.map(({ stage }) => stage)).toEqual(["NUDGE", "RESCUE"]);
  });

  it("routes a blocking misconception to deterministic Correction", async () => {
    const game = deps();
    await startDemoSession(game, "correction");
    const result = await submitThought(game, "correction", misconception);
    expect(result).toMatchObject({ outcome: "GUIDED", session: { stage: "CORRECTION", status: "THINKING" } });
    expect(result?.session.guidance[0]?.text).toContain("소통 비용");
  });

  it("uses actual submitted text as representative evidence", async () => {
    const game = deps();
    await startDemoSession(game, "evidence");
    await submitThought(game, "evidence", full);
    const stored = await game.store.getSession("evidence") as PlaySession;
    const evidence = selectRepresentativeEvidence(stored);
    expect(resolveEvidence(stored, evidence)).toBe(full);
  });

  it("keeps Judge evidence offsets in the exact stored answer coordinate system", async () => {
    const game = deps();
    const submitted = `  \n${full}\t  `;
    await startDemoSession(game, "spaced-evidence");
    const result = await submitThought(game, "spaced-evidence", submitted);
    const stored = await game.store.getSession("spaced-evidence") as PlaySession;
    const evidence = selectRepresentativeEvidence(stored);

    expect(stored.thoughts[0]?.text).toBe(submitted);
    expect(evidence).toMatchObject({ spanStart: 3, spanEnd: 3 + full.length });
    expect(resolveEvidence(stored, evidence)).toBe(full);
    expect(result?.session.representativeThought).toBe(full);
  });

  it("forbids Lock before LOCKABLE and Reveal before Lock", async () => {
    const session = createPlaySession("forbidden");
    expect(() => lockPlaySession(session)).toThrow("INVALID_SESSION_STATE");
    expect(() => completeReveal(session)).toThrow("REVEAL_NOT_ALLOWED");
    await expect(getDemoReveal(deps().store, revealContent, "missing")).resolves.toBeUndefined();
  });

  it("allows only the explicit evaluate, lock, and reveal sequence", async () => {
    const game = deps();
    await startDemoSession(game, "sequence");
    await expect(lockThought(game, "sequence")).rejects.toThrow("INVALID_SESSION_STATE");
    await submitThought(game, "sequence", full);
    const locked = await lockThought(game, "sequence");
    expect(locked?.status).toBe("LOCKED");
    const reveal = await getDemoReveal(game.store, revealContent, "sequence");
    expect(reveal?.representativeThought).toBe(full);
    const completed = await completeDemoReveal(game, "sequence");
    expect(completed).toMatchObject({ status: "REVEALED", revealCompleted: true });
  });

  it("reconstructs an M1 snapshot by replaying public thoughts through application policy", async () => {
    const game = deps();
    const restored = await restoreDemoSession(game, { id: "restore", thoughts: [wrong, "모르겠다."], status: "LOCKED" });
    expect(restored).toMatchObject({ id: "restore", status: "LOCKED", stage: "RESCUE", turnCount: 2 });
    expect((await getDemoSession(game, "restore"))?.guidance.map(({ stage }) => stage)).toEqual(["NUDGE", "RESCUE"]);
  });

  it("exposes EVALUATING as a real intermediate state", async () => {
    const session = createPlaySession("evaluating");
    const evaluating = beginEvaluation(session, { id: "a", turn: 1, stage: "BLIND", text: full });
    expect(evaluating.status).toBe("EVALUATING");
    const verdict = await new FakeJudgeAdapter().evaluate({ currentAnswer: full, priorConfirmedState: [] });
    expect(applyJudgeVerdict(evaluating, verdict).session.status).toBe("LOCKABLE");
  });
});
