import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { finishReveal, getOwned, reveal, startOfficial } from "@/application/play/daily-game";
import { answer } from "../support/judge-submission";
import { AdaptiveEvaluationPausedError } from "@/application/play/adaptive-evaluation";
import { resumeAdaptiveEvaluation } from "../support/judge-submission";
import { CachedSemanticAiReadiness } from "@/application/play/semantic-ai-readiness";
import { OpenAISemanticReadinessProbe } from "@/adapters/openai-semantic-readiness/openai-semantic-readiness";
import { makeSemanticAiReadiness } from "@/server/semantic-ai-readiness";
import { adaptiveRuntimeFixture, ADAPTIVE_FULL_FIXTURE_ANSWER, fixtureAttempt, fixtureProviderFailure, fixtureSchemaFailure } from "../support/adaptive-runtime-fixture";

describe("M4-C bounded/coalesced readiness", () => {
  it.each(["local", "staging", "production"] as const)("fake Judge cannot establish adaptive readiness in %s even after legacy success", async APP_ENV => {
    const readiness = makeSemanticAiReadiness({ APP_ENV, JUDGE_ADAPTER: "fake" }, { now: () => new Date(0) });
    readiness.recordSuccess(); expect(await readiness.check()).toBe("UNAVAILABLE");
  });

  it("fake readiness is available only to explicit test composition", async () => {
    const readiness = makeSemanticAiReadiness({ APP_ENV: "test", JUDGE_ADAPTER: "fake" }, { now: () => new Date(0) });
    expect(await readiness.check()).toBe("READY");
  });
  it("caches READY for 60 seconds and stale checks share exactly one probe", async () => {
    let now = 0;
    let release!: (state: "READY") => void;
    const probe = vi.fn(() => new Promise<"READY">(resolve => { release = resolve; }));
    const readiness = new CachedSemanticAiReadiness({ now: () => new Date(now) }, { probe });
    const checks = Array.from({ length: 20 }, () => readiness.check());
    await Promise.resolve(); expect(probe).toHaveBeenCalledTimes(1);
    release("READY"); expect(await Promise.all(checks)).toEqual(Array(20).fill("READY"));
    now = 59_999; expect(await readiness.check()).toBe("READY"); expect(probe).toHaveBeenCalledTimes(1);
    now = 60_000;
    const stale = [readiness.check(), readiness.check()];
    await Promise.resolve(); expect(probe).toHaveBeenCalledTimes(2);
    release("READY"); await Promise.all(stale);
  });

  it("uses 12-second unavailable backoff and sanitizes probe exceptions", async () => {
    let now = 0;
    const probe = vi.fn().mockRejectedValue(new Error("private operational detail"));
    const readiness = new CachedSemanticAiReadiness({ now: () => new Date(now) }, { probe });
    expect(await readiness.check()).toBe("UNAVAILABLE");
    now = 11_999; expect(await readiness.check()).toBe("UNAVAILABLE"); expect(probe).toHaveBeenCalledTimes(1);
    now = 12_000; await readiness.check(); expect(probe).toHaveBeenCalledTimes(2);
  });

  it.each(["READY", "UNAVAILABLE"] as const)("passive %s evidence wins over an older in-flight probe", async state => {
    let release!: (state: "READY" | "UNAVAILABLE") => void;
    const readiness = new CachedSemanticAiReadiness({ now: () => new Date(0) }, { probe: () => new Promise(resolve => { release = resolve; }) });
    const pending = readiness.check(); await Promise.resolve();
    if (state === "READY") readiness.recordSuccess(); else readiness.recordProviderFailure();
    release(state === "READY" ? "UNAVAILABLE" : "READY");
    expect(await pending).toBe(state); expect(await readiness.check()).toBe(state);
  });

  it("non-generation probe checks only the exact configured model with one attempt", async () => {
    const retrieveModel = vi.fn().mockResolvedValue({ id: "configured-judge" });
    const probe = new OpenAISemanticReadinessProbe({ retrieveModel }, "configured-judge");
    expect(await probe.probe()).toBe("READY");
    expect(retrieveModel).toHaveBeenCalledExactlyOnceWith("configured-judge");
    retrieveModel.mockRejectedValue(new Error("do not expose"));
    expect(await probe.probe()).toBe("UNAVAILABLE"); expect(retrieveModel).toHaveBeenCalledTimes(2);
  });

  it("model mismatch fails closed", async () => {
    const probe = new OpenAISemanticReadinessProbe({ retrieveModel: async () => ({ id: "other-model" }) }, "configured-judge");
    expect(await probe.probe()).toBe("UNAVAILABLE");
  });

  it("SDK transport explicitly disables retries and generation", async () => {
    const source = await readFile("src/adapters/openai-semantic-readiness/openai-semantic-readiness.ts", "utf8");
    expect(source).toContain("models.retrieve(model, { maxRetries: 0, timeout: 10_000 })");
    expect(source).not.toMatch(/responses\.create|responses\.parse|completions/);
    const migration = await readFile("supabase/migrations/202609130001_m4_adaptive_recovery.sql", "utf8");
    expect(migration).toContain("'ERROR_RECOVERABLE'"); expect(migration).not.toMatch(/CREATE TABLE|ADD COLUMN|DELETE|UPDATE user_answers/i);
  });
});

