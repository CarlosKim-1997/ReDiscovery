import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import rawContent from "../content/approved/conway-law.v1.json" with { type: "json" };
import { approvedContentSchema } from "../src/domain/content/schema.ts";
import { validateJudgeVerdict } from "../src/application/play/judge-verdict.ts";
import { OpenAIJudgeAdapter, OpenAIResponsesJudgeTransport, PRIMARY_JUDGE_PROMPT_VERSION } from "../src/adapters/openai-judge/openai-judge.ts";
import { JudgeExecutionError } from "../src/ports/judge.ts";
import { contentVersionHash } from "./content-tools.mts";

type Status="DISCOVERED"|"PARTIAL"|"ABSENT"|"CONTRADICTED";
type Case={id:string;current_answer:string;prior_confirmed_state?:{nodeId:string;status:Status}[];last_guidance?:string;expected_answer_type:string;expected_ambiguity:string;expected_node_statuses:Record<string,Status>;expected_evidence?:Record<string,string[]>;evidence_terms?:Record<string,string[]>};
type Counts={tp:number;fp:number;fn:number};

export async function loadCases(directory:string):Promise<Case[]> {
  const seed=(await readFile(path.join(directory,"conway.seed.jsonl"),"utf8")).trim().split(/\r?\n/).map(line=>JSON.parse(line) as Case);
  const messy=JSON.parse(await readFile(path.join(directory,"conway.messy.json"),"utf8")) as {case_groups:Array<Omit<Case,"id"|"current_answer">&{id:string;variants:string[]}>};
  return [...seed,...messy.case_groups.flatMap(group=>group.variants.map((current_answer,index)=>({
    id:`messy-${group.id}-${String(index+1).padStart(2,"0")}`,current_answer,
    ...(group.prior_confirmed_state?{prior_confirmed_state:group.prior_confirmed_state}:{}),
    ...(group.last_guidance?{last_guidance:group.last_guidance}:{}),
    expected_answer_type:group.expected_answer_type,expected_ambiguity:group.expected_ambiguity,
    expected_node_statuses:group.expected_node_statuses,...(group.evidence_terms?{evidence_terms:group.evidence_terms}:{}),
  })))];
}

const ratio=(n:number,d:number)=>d===0?null:n/d;
const f1=(p:number|null,r:number|null)=>p===null||r===null||p+r===0?null:2*p*r/(p+r);
const round=(v:number|null)=>v===null?null:Number(v.toFixed(4));
function percentile(values:number[],q:number){if(values.length===0)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(q*sorted.length)-1)]!;}
const emptyCounts=():Record<Status,Counts>=>({DISCOVERED:{tp:0,fp:0,fn:0},PARTIAL:{tp:0,fp:0,fn:0},ABSENT:{tp:0,fp:0,fn:0},CONTRADICTED:{tp:0,fp:0,fn:0}});
function metricsForCounts(counts:Record<Status,Counts>,statuses:Status[]){return Object.fromEntries(statuses.map(status=>{const c=counts[status];const p=ratio(c.tp,c.tp+c.fp),r=ratio(c.tp,c.tp+c.fn);return[status,{...c,precision:round(p),recall:round(r),f1:round(f1(p,r))}];}));}

export function assertEvalReportRedacted(report:unknown,fixtureAnswers:readonly string[]){
  const forbiddenKeys=new Set(["current_answer","currentAnswer","evidenceText","literalEvidence","fullPrompt","providerResponse","provider_response"]);
  const inspect=(value:unknown):void=>{if(!value||typeof value!=="object")return;for(const [key,nested] of Object.entries(value)){if(forbiddenKeys.has(key))throw new Error(`Eval report contains forbidden raw field: ${key}`);inspect(nested);}};
  inspect(report);
  const serialized=JSON.stringify(report);
  for(const answer of fixtureAnswers){if(answer.trim()&&serialized.includes(answer))throw new Error("Eval report contains a raw fixture answer");}
}

