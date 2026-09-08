import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import raw from "../../content/approved/conway-law.v1.json";
import { approvedContentSchema } from "@/domain/content/schema";
import { validateJudgeVerdict } from "@/application/play/judge-verdict";
import {
  buildOpenAIJudgeClientOptions, buildOpenAIResponseRequest, buildProviderVerdictSchema,
  OpenAIJudgeAdapter, OpenAIResponsesJudgeTransport,
  type OpenAIJudgeTransport, type OpenAIJudgeTransportRequest,
} from "@/adapters/openai-judge/openai-judge";
import { JudgeExecutionError } from "@/ports/judge";
import {
  getJudgeSystemPrompt, JUDGE_V2_PROMPT_VERSION, JUDGE_V2_SYSTEM_PROMPT,
  JUDGE_V3_PROMPT_VERSION, JUDGE_V3_SYSTEM_PROMPT, PRIMARY_JUDGE_PROMPT_VERSION, PRIMARY_JUDGE_SYSTEM_PROMPT,
} from "@/shared/judge-prompts";
import { JudgeVerdictValidationError } from "@/application/play/judge-verdict";

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
  it("forces SDK logging off even when OPENAI_LOG requests debug output",()=>{const previous=process.env.OPENAI_LOG;process.env.OPENAI_LOG="debug";try{expect(buildOpenAIJudgeClientOptions("secret")).toMatchObject({apiKey:"secret",maxRetries:0,logLevel:"off"});const transport=new OpenAIResponsesJudgeTransport("secret");expect((transport as unknown as {client:{logLevel:string}}).client.logLevel).toBe("off");}finally{if(previous===undefined)delete process.env.OPENAI_LOG;else process.env.OPENAI_LOG=previous;}});
  it("uses the configured model, Structured Outputs, and explicitly disables Responses API storage",()=>{const request=buildOpenAIResponseRequest({model:"configured-primary-model",promptVersion:PRIMARY_JUDGE_PROMPT_VERSION,systemPrompt:"classifier",input:"synthetic fixture",expectedNodeIds:ids});expect(request.model).toBe("configured-primary-model");expect(request.text.format).toBeDefined();expect(Object.hasOwn(request,"store")).toBe(true);expect(request.store).toBe(false);expect(request.tools).toEqual([]);expect(request.tool_choice).toBe("none");});
  it("keeps immutable v1 available and makes v2 explicitly addressable",async()=>{
    expect(createHash("sha256").update(PRIMARY_JUDGE_SYSTEM_PROMPT).digest("hex")).toBe("37981f9cd17d4e7a72c54c9d7269548e8eb2928175d5a3e9448ecfbe52614aaa");
    expect(getJudgeSystemPrompt(PRIMARY_JUDGE_PROMPT_VERSION)).toBe(PRIMARY_JUDGE_SYSTEM_PROMPT);
    expect(getJudgeSystemPrompt(JUDGE_V2_PROMPT_VERSION)).toBe(JUDGE_V2_SYSTEM_PROMPT);
    expect(JUDGE_V2_SYSTEM_PROMPT).toMatch(/Hedging.*does not make a complete proposition PARTIAL/);
    expect(JUDGE_V2_SYSTEM_PROMPT).toMatch(/priorConfirmedState.*must never upgrade, downgrade, or fabricate/);
    expect(JUDGE_V2_SYSTEM_PROMPT).toMatch(/shortest sufficient unique literal evidenceText/);
    const defaultTransport=new ScriptedTransport([valid]);await run(defaultTransport);expect(defaultTransport.requests[0]).toMatchObject({promptVersion:"judge-v1",systemPrompt:PRIMARY_JUDGE_SYSTEM_PROMPT});
    const v2Transport=new ScriptedTransport([valid]);await new OpenAIJudgeAdapter(v2Transport,"candidate-model",()=>0,JUDGE_V2_PROMPT_VERSION).evaluate({rubric,currentAnswer:answer,priorConfirmedState:[]});expect(v2Transport.requests[0]).toMatchObject({promptVersion:"judge-v2",systemPrompt:JUDGE_V2_SYSTEM_PROMPT});
    const v3Transport=new ScriptedTransport([valid]);await new OpenAIJudgeAdapter(v3Transport,"candidate-model",()=>0,JUDGE_V3_PROMPT_VERSION).evaluate({rubric,currentAnswer:answer,priorConfirmedState:[]});expect(v3Transport.requests[0]).toMatchObject({promptVersion:"judge-v3",systemPrompt:JUDGE_V3_SYSTEM_PROMPT});
  });
  it("pins frozen v2 and keeps v3 at least 15 percent smaller",()=>{expect(createHash("sha256").update(JUDGE_V2_SYSTEM_PROMPT).digest("hex")).toBe("71bf51a99a52301ea0fed0c7ab47c74e47651d0a9f19295ce1193ff1b5c821b7");expect(Buffer.byteLength(JUDGE_V3_SYSTEM_PROMPT)).toBeLessThanOrEqual(Math.floor(Buffer.byteLength(JUDGE_V2_SYSTEM_PROMPT)*0.85));});
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
  it.each([
    ["structured shape",{bad:true},"STRUCTURED_OUTPUT_INVALID"],
    ["node set",{...valid,nodes:valid.nodes.slice(1)},"NODE_SET_INVALID"],
    ["status/evidence",{...valid,nodes:valid.nodes.map((n,i)=>i===0?{...n,status:"ABSENT"}:n)},"STATUS_EVIDENCE_INVALID"],
    ["non-literal evidence",{...valid,nodes:valid.nodes.map((n,i)=>i===0?{...n,evidenceText:"없는 문장"}:n)},"EVIDENCE_NOT_LITERAL"],
  ] as const)("classifies %s failures without raw data",async(_name,bad,category)=>{const error=await run(new ScriptedTransport([bad,bad])).catch(e=>e) as JudgeExecutionError;expect(error.attempts.map(a=>a.failureCategory)).toEqual([category,category]);expect(JSON.stringify(error)).not.toContain(answer);});
  it("classifies repeated literal evidence",async()=>{const repeated="팀 팀";const bad={...valid,nodes:valid.nodes.map((n,i)=>i===0?{...n,evidenceText:"팀"}:{...n,evidenceText:repeated})};const error=await run(new ScriptedTransport([bad,bad]),repeated).catch(e=>e) as JudgeExecutionError;expect(error.attempts.map(a=>a.failureCategory)).toEqual(["EVIDENCE_NOT_UNIQUE","EVIDENCE_NOT_UNIQUE"]);});
  it("retries one schema failure and then succeeds",async()=>{const transport=new ScriptedTransport([{bad:true},valid]);const execution=await run(transport);expect(execution.attempts.map(a=>a.resultStatus)).toEqual(["SCHEMA_ERROR","SUCCEEDED"]);});
  it("returns a controlled failure after two provider failures",async()=>{const transport=new ScriptedTransport([new Error("secret raw body"),new Error("still secret")]);const error=await run(transport).catch(e=>e);expect(error).toBeInstanceOf(JudgeExecutionError);expect(error.message).toBe("JUDGE_UNAVAILABLE");expect(JSON.stringify(error)).not.toContain("secret raw body");});
  it("does not retry a valid semantic result",async()=>{const semanticDisagreement={...valid,nodes:valid.nodes.map(n=>({...n,status:"PARTIAL"}))};const transport=new ScriptedTransport([semanticDisagreement]);await run(transport);expect(transport.requests).toHaveLength(1);});
  it("sends only the allowed classification fields and no hidden layers",async()=>{const transport=new ScriptedTransport([valid]);await new OpenAIJudgeAdapter(transport,"candidate-model",()=>0).evaluate({rubric,currentAnswer:answer,priorConfirmedState:[{nodeId:ids[0]!,status:"DISCOVERED"}],lastGuidance:"생각해 보세요"});const serialized=JSON.stringify(transport.requests[0]);expect(serialized).toContain("currentAnswer");expect(serialized).not.toMatch(/SERVER_POLICY|REVEAL_CONTENT|recognition_aliases|Conway|Melvin|1968|transcript|userIdentity|user_id|futureAnswer/);});
  it("converts literal Unicode evidence to exact UTF-16 offsets",()=>{const evidenceText="제품 구조가 팀 구조를 닮는다 😀";const rawVerdict={answerType:"REASONING" as const,ambiguity:"NONE" as const,nodes:ids.map((nodeId,index)=>index===3?{nodeId,status:"DISCOVERED" as const,evidenceText}:{nodeId,status:"ABSENT" as const})};const verdict=validateJudgeVerdict(rawVerdict,rubric,answer);const evidence=verdict.nodes[3]!.evidence!;expect(answer.slice(evidence.start,evidence.end)).toBe(evidenceText);});
  it("classifies deterministic validator failures",()=>{const current="팀 팀";const rawVerdict={answerType:"REASONING" as const,ambiguity:"TOO_SHORT" as const,nodes:ids.map((nodeId,index)=>index===0?{nodeId,status:"PARTIAL" as const,evidenceText:"팀"}:{nodeId,status:"ABSENT" as const})};try{validateJudgeVerdict(rawVerdict,rubric,current);throw new Error("expected validation failure");}catch(error){expect(error).toBeInstanceOf(JudgeVerdictValidationError);expect((error as JudgeVerdictValidationError).category).toBe("EVIDENCE_NOT_UNIQUE");}});
});
