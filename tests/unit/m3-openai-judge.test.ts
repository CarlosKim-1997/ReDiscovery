import { describe, expect, it } from "vitest";
import raw from "../../content/approved/conway-law.v1.json";
import { approvedContentSchema } from "@/domain/content/schema";
import { validateJudgeVerdict } from "@/application/play/judge-verdict";
import {
  buildOpenAIResponseRequest, buildProviderVerdictSchema, OpenAIJudgeAdapter, PRIMARY_JUDGE_PROMPT_VERSION,
  type OpenAIJudgeTransport, type OpenAIJudgeTransportRequest,
} from "@/adapters/openai-judge/openai-judge";
import { JudgeExecutionError } from "@/ports/judge";

const rubric=approvedContentSchema.parse(raw).JUDGE_RUBRIC;
const ids=rubric.nodes.map(n=>n.id);
const answer="팀 안 소통 때문에 설계 결정이 모여 제품 구조가 팀 구조를 닮는다 😀";
const valid={answerType:"REASONING",ambiguity:"NONE",nodes:ids.map(nodeId=>({nodeId,status:"DISCOVERED",evidenceText:answer}))};

class ScriptedTransport implements OpenAIJudgeTransport {
  readonly requests:OpenAIJudgeTransportRequest[]=[];
  constructor(private readonly script:unknown[]){}
  async classify(request:OpenAIJudgeTransportRequest){this.requests.push(request);const next=this.script.shift();if(next instanceof Error)throw next;return{output:next,inputTokens:10,outputTokens:5,totalTokens:15,providerRequestId:`req-${this.requests.length}`};}
}

const run=(transport:ScriptedTransport,currentAnswer=answer)=>new OpenAIJudgeAdapter(transport,"candidate-model",()=>0).evaluate({rubric,currentAnswer,priorConfirmedState:[]});

describe("M3 OpenAI Judge adapter",()=>{
  it("explicitly disables Responses API storage",()=>{const request=buildOpenAIResponseRequest({model:"candidate-model",systemPrompt:"classifier",input:"synthetic fixture",expectedNodeIds:ids});expect(Object.hasOwn(request,"store")).toBe(true);expect(request.store).toBe(false);});
  it("builds a strict schema covering every rubric node",()=>{const schema=buildProviderVerdictSchema(ids);expect(schema.safeParse(valid).success).toBe(true);expect(schema.safeParse({...valid,nodes:valid.nodes.slice(1)}).success).toBe(false);expect(schema.safeParse({...valid,nodes:[...valid.nodes,{nodeId:"UNKNOWN",status:"ABSENT",evidenceText:null}]}).success).toBe(false);});
  it("maps structured output and records provider metadata",async()=>{const transport=new ScriptedTransport([valid]);const execution=await run(transport);expect(execution.verdict.nodes).toHaveLength(ids.length);expect(execution.attempts[0]).toMatchObject({provider:"openai",model:"candidate-model",promptVersion:PRIMARY_JUDGE_PROMPT_VERSION,schemaValid:true,totalTokens:15,providerRequestId:"req-1"});expect(transport.requests).toHaveLength(1);});
  it.each([
    ["missing node",{...valid,nodes:valid.nodes.slice(1)}],
    ["unknown node",{...valid,nodes:valid.nodes.map((n,i)=>i===0?{...n,nodeId:"UNKNOWN"}:n)}],
    ["duplicate node",{...valid,nodes:valid.nodes.map((n,i)=>i===1?{...n,nodeId:ids[0]}:n)}],
    ["missing evidence",{...valid,nodes:valid.nodes.map((n,i)=>i===0?{nodeId:n.nodeId,status:n.status}:n)}],
    ["ABSENT evidence",{...valid,nodes:valid.nodes.map((n,i)=>i===0?{...n,status:"ABSENT"}:n)}],
    ["fabricated evidence",{...valid,nodes:valid.nodes.map((n,i)=>i===0?{...n,evidenceText:"없는 문장"}:n)}],
  ])("rejects %s after one retry",async(_name,bad)=>{const transport=new ScriptedTransport([bad,bad]);await expect(run(transport)).rejects.toBeInstanceOf(JudgeExecutionError);expect(transport.requests).toHaveLength(2);});
  it("retries one schema failure and then succeeds",async()=>{const transport=new ScriptedTransport([{bad:true},valid]);const execution=await run(transport);expect(execution.attempts.map(a=>a.resultStatus)).toEqual(["SCHEMA_ERROR","SUCCEEDED"]);});
  it("returns a controlled failure after two provider failures",async()=>{const transport=new ScriptedTransport([new Error("secret raw body"),new Error("still secret")]);const error=await run(transport).catch(e=>e);expect(error).toBeInstanceOf(JudgeExecutionError);expect(error.message).toBe("JUDGE_UNAVAILABLE");expect(JSON.stringify(error)).not.toContain("secret raw body");});
  it("does not retry a valid semantic result",async()=>{const semanticDisagreement={...valid,nodes:valid.nodes.map(n=>({...n,status:"PARTIAL"}))};const transport=new ScriptedTransport([semanticDisagreement]);await run(transport);expect(transport.requests).toHaveLength(1);});
  it("sends only the allowed classification fields and no hidden layers",async()=>{const transport=new ScriptedTransport([valid]);await new OpenAIJudgeAdapter(transport,"candidate-model",()=>0).evaluate({rubric,currentAnswer:answer,priorConfirmedState:[{nodeId:ids[0]!,status:"DISCOVERED"}],lastGuidance:"생각해 보세요"});const serialized=JSON.stringify(transport.requests[0]);expect(serialized).toContain("currentAnswer");expect(serialized).not.toMatch(/SERVER_POLICY|REVEAL_CONTENT|recognition_aliases|Conway|Melvin|1968/);});
  it("converts literal Unicode evidence to exact UTF-16 offsets",()=>{const evidenceText="제품 구조가 팀 구조를 닮는다 😀";const rawVerdict={answerType:"REASONING" as const,ambiguity:"NONE" as const,nodes:ids.map((nodeId,index)=>index===3?{nodeId,status:"DISCOVERED" as const,evidenceText}:{nodeId,status:"ABSENT" as const})};const verdict=validateJudgeVerdict(rawVerdict,rubric,answer);const evidence=verdict.nodes[3]!.evidence!;expect(answer.slice(evidence.start,evidence.end)).toBe(evidenceText);});
  it("rejects ambiguous duplicate literal evidence",()=>{const current="팀 팀";const rawVerdict={answerType:"REASONING" as const,ambiguity:"TOO_SHORT" as const,nodes:ids.map((nodeId,index)=>index===0?{nodeId,status:"PARTIAL" as const,evidenceText:"팀"}:{nodeId,status:"ABSENT" as const})};expect(()=>validateJudgeVerdict(rawVerdict,rubric,current)).toThrow("INVALID_JUDGE_EVIDENCE");});
});