export async function runJudgeEval(){
  const apiKey=process.env.OPENAI_API_KEY;const model=process.env.PRIMARY_JUDGE_MODEL;
  if(!apiKey||!model)throw new Error("OPENAI_API_KEY and PRIMARY_JUDGE_MODEL are required for real Judge evaluation");
  const directory=path.resolve("eval/judge/v1");
  const manifest=JSON.parse(await readFile(path.join(directory,"manifest.json"),"utf8")) as {dataset_version:string;content_version:number;prompt_version:string;candidate_model:string;pricing_usd_per_million:{input:number;output:number;checked_at:string}};
  if(manifest.prompt_version!==PRIMARY_JUDGE_PROMPT_VERSION)throw new Error("Dataset prompt version does not match adapter prompt version");
  const content=approvedContentSchema.parse(rawContent);const cases=await loadCases(directory);
  const judge=new OpenAIJudgeAdapter(new OpenAIResponsesJudgeTransport(apiKey),model);
  const statuses:Status[]=["DISCOVERED","PARTIAL","ABSENT","CONTRADICTED"];
  const counts=emptyCounts();
  const perNode=Object.fromEntries(content.JUDGE_RUBRIC.nodes.map(n=>[n.id,{correct:0,total:0,counts:emptyCounts()}])) as Record<string,{correct:number;total:number;counts:Record<Status,Counts>}>;
  const answerConfusion:Record<string,Record<string,number>>={};const ambiguityConfusion:Record<string,Record<string,number>>={};
  const failures:Array<Record<string,unknown>>=[];const discoveredFalsePositiveCaseIds:string[]=[];const prematureLockCaseIds:string[]=[];const prematureUnlockCaseIds:string[]=[];
  let answerCorrect=0,ambiguityCorrect=0,schemaValid=0,retried=0,retryAttempts=0,providerFailures=0,schemaFailures=0,evidenceExpected=0,evidenceMissing=0,evidenceInvalid=0,evidenceSemanticMismatch=0;
  let inputTokens=0,outputTokens=0,totalTokens=0;const latencies:number[]=[];
  const required=new Set(content.SERVER_POLICY.required_nodes);let coreDiscoveredTp=0,coreDiscoveredFp=0,coreDiscoveredFn=0;
  for(const testCase of cases){
    let execution;
    try { execution=await judge.evaluate({rubric:content.JUDGE_RUBRIC,currentAnswer:testCase.current_answer,priorConfirmedState:testCase.prior_confirmed_state??[],...(testCase.last_guidance?{lastGuidance:testCase.last_guidance}:{})}); }
    catch(error){const attempts=error instanceof JudgeExecutionError?error.attempts:[];if(attempts.length>1){retried+=1;retryAttempts+=attempts.length-1;}for(const a of attempts){latencies.push(a.latencyMs);inputTokens+=a.inputTokens??0;outputTokens+=a.outputTokens??0;totalTokens+=a.totalTokens??0;if(a.resultStatus==="PROVIDER_ERROR")providerFailures+=1;if(a.resultStatus==="SCHEMA_ERROR")schemaFailures+=1;}failures.push({id:testCase.id,kind:"execution",attempts:attempts.map(a=>a.resultStatus)});continue;}
    if(execution.attempts.length>1){retried+=1;retryAttempts+=execution.attempts.length-1;}for(const a of execution.attempts){latencies.push(a.latencyMs);inputTokens+=a.inputTokens??0;outputTokens+=a.outputTokens??0;totalTokens+=a.totalTokens??0;if(a.resultStatus==="PROVIDER_ERROR")providerFailures+=1;if(a.resultStatus==="SCHEMA_ERROR")schemaFailures+=1;}
    let verdict;try{verdict=validateJudgeVerdict(execution.verdict,content.JUDGE_RUBRIC,testCase.current_answer);schemaValid+=1;}catch{evidenceInvalid+=1;failures.push({id:testCase.id,kind:"invalid-evidence"});continue;}
    answerConfusion[testCase.expected_answer_type]??={};answerConfusion[testCase.expected_answer_type]![verdict.answerType]=(answerConfusion[testCase.expected_answer_type]![verdict.answerType]??0)+1;
    ambiguityConfusion[testCase.expected_ambiguity]??={};ambiguityConfusion[testCase.expected_ambiguity]![verdict.ambiguity]=(ambiguityConfusion[testCase.expected_ambiguity]![verdict.ambiguity]??0)+1;
    if(verdict.answerType===testCase.expected_answer_type)answerCorrect+=1;else failures.push({id:testCase.id,kind:"answer-type",expected:testCase.expected_answer_type,actual:verdict.answerType});
    if(verdict.ambiguity===testCase.expected_ambiguity)ambiguityCorrect+=1;else failures.push({id:testCase.id,kind:"ambiguity",expected:testCase.expected_ambiguity,actual:verdict.ambiguity});
    let predictedRequiredDiscovered=0,expectedRequiredDiscovered=0;
    for(const node of verdict.nodes){const expected=testCase.expected_node_statuses[node.nodeId]!;const nodeMetric=perNode[node.nodeId]!;nodeMetric.total+=1;if(node.status===expected)nodeMetric.correct+=1;for(const status of statuses){if(node.status===status&&expected===status){counts[status].tp+=1;nodeMetric.counts[status].tp+=1;}else if(node.status===status){counts[status].fp+=1;nodeMetric.counts[status].fp+=1;}else if(expected===status){counts[status].fn+=1;nodeMetric.counts[status].fn+=1;}}
      if(required.has(node.nodeId)&&node.status==="DISCOVERED"){predictedRequiredDiscovered+=1;if(expected==="DISCOVERED")coreDiscoveredTp+=1;else{coreDiscoveredFp+=1;discoveredFalsePositiveCaseIds.push(testCase.id);}}
      if(required.has(node.nodeId)&&expected==="DISCOVERED"){expectedRequiredDiscovered+=1;if(node.status!=="DISCOVERED")coreDiscoveredFn+=1;}
      if(expected!=="ABSENT"){evidenceExpected+=1;if(!node.evidence){evidenceMissing+=1;continue;}const literal=testCase.current_answer.slice(node.evidence.start,node.evidence.end);if(!literal){evidenceInvalid+=1;continue;}const accepted=testCase.expected_evidence?.[node.nodeId]??testCase.evidence_terms?.[node.nodeId]??[];if(accepted.length>0&&!accepted.some(term=>literal.includes(term)||term.includes(literal)))evidenceSemanticMismatch+=1;}
      if(node.status!==expected)failures.push({id:testCase.id,kind:"node",nodeId:node.nodeId,expected,actual:node.status});
    }
    if(expectedRequiredDiscovered<content.SERVER_POLICY.lock_threshold&&predictedRequiredDiscovered>=content.SERVER_POLICY.lock_threshold)prematureLockCaseIds.push(testCase.id);
    if(expectedRequiredDiscovered>=content.SERVER_POLICY.lock_threshold&&predictedRequiredDiscovered<content.SERVER_POLICY.lock_threshold)prematureUnlockCaseIds.push(testCase.id);
  }
  const statusMetrics=metricsForCounts(counts,statuses);
  const f1Values=Object.values(statusMetrics).map(m=>m.f1).filter((v):v is number=>v!==null);
  const report={timestamp:new Date().toISOString(),git_sha:gitSha(),dataset_version:manifest.dataset_version,content_version:manifest.content_version,content_hash:contentVersionHash(content),model,prompt_version:PRIMARY_JUDGE_PROMPT_VERSION,case_count:cases.length,
    metrics:{node:{per_status:statusMetrics,macro_f1:round(f1Values.reduce((a,b)=>a+b,0)/f1Values.length),per_node:Object.fromEntries(Object.entries(perNode).map(([id,c])=>{const perStatus=metricsForCounts(c.counts,statuses);const values=Object.values(perStatus).map(m=>m.f1).filter((v):v is number=>v!==null);return[id,{accuracy:round(ratio(c.correct,c.total)),correct:c.correct,total:c.total,macro_f1:round(values.reduce((a,b)=>a+b,0)/values.length),per_status:perStatus}];}))},critical_lock:{core_discovered_precision:round(ratio(coreDiscoveredTp,coreDiscoveredTp+coreDiscoveredFp)),core_discovered_recall:round(ratio(coreDiscoveredTp,coreDiscoveredTp+coreDiscoveredFn)),precision_numerator:coreDiscoveredTp,precision_denominator:coreDiscoveredTp+coreDiscoveredFp,recall_numerator:coreDiscoveredTp,recall_denominator:coreDiscoveredTp+coreDiscoveredFn,false_positive_count:coreDiscoveredFp,false_negative_count:coreDiscoveredFn,discovered_false_positive_case_ids:[...new Set(discoveredFalsePositiveCaseIds)],designated_subset_rule:`expected required DISCOVERED count < lock_threshold (${content.SERVER_POLICY.lock_threshold})`,premature_lock_proxy_count:new Set(prematureLockCaseIds).size,premature_lock_proxy_case_ids:[...new Set(prematureLockCaseIds)],premature_unlock_proxy_count:new Set(prematureUnlockCaseIds).size,premature_unlock_proxy_case_ids:[...new Set(prematureUnlockCaseIds)]},answer_type:{accuracy:round(ratio(answerCorrect,cases.length)),confusion:answerConfusion},ambiguity:{accuracy:round(ratio(ambiguityCorrect,cases.length)),confusion:ambiguityConfusion},evidence:{expected_count:evidenceExpected,missing_count:evidenceMissing,missing_rate:round(ratio(evidenceMissing,evidenceExpected)),invalid_literal_count:evidenceInvalid,invalid_literal_rate:round(ratio(evidenceInvalid,evidenceExpected)),accepted_invalid_literal_count:0,semantic_mismatch_count:evidenceSemanticMismatch,semantic_mismatch_rate:round(ratio(evidenceSemanticMismatch,evidenceExpected))},operational:{schema_valid_rate:round(ratio(schemaValid,cases.length)),retry_count:retryAttempts,retried_case_count:retried,retry_rate:round(ratio(retried,cases.length)),provider_failure_count:providerFailures,schema_failure_count:schemaFailures,latency_ms:{p50:percentile(latencies,.5),p95:percentile(latencies,.95),max:latencies.length?Math.max(...latencies):null},tokens:{input:inputTokens,output:outputTokens,total:totalTokens},estimated_cost_usd:model===manifest.candidate_model?Number(((inputTokens*manifest.pricing_usd_per_million.input+outputTokens*manifest.pricing_usd_per_million.output)/1_000_000).toFixed(8)):null,pricing_basis:model===manifest.candidate_model?manifest.pricing_usd_per_million:null}},
    critical_failures:{false_positive_case_ids:[...new Set(prematureLockCaseIds)],false_negative_case_ids:[...new Set(prematureUnlockCaseIds)]},failures};
  assertEvalReportRedacted(report,cases.map(testCase=>testCase.current_answer));
  const out=path.resolve("artifacts/eval/judge");await mkdir(out,{recursive:true});const file=path.join(out,`${manifest.dataset_version}-${Date.now()}.json`);await writeFile(file,JSON.stringify(report,null,2)+"\n","utf8");
  console.log(`Judge eval ${cases.length} cases | macro F1 ${report.metrics.node.macro_f1} | core DISCOVERED ${coreDiscoveredTp}/${coreDiscoveredTp+coreDiscoveredFp} | schema ${report.metrics.operational.schema_valid_rate} | retries ${retried}`);console.log(`Report: ${file}`);
}

function gitSha(){try{return execFileSync("git",["-c","safe.directory=C:/Users/김성하/Desktop/PJT/ReDiscovery","rev-parse","HEAD"],{encoding:"utf8"}).trim();}catch{return null;}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runJudgeEval();
