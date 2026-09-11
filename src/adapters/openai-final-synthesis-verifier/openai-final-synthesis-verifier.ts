import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  FINAL_SYNTHESIS_COMPONENT_MATCHES,
  FINAL_SYNTHESIS_ENDORSEMENT_STATUSES,
  FINAL_SYNTHESIS_REFERENCE_STATUSES,
  FinalSynthesisExecutionError,
  FinalSynthesisProofValidationError,
  validateFinalSynthesisProofStructure,
  type FinalSynthesisVerifierAttempt,
  type FinalSynthesisVerifierInput,
  type FinalSynthesisVerifierPort,
  type UnvalidatedFinalSynthesisProof,
} from "@/ports/final-synthesis-verifier";
import { FINAL_SYNTHESIS_PROMPT_VERSION,FINAL_SYNTHESIS_SYSTEM_PROMPT } from "@/shared/final-synthesis-verifier-prompt";

export interface FinalSynthesisProofContract { readonly nodeId:string; readonly componentIds:readonly string[] }

export function buildFinalSynthesisProviderSchema(contract:readonly FinalSynthesisProofContract[],unitIds:readonly string[]){
  if(contract.length===0||unitIds.length===0)throw new Error("FINAL_SYNTHESIS_PROVIDER_CONTRACT_EMPTY");
  const nodeIds=contract.map(node=>node.nodeId) as [string,...string[]];
  const allComponentIds=[...new Set(contract.flatMap(node=>node.componentIds))] as [string,...string[]];
  const evidenceIds=unitIds as [string,...string[]];
  if(allComponentIds.length===0)throw new Error("FINAL_SYNTHESIS_PROVIDER_CONTRACT_EMPTY");
  const component=z.object({
    componentId:z.enum(allComponentIds),
    endorsementStatus:z.enum(FINAL_SYNTHESIS_ENDORSEMENT_STATUSES),
    referenceStatus:z.enum(FINAL_SYNTHESIS_REFERENCE_STATUSES),
    componentMatch:z.enum(FINAL_SYNTHESIS_COMPONENT_MATCHES),
    evidenceUnitIds:z.array(z.enum(evidenceIds)).max(evidenceIds.length),
    antecedentEvidenceUnitIds:z.array(z.enum(evidenceIds)).max(evidenceIds.length),
  }).strict();
  const node=z.object({nodeId:z.enum(nodeIds),components:z.array(component).min(1).max(allComponentIds.length)}).strict();
  return z.object({nodes:z.array(node).length(nodeIds.length)}).strict();
}

export interface OpenAIFinalSynthesisTransportRequest{
  readonly model:string;readonly promptVersion:typeof FINAL_SYNTHESIS_PROMPT_VERSION;readonly systemPrompt:string;
  readonly input:string;readonly contract:readonly FinalSynthesisProofContract[];readonly evidenceUnitIds:readonly string[];
}
export interface OpenAIFinalSynthesisTransportResult{readonly output:unknown;readonly inputTokens?:number;readonly outputTokens?:number;readonly totalTokens?:number;readonly providerRequestId?:string}
export interface OpenAIFinalSynthesisTransport{extract(request:OpenAIFinalSynthesisTransportRequest):Promise<OpenAIFinalSynthesisTransportResult>}

export function buildOpenAIFinalSynthesisClientOptions(apiKey:string):ConstructorParameters<typeof OpenAI>[0]{return{apiKey,maxRetries:0,logLevel:"off"}}
export function buildOpenAIFinalSynthesisResponseRequest(request:OpenAIFinalSynthesisTransportRequest){return{
  model:request.model,instructions:request.systemPrompt,input:request.input,
  text:{format:zodTextFormat(buildFinalSynthesisProviderSchema(request.contract,request.evidenceUnitIds),"g1_final_synthesis_v1")},
  store:false as const,tools:[],tool_choice:"none" as const,
}}
export function serializeFinalSynthesisSemanticInput(input:FinalSynthesisVerifierInput){return JSON.stringify({requiredNodes:input.requiredNodes,submission:input.submission,evidenceUnits:input.evidenceUnits})}

