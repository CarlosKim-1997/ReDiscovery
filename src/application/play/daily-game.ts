import type { ClockPort } from "@/ports/clock";
import type { IdentityPort } from "@/ports/identity";
import type { JudgePort } from "@/ports/judge";
import type { PrimaryStorePort } from "@/ports/primary-store";
import { applyCorrectiveRescue, completeReveal, lockPlaySession } from "@/domain/play/policy";
import { resolveEvidence } from "@/domain/play/session";
import type { PlaySession } from "@/domain/play/session";
import type { ServerPolicy } from "@/domain/content/schema";
import { deriveRevealOutcome } from "@/domain/play/final-synthesis";
import { resolveAdaptiveRevealOutcome } from "@/domain/reveal/outcome";
import { projectPersonalizedConnection, type PersonalizedEvidenceIssue } from "@/domain/reveal/personalized-connection";
import { toPublicSessionView } from "./session-view";
import type { SemanticAiReadinessPort } from "@/ports/semantic-ai-readiness";
import { requireSemanticAiReadiness } from "./adaptive-evaluation";
import { submitJudgeOperation, type JudgeSubmission } from "./judge-operations";

export interface DailyGameDeps { readonly clock:ClockPort; readonly identity:IdentityPort; readonly judge:JudgePort; readonly store:PrimaryStorePort; readonly readiness?:SemanticAiReadinessPort }
export async function currentDaily(deps:DailyGameDeps){return deps.store.resolveDaily(deps.clock.now());}
export type DeviceResolution = { kind: "ACTIVE"; device: { id: string } } | { kind: "MISSING" } | { kind: "STALE" };
export async function resolveExistingDevice(deps: Pick<DailyGameDeps, "identity" | "store">, token?: string): Promise<DeviceResolution> {
  if (!token) return { kind: "MISSING" };
  const device = await deps.store.findActiveDevice(deps.identity.hashToken(token));
  return device ? { kind: "ACTIVE", device } : { kind: "STALE" };
}
export async function ensureDevice(deps:DailyGameDeps,token?:string){
  if(token){const existing=await deps.store.findActiveDevice(deps.identity.hashToken(token));if(existing){await deps.store.touchDevice(existing.id);return{device:existing};}}
  const freshToken=deps.identity.randomToken();const device=await deps.store.createDevice(deps.identity.hashToken(freshToken));return{device,token:freshToken};
}
export async function startOfficial(deps:DailyGameDeps,deviceId:string){
  const daily=await currentDaily(deps);if(!daily)return undefined;
  const content=await requiredContent(deps,daily.contentVersionId);
  if("adaptive_guidance" in content.serverPolicy){
    const existing=await deps.store.getOfficialSession(deviceId,daily.id);
    if(existing)return{daily:publicDaily(daily),session:toPublicSessionView(existing,content.serverPolicy,[],deps.clock.now())};
    await requireSemanticAiReadiness(deps);
  }
  const session=await deps.store.startOfficialSession(deviceId,daily,content.judgeRubric.nodes.map(n=>n.id));
  return{daily:publicDaily(daily),session:toPublicSessionView(session,content.serverPolicy,[],deps.clock.now())};
}
export async function getOwned(deps:DailyGameDeps,deviceId:string,id:string){const s=await deps.store.getOwnedSession(id,deviceId);if(!s)return undefined;const c=await requiredContent(deps,s.contentVersionId);const daily=await deps.store.getDaily(s.dailyId);const attempts="final_synthesis" in c.serverPolicy?await deps.store.getFinalSynthesisAttempts(s.id,deviceId):[];return{daily:daily?publicDaily(daily):undefined,session:toPublicSessionView(s,c.serverPolicy,attempts??[],deps.clock.now())};}
export async function answer(deps:DailyGameDeps,deviceId:string,id:string,input:JudgeSubmission){ return submitJudgeOperation(deps,deviceId,id,input); }
export async function recover(deps:DailyGameDeps,deviceId:string,id:string){return transition(deps,deviceId,id,(s,p)=>{const recovered=applyCorrectiveRescue(s,p);return recovered.status==="SYNTHESIZING"?{...recovered,synthesisEnteredAt:deps.clock.now()}:recovered;});}
export async function lock(deps:DailyGameDeps,deviceId:string,id:string){return transition(deps,deviceId,id,(s,p)=>lockPlaySession(s,p));}
export async function reveal(deps:DailyGameDeps,deviceId:string,id:string,onEvidenceIssue?:(issue:PersonalizedEvidenceIssue)=>void){
  const s=await deps.store.getOwnedSession(id,deviceId);if(!s)return undefined;
  if(s.status!=="LOCKED"&&s.status!=="REVEAL_READY"&&s.status!=="REVEALED")throw new Error("REVEAL_NOT_ALLOWED");
  const c=await requiredContent(deps,s.contentVersionId);const discoveryOutcome=deriveRevealOutcome(s);
  const revealOutcome=resolveAdaptiveRevealOutcome(s,c.serverPolicy);
  const personalized=projectPersonalizedConnection(s,c.revealContent,c.serverPolicy);
  for(const issue of personalized?.issues??[])onEvidenceIssue?.(issue);
  const {theory,person,year,explanation,connection,provenance}=c.revealContent;
  let representativeThought:string|undefined;
  if(discoveryOutcome==="VERIFIED_LEGACY"&&s.lockEvidence)representativeThought=resolveEvidence(s,s.lockEvidence);
  if(discoveryOutcome==="VERIFIED_FINAL_SYNTHESIS"&&s.verifiedSynthesisAttemptId){const attempts=await deps.store.getFinalSynthesisAttempts(s.id,deviceId);representativeThought=attempts?.find(attempt=>attempt.id===s.verifiedSynthesisAttemptId)?.text??undefined;}
  return{theory,person,year,explanation,provenance,discoveryOutcome,...(revealOutcome?{revealOutcome}:{}),...(personalized?{personalizedConnection:personalized.view}:{}),...(representativeThought?{representativeThought}:{}),substantialGuidanceUsed:s.guidance.some(g=>g.stage==="RESCUE"||g.stage==="CORRECTION"),connection:representativeThought?`당신은 “${representativeThought}”라고 보았습니다. ${connection}`:connection};
}
export async function finishReveal(deps:DailyGameDeps,deviceId:string,id:string){const s=await deps.store.getOwnedSession(id,deviceId);if(!s)return undefined;const c=await requiredContent(deps,s.contentVersionId);const completed=completeReveal(s);const next={...completed,stateVersion:s.status==="REVEALED"?s.stateVersion:s.stateVersion+1};if(s.status!=="REVEALED"&&!await deps.store.completeReveal(s.stateVersion,next))throw new Error("STALE_STATE_VERSION");const attempts="final_synthesis" in c.serverPolicy?await deps.store.getFinalSynthesisAttempts(s.id,deviceId):[];return toPublicSessionView(next,c.serverPolicy,attempts??[],deps.clock.now());}
async function transition(deps:DailyGameDeps,deviceId:string,id:string,fn:(s:PlaySession,p:ServerPolicy)=>PlaySession){const s=await deps.store.getOwnedSession(id,deviceId);if(!s)return undefined;const c=await requiredContent(deps,s.contentVersionId);const changed=fn(s,c.serverPolicy);const next={...changed,stateVersion:s.stateVersion+1};if(!await deps.store.saveTransition(s.stateVersion,next))throw new Error("STALE_STATE_VERSION");const attempts="final_synthesis" in c.serverPolicy?await deps.store.getFinalSynthesisAttempts(s.id,deviceId):[];return toPublicSessionView(next,c.serverPolicy,attempts??[],deps.clock.now());}
async function requiredContent(deps:DailyGameDeps,id:string){const c=await deps.store.getContentVersion(id);if(!c)throw new Error("CONTENT_VERSION_NOT_FOUND");return c;}
function publicDaily(d:{id:string;canonicalDate:string;sequenceNumber:number;publicPlay:{label:string;estimated_minutes:number;scenario:string;question:string}}){return{id:d.id,canonicalDate:d.canonicalDate,sequenceNumber:d.sequenceNumber,label:d.publicPlay.label,estimatedMinutes:d.publicPlay.estimated_minutes,scenario:d.publicPlay.scenario,question:d.publicPlay.question};}
