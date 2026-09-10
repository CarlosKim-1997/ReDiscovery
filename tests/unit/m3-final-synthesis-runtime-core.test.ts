import { describe,expect,it } from "vitest";
import rawV1 from "../../content/approved/conway-law.v1.json";
import rawV5 from "../../content/approved/conway-law.v5.json";
import { approvedContentSchema } from "@/domain/content/schema";
import { createPlaySession,type PlaySession } from "@/domain/play/session";
import { applyCorrectiveRescue,applyJudgeVerdict,beginEvaluation,lockPlaySession } from "@/domain/play/policy";
import { completeSynthesisVerification,deriveRevealOutcome,skipSynthesis } from "@/domain/play/final-synthesis";
import type { JudgeVerdict } from "@/domain/play/judgment";
import { PlayRuleError } from "@/domain/play/errors";
import { submitFinalSynthesis } from "@/application/play/final-synthesis";
import type { PrimaryStorePort } from "@/ports/primary-store";
import type { FinalSynthesisVerifierInput,FinalSynthesisVerifierPort,UnvalidatedFinalSynthesisProof } from "@/ports/final-synthesis-verifier";

const legacy=approvedContentSchema.parse(rawV1);const synthesis=approvedContentSchema.parse(rawV5);
const synthesisPolicy="final_synthesis" in synthesis.SERVER_POLICY?synthesis.SERVER_POLICY:(()=>{throw new Error("expected schema v3");})();
function fresh(content= synthesis):PlaySession{return createPlaySession({id:"00000000-0000-4000-8000-000000000001",dailyId:"daily",contentVersionId:`v${content.version}`,anonymousDeviceId:"device",nodeIds:content.JUDGE_RUBRIC.nodes.map(node=>node.id)});}
function verdict(content= synthesis,status:"DISCOVERED"|"ABSENT"="DISCOVERED"):JudgeVerdict{return{answerType:"REASONING",ambiguity:"NONE",nodes:content.JUDGE_RUBRIC.nodes.map(node=>status==="ABSENT"?{nodeId:node.id,status}:{nodeId:node.id,status,evidence:{start:0,end:4}})};}
function evaluating(content= synthesis,base=fresh(content)){return beginEvaluation(base,{id:"answer",turn:base.turnCount+1,stage:base.stage,text:"완전한 생각"});}

describe("M3 Final Synthesis lifecycle policy",()=>{
  it("keeps legacy eligibility LOCKABLE and enters synthesis on discovery-ready content",()=>{
    expect(applyJudgeVerdict(evaluating(legacy),verdict(legacy),legacy.SERVER_POLICY).session.status).toBe("LOCKABLE");
    expect(applyJudgeVerdict(evaluating(),verdict(),synthesis.SERVER_POLICY)).toMatchObject({outcome:"SYNTHESIZING",session:{status:"SYNTHESIZING",synthesisEntryReason:"DISCOVERY_READY"}});
  });
  it("routes ordinary and corrective Rescue exhaustion while preserving legacy behavior",()=>{
    const maxed={...fresh(),turnCount:synthesis.SERVER_POLICY.max_turns-1};
    expect(applyJudgeVerdict(evaluating(synthesis,maxed),verdict(synthesis,"ABSENT"),synthesis.SERVER_POLICY).session).toMatchObject({status:"SYNTHESIZING",stage:"RESCUE",synthesisEntryReason:"RESCUE_EXHAUSTED"});
    const blocking=synthesis.SERVER_POLICY.blocking_nodes[0]!;
    const corrective={...fresh(),turnCount:synthesis.SERVER_POLICY.max_turns,stage:"CORRECTION" as const,discoveries:fresh().discoveries.map(node=>node.nodeId===blocking?{...node,status:"CONTRADICTED" as const}:node),guidance:[{stage:"CORRECTION" as const,key:"CORRECTION",text:synthesis.SERVER_POLICY.guidance.CORRECTION}]};
    expect(applyCorrectiveRescue(corrective,synthesis.SERVER_POLICY)).toMatchObject({status:"SYNTHESIZING",stage:"RESCUE",synthesisEntryReason:"RESCUE_EXHAUSTED"});
    const legacyCorrective={...corrective,contentVersionId:"v1"};
    expect(applyCorrectiveRescue(legacyCorrective,legacy.SERVER_POLICY).status).toBe("LOCKABLE");
  });
  it("rejects the legacy Lock path whenever Final Synthesis policy is present",()=>{
    const malformed={...fresh(),status:"LOCKABLE" as const,thoughts:[{id:"a",turn:1,stage:"BLIND" as const,text:"thought"}]};
    expect(()=>lockPlaySession(malformed,synthesis.SERVER_POLICY)).toThrowError(new PlayRuleError("FINAL_SYNTHESIS_REQUIRED"));
  });
});

