import type { ContentVersion, PublicPlay } from "@/domain/content/schema";
import type { FinalSynthesisAttempt, PlaySession, SubmittedThought } from "@/domain/play/session";
import type { JudgeAttempt } from "@/ports/judge";
import type { FinalSynthesisVerifierAttempt } from "@/ports/final-synthesis-verifier";

interface AiRunBase { readonly id:string; readonly sessionId?:string; readonly contentVersionId:string; readonly datasetVersion?:string; readonly createdAt:Date }
export interface JudgeAiRunRecord extends AiRunBase,JudgeAttempt { readonly purpose:"JUDGE"; readonly answerId?:string }
export interface FinalSynthesisAiRunRecord extends AiRunBase,FinalSynthesisVerifierAttempt { readonly purpose:"FINAL_SYNTHESIS_VERIFY"; readonly synthesisAttemptId:string; readonly evaluationGeneration:number }
export type AiRunRecord=JudgeAiRunRecord|FinalSynthesisAiRunRecord;

export interface DailyRecord { readonly id:string; readonly canonicalDate:string; readonly sequenceNumber:number; readonly releaseAt:Date; readonly contentVersionId:string; readonly publicPlay:PublicPlay }
export type ReserveSynthesisSubmissionResult=
  |{readonly kind:"RESERVED"|"IDEMPOTENT";readonly session:PlaySession;readonly attempt:FinalSynthesisAttempt}
  |{readonly kind:"IDEMPOTENCY_CONFLICT"|"STALE_STATE_VERSION"|"INVALID_STATE"|"SUBMISSION_LIMIT"|"ACTIVE_EVALUATION"};
export type ReserveSynthesisRetryResult=
  |{readonly kind:"RESERVED";readonly session:PlaySession;readonly attempt:FinalSynthesisAttempt}
  |{readonly kind:"STALE_STATE_VERSION"|"STALE_EVALUATION_GENERATION"|"INVALID_STATE"|"ACTIVE_EVALUATION"};

export interface PrimaryStorePort {
  resolveDaily(at:Date):Promise<DailyRecord|undefined>;
  getDaily(id:string):Promise<DailyRecord|undefined>;
  getContentVersion(id:string):Promise<ContentVersion|undefined>;
  findActiveDevice(tokenHash:string):Promise<{id:string}|undefined>;
  createDevice(tokenHash:string):Promise<{id:string}>;
  touchDevice(id:string):Promise<void>;
  startOfficialSession(deviceId:string,daily:DailyRecord,nodeIds:readonly string[]):Promise<PlaySession>;
  getOwnedSession(id:string,deviceId:string):Promise<PlaySession|undefined>;
  getFinalSynthesisAttempts(sessionId:string,deviceId:string):Promise<readonly FinalSynthesisAttempt[]|undefined>;
  reserveAnswerEvaluation(expectedVersion:number,answer:SubmittedThought,evaluating:PlaySession):Promise<boolean>;
  completeAnswerEvaluation(expectedVersion:number,session:PlaySession):Promise<boolean>;
  abortAnswerEvaluation(expectedVersion:number,prior:PlaySession,answerId:string):Promise<boolean>;
  recordAiRuns(runs:readonly AiRunRecord[]):Promise<void>;
  saveAnswerTransition(expectedVersion:number,answer:SubmittedThought,session:PlaySession):Promise<boolean>;
  saveTransition(expectedVersion:number,session:PlaySession):Promise<boolean>;
  completeReveal(expectedVersion:number,session:PlaySession):Promise<boolean>;
  reserveFinalSynthesisSubmission(input:{readonly sessionId:string;readonly deviceId:string;readonly expectedStateVersion:number;readonly attemptId:string;readonly submissionKeyHash:string;readonly submissionTextHash:string;readonly text:string;readonly submittedAt:Date;readonly leaseDurationMs:number}):Promise<ReserveSynthesisSubmissionResult>;
  completeFinalSynthesisEvaluation(input:{readonly sessionId:string;readonly deviceId:string;readonly attemptId:string;readonly evaluationGeneration:number;readonly redactedResult:unknown;readonly eligible:boolean;readonly evaluatedAt:Date;readonly runs:readonly FinalSynthesisAiRunRecord[]}):Promise<PlaySession|undefined>;
  markFinalSynthesisEvaluationRecoverable(input:{readonly sessionId:string;readonly deviceId:string;readonly attemptId:string;readonly evaluationGeneration:number;readonly failedAt:Date;readonly failureCategory:string;readonly runs:readonly FinalSynthesisAiRunRecord[]}):Promise<PlaySession|undefined>;
  reserveFinalSynthesisRetry(input:{readonly sessionId:string;readonly deviceId:string;readonly expectedStateVersion:number;readonly attemptId:string;readonly expectedEvaluationGeneration:number;readonly startedAt:Date;readonly leaseDurationMs:number}):Promise<ReserveSynthesisRetryResult>;
  skipFinalSynthesis(input:{readonly sessionId:string;readonly deviceId:string;readonly expectedStateVersion:number;readonly skippedAt:Date}):Promise<PlaySession|undefined>;
}
