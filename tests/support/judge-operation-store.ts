import { beginEvaluation } from "@/domain/play/policy";
import type { PrimaryStorePort } from "@/ports/primary-store";
import type { JudgeOperation, JudgeExecutionOwner } from "@/ports/ai-operation";

/** Test-owned lifecycle on top of the existing gameplay/CAS fixture. */
export function installJudgeOperationFixture(store: PrimaryStorePort) {
  const operations = new Map<string,JudgeOperation>();
  const hashes = new Map<string,string>();
  const admissionStates = new Map<string,string>();
  let queue = Promise.resolve();
  const serial = <T>(action: () => Promise<T>): Promise<T> => { const pending = queue.then(action); queue = pending.then(()=>{},()=>{}); return pending; };
  const fence = async (owner: JudgeExecutionOwner,at: Date) => {
    const session = await store.getOwnedSession(owner.session.id,owner.session.anonymousDeviceId);
    const op = operations.get(owner.answer.id);
    if (!session || session.stateVersion !== owner.session.stateVersion) throw new Error("STALE_STATE_VERSION");
    if (!op || op.status !== "EVALUATING" || op.recoveryCount !== owner.operation.recoveryCount || op.leaseExpiresAt!.getTime() <= at.getTime()) throw new Error("STALE_JUDGE_EXECUTION");
  };
  store.reserveJudgeSubmission = input => serial(async () => {
    const session = await store.getOwnedSession(input.sessionId,input.deviceId);
    if (!session) return {kind: "SESSION_NOT_FOUND"};
    const existing = session.thoughts.find(a=>a.submissionId === input.answer.submissionId);
    if (existing) return hashes.get(existing.id) === input.payloadHash ? {kind: "REPLAY",session} : {kind: "IDEMPOTENCY_CONFLICT"};
    if (session.thoughts.some(a=>a.turn === input.answer.turn)) return {kind: "TURN_ALREADY_SUBMITTED"};
    if (session.status !== "THINKING" || input.answer.turn !== session.turnCount+1 || input.answer.turn > 2) return {kind: "INVALID_SESSION_STATE"};
    const op: JudgeOperation = {id: input.operationId,answerId: input.answer.id,status: "EVALUATING",recoveryCount: 0,leaseExpiresAt: new Date(input.at.getTime()+input.leaseDurationMs)};
    const next = {...beginEvaluation(session,input.answer),stateVersion: session.stateVersion+1,judgeEvaluation: op};
    if (!await store.reserveAnswerEvaluation(input.expectedVersion,input.answer,next)) return {kind: "STALE_STATE_VERSION"};
    operations.set(input.answer.id,op); hashes.set(input.answer.id,input.payloadHash); admissionStates.set(input.runId,"ADMITTED");
    return {kind: "NEW",owner: {session: next,answer: input.answer,operation: op,runId: input.runId}};
  });
  store.reserveJudgeRecovery = input => serial(async () => {
    const session = await store.getOwnedSession(input.sessionId,input.deviceId);
    if (!session) return {kind: "SESSION_NOT_FOUND"};
    const answer = session.thoughts.at(-1); const op = answer && operations.get(answer.id);
    if (!answer || answer.submissionId !== input.submissionId || !op) return {kind: "INVALID_SESSION_STATE"};
    if (session.stateVersion !== input.expectedVersion) return {kind: "STALE_STATE_VERSION"};
    if (op.status === "COMPLETED") return {kind: "REPLAY",session};
    if (op.recoveryCount === 1) return {kind: "RECOVERY_EXHAUSTED"};
    if (op.status !== "RECOVERABLE") return {kind: "INVALID_SESSION_STATE"};
    const recovering: JudgeOperation = {...op,status: "EVALUATING",recoveryCount: 1,leaseExpiresAt: new Date(input.at.getTime()+input.leaseDurationMs)};
    const next = {...session,status: "EVALUATING" as const,stateVersion: session.stateVersion+1,judgeEvaluation: recovering};
    if (!await store.saveTransition(input.expectedVersion,next)) return {kind: "STALE_STATE_VERSION"};
    operations.set(answer.id,recovering); admissionStates.set(input.runId,"ADMITTED");
    return {kind: "NEW",owner: {session: next,answer,operation: recovering,runId: input.runId}};
  });
  store.getJudgeOperation = async (id,device) => { const session = await store.getOwnedSession(id,device); return session?.thoughts.at(-1) ? operations.get(session.thoughts.at(-1)!.id) : undefined; };
  store.verifyJudgeAdmission = async (owner,at) => {await fence(owner,at);if(admissionStates.get(owner.runId) !== "ADMITTED")throw new Error("STALE_JUDGE_EXECUTION");};
  store.admitJudgeRetry = async (owner,id,at) => { await fence(owner,at); if(admissionStates.has(id))throw new Error("INVALID_JUDGE_ATTEMPT"); admissionStates.set(id,"ADMITTED"); };
  store.settleJudgeFailure = async (owner,id,attempt,ambiguous,at) => { await fence(owner,at);admissionStates.set(id,ambiguous?"UNKNOWN":"FAILED"); await store.recordAiRuns([{...attempt,id,sessionId: owner.session.id,answerId: owner.answer.id,purpose: "JUDGE",contentVersionId: owner.session.contentVersionId,createdAt: at}]); };
  store.pauseJudgeOperation = async (owner,at) => {
    await fence(owner,at);
    const op: JudgeOperation = {id: owner.operation.id,answerId: owner.answer.id,status: owner.operation.recoveryCount ? "RECOVERY_EXHAUSTED" : "RECOVERABLE",recoveryCount: owner.operation.recoveryCount};
    const next = {...owner.session,status: "ERROR_RECOVERABLE" as const,stateVersion: owner.session.stateVersion+1,judgeEvaluation: op};
    if (!await store.saveTransition(owner.session.stateVersion,next))throw new Error("STALE_STATE_VERSION");
    operations.set(owner.answer.id,op); return next;
  };
  store.completeJudgeOperation = async (owner,id,attempt,next,at) => {
    await fence(owner,at);
    const op: JudgeOperation = {id: owner.operation.id,answerId: owner.answer.id,status: "COMPLETED",recoveryCount: owner.operation.recoveryCount};
    const completed = {...next,judgeEvaluation: op};
    if (!await store.completeAnswerEvaluation(owner.session.stateVersion,completed))throw new Error("STALE_STATE_VERSION");
    operations.set(owner.answer.id,op); admissionStates.set(id,"SUCCEEDED");
    await store.recordAiRuns([{...attempt,id,sessionId: next.id,answerId: owner.answer.id,purpose: "JUDGE",contentVersionId: next.contentVersionId,createdAt: at}]);
    return completed;
  };
}