describe("M4-C start and passive execution evidence", () => {
  it("READY adaptive start creates one session; fresh cache avoids another probe", async () => {
    const f = adaptiveRuntimeFixture();
    await startOfficial(f.deps, "device"); expect(f.starts()).toBe(1); expect(f.probes()).toBe(1);
    expect(await f.readiness.check()).toBe("READY"); expect(f.probes()).toBe(1);
  });

  it("UNAVAILABLE or absent readiness creates no session", async () => {
    const f = adaptiveRuntimeFixture(); f.setProbeState("UNAVAILABLE");
    await expect(startOfficial(f.deps, "device")).rejects.toThrow("SEMANTIC_AI_UNAVAILABLE");
    expect(f.starts()).toBe(0); expect(f.judgeInputs).toHaveLength(0);
    await expect(startOfficial({ clock: f.deps.clock, judge: f.deps.judge, identity: f.deps.identity, store: f.deps.store }, "device")).rejects.toThrow("SEMANTIC_AI_UNAVAILABLE");
    expect(f.starts()).toBe(0);
  });

  it("existing official play remains accessible without new readiness/session creation", async () => {
    const f = adaptiveRuntimeFixture(); await startOfficial(f.deps, "device");
    f.readiness.recordProviderFailure();
    expect((await startOfficial(f.deps, "device"))!.session.id).toBe(f.session().id);
    expect(f.starts()).toBe(1); expect(f.probes()).toBe(1);
  });

  it("successful Judge execution renews READY without a probe", async () => {
    const f = adaptiveRuntimeFixture(); await startOfficial(f.deps, "device"); f.advance(59_000);
    await answer(f.deps, "device", f.session().id, "모르겠다."); f.advance(59_000);
    expect(await f.readiness.check()).toBe("READY"); expect(f.probes()).toBe(1);
  });

  it.each([fixtureSchemaFailure, () => ({ verdict: { answerType: "REASONING" as const, ambiguity: "NONE" as const, nodes: [] }, attempts: [fixtureAttempt] })])("schema-only failure pauses only this session, not global readiness", async makeFailure => {
    const f = adaptiveRuntimeFixture(); await startOfficial(f.deps, "device"); f.executions.push(makeFailure());
    await expect(answer(f.deps, "device", f.session().id, "저장할 생각")).rejects.toBeInstanceOf(AdaptiveEvaluationPausedError);
    expect(f.session().status).toBe("ERROR_RECOVERABLE");
    expect(await f.readiness.check()).toBe("READY"); expect(f.probes()).toBe(1);
    expect(f.aiRuns.at(-1)).toMatchObject({ resultStatus: "SCHEMA_ERROR", answerId: f.session().thoughts[0]!.id });
  });

  it("legacy start is unchanged and legacy failure preserves the accepted answer", async () => {
    const f = adaptiveRuntimeFixture(true); f.setProbeState("UNAVAILABLE");
    await startOfficial(f.deps, "device"); expect(f.probes()).toBe(0);
    f.executions.push(fixtureProviderFailure());
    await expect(answer(f.deps, "device", f.session().id, "legacy answer")).rejects.toBeInstanceOf(AdaptiveEvaluationPausedError);
    expect(f.session()).toMatchObject({ status: "ERROR_RECOVERABLE", turnCount: 1 });
    expect(f.session().thoughts).toHaveLength(1);
  });
});