describe("M3 Final Synthesis deterministic result transitions",()=>{
  const entered=():PlaySession=>({...fresh(),status:"SYNTHESIZING",synthesisEntryReason:"DISCOVERY_READY",synthesisEnteredAt:new Date("2026-09-10T00:00:00Z")});
  const evaluatedAt=new Date("2026-09-10T00:01:00Z");
  it("locks either verified attempt without consuming a thinking turn or rewriting Judge discoveries",()=>{
    for(const attemptNumber of [1,2] as const){const before=entered();const after=completeSynthesisVerification(before,{attemptNumber,attemptId:`s${attemptNumber}`,verified:true,evaluatedAt});expect(after).toMatchObject({status:"LOCKED",turnCount:0,verifiedSynthesisAttemptId:`s${attemptNumber}`,lockedAt:evaluatedAt});expect(after.discoveries).toEqual(before.discoveries);expect(deriveRevealOutcome(after)).toBe("VERIFIED_FINAL_SYNTHESIS");}
  });
  it("keeps first insufficiency in synthesis and makes only second insufficiency reveal-ready",()=>{
    const before=entered();expect(completeSynthesisVerification(before,{attemptNumber:1,attemptId:"s1",verified:false,evaluatedAt})).toBe(before);expect(completeSynthesisVerification(before,{attemptNumber:2,attemptId:"s2",verified:false,evaluatedAt})).toMatchObject({status:"REVEAL_READY",turnCount:0});
  });
  it("skips only without an active evaluation and derives unverified Reveal from absent evidence",()=>{
    const skipped=skipSynthesis(entered(),evaluatedAt,false);expect(skipped).toMatchObject({status:"REVEAL_READY",synthesisSkippedAt:evaluatedAt});expect(deriveRevealOutcome(skipped)).toBe("UNVERIFIED_REVEAL");expect(()=>skipSynthesis(entered(),evaluatedAt,true)).toThrow(/INVALID_SESSION_STATE/);
  });
});

describe("M3 Final Synthesis provider-neutral orchestration",()=>{
  it("passes only synthesis-local authority, records redacted attempts, and preserves turn/Judge state",async()=>{
    const session={...fresh(),status:"SYNTHESIZING" as const,synthesisEntryReason:"DISCOVERY_READY" as const,synthesisEnteredAt:new Date("2026-09-10T00:00:00Z")};
    let received:FinalSynthesisVerifierInput|undefined;let recorded:unknown;
    const componentProof=(componentId:string)=>({componentId,endorsementStatus:"ENDORSED" as const,referenceStatus:"SELF_CONTAINED" as const,componentMatch:"COMPLETE_COMPONENT_MATCH" as const,evidenceUnitIds:["synthesis:u1"],antecedentEvidenceUnitIds:[]});
    const proof:UnvalidatedFinalSynthesisProof={nodes:synthesisPolicy.lock_verifier.nodes.map(node=>({nodeId:node.node_id,components:node.required_components.map(component=>componentProof(component.id))}))};
    const verifier:FinalSynthesisVerifierPort={extractProof:async input=>{received=input;return{proof,attempts:[{attempt:1,provider:"fixture",model:"fixture",promptVersion:"fixture-v1",schemaValid:true,resultStatus:"SUCCEEDED",latencyMs:1}]};}};
    const store={
      getOwnedSession:async()=>session,
      getContentVersion:async()=>({id:"v5",version:5,schemaVersion:3,contentHash:"x".repeat(64),publicPlay:synthesis.PUBLIC_PLAY,judgeRubric:synthesis.JUDGE_RUBRIC,serverPolicy:synthesis.SERVER_POLICY,revealContent:synthesis.REVEAL_CONTENT}),
      reserveFinalSynthesisSubmission:async(input:Record<string,unknown>)=>({kind:"RESERVED" as const,session:{...session,stateVersion:1},attempt:{id:String(input.attemptId),sessionId:session.id,attemptNumber:1 as const,submissionKeyHash:String(input.submissionKeyHash),submissionTextHash:String(input.submissionTextHash),text:String(input.text),charCount:String(input.text).length,submittedAt:input.submittedAt as Date,evaluationState:"EVALUATING" as const,evaluationGeneration:1,evaluationStartedAt:input.submittedAt as Date,evaluationLeaseExpiresAt:input.submittedAt as Date,proofContractVersion:"final-synthesis-proof-v1" as const,updatedAt:input.submittedAt as Date}}),
      completeFinalSynthesisEvaluation:async(input:Record<string,unknown>)=>{recorded=input;return completeSynthesisVerification({...session,stateVersion:1},{attemptNumber:1,attemptId:String(input.attemptId),verified:Boolean(input.eligible),evaluatedAt:input.evaluatedAt as Date});},
      markFinalSynthesisEvaluationRecoverable:async()=>undefined,
    } as unknown as PrimaryStorePort;
    const result=await submitFinalSynthesis({store,verifier,clock:{now:()=>new Date("2026-09-10T00:01:00Z")},identity:{randomId:()=>"00000000-0000-4000-8000-000000000099",randomToken:()=>"unused",hashToken:value=>`hash-${value}`}}, {deviceId:"device",sessionId:session.id,text:"경계가 소통을 가르고 그 결과 구조도 서로 닮는다.",idempotencyKey:"key",expectedStateVersion:0});
    expect(result.kind).toBe("VERIFIED");expect(result.session.turnCount).toBe(0);expect(result.session.discoveries).toEqual(session.discoveries);
    expect(Object.keys(received!).sort()).toEqual(["evidenceUnits","requiredNodes","submission"]);expect(JSON.stringify(received)).not.toMatch(/previous|judge|guidance|reveal|expected/i);
    expect(JSON.stringify(recorded)).not.toContain("경계가 소통");expect(recorded).toMatchObject({evaluationGeneration:1,runs:[{purpose:"FINAL_SYNTHESIS_VERIFY",synthesisAttemptId:"00000000-0000-4000-8000-000000000099",evaluationGeneration:1}]});
  });
});
