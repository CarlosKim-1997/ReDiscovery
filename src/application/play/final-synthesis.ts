import type { ClockPort } from "@/ports/clock";
import type { IdentityPort } from "@/ports/identity";
import type { FinalSynthesisAiRunRecord, PrimaryStorePort } from "@/ports/primary-store";
import {
  FinalSynthesisExecutionError,
  FinalSynthesisProofValidationError,
  type FinalSynthesisVerifierAttempt,
  type FinalSynthesisVerifierPort,
} from "@/ports/final-synthesis-verifier";
import { buildFinalSynthesisVerifierInput, deriveFinalSynthesisVerification, isFinalSynthesisEligible } from "./final-synthesis-proof";

export const FINAL_SYNTHESIS_EVALUATION_LEASE_MS = 120_000;

export class FinalSynthesisApplicationError extends Error {
  constructor(readonly code:
    | "SESSION_NOT_FOUND" | "FINAL_SYNTHESIS_NOT_ENABLED" | "INVALID_SYNTHESIS_STATE"
    | "STALE_STATE_VERSION" | "IDEMPOTENCY_CONFLICT" | "SUBMISSION_LIMIT"
    | "ACTIVE_EVALUATION" | "STALE_EVALUATION_GENERATION") { super(code); }
}

export interface FinalSynthesisDeps {
  readonly clock: ClockPort;
  readonly identity: IdentityPort;
  readonly verifier: FinalSynthesisVerifierPort;
  readonly store: PrimaryStorePort;
  readonly leaseDurationMs?: number;
}

export async function submitFinalSynthesis(deps:FinalSynthesisDeps,input:{readonly deviceId:string;readonly sessionId:string;readonly text:string;readonly idempotencyKey:string;readonly expectedStateVersion:number}){
  const session=await deps.store.getOwnedSession(input.sessionId,input.deviceId);if(!session)throw new FinalSynthesisApplicationError("SESSION_NOT_FOUND");
  const content=await deps.store.getContentVersion(session.contentVersionId);if(!content||!("final_synthesis" in content.serverPolicy))throw new FinalSynthesisApplicationError("FINAL_SYNTHESIS_NOT_ENABLED");
  const verifierInput=buildInput(content.serverPolicy.lock_verifier.nodes,input.text);
  const now=deps.clock.now();
  const reserved=await deps.store.reserveFinalSynthesisSubmission({sessionId:session.id,deviceId:input.deviceId,expectedStateVersion:input.expectedStateVersion,attemptId:deps.identity.randomId(),submissionKeyHash:deps.identity.hashToken(input.idempotencyKey),submissionTextHash:deps.identity.hashToken(input.text),text:input.text,submittedAt:now,leaseDurationMs:deps.leaseDurationMs??FINAL_SYNTHESIS_EVALUATION_LEASE_MS});
  if(reserved.kind==="IDEMPOTENT")return{kind:"IDEMPOTENT" as const,session:reserved.session,attempt:reserved.attempt};
  if(reserved.kind!=="RESERVED")throw mapStoreError(reserved.kind);
  return evaluateReserved(deps,reserved.session,reserved.attempt,verifierInput);
}

export async function retryFinalSynthesisEvaluation(deps:FinalSynthesisDeps,input:{readonly deviceId:string;readonly sessionId:string;readonly attemptId:string;readonly expectedStateVersion:number;readonly expectedEvaluationGeneration:number}){
  const session=await deps.store.getOwnedSession(input.sessionId,input.deviceId);if(!session)throw new FinalSynthesisApplicationError("SESSION_NOT_FOUND");
  const content=await deps.store.getContentVersion(session.contentVersionId);if(!content||!("final_synthesis" in content.serverPolicy))throw new FinalSynthesisApplicationError("FINAL_SYNTHESIS_NOT_ENABLED");
  const now=deps.clock.now();const reserved=await deps.store.reserveFinalSynthesisRetry({...input,startedAt:now,leaseDurationMs:deps.leaseDurationMs??FINAL_SYNTHESIS_EVALUATION_LEASE_MS});
  if(reserved.kind!=="RESERVED")throw mapStoreError(reserved.kind);
  if(!reserved.attempt.text)throw new FinalSynthesisApplicationError("INVALID_SYNTHESIS_STATE");
  return evaluateReserved(deps,reserved.session,reserved.attempt,buildInput(content.serverPolicy.lock_verifier.nodes,reserved.attempt.text));
}

export async function skipFinalSynthesis(deps:FinalSynthesisDeps,input:{readonly deviceId:string;readonly sessionId:string;readonly expectedStateVersion:number}){
  const result=await deps.store.skipFinalSynthesis({...input,skippedAt:deps.clock.now()});
  if(!result)throw new FinalSynthesisApplicationError("INVALID_SYNTHESIS_STATE");return result;
}