export class OpenAIResponsesFinalSynthesisTransport implements OpenAIFinalSynthesisTransport{
  private readonly client:OpenAI;
  constructor(apiKey:string){this.client=new OpenAI(buildOpenAIFinalSynthesisClientOptions(apiKey))}
  async extract(request:OpenAIFinalSynthesisTransportRequest):Promise<OpenAIFinalSynthesisTransportResult>{
    const result=await this.client.responses.parse(buildOpenAIFinalSynthesisResponseRequest(request)).withResponse();
    if(!result.data.output_parsed)throw new Error("SCHEMA_INVALID");
    const usage=result.data.usage;return{output:result.data.output_parsed,...(usage?{inputTokens:usage.input_tokens,outputTokens:usage.output_tokens,totalTokens:usage.total_tokens}:{}),...(result.request_id?{providerRequestId:result.request_id}:{})};
  }
}

export class OpenAIFinalSynthesisVerifierAdapter implements FinalSynthesisVerifierPort{
  readonly promptVersion=FINAL_SYNTHESIS_PROMPT_VERSION;
  constructor(private readonly transport:OpenAIFinalSynthesisTransport,private readonly model:string,private readonly nowMs:()=>number=()=>performance.now()){}
  async extractProof(input:FinalSynthesisVerifierInput){
    const attempts:FinalSynthesisVerifierAttempt[]=[];
    const request:OpenAIFinalSynthesisTransportRequest={model:this.model,promptVersion:this.promptVersion,systemPrompt:FINAL_SYNTHESIS_SYSTEM_PROMPT,input:serializeFinalSynthesisSemanticInput(input),contract:input.requiredNodes.map(node=>({nodeId:node.nodeId,componentIds:node.requiredComponents.map(component=>component.componentId)})),evidenceUnitIds:input.evidenceUnits.map(unit=>unit.unitId)};
    for(let attempt=1;attempt<=2;attempt+=1){const started=this.nowMs();try{
      const response=await this.transport.extract(request);const parsed=buildFinalSynthesisProviderSchema(request.contract,request.evidenceUnitIds).parse(response.output) as UnvalidatedFinalSynthesisProof;validateFinalSynthesisProofStructure(parsed,input);
      attempts.push(metadata(attempt,this.model,Math.max(0,Math.round(this.nowMs()-started)),"SUCCEEDED",true,response));return{proof:parsed,attempts};
    }catch(error){const failure=classify(error);attempts.push(metadata(attempt,this.model,Math.max(0,Math.round(this.nowMs()-started)),failure.resultStatus,false,undefined,failure.category));}}
    throw new FinalSynthesisExecutionError(attempts);
  }
}

function metadata(attempt:number,model:string,latencyMs:number,resultStatus:FinalSynthesisVerifierAttempt["resultStatus"],schemaValid:boolean,response?:OpenAIFinalSynthesisTransportResult,failureCategory?:FinalSynthesisVerifierAttempt["failureCategory"]):FinalSynthesisVerifierAttempt{return{attempt,provider:"openai",model,promptVersion:FINAL_SYNTHESIS_PROMPT_VERSION,schemaValid,resultStatus,latencyMs,...(failureCategory?{failureCategory}:{}),...(response?.inputTokens!==undefined?{inputTokens:response.inputTokens}:{}),...(response?.outputTokens!==undefined?{outputTokens:response.outputTokens}:{}),...(response?.totalTokens!==undefined?{totalTokens:response.totalTokens}:{}),...(response?.providerRequestId?{providerRequestId:response.providerRequestId}:{})}}
function classify(error:unknown):{resultStatus:"PROVIDER_ERROR"|"SCHEMA_ERROR";category:FinalSynthesisVerifierAttempt["failureCategory"]}{if(error instanceof FinalSynthesisProofValidationError)return{resultStatus:"SCHEMA_ERROR",category:error.category};if(error instanceof z.ZodError||(error instanceof Error&&error.message==="SCHEMA_INVALID"))return{resultStatus:"SCHEMA_ERROR",category:"STRUCTURED_OUTPUT_INVALID"};return{resultStatus:"PROVIDER_ERROR",category:"PROVIDER_UNAVAILABLE"}}
