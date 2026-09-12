import { APIError } from "openai";
import { describe,expect,it,vi } from "vitest";
import { buildFinalSynthesisV2VerifierInput } from "@/application/play/final-synthesis-proof-v2";
import { FinalSynthesisV2ExecutionError } from "@/ports/final-synthesis-verifier-v2";
import {
  OpenAIFinalSynthesisVerifierV2Adapter,
  OpenAIResponsesFinalSynthesisV2Transport,
  buildOpenAIFinalSynthesisV2ResponseRequest,
  type FinalSynthesisV2TransportExecutionObserver,
} from "@/adapters/openai-final-synthesis-verifier-v2/openai-final-synthesis-verifier-v2";

const nodes=[{nodeId:"NODE",requiredComponents:[{componentId:"COMP",description:"complete"}]}] as const;
const input=buildFinalSynthesisV2VerifierInput(nodes,"명시된 완전한 결론이다");
const complete={nodes:[{nodeId:"NODE",components:[{componentId:"COMP",endorsementStatus:"ENDORSED" as const,referenceStatus:"SELF_CONTAINED" as const,componentMatch:"COMPLETE_COMPONENT_MATCH" as const,evidenceUnitIds:["synthesis:u1"],antecedentEvidenceUnitIds:[]}]}]};
const observer=():FinalSynthesisV2TransportExecutionObserver=>({recordTransportExecution:vi.fn()});

describe("Final Synthesis v2 provider request boundary",()=>{
  it("builds an array-based strict response schema without positional tuple keywords",()=>{
    const request=buildOpenAIFinalSynthesisV2ResponseRequest({model:"fake",promptVersion:"final-synthesis-verify-v2",systemPrompt:"abstract",input:"{}",contract:[{nodeId:"NODE",componentIds:["COMP"]}],evidenceUnitIds:["synthesis:u1"]});
    const schema=(request.text.format as {schema:unknown}).schema;
    const records:Record<string,unknown>[]=[];
    const visit=(value:unknown)=>{if(Array.isArray(value)){for(const item of value)visit(item);return}if(value&&typeof value==="object"){records.push(value as Record<string,unknown>);for(const item of Object.values(value as Record<string,unknown>))visit(item)}};
    visit(schema);
    expect(records.some(value=>Array.isArray(value.items))).toBe(false);
    expect(records.some(value=>Object.hasOwn(value,"additionalItems"))).toBe(false);
    expect(JSON.stringify(schema)).not.toContain("prefixItems");
  });

  it("classifies local request construction failures without crossing the provider boundary",async()=>{
    const execution=observer(),invoke=vi.fn();
    const transport=new OpenAIResponsesFinalSynthesisV2Transport("not-used",execution,invoke);
    const localInput=buildFinalSynthesisV2VerifierInput([],"local build failure");
    await expect(new OpenAIFinalSynthesisVerifierV2Adapter(transport,"fake",()=>1).extractProof(localInput)).rejects.toBeInstanceOf(FinalSynthesisV2ExecutionError);
    expect(execution.recordTransportExecution).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    try{await new OpenAIFinalSynthesisVerifierV2Adapter(transport,"fake",()=>1).extractProof(localInput)}catch(error){
      const attempts=(error as FinalSynthesisV2ExecutionError).attempts;
      expect(attempts).toHaveLength(2);
      expect(attempts.every(item=>item.failureCategory==="LOCAL_REQUEST_BUILD_ERROR"&&!item.providerRequestStarted)).toBe(true);
    }
  });

  it("increments exactly at the fake SDK invocation boundary and preserves retry accounting",async()=>{
    const execution=observer();let count=0;
    const invoke=vi.fn(async()=>{count++;return{output:count===1?{nodes:[{nodeId:"NODE",components:[{...complete.nodes[0]!.components[0]!,evidenceUnitIds:[]}]}]}:complete,providerRequestId:`request-${count}`,inputTokens:8,outputTokens:3,totalTokens:11}});
    const result=await new OpenAIFinalSynthesisVerifierV2Adapter(new OpenAIResponsesFinalSynthesisV2Transport("not-used",execution,invoke),"fake",()=>1).extractProof(input);
    expect(execution.recordTransportExecution).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.attempts.map(item=>item.providerRequestStarted)).toEqual([true,true]);
    expect(result.attempts[0]).toMatchObject({failureCategory:"PROOF_RECORD_INVALID",validationReason:"NON_NO_SUPPORT_EVIDENCE_REQUIRED",providerRequestId:"request-1",inputTokens:8,outputTokens:3,totalTokens:11});
    expect(result.attempts[1]).toMatchObject({resultStatus:"SUCCEEDED",providerRequestId:"request-2"});
  });

  it("classifies API failures distinctly and persists only bounded redacted diagnostics",async()=>{
    const execution=observer();
    const headers=new Headers({"x-request-id":"request-safe","retry-after":"7"});
    const invoke=vi.fn(async()=>{throw new APIError(429,{code:"rate_limit",message:"Bearer bearer-secret sk-secret OPENAI_API_KEY=secret \u0000 unsafe"},undefined,headers)});
    try{await new OpenAIFinalSynthesisVerifierV2Adapter(new OpenAIResponsesFinalSynthesisV2Transport("not-used",execution,invoke),"fake",()=>1).extractProof(input);throw new Error("expected failure")}catch(error){
      expect(error).toBeInstanceOf(FinalSynthesisV2ExecutionError);
      const attempts=(error as FinalSynthesisV2ExecutionError).attempts;
      expect(attempts).toHaveLength(2);
      expect(attempts.every(item=>item.failureCategory==="PROVIDER_REQUEST_ERROR"&&item.providerRequestStarted)).toBe(true);
      expect(attempts[0]).toMatchObject({errorClass:"APIError",errorCode:"rate_limit",httpStatus:429,retryAfter:"7"});
      expect(attempts[0]!.errorMessage).toContain("[REDACTED]");
      expect(attempts[0]!.errorMessage).not.toMatch(/bearer-secret|sk-secret|OPENAI_API_KEY=secret/u);
      expect(attempts[0]!.errorMessage).not.toContain(String.fromCharCode(0));
      expect(attempts[0]!.errorMessage!.length).toBeLessThanOrEqual(512);
    }
    expect(execution.recordTransportExecution).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