async function evaluateReserved(deps:FinalSynthesisDeps,session:Awaited<ReturnType<PrimaryStorePort["getOwnedSession"]>> & {},attempt:NonNullable<Awaited<ReturnType<PrimaryStorePort["getFinalSynthesisAttempts"]>>>[number],verifierInput:ReturnType<typeof buildFinalSynthesisVerifierInput>){
  let attempts:readonly FinalSynthesisVerifierAttempt[]=[];
  try{
    const execution=await deps.verifier.extractProof(verifierInput);attempts=execution.attempts;
    let verification;
    try{verification=deriveFinalSynthesisVerification(execution.proof,verifierInput);}
    catch(error){
      const category=error instanceof FinalSynthesisProofValidationError?error.category:"PROOF_SHAPE_INVALID";attempts=markLastSchemaFailure(attempts,category);throw new FinalSynthesisExecutionError(attempts);
    }
    const at=deps.clock.now();const runs=makeRuns(deps,session.id,session.contentVersionId,attempt.id,attempt.evaluationGeneration,attempts,at);
    const completed=await deps.store.completeFinalSynthesisEvaluation({sessionId:session.id,deviceId:session.anonymousDeviceId,attemptId:attempt.id,evaluationGeneration:attempt.evaluationGeneration,redactedResult:verification,eligible:isFinalSynthesisEligible(verification),evaluatedAt:at,runs});
    if(!completed)throw new FinalSynthesisApplicationError("STALE_EVALUATION_GENERATION");
    return{kind:isFinalSynthesisEligible(verification)?"VERIFIED" as const:"INSUFFICIENT" as const,session:completed,attemptId:attempt.id,verification};
  }catch(error){
    if(error instanceof FinalSynthesisApplicationError)throw error;
    const failedAttempts=error instanceof FinalSynthesisExecutionError?error.attempts:attempts;const at=deps.clock.now();
    const failureCategory=failedAttempts.at(-1)?.failureCategory??"PROVIDER_UNAVAILABLE";
    const recovered=await deps.store.markFinalSynthesisEvaluationRecoverable({sessionId:session.id,deviceId:session.anonymousDeviceId,attemptId:attempt.id,evaluationGeneration:attempt.evaluationGeneration,failedAt:at,failureCategory,runs:makeRuns(deps,session.id,session.contentVersionId,attempt.id,attempt.evaluationGeneration,failedAttempts,at)});
    if(!recovered)throw new FinalSynthesisApplicationError("STALE_EVALUATION_GENERATION");
    throw new FinalSynthesisExecutionError(failedAttempts);
  }
}

type PolicyNode={readonly node_id:string;readonly required_components:readonly{readonly id:string;readonly description:string}[]};
function buildInput(nodes:readonly PolicyNode[],text:string){return buildFinalSynthesisVerifierInput(nodes.map(node=>({nodeId:node.node_id,requiredComponents:node.required_components.map(component=>({componentId:component.id,description:component.description}))})),text);}
function makeRuns(deps:FinalSynthesisDeps,sessionId:string,contentVersionId:string,synthesisAttemptId:string,evaluationGeneration:number,attempts:readonly FinalSynthesisVerifierAttempt[],createdAt:Date):readonly FinalSynthesisAiRunRecord[]{return attempts.map(run=>({...run,id:deps.identity.randomId(),sessionId,purpose:"FINAL_SYNTHESIS_VERIFY",contentVersionId,synthesisAttemptId,evaluationGeneration,createdAt}));}
function markLastSchemaFailure(attempts:readonly FinalSynthesisVerifierAttempt[],failureCategory:NonNullable<FinalSynthesisVerifierAttempt["failureCategory"]>){return attempts.map((run,index)=>index===attempts.length-1?{...run,schemaValid:false as const,resultStatus:"SCHEMA_ERROR" as const,failureCategory}:run);}
function mapStoreError(kind:string){const code=kind==="STALE_STATE_VERSION"?"STALE_STATE_VERSION":kind==="IDEMPOTENCY_CONFLICT"?"IDEMPOTENCY_CONFLICT":kind==="SUBMISSION_LIMIT"?"SUBMISSION_LIMIT":kind==="ACTIVE_EVALUATION"?"ACTIVE_EVALUATION":kind==="STALE_EVALUATION_GENERATION"?"STALE_EVALUATION_GENERATION":"INVALID_SYNTHESIS_STATE";return new FinalSynthesisApplicationError(code);}
