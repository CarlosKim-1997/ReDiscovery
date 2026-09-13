import { randomUUID } from "node:crypto";
import { answer as submit } from "@/application/play/daily-game";
import { resumeJudgeOperation } from "@/application/play/judge-operations";
import type { DailyGameDeps } from "@/application/play/daily-game";

/** Existing successful-gameplay fixtures explicitly create fresh submissions. */
export async function answer(deps: DailyGameDeps,deviceId: string,id: string,text: string) {
  const session = await deps.store.getOwnedSession(id,deviceId);
  if (!session) return undefined;
  const content = await deps.store.getContentVersion(session.contentVersionId);
  if (!content || session.turnCount >= content.serverPolicy.max_turns) throw new Error("INVALID_SESSION_STATE");
  const result = await submit(deps,deviceId,id,{turn: session.turnCount+1,submissionId: randomUUID(),thought: text});
  if (result && result.processing !== "PROCESSED") throw new Error("Expected fresh fixture submission");
  return result;
}
export async function resumeAdaptiveEvaluation(deps: DailyGameDeps,deviceId: string,id: string,expectedVersion: number) {
  const session = await deps.store.getOwnedSession(id,deviceId);
  const submissionId = session?.thoughts.at(-1)?.submissionId;
  if (!submissionId) throw new Error("Missing fixture submission identity");
  return resumeJudgeOperation(deps,deviceId,id,submissionId,expectedVersion);
}
