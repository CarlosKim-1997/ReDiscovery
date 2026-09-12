import { z } from "zod";
import type { FinalSynthesisEvidenceUnit, FinalSynthesisVerifierInput } from "@/ports/final-synthesis-verifier";

export const FINAL_SYNTHESIS_PROOF_V2_CONTRACT_VERSION = "final-synthesis-proof-v2" as const;
export const FINAL_SYNTHESIS_V2_ENDORSEMENT_STATUSES = ["ENDORSED","REJECTED_OR_QUOTED","CONTRADICTED_OR_REPLACED","MIXED_OR_UNRESOLVED","NOT_APPLICABLE"] as const;
export const FINAL_SYNTHESIS_V2_REFERENCE_STATUSES = ["SELF_CONTAINED","RESOLVED_WITHIN_SYNTHESIS","UNRESOLVED","AMBIGUOUS","NOT_APPLICABLE"] as const;
export const FINAL_SYNTHESIS_V2_COMPONENT_MATCHES = ["COMPLETE_COMPONENT_MATCH","WEAKER_THAN_COMPONENT_REQUIREMENT","PARTIAL_COMPONENT_MATCH","CONTRADICTS_COMPONENT","NO_COMPONENT_SUPPORT"] as const;
export type FinalSynthesisV2EndorsementStatus=(typeof FINAL_SYNTHESIS_V2_ENDORSEMENT_STATUSES)[number];
export type FinalSynthesisV2ReferenceStatus=(typeof FINAL_SYNTHESIS_V2_REFERENCE_STATUSES)[number];
export type FinalSynthesisV2ComponentMatch=(typeof FINAL_SYNTHESIS_V2_COMPONENT_MATCHES)[number];
export type FinalSynthesisVerifierV2Input=FinalSynthesisVerifierInput;

const componentSchema=z.object({componentId:z.string().min(1),endorsementStatus:z.enum(FINAL_SYNTHESIS_V2_ENDORSEMENT_STATUSES),referenceStatus:z.enum(FINAL_SYNTHESIS_V2_REFERENCE_STATUSES),componentMatch:z.enum(FINAL_SYNTHESIS_V2_COMPONENT_MATCHES),evidenceUnitIds:z.array(z.string().min(1)),antecedentEvidenceUnitIds:z.array(z.string().min(1))}).strict();
const nodeSchema=z.object({nodeId:z.string().min(1),components:z.array(componentSchema)}).strict();
export const finalSynthesisProofV2Schema=z.object({nodes:z.array(nodeSchema)}).strict();
export type UnvalidatedFinalSynthesisV2ComponentProof=z.infer<typeof componentSchema>;
export type UnvalidatedFinalSynthesisV2Proof=z.infer<typeof finalSynthesisProofV2Schema>;

export const FINAL_SYNTHESIS_V2_VALIDATION_REASONS=["PROOF_SHAPE_INVALID","DUPLICATE_REQUIRED_NODE_ID","DUPLICATE_REQUIRED_COMPONENT_ID","DUPLICATE_NODE_ID","UNKNOWN_NODE","MISSING_NODE","DUPLICATE_COMPONENT_ID","UNKNOWN_COMPONENT","MISSING_COMPONENT","DUPLICATE_INPUT_EVIDENCE_UNIT_ID","DUPLICATE_EVIDENCE_UNIT_ID","DUPLICATE_ANTECEDENT_EVIDENCE_UNIT_ID","UNKNOWN_EVIDENCE_UNIT","EVIDENCE_ANTECEDENT_OVERLAP","NO_SUPPORT_STATUS_INVALID","NO_SUPPORT_EVIDENCE_FORBIDDEN","NON_NO_SUPPORT_STATUS_REQUIRED","NON_NO_SUPPORT_EVIDENCE_REQUIRED","SELF_CONTAINED_ANTECEDENT_FORBIDDEN","NON_RESOLVED_ANTECEDENT_FORBIDDEN","RESOLVED_EVIDENCE_REQUIRED","RESOLVED_ANTECEDENT_REQUIRED","ANTECEDENT_NOT_EARLIER","EVIDENCE_UNIT_SPAN_MISMATCH","EVIDENCE_UNIT_LIST_MISMATCH"] as const;
export type FinalSynthesisV2ValidationReason=(typeof FINAL_SYNTHESIS_V2_VALIDATION_REASONS)[number];
export type FinalSynthesisV2FailureCategory="PROOF_SHAPE_INVALID"|"NODE_SET_INVALID"|"PROOF_RECORD_INVALID"|"EVIDENCE_UNIT_INVALID";
export const FINAL_SYNTHESIS_V2_OPERATIONAL_FAILURE_CATEGORIES=["STRUCTURED_OUTPUT_INVALID","LOCAL_REQUEST_BUILD_ERROR","PROVIDER_REQUEST_ERROR","NETWORK_OR_TRANSPORT_ERROR","UNKNOWN_EXECUTION_ERROR"] as const;
export type FinalSynthesisV2OperationalFailureCategory=(typeof FINAL_SYNTHESIS_V2_OPERATIONAL_FAILURE_CATEGORIES)[number];
export type FinalSynthesisV2AttemptFailureCategory=FinalSynthesisV2FailureCategory|FinalSynthesisV2OperationalFailureCategory;
export class FinalSynthesisV2ProofValidationError extends Error{constructor(readonly category:FinalSynthesisV2FailureCategory,readonly reason:FinalSynthesisV2ValidationReason){super(`${category}:${reason}`)}}

