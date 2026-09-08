import { describe,expect,it } from "vitest";
import raw from "../../content/approved/conway-law.v1.json";
import { approvedContentSchema } from "@/domain/content/schema";
import { createPlaySession,resolveEvidence } from "@/domain/play/session";
import { applyJudgeVerdict,beginEvaluation,canApplyCorrectiveRescue,applyCorrectiveRescue,lockPlaySession } from "@/domain/play/policy";
import { FakeJudgeAdapter } from "@/adapters/fake-judge/fake-judge";

const content=approvedContentSchema.parse(raw);const policy=content.SERVER_POLICY;const rubric=content.JUDGE_RUBRIC;
const fresh=()=>createPlaySession({id:"00000000-0000-4000-8000-000000000001",dailyId:"daily",contentVersionId:"v1",anonymousDeviceId:"device",nodeIds:rubric.nodes.map(n=>n.id)});
const judge=new FakeJudgeAdapter();
describe("M2 generic content-driven domain",()=>{
  it("validates four layers without Reveal identity in the Judge rubric",()=>{expect(content.status).toBe("APPROVED");expect(JSON.stringify(rubric)).not.toMatch(/Conway|Melvin|1968|콘웨이/i);});
  it("uses content node IDs and policy to lock immediate discovery",async()=>{const answer="팀 경계가 소통 경계를 만들고 설계 결정이 모여 시스템 구조가 조직 구조를 닮는다.";const thought={id:"a",turn:1,stage:"BLIND" as const,text:answer};const evaluating=beginEvaluation(fresh(),thought);const verdict=await judge.evaluate({rubric,currentAnswer:answer,priorConfirmedState:[]});const result=applyJudgeVerdict(evaluating,verdict,policy);expect(result.outcome).toBe("LOCKABLE");expect(lockPlaySession(result.session,policy).status).toBe("LOCKED");});
  it("preserves exact evidence spans",async()=>{const answer="  조직이나 소통은 상관없고 기술만 결과를 결정한다.  ";const thought={id:"a",turn:1,stage:"BLIND" as const,text:answer};const verdict=await judge.evaluate({rubric,currentAnswer:answer,priorConfirmedState:[]});const result=applyJudgeVerdict(beginEvaluation(fresh(),thought),verdict,policy);const ref=result.session.discoveries.find(n=>n.status==="CONTRADICTED")!.contradictionEvidence!;expect(resolveEvidence(result.session,ref)).toBe(answer.trim());});
  it("keeps final contradiction bounded and no-fail",async()=>{let s=fresh();for(const text of ["모르겠다.","조직이나 소통은 상관없고 기술만 결과를 결정한다."]){const t={id:`a${s.turnCount}`,turn:s.turnCount+1,stage:s.stage,text};const v=await judge.evaluate({rubric,currentAnswer:text,priorConfirmedState:s.discoveries});s=applyJudgeVerdict(beginEvaluation(s,t),v,policy).session;}expect(canApplyCorrectiveRescue(s,policy)).toBe(true);expect(applyCorrectiveRescue(s,policy).status).toBe("LOCKABLE");});
  function synthetic(){return{slug:"aurora-principle",version:1,schema_version:1,status:"APPROVED",approved_at:"2026-09-08T00:00:00.000Z",PUBLIC_PLAY:{label:"오늘의 사고",estimated_minutes:2,scenario:"서로 다른 관측자가 같은 패턴을 보았습니다.",question:"왜 이런 패턴이 반복될까요?"},JUDGE_RUBRIC:{discriminator:"observer-pattern-v1",nodes:[{id:"PATTERN",description:"반복 패턴을 인식한다."}],misconceptions:[] as string[]},SERVER_POLICY:{max_turns:2,required_nodes:["PATTERN"],blocking_nodes:[],lock_threshold:1,guidance:{REFLECT:"조금 더 생각해보세요.",NUDGE:"관측 조건을 살펴보세요.",CORRECTION:"다른 조건도 확인하세요.",RESCUE:"관측 조건이 패턴을 만들 수 있습니다."},recognition_aliases:["Skybridge"]},REVEAL_CONTENT:{theory:"Aurora Principle",person:"Dr Lina Vale",year:"2042",explanation:"검증된 설명",connection:"연결 설명",provenance:{verified:true}}};}
  it("validates a second non-Conway fixture with content-derived isolation",()=>{expect(approvedContentSchema.parse(synthetic()).slug).toBe("aurora-principle");});
  it.each([
    ["theory","PUBLIC_PLAY"],["person","JUDGE_RUBRIC"],["year","PUBLIC_PLAY"],["alias","JUDGE_RUBRIC"],
  ])("rejects generic %s leakage from %s",(identity,layer)=>{const candidate=synthetic();if(layer==="PUBLIC_PLAY")candidate.PUBLIC_PLAY.scenario+=identity==="theory"?" Aurora Principle":identity==="year"?" 2042":" Skybridge";else candidate.JUDGE_RUBRIC.misconceptions.push(identity==="person"?"Dr Lina Vale":"Skybridge");expect(()=>approvedContentSchema.parse(candidate)).toThrow(/leaks Reveal identity/);});
});
