import { describe,expect,it } from "vitest";
import rawV1 from "../../content/approved/conway-law.v1.json";
import rawV5 from "../../content/approved/conway-law.v5.json";
import { approvedContentSchema } from "@/domain/content/schema";
import { createPlaySession,type PlaySession } from "@/domain/play/session";
import { applyCorrectiveRescue,applyJudgeVerdict,beginEvaluation,completeReveal,lockPlaySession } from "@/domain/play/policy";
import { completeSynthesisVerification,deriveRevealOutcome,skipSynthesis } from "@/domain/play/final-synthesis";
import type { JudgeVerdict } from "@/domain/play/judgment";
import { PlayRuleError } from "@/domain/play/errors";
import { submitFinalSynthesis } from "@/application/play/final-synthesis";
import { buildFinalSynthesisVerifierInput,deriveFinalSynthesisVerification,isFinalSynthesisEligible } from "@/application/play/final-synthesis-proof";
import type { PrimaryStorePort } from "@/ports/primary-store";
import type { FinalSynthesisVerifierInput,FinalSynthesisVerifierPort,UnvalidatedFinalSynthesisProof } from "@/ports/final-synthesis-verifier";
import { FakeFinalSynthesisVerifierAdapter,FINAL_SYNTHESIS_FAKE_FIXTURES } from "@/adapters/fake-final-synthesis-verifier/fake-final-synthesis-verifier";
import { makeFinalSynthesisVerifier } from "@/server/final-synthesis-verifier";
import { toPublicSessionView } from "@/application/play/session-view";
import { FinalSynthesisEntryFakeJudgeAdapter,FINAL_SYNTHESIS_ENTRY_FAKE_ANSWER } from "@/adapters/fake-judge/final-synthesis-entry-fake-judge";
import { FakeJudgeAdapter } from "@/adapters/fake-judge/fake-judge";
import { assertE2eFixtureSafety } from "../support/e2e-fixture-safety";
import { canonicalSessionRoute } from "@/app/_components/session-routing";

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

