import { z } from "zod";
import { getOwned, type DailyGameDeps } from "./daily-game";
import type { ContentVersion } from "@/domain/content/schema";
import type { JudgeExecutionOwner } from "@/ports/ai-operation";
import { JudgeExecutionError } from "@/ports/judge";
import { applyJudgeVerdict } from "@/domain/play/policy";
import { JudgeVerdictValidationError, validateJudgeVerdict } from "./judge-verdict";
import { toPublicSessionView } from "./session-view";
import { AdaptiveEvaluationPausedError, requireSemanticAiReadiness } from "./adaptive-evaluation";

// Two SDK-default 10-minute attempts plus bounded scheduling headroom.
export const JUDGE_ROUND_LEASE_MS = 21 * 60 * 1000;
export const judgeSubmissionSchema = z.object({ turn: z.number().int().min(1).max(2), submissionId: z.uuid(), thought: z.string().min(1).max(2000) }).strict();
export type JudgeSubmission = z.infer<typeof judgeSubmissionSchema>;
const metadata = (deps: DailyGameDeps) => deps.judge.admissionMetadata ?? { provider: "fake", model: "fake", promptVersion: "fake" };

export async function submitJudgeOperation(deps: DailyGameDeps,deviceId: string,sessionId: string,input: JudgeSubmission) {
  judgeSubmissionSchema.parse(input);
  const session = await deps.store.getOwnedSession(sessionId,deviceId);
  if (!session) return undefined;
  const content = await deps.store.getContentVersion(session.contentVersionId);
  if (!content) throw new Error("CONTENT_VERSION_NOT_FOUND");
  const result = await deps.store.reserveJudgeSubmission({ sessionId,deviceId,expectedVersion: session.stateVersion,
    answer: { id: deps.identity.randomId(),submissionId: input.submissionId,turn: input.turn,stage: session.stage,text: input.thought },
    payloadHash: deps.identity.hashToken(JSON.stringify([input.turn,input.thought])),operationId: deps.identity.randomId(),runId: deps.identity.randomId(),at: deps.clock.now(),leaseDurationMs: JUDGE_ROUND_LEASE_MS,metadata: metadata(deps) });
  if (result.kind === "SESSION_NOT_FOUND") return undefined;
  if (result.kind === "REPLAY") return replayJudgeOperation(deps,deviceId,sessionId);
  if (result.kind !== "NEW") throw new Error(result.kind);
  return executeJudgeOperation(deps,result.owner,content);
}

export async function resumeJudgeOperation(deps: DailyGameDeps,deviceId: string,sessionId: string,submissionId: string,expectedVersion: number) {
  const session = await deps.store.getOwnedSession(sessionId,deviceId);
  if (!session) return undefined;
  const content = await deps.store.getContentVersion(session.contentVersionId);
  if (!content) throw new Error("CONTENT_VERSION_NOT_FOUND");
  if ("adaptive_guidance" in content.serverPolicy) await requireSemanticAiReadiness(deps);
  const result = await deps.store.reserveJudgeRecovery({ sessionId,deviceId,submissionId,expectedVersion,runId: deps.identity.randomId(),at: deps.clock.now(),leaseDurationMs: JUDGE_ROUND_LEASE_MS,metadata: metadata(deps) });
  if (result.kind === "SESSION_NOT_FOUND") return undefined;
  if (result.kind === "REPLAY") return replayJudgeOperation(deps,deviceId,sessionId);
  if (result.kind !== "NEW") throw new Error(result.kind);
  return executeJudgeOperation(deps,result.owner,content);
}

// Reservation has committed before this canonical loader uses the pool.
async function replayJudgeOperation(deps: DailyGameDeps,deviceId: string,sessionId: string) {
  const current = await getOwned(deps,deviceId,sessionId);
  return current ? {processing: "REPLAYED" as const,session: current.session} : undefined;
}

export async function executeJudgeOperation(deps: DailyGameDeps,owner: JudgeExecutionOwner,content: ContentVersion) {
  let runId = owner.runId;
  let settled = false;
  try {
    const execution = await deps.judge.evaluate({ rubric: content.judgeRubric,currentAnswer: owner.answer.text,priorConfirmedState: owner.session.discoveries,
      ...(owner.session.guidance.at(-1)?.text ? {lastGuidance: owner.session.guidance.at(-1)!.text} : {}),
      lifecycle: {
        beforeAttempt: async attempt => {
          if (attempt === 1) await deps.store.verifyJudgeAdmission(owner,deps.clock.now());
          else if (attempt === 2) { const nextId = deps.identity.randomId(); await deps.store.admitJudgeRetry(owner,nextId,deps.clock.now(),metadata(deps)); runId = nextId; settled = false; }
          else throw new Error("INVALID_JUDGE_ATTEMPT");
        },
        failedAttempt: async (attempt,ambiguous) => { await deps.store.settleJudgeFailure(owner,runId,attempt,ambiguous,deps.clock.now()); settled = true; },
      },
    });
    const last = execution.attempts.at(-1);
    if (!last) throw new Error("INVALID_JUDGE_ATTEMPT");
    let verdict;
    try { verdict = validateJudgeVerdict(execution.verdict,content.judgeRubric,owner.answer.text); }
    catch (error) { await deps.store.settleJudgeFailure(owner,runId,{...last,schemaValid: false,resultStatus: "SCHEMA_ERROR",failureCategory: error instanceof JudgeVerdictValidationError ? error.category : "STRUCTURED_OUTPUT_INVALID"},false,deps.clock.now()); settled = true; throw error; }
    const result = applyJudgeVerdict(owner.session,verdict,content.serverPolicy);
    const next = { ...result.session,...(result.session.status === "SYNTHESIZING" ? {synthesisEnteredAt: deps.clock.now()} : {}),stateVersion: owner.session.stateVersion+1 };
    const completed = await deps.store.completeJudgeOperation(owner,runId,last,next,deps.clock.now());
    deps.readiness?.recordSuccess();
    return { processing: "PROCESSED" as const,outcome: result.outcome,session: toPublicSessionView(completed,content.serverPolicy,[],deps.clock.now()) };
  } catch (error) {
    if (error instanceof Error && ["STALE_STATE_VERSION","STALE_JUDGE_EXECUTION"].includes(error.message)) throw error;
    if (error instanceof JudgeExecutionError) {
      const last = error.attempts.at(-1);
      if (last?.resultStatus === "PROVIDER_ERROR") deps.readiness?.recordProviderFailure();
      if (last && !settled) await deps.store.settleJudgeFailure(owner,runId,last,last.resultStatus === "PROVIDER_ERROR",deps.clock.now());
    }
    const paused = await deps.store.pauseJudgeOperation(owner,deps.clock.now());
    throw new AdaptiveEvaluationPausedError(toPublicSessionView(paused,content.serverPolicy,[],deps.clock.now()));
  }
}