describe.each([1, 2])("M4-C interrupted Turn %i", turn => {
  async function paused() {
    const f = adaptiveRuntimeFixture(); await startOfficial(f.deps, "device");
    if (turn === 2) await answer(f.deps, "device", f.session().id, "모르겠다.");
    f.executions.push(fixtureProviderFailure());
    const text = `  😀 ${ADAPTIVE_FULL_FIXTURE_ANSWER}  `;
    let pausedError: AdaptiveEvaluationPausedError | undefined;
    try { await answer(f.deps, "device", f.session().id, text); } catch (error) { if (error instanceof AdaptiveEvaluationPausedError) pausedError = error; else throw error; }
    expect(pausedError).toBeDefined();
    return { f, text, publicView: pausedError!.session };
  }

  it("preserves exact answer, turn, semantic state, and failed AI runs without fabricated feedback", async () => {
    const { f, text, publicView } = await paused();
    expect(f.session()).toMatchObject({ status: "ERROR_RECOVERABLE", turnCount: turn });
    expect(f.session().thoughts.at(-1)).toMatchObject({ text, turn });
    expect(f.session().thoughts).toHaveLength(turn); expect(f.session().guidance).toHaveLength(turn - 1);
    expect(publicView.adaptive).toMatchObject({ paused: true, canResume: true, canAnswer: false, canReveal: false });
    expect(publicView.adaptive!.text).toBeUndefined();
    expect(f.aiRuns.at(-1)).toMatchObject({ resultStatus: "PROVIDER_ERROR", answerId: f.session().thoughts.at(-1)!.id });
    expect(await f.readiness.check()).toBe("UNAVAILABLE");
    await expect(answer(f.deps, "device", f.session().id, "new reasoning")).rejects.toThrow("INVALID_SESSION_STATE");
    await expect(reveal(f.deps, "device", f.session().id)).rejects.toThrow("REVEAL_NOT_ALLOWED");
    expect((await getOwned(f.deps, "device", f.session().id))!.session.thoughts.at(-1)!.text).toBe(text);
  });

  it("unavailable retry does not call Judge or consume another turn", async () => {
    const { f } = await paused(); const calls = f.judgeInputs.length;
    await expect(resumeAdaptiveEvaluation(f.deps, "device", f.session().id, f.session().stateVersion)).rejects.toThrow("SEMANTIC_AI_UNAVAILABLE");
    expect(f.judgeInputs).toHaveLength(calls); expect(f.session().turnCount).toBe(turn);
  });

  it("available retry reevaluates same answer/id/turn and continues normal M4-B", async () => {
    const { f, text } = await paused(); const pending = f.session().thoughts.at(-1)!;
    f.advance(12_000);
    const result = await resumeAdaptiveEvaluation(f.deps, "device", f.session().id, f.session().stateVersion);
    expect(f.judgeInputs.at(-1)!.currentAnswer).toBe(text);
    expect(f.session().thoughts.at(-1)).toEqual(pending); expect(f.session().thoughts).toHaveLength(turn);
    expect(f.reservations()).toBe(turn); expect(f.session().turnCount).toBe(turn);
    expect(result!.session).toMatchObject({ status: turn === 1 ? "THINKING" : "REVEAL_READY", turnCount: turn, adaptive: { paused: false, canResume: false, canAnswer: turn === 1, canReveal: turn === 2, text: expect.any(String) } });
    expect(f.aiRuns.at(-1)).toMatchObject({ answerId: pending.id }); expect(await f.readiness.check()).toBe("READY");
    if (turn === 2) {
      expect(await reveal(f.deps, "device", f.session().id)).toBeDefined();
      expect(await finishReveal(f.deps, "device", f.session().id)).toMatchObject({ status: "REVEALED" });
    }
  });

  it("failed retry remains paused with no duplicate answer", async () => {
    const { f, text } = await paused(); f.advance(12_000); f.executions.push(fixtureProviderFailure());
    await expect(resumeAdaptiveEvaluation(f.deps, "device", f.session().id, f.session().stateVersion)).rejects.toBeInstanceOf(AdaptiveEvaluationPausedError);
    expect(f.session()).toMatchObject({ status: "ERROR_RECOVERABLE", turnCount: turn });
    expect(f.session().thoughts).toHaveLength(turn); expect(f.session().thoughts.at(-1)!.text).toBe(text);
  });

  it("concurrent retries reserve only once; stale/repeated recovery cannot duplicate evaluation", async () => {
    const { f } = await paused(); f.advance(12_000);
    const version = f.session().stateVersion; const before = f.judgeInputs.length;
    const results = await Promise.allSettled([resumeAdaptiveEvaluation(f.deps, "device", f.session().id, version), resumeAdaptiveEvaluation(f.deps, "device", f.session().id, version)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(f.judgeInputs).toHaveLength(before + 1); expect(f.session().thoughts).toHaveLength(turn);
    await expect(resumeAdaptiveEvaluation(f.deps, "device", f.session().id, version)).rejects.toThrow("STALE_STATE_VERSION");
    await expect(resumeAdaptiveEvaluation(f.deps, "device", f.session().id, f.session().stateVersion)).resolves.toMatchObject({processing: "REPLAYED"});
    expect(f.judgeInputs).toHaveLength(before + 1);
  });

  it("CAS rejection stops before Judge and preserves paused answer", async () => {
    const { f } = await paused(); f.advance(12_000); f.rejectNextTransition(); const before = f.judgeInputs.length;
    await expect(resumeAdaptiveEvaluation(f.deps, "device", f.session().id, f.session().stateVersion)).rejects.toThrow("STALE_STATE_VERSION");
    expect(f.judgeInputs).toHaveLength(before); expect(f.session().status).toBe("ERROR_RECOVERABLE");
  });
});