describe("M3 Final Synthesis product wiring boundaries",()=>{
  it("guards direct E2E fixture writes with test, explicit opt-in, and loopback database authority",()=>{
    const allowed=(databaseUrl:string)=>({APP_ENV:"test",E2E_ALLOW_DB_FIXTURES:"1",DATABASE_URL:databaseUrl});
    const ipv4="postgresql://postgres@127.0.0.1:54322/rediscovery_e2e";
    const localhost="postgres://postgres@localhost:54322/rediscovery_e2e";
    expect(assertE2eFixtureSafety(allowed(ipv4))).toBe(ipv4);
    expect(assertE2eFixtureSafety(allowed(localhost))).toBe(localhost);
    expect(()=>assertE2eFixtureSafety({...allowed(ipv4),APP_ENV:"production"})).toThrow(/E2E_DB_FIXTURE_FORBIDDEN/);
    expect(()=>assertE2eFixtureSafety({...allowed(ipv4),APP_ENV:"local"})).toThrow(/E2E_DB_FIXTURE_FORBIDDEN/);
    expect(()=>assertE2eFixtureSafety({APP_ENV:"test",DATABASE_URL:ipv4})).toThrow(/E2E_DB_FIXTURE_FORBIDDEN/);
    expect(()=>assertE2eFixtureSafety({APP_ENV:"test",E2E_ALLOW_DB_FIXTURES:"1"})).toThrow(/E2E_DB_FIXTURE_DATABASE_URL_REQUIRED/);
    expect(()=>assertE2eFixtureSafety({...allowed(ipv4),DATABASE_URL:""})).toThrow(/E2E_DB_FIXTURE_DATABASE_URL_REQUIRED/);
    expect(()=>assertE2eFixtureSafety({...allowed(ipv4),DATABASE_URL:"   "})).toThrow(/E2E_DB_FIXTURE_DATABASE_URL_REQUIRED/);
    expect(()=>assertE2eFixtureSafety({...allowed(ipv4),DATABASE_URL:"not a database URL"})).toThrow(/E2E_DB_FIXTURE_DATABASE_URL_INVALID/);
    expect(()=>assertE2eFixtureSafety(allowed("postgresql://user@example.com/rediscovery_e2e"))).toThrow(/E2E_DB_FIXTURE_REQUIRES_LOOPBACK_POSTGRES/);
    expect(()=>assertE2eFixtureSafety(allowed("postgresql://user@192.168.1.20/rediscovery_e2e"))).toThrow(/E2E_DB_FIXTURE_REQUIRES_LOOPBACK_POSTGRES/);
    expect(()=>assertE2eFixtureSafety(allowed("postgresql://postgres@127.0.0.1:54322/postgres"))).toThrow(/E2E_DB_FIXTURE_REQUIRES_DEDICATED_DATABASE/);
    expect(()=>assertE2eFixtureSafety(allowed("postgresql://postgres@localhost:54322/rediscovery"))).toThrow(/E2E_DB_FIXTURE_REQUIRES_DEDICATED_DATABASE/);
    expect(()=>assertE2eFixtureSafety(allowed("postgresql://postgres@localhost:54322"))).toThrow(/E2E_DB_FIXTURE_REQUIRES_DEDICATED_DATABASE/);
  });
  it("uses an exact test-only Judge fixture to reach v5 semantic eligibility",async()=>{
    const judge=new FinalSynthesisEntryFakeJudgeAdapter(new FakeJudgeAdapter());const execution=await judge.evaluate({rubric:synthesis.JUDGE_RUBRIC,currentAnswer:FINAL_SYNTHESIS_ENTRY_FAKE_ANSWER,priorConfirmedState:[]});
    expect(execution.verdict.nodes).toHaveLength(synthesis.JUDGE_RUBRIC.nodes.length);expect(execution.verdict.nodes.every(node=>node.status==="DISCOVERED")).toBe(true);
  });
  it("routes every terminal canonical session state without routing active phases",()=>{
    expect(canonicalSessionRoute("LOCKED","s")).toBe("/reveal/s");expect(canonicalSessionRoute("REVEAL_READY","s")).toBe("/reveal/s");expect(canonicalSessionRoute("REVEALED","s")).toBe("/result/s");expect(canonicalSessionRoute("SYNTHESIZING","s")).toBeUndefined();expect(canonicalSessionRoute("THINKING","s")).toBeUndefined();expect(canonicalSessionRoute("LOCKABLE","s")).toBeUndefined();
  });
  it("composes the deterministic fixture only in APP_ENV=test and otherwise fails closed",async()=>{
    expect(makeFinalSynthesisVerifier({APP_ENV:"test"})).toBeInstanceOf(FakeFinalSynthesisVerifierAdapter);
    const unavailable=makeFinalSynthesisVerifier({APP_ENV:"local"});
    await expect(unavailable.extractProof({requiredNodes:[],submission:{text:"x"},evidenceUnits:[]})).rejects.toMatchObject({attempts:[{resultStatus:"PROVIDER_ERROR",failureCategory:"PROVIDER_UNAVAILABLE"}]});
  });
  it("uses exact deterministic fixtures without exposing a semantic keyword heuristic",async()=>{
    const verifier=new FakeFinalSynthesisVerifierAdapter();
    const candidate=buildInput(FINAL_SYNTHESIS_FAKE_FIXTURES.VERIFIED);
    const verified=derive(candidate,await verifier.extractProof(candidate));expect(verified).toBe(true);
    const nearMiss=buildInput(`${FINAL_SYNTHESIS_FAKE_FIXTURES.VERIFIED} `);
    expect(derive(nearMiss,await verifier.extractProof(nearMiss))).toBe(false);
  });
  it("exposes only product-safe synthesis state and permits Reveal without synthesizing a Lock",()=>{
    const session={...fresh(),status:"SYNTHESIZING" as const,synthesisEntryReason:"DISCOVERY_READY" as const,synthesisEnteredAt:new Date("2026-09-10T00:00:00Z")};
    const view=toPublicSessionView(session,synthesisPolicy,[],new Date("2026-09-10T00:01:00Z"));
    expect(view.synthesis).toEqual({enabled:true,attemptsUsed:0,maxSubmissions:2,maxChars:500,evaluationInProgress:false,canSubmit:true,canRetryEvaluation:false,canSkip:true,finalRewriteRequired:false});
    expect(JSON.stringify(view)).not.toMatch(/component|provider|model|proof/i);
    const revealed=completeReveal({...session,status:"REVEAL_READY"});expect(revealed.status).toBe("REVEALED");expect(revealed.lockedAt).toBeUndefined();expect(revealed.verifiedSynthesisAttemptId).toBeUndefined();
  });
});

function buildInput(text:string):FinalSynthesisVerifierInput{return buildFinalSynthesisVerifierInput(synthesisPolicy.lock_verifier.nodes.map(node=>({nodeId:node.node_id,requiredComponents:node.required_components.map(component=>({componentId:component.id,description:component.description}))})),text);}
function derive(input:FinalSynthesisVerifierInput,execution:Awaited<ReturnType<FinalSynthesisVerifierPort["extractProof"]>>){return isFinalSynthesisEligible(deriveFinalSynthesisVerification(execution.proof,input));}
