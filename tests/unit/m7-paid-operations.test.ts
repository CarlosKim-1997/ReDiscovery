import { randomUUID } from "node:crypto";
import { describe,it,expect,vi } from "vitest";
import { answer,startOfficial } from "@/application/play/daily-game";
import { resumeJudgeOperation } from "@/application/play/judge-operations";
import { AdaptiveEvaluationPausedError } from "@/application/play/adaptive-evaluation";
import { OpenAIJudgeAdapter } from "@/adapters/openai-judge/openai-judge";
import { toPublicSessionView } from "@/application/play/session-view";
import { adaptiveRuntimeFixture,fixtureProviderFailure,ADAPTIVE_FULL_FIXTURE_ANSWER } from "../support/adaptive-runtime-fixture";

async function setup(legacy=false) { const f=adaptiveRuntimeFixture(legacy);await startOfficial(f.deps,"device");return f; }
const payload=()=>({turn: 1,submissionId: randomUUID(),thought: "서로 소통하는 사람들의 경계가 구조에 남습니다."});
describe("M7-A submission admission and replay",()=>{
  it("replays a completed submission without answer/operation/run/provider duplication",async()=>{
    const f=await setup();const input=payload();await answer(f.deps,"device",f.session().id,input);
    const op=await f.deps.store.getJudgeOperation(f.session().id,"device");
    const replay=await answer(f.deps,"device",f.session().id,input);
    expect(replay?.processing).toBe("REPLAYED");expect(f.session().thoughts).toHaveLength(1);expect(f.judgeInputs).toHaveLength(1);expect(f.aiRuns).toHaveLength(1);
    expect((await f.deps.store.getJudgeOperation(f.session().id,"device"))?.id).toBe(op?.id);
  });
  it("rejects changed text and changed turn under the same submission ID",async()=>{
    const f=await setup();const input=payload();await answer(f.deps,"device",f.session().id,input);
    await expect(answer(f.deps,"device",f.session().id,{...input,thought: input.thought+" "})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(answer(f.deps,"device",f.session().id,{...input,turn: 2})).rejects.toThrow("IDEMPOTENCY_CONFLICT");expect(f.judgeInputs).toHaveLength(1);
  });
  it("a delayed different Turn 1 submission never becomes Turn 2",async()=>{
    const f=await setup();await answer(f.deps,"device",f.session().id,payload());
    await expect(answer(f.deps,"device",f.session().id,payload())).rejects.toThrow("TURN_ALREADY_SUBMITTED");expect(f.session().turnCount).toBe(1);expect(f.judgeInputs).toHaveLength(1);
  });
  it("concurrent identical submissions have one accepted execution",async()=>{
    const f=await setup();const input=payload();const results=await Promise.allSettled([answer(f.deps,"device",f.session().id,input),answer(f.deps,"device",f.session().id,input)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(2);expect(f.session().thoughts).toHaveLength(1);expect(f.judgeInputs).toHaveLength(1);
  });
  it("concurrent different submissions have one winner and no extra turn",async()=>{
    const f=await setup();const results=await Promise.allSettled([answer(f.deps,"device",f.session().id,payload()),answer(f.deps,"device",f.session().id,payload())]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(f.session().thoughts).toHaveLength(1);expect(f.judgeInputs).toHaveLength(1);
  });
  it.each([false,true])("preserves accepted answer and same operation during recovery (legacy=%s)",async legacy=>{
    const f=await setup(legacy);const input=payload();f.executions.push(fixtureProviderFailure());
    await expect(answer(f.deps,"device",f.session().id,input)).rejects.toBeInstanceOf(AdaptiveEvaluationPausedError);
    const op=await f.deps.store.getJudgeOperation(f.session().id,"device");const answerId=f.session().thoughts[0]!.id;
    expect(f.session()).toMatchObject({status: "ERROR_RECOVERABLE",turnCount: 1});expect(f.session().thoughts[0]?.submissionId).toBe(input.submissionId);
    await expect(answer(f.deps,"device",f.session().id,payload())).rejects.toThrow("TURN_ALREADY_SUBMITTED");
    f.advance(12000);await resumeJudgeOperation(f.deps,"device",f.session().id,input.submissionId,f.session().stateVersion);
    expect(f.session().thoughts[0]?.id).toBe(answerId);expect((await f.deps.store.getJudgeOperation(f.session().id,"device"))?.id).toBe(op?.id);expect(f.session().thoughts).toHaveLength(1);
  });
  it.each([false,true])("rejects a second failed recovery (legacy=%s)",async legacy=>{
    const f=await setup(legacy);const input=payload();f.executions.push(fixtureProviderFailure());
    await expect(answer(f.deps,"device",f.session().id,input)).rejects.toBeInstanceOf(AdaptiveEvaluationPausedError);f.advance(12000);
    f.executions.push(fixtureProviderFailure());await expect(resumeJudgeOperation(f.deps,"device",f.session().id,input.submissionId,f.session().stateVersion)).rejects.toBeInstanceOf(AdaptiveEvaluationPausedError);f.advance(12000);
    await expect(resumeJudgeOperation(f.deps,"device",f.session().id,input.submissionId,f.session().stateVersion)).rejects.toThrow("RECOVERY_EXHAUSTED");expect(f.session().thoughts).toHaveLength(1);expect(f.judgeInputs).toHaveLength(2);
  });
  it("admission failure makes zero transport calls, including automatic retries",async()=>{
    const f=await setup();const classify=vi.fn();const judge=new OpenAIJudgeAdapter({classify},"fixture");vi.spyOn(f.deps.store,"verifyJudgeAdmission").mockRejectedValue(new Error("DB_ADMISSION_FAILED"));
    await expect(answer({...f.deps,judge},"device",f.session().id,payload())).rejects.toBeInstanceOf(AdaptiveEvaluationPausedError);expect(classify).not.toHaveBeenCalled();expect(f.session().thoughts).toHaveLength(1);
  });
  it("each adapter retry requests another admission within the same round",async()=>{
    const f=await setup();const text=ADAPTIVE_FULL_FIXTURE_ANSWER;
    const output={answerType:"REASONING",ambiguity:"NONE",nodes:f.content.JUDGE_RUBRIC.nodes.map(n=>({nodeId:n.id,status:"DISCOVERED",evidenceText:text}))};
    const classify=vi.fn().mockRejectedValueOnce(new Error("transport unknown")).mockResolvedValueOnce({output});
    const retry=vi.spyOn(f.deps.store,"admitJudgeRetry");const judge=new OpenAIJudgeAdapter({classify},"fixture");
    await answer({...f.deps,judge},"device",f.session().id,{...payload(),thought:text});expect(classify).toHaveBeenCalledTimes(2);expect(retry).toHaveBeenCalledTimes(1);expect(retry.mock.calls[0]?.[0].operation.recoveryCount).toBe(0);
  });
  it("attempt-2 admission failure never enters the second provider transport",async()=>{
    const f=await setup();const classify=vi.fn().mockResolvedValue({output:{bad:true}});
    const retry=vi.spyOn(f.deps.store,"admitJudgeRetry").mockRejectedValue(new Error("DB_ADMISSION_FAILED"));
    await expect(answer({...f.deps,judge:new OpenAIJudgeAdapter({classify},"fixture")},"device",f.session().id,payload())).rejects.toBeInstanceOf(AdaptiveEvaluationPausedError);
    expect(retry).toHaveBeenCalledTimes(1);expect(classify).toHaveBeenCalledTimes(1);
    expect(f.session()).toMatchObject({status:"ERROR_RECOVERABLE",turnCount:1});
  });
  describe.each([false,true])("common recovery projection (legacy=%s)",legacy=>{
    it.each([
      ["RECOVERABLE",0,true,false],
      ["RECOVERY_EXHAUSTED",1,false,true],
      ["EVALUATING",0,true,false],
      ["EVALUATING",1,false,true],
    ] as const)("%s round %s exposes consistent resume capability",async(status,recoveryCount,canResume,recoveryExhausted)=>{
      const f=await setup(legacy);const now=f.deps.clock.now();
      const session={...f.session(),status:"ERROR_RECOVERABLE" as const,judgeEvaluation:{status,recoveryCount,...(status==="EVALUATING"?{leaseExpiresAt:new Date(now.getTime()-1)}:{})}};
      const view=toPublicSessionView(session,f.content.SERVER_POLICY,[],now);
      expect(view.evaluation).toMatchObject({inProgress:false,paused:true,canResume,recoveryExhausted});
      if(!legacy)expect(view.adaptive).toMatchObject({paused:true,canResume});
    });
  });
});