export interface FinalSynthesisVerifierV2Attempt{readonly attempt:number;readonly provider:string;readonly model:string;readonly promptVersion:string;readonly schemaValid:boolean;readonly resultStatus:"SUCCEEDED"|"PROVIDER_ERROR"|"SCHEMA_ERROR";readonly providerRequestStarted:boolean;readonly failureCategory?:FinalSynthesisV2AttemptFailureCategory;readonly validationReason?:FinalSynthesisV2ValidationReason;readonly inputTokens?:number;readonly outputTokens?:number;readonly totalTokens?:number;readonly latencyMs:number;readonly providerRequestId?:string;readonly errorClass?:string;readonly errorCode?:string;readonly httpStatus?:number;readonly retryAfter?:string;readonly errorMessage?:string}
export interface FinalSynthesisV2Execution{readonly proof:UnvalidatedFinalSynthesisV2Proof;readonly attempts:readonly FinalSynthesisVerifierV2Attempt[]}
export interface FinalSynthesisVerifierV2Port{extractProof(input:FinalSynthesisVerifierV2Input):Promise<FinalSynthesisV2Execution>}
export class FinalSynthesisV2ExecutionError extends Error{constructor(readonly attempts:readonly FinalSynthesisVerifierV2Attempt[]){super("FINAL_SYNTHESIS_V2_EXECUTION_FAILED")}}

