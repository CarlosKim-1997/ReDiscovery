import type { ClockPort } from "@/ports/clock";
import type { IdentityPort } from "@/ports/identity";
import type { JudgePort } from "@/ports/judge";
import type { PrimaryStorePort } from "@/ports/primary-store";
import { applyCorrectiveRescue, applyJudgeVerdict, beginEvaluation, completeReveal, lockPlaySession } from "@/domain/play/policy";
import { resolveEvidence } from "@/domain/play/session";
import type { PlaySession } from "@/domain/play/session";
import type { ServerPolicy } from "@/domain/content/schema";
import { toPublicSessionView } from "./session-view";
import { validateJudgeVerdict } from "./judge-verdict";
import { JudgeExecutionError, type JudgeAttempt } from "@/ports/judge";

export interface DailyGameDeps { readonly clock:ClockPort; readonly identity:IdentityPort; readonly judge:JudgePort; readonly store:PrimaryStorePort }
export async function currentDaily(deps:DailyGameDeps){return deps.store.resolveDaily(deps.clock.now());}
export async function resolveDevice(deps:DailyGameDeps,token?:string){
  if(token){const existing=await deps.store.findActiveDevice(deps.identity.hashToken(token));if(existing){await deps.store.touchDevice(existing.id);return{device:existing};}}
  const freshToken=deps.identity.randomToken();const device=await deps.store.createDevice(deps.identity.hashToken(freshToken));return{device,token:freshToken};
}
export async function startOfficial(deps:DailyGameDeps,deviceId:string){const daily=await currentDaily(deps);if(!daily)return undefined;const content=await requiredContent(deps,daily.contentVersionId);const session=await deps.store.startOfficialSession(deviceId,daily,content.judgeRubric.nodes.map(n=>n.id));return{daily:publicDaily(daily),session:toPublicSessionView(session,content.serverPolicy)};}
export async function getOwned(deps:DailyGameDeps,deviceId:string,id:string){const s=await deps.store.getOwnedSession(id,deviceId);if(!s)return undefined;const c=await requiredContent(deps,s.contentVersionId);const daily=await deps.store.getDaily(s.dailyId);return{daily:daily?publicDaily(daily):undefined,session:toPublicSessionView(s,c.serverPolicy)};}
export async function answer(deps:DailyGameDeps,deviceId:string,id:string,text:string){
  const s=await deps.store.getOwnedSession(id,deviceId);if(!s)return undefined;const c=await requiredContent(deps,s.contentVersionId);if(text.length>2000)throw new Error("ANSWER_TOO_LONG");if(s.turnCount>=c.serverPolicy.max_turns)throw new Error("INVALID_SESSION_STATE");
  const thought={id:deps.identity.randomId(),turn:s.turnCount+1,stage:s.stage,text};const evaluating={...beginEvaluation(s,thought),stateVersion:s.stateVersion+1};
  if(!await deps.store.reserveAnswerEvaluation(s.stateVersion,thought,evaluating))throw new Error("STALE_STATE_VERSION");
  let attempts:readonly JudgeAttempt[]=[];let runsRecorded=false;
  try {
    const execution=await deps.judge.evaluate({rubric:c.judgeRubric,currentAnswer:text,priorConfirmedState:s.discoveries,...(s.guidance.at(-1)?.text?{lastGuidance:s.guidance.at(-1)!.text}:{})});
    attempts=execution.attempts;
    let verdict;
    try { verdict=validateJudgeVerdict(execution.verdict,c.judgeRubric,text); }
    catch { attempts=markLastSchemaFailure(attempts);throw new JudgeExecutionError(attempts); }
    await recordRuns(deps,s,thought.id,attempts);runsRecorded=true;
    const result=applyJudgeVerdict(evaluating,verdict,c.serverPolicy);const next={...result.session,stateVersion:evaluating.stateVersion+1};
    if(!await deps.store.completeAnswerEvaluation(evaluating.stateVersion,next))throw new Error("STALE_STATE_VERSION");
    return{outcome:result.outcome,session:toPublicSessionView(next,c.serverPolicy)};
  } catch(error) {
    const failedAttempts=error instanceof JudgeExecutionError?error.attempts:attempts;
    if(!runsRecorded&&failedAttempts.length>0)try{await recordRuns(deps,s,thought.id,failedAttempts);}catch{void 0;}
    await deps.store.abortAnswerEvaluation(evaluating.stateVersion,s,thought.id);
    if(error instanceof JudgeExecutionError)throw error;
    throw new JudgeExecutionError(failedAttempts);
  }
}
export async function recover(deps:DailyGameDeps,deviceId:string,id:string){return transition(deps,deviceId,id,(s,p)=>applyCorrectiveRescue(s,p));}
export async function lock(deps:DailyGameDeps,deviceId:string,id:string){return transition(deps,deviceId,id,(s,p)=>lockPlaySession(s,p));}
export async function reveal(deps:DailyGameDeps,deviceId:string,id:string){const s=await deps.store.getOwnedSession(id,deviceId);if(!s)return undefined;if((s.status!=="LOCKED"&&s.status!=="REVEALED")||!s.lockEvidence)throw new Error("REVEAL_NOT_ALLOWED");const c=await requiredContent(deps,s.contentVersionId);const representativeThought=resolveEvidence(s,s.lockEvidence);return{...c.revealContent,representativeThought,substantialGuidanceUsed:s.guidance.some(g=>g.stage==="RESCUE"||g.stage==="CORRECTION"),connection:`당신은 “${representativeThought}”라고 보았습니다. ${c.revealContent.connection}`};}
export async function finishReveal(deps:DailyGameDeps,deviceId:string,id:string){const s=await deps.store.getOwnedSession(id,deviceId);if(!s)return undefined;const c=await requiredContent(deps,s.contentVersionId);const completed=completeReveal(s);const next={...completed,stateVersion:s.status==="REVEALED"?s.stateVersion:s.stateVersion+1};if(s.status!=="REVEALED"&&!await deps.store.completeReveal(s.stateVersion,next))throw new Error("STALE_STATE_VERSION");return toPublicSessionView(next,c.serverPolicy);}
async function transition(deps:DailyGameDeps,deviceId:string,id:string,fn:(s:PlaySession,p:ServerPolicy)=>PlaySession){const s=await deps.store.getOwnedSession(id,deviceId);if(!s)return undefined;const c=await requiredContent(deps,s.contentVersionId);const changed=fn(s,c.serverPolicy);const next={...changed,stateVersion:s.stateVersion+1};if(!await deps.store.saveTransition(s.stateVersion,next))throw new Error("STALE_STATE_VERSION");return toPublicSessionView(next,c.serverPolicy);}
async function requiredContent(deps:DailyGameDeps,id:string){const c=await deps.store.getContentVersion(id);if(!c)throw new Error("CONTENT_VERSION_NOT_FOUND");return c;}
function publicDaily(d:{id:string;canonicalDate:string;sequenceNumber:number;publicPlay:{label:string;estimated_minutes:number;scenario:string;question:string}}){return{id:d.id,canonicalDate:d.canonicalDate,sequenceNumber:d.sequenceNumber,label:d.publicPlay.label,estimatedMinutes:d.publicPlay.estimated_minutes,scenario:d.publicPlay.scenario,question:d.publicPlay.question};}
async function recordRuns(deps:DailyGameDeps,session:PlaySession,answerId:string,attempts:readonly JudgeAttempt[]){const at=deps.clock.now();await deps.store.recordAiRuns(attempts.map(run=>({...run,id:deps.identity.randomId(),sessionId:session.id,answerId,purpose:"JUDGE",contentVersionId:session.contentVersionId,createdAt:at})));}
function markLastSchemaFailure(attempts:readonly JudgeAttempt[]):readonly JudgeAttempt[]{return attempts.map((run,index)=>index===attempts.length-1?{...run,schemaValid:false,resultStatus:"SCHEMA_ERROR"}:run);}
