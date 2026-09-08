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
});