export function validateFinalSynthesisV2ProofStructure(candidate:unknown,input:FinalSynthesisVerifierV2Input):UnvalidatedFinalSynthesisV2Proof{
  const parsed=finalSynthesisProofV2Schema.safeParse(candidate);if(!parsed.success)fail("PROOF_SHAPE_INVALID","PROOF_SHAPE_INVALID");const proof=parsed.data;
  const requiredIds=input.requiredNodes.map(x=>x.nodeId);if(new Set(requiredIds).size!==requiredIds.length)fail("NODE_SET_INVALID","DUPLICATE_REQUIRED_NODE_ID");
  const expected=new Map(input.requiredNodes.map(x=>[x.nodeId,x]));for(const node of input.requiredNodes){const ids=node.requiredComponents.map(x=>x.componentId);if(new Set(ids).size!==ids.length)fail("PROOF_RECORD_INVALID","DUPLICATE_REQUIRED_COMPONENT_ID")}
  const actualIds=proof.nodes.map(x=>x.nodeId);if(new Set(actualIds).size!==actualIds.length)fail("NODE_SET_INVALID","DUPLICATE_NODE_ID");if(actualIds.some(id=>!expected.has(id)))fail("NODE_SET_INVALID","UNKNOWN_NODE");if(requiredIds.some(id=>!actualIds.includes(id)))fail("NODE_SET_INVALID","MISSING_NODE");
  const units=new Map(input.evidenceUnits.map(x=>[x.unitId,x]));if(units.size!==input.evidenceUnits.length)fail("EVIDENCE_UNIT_INVALID","DUPLICATE_INPUT_EVIDENCE_UNIT_ID");for(const unit of input.evidenceUnits)if(input.submission.text.slice(unit.start,unit.end)!==unit.text)fail("EVIDENCE_UNIT_INVALID","EVIDENCE_UNIT_SPAN_MISMATCH");
  for(const node of proof.nodes){const required=new Set(expected.get(node.nodeId)!.requiredComponents.map(x=>x.componentId));const ids=node.components.map(x=>x.componentId);if(new Set(ids).size!==ids.length)fail("PROOF_RECORD_INVALID","DUPLICATE_COMPONENT_ID");if(ids.some(id=>!required.has(id)))fail("PROOF_RECORD_INVALID","UNKNOWN_COMPONENT");if([...required].some(id=>!ids.includes(id)))fail("PROOF_RECORD_INVALID","MISSING_COMPONENT");for(const component of node.components)validateComponent(component,units)}return proof;
}
function validateComponent(c:UnvalidatedFinalSynthesisV2ComponentProof,units:ReadonlyMap<string,FinalSynthesisEvidenceUnit>){
  if(new Set(c.evidenceUnitIds).size!==c.evidenceUnitIds.length)fail("PROOF_RECORD_INVALID","DUPLICATE_EVIDENCE_UNIT_ID");if(new Set(c.antecedentEvidenceUnitIds).size!==c.antecedentEvidenceUnitIds.length)fail("PROOF_RECORD_INVALID","DUPLICATE_ANTECEDENT_EVIDENCE_UNIT_ID");if(c.evidenceUnitIds.some(id=>c.antecedentEvidenceUnitIds.includes(id)))fail("PROOF_RECORD_INVALID","EVIDENCE_ANTECEDENT_OVERLAP");
  const evidence=resolve(c.evidenceUnitIds,units),antecedents=resolve(c.antecedentEvidenceUnitIds,units);const noSupport=c.componentMatch==="NO_COMPONENT_SUPPORT";
  if(noSupport){if(c.endorsementStatus!=="NOT_APPLICABLE"||c.referenceStatus!=="NOT_APPLICABLE")fail("PROOF_RECORD_INVALID","NO_SUPPORT_STATUS_INVALID");if(evidence.length||antecedents.length)fail("PROOF_RECORD_INVALID","NO_SUPPORT_EVIDENCE_FORBIDDEN");return}
  if(c.endorsementStatus==="NOT_APPLICABLE"||c.referenceStatus==="NOT_APPLICABLE")fail("PROOF_RECORD_INVALID","NON_NO_SUPPORT_STATUS_REQUIRED");if(!evidence.length)fail("PROOF_RECORD_INVALID","NON_NO_SUPPORT_EVIDENCE_REQUIRED");
  if(c.referenceStatus==="SELF_CONTAINED"){if(antecedents.length)fail("PROOF_RECORD_INVALID","SELF_CONTAINED_ANTECEDENT_FORBIDDEN");return}if(c.referenceStatus!=="RESOLVED_WITHIN_SYNTHESIS"){if(antecedents.length)fail("PROOF_RECORD_INVALID","NON_RESOLVED_ANTECEDENT_FORBIDDEN");return}if(!evidence.length)fail("PROOF_RECORD_INVALID","RESOLVED_EVIDENCE_REQUIRED");if(!antecedents.length)fail("PROOF_RECORD_INVALID","RESOLVED_ANTECEDENT_REQUIRED");const first=[...evidence].sort(compare)[0]!;if(antecedents.some(x=>compare(x,first)>=0))fail("PROOF_RECORD_INVALID","ANTECEDENT_NOT_EARLIER");
}
function resolve(ids:readonly string[],units:ReadonlyMap<string,FinalSynthesisEvidenceUnit>){return ids.map(id=>{const unit=units.get(id);if(!unit)fail("EVIDENCE_UNIT_INVALID","UNKNOWN_EVIDENCE_UNIT");return unit})}
function compare(a:FinalSynthesisEvidenceUnit,b:FinalSynthesisEvidenceUnit){return a.start-b.start||a.end-b.end}
function fail(category:FinalSynthesisV2FailureCategory,reason:FinalSynthesisV2ValidationReason):never{throw new FinalSynthesisV2ProofValidationError(category,reason)}
