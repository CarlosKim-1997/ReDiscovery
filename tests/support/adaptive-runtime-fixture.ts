import rawV6 from "../../content/approved/conway-law.v6.json" with { type: "json" };
import rawV1 from "../../content/approved/conway-law.v1.json" with { type: "json" };
import { approvedContentSchema } from "../../src/domain/content/schema";
import { createPlaySession, type PlaySession } from "../../src/domain/play/session";
import { storedGuidanceText } from "../../src/domain/play/adaptive-runtime";
import { CachedSemanticAiReadiness } from "../../src/application/play/semantic-ai-readiness";
import type { DailyGameDeps } from "../../src/application/play/daily-game";
import { JudgeExecutionError, type JudgeExecution, type JudgePort } from "../../src/ports/judge";
import type { AiRunRecord, PrimaryStorePort } from "../../src/ports/primary-store";
import type { SemanticAiReadiness } from "../../src/ports/semantic-ai-readiness";
import { installJudgeOperationFixture } from "./judge-operation-store";

export const ADAPTIVE_FULL_FIXTURE_ANSWER = "팀 경계가 소통을 가르고 설계 결정이 모여 시스템 구조가 조직 구조를 닮는다.";
export const fixtureAttempt = { attempt: 1, provider: "fake", model: "fixture", promptVersion: "fixture", schemaValid: true, resultStatus: "SUCCEEDED", latencyMs: 0 } as const;
export const fixtureProviderFailure = () => new JudgeExecutionError([{ ...fixtureAttempt, schemaValid: false, resultStatus: "PROVIDER_ERROR" }]);
export const fixtureSchemaFailure = () => new JudgeExecutionError([{ ...fixtureAttempt, schemaValid: false, resultStatus: "SCHEMA_ERROR", failureCategory: "STRUCTURED_OUTPUT_INVALID" }]);

/** Test-only existing-store/CAS fixture shared by application and browser tests. */
export function adaptiveRuntimeFixture(legacy = false) {
  const content = approvedContentSchema.parse(legacy ? rawV1 : rawV6);
  const version = { id: "fixture-content", version: content.version, schemaVersion: content.schema_version, contentHash: "fixture", publicPlay: content.PUBLIC_PLAY, judgeRubric: content.JUDGE_RUBRIC, serverPolicy: content.SERVER_POLICY, revealContent: content.REVEAL_CONTENT };
  const daily = { id: "fixture-daily", canonicalDate: "2099-01-02", sequenceNumber: 999998, releaseAt: new Date("2099-01-02T00:00:00Z"), contentVersionId: version.id, publicPlay: content.PUBLIC_PLAY };
  let session: PlaySession | undefined;
  let now = new Date("2099-01-02T03:00:00Z").getTime();
  let id = 0;
  let starts = 0;
  let reservations = 0;
  let probes = 0;
  let rejectTransition = false;
  let probeState: SemanticAiReadiness = "READY";
  const judgeInputs: Parameters<JudgePort["evaluate"]>[0][] = [];
  const executions: (JudgeExecution | Error | undefined)[] = [];
  const aiRuns: AiRunRecord[] = [];
  const clock = { now: () => new Date(now) };
  const readiness = new CachedSemanticAiReadiness(clock, { probe: async () => { probes++; return probeState; } });
  const restore = (next: PlaySession) => { session = { ...next, guidance: next.guidance.map(event => ({ ...event, text: storedGuidanceText(event.key, content.SERVER_POLICY) })) }; };
  const cas = async (expected: number, next: PlaySession) => {
    if (rejectTransition) { rejectTransition = false; return false; }
    if (!session || session.stateVersion !== expected) return false;
    restore(next); return true;
  };
  const store = {
    resolveDaily: async () => daily,
    getDaily: async () => daily,
    getContentVersion: async () => version,
    getOfficialSession: async () => session,
    getOwnedSession: async (sessionId: string, deviceId: string) => sessionId === session?.id && deviceId === session.anonymousDeviceId ? session : undefined,
    startOfficialSession: async () => { starts++; session ??= createPlaySession({ id: "adaptive-fixture", dailyId: daily.id, contentVersionId: version.id, anonymousDeviceId: "device", nodeIds: content.JUDGE_RUBRIC.nodes.map(node => node.id) }); return session; },
    reserveAnswerEvaluation: async (expected: number, _answer: unknown, next: PlaySession) => { const ok = await cas(expected, next); if (ok) reservations++; return ok; },
    completeAnswerEvaluation: cas,
    saveTransition: cas,
    completeReveal: cas,
    abortAnswerEvaluation: async (expected: number, prior: PlaySession) => cas(expected, { ...prior, stateVersion: expected + 1 }),
    recordAiRuns: async (runs: readonly AiRunRecord[]) => { aiRuns.push(...runs); },
  } as unknown as PrimaryStorePort;
  installJudgeOperationFixture(store);
  const judge: JudgePort = { evaluate: async input => {
    judgeInputs.push(input);
    const scripted = executions.shift();
    if (scripted instanceof Error) throw scripted;
    if (scripted) return scripted;
    return { verdict: { answerType: "REASONING", ambiguity: "NONE", nodes: input.rubric.nodes.map(node => input.currentAnswer === ADAPTIVE_FULL_FIXTURE_ANSWER
      ? { nodeId: node.id, status: "DISCOVERED", evidenceText: input.currentAnswer }
      : { nodeId: node.id, status: "ABSENT" }) }, attempts: [fixtureAttempt] };
  } };
  const deps: DailyGameDeps = { store, judge, clock, readiness, identity: { randomId: () => `fixture-${++id}`, randomToken: () => "unused", hashToken: text => text } };
  return { deps, content, daily, executions, judgeInputs, aiRuns, readiness,
    session: () => session!, starts: () => starts, reservations: () => reservations, probes: () => probes,
    advance: (ms: number) => { now += ms; }, setProbeState: (state: SemanticAiReadiness) => { probeState = state; },
    rejectNextTransition: () => { rejectTransition = true; },
  };
}
