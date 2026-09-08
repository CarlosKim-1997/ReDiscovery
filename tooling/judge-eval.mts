import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { approvedContentSchema } from "../src/domain/content/schema.ts";
import { validateJudgeVerdict } from "../src/application/play/judge-verdict.ts";
import {
  JUDGE_PROMPT_VERSIONS,
  OpenAIJudgeAdapter,
  OpenAIResponsesJudgeTransport,
  type JudgePromptVersion,
} from "../src/adapters/openai-judge/openai-judge.ts";
import { JudgeExecutionError } from "../src/ports/judge.ts";
import { contentVersionHash } from "./content-tools.mts";
import { isSemanticLockEligible, mergeSemanticNodeStates } from "../src/domain/play/semantic-state.ts";

type Status="DISCOVERED"|"PARTIAL"|"ABSENT"|"CONTRADICTED";
type Case={id:string;current_answer:string;prior_confirmed_state?:{nodeId:string;status:Status}[];last_guidance?:string;expected_answer_type:string;expected_ambiguity:string;expected_node_statuses:Record<string,Status>;expected_evidence?:Record<string,string[]>;evidence_terms?:Record<string,string[]>};
type Counts={tp:number;fp:number;fn:number};
type Change<T>={from:T;to:T};
type EvalManifest={dataset_version:string;content_slug:string;content_version:number;prompt_version:string;candidate_model:string;pricing_usd_per_million:{input:number;output:number;checked_at:string};seed_file?:string;messy_file?:string;base_suite?:string;label_overrides_file?:string;expected_case_count?:number};
type LabelOverride={case_ids:string[];answer_type?:Change<string>;ambiguity?:Change<string>;node_statuses?:Record<string,Change<Status>>;evidence_terms?:Record<string,string[]>;reason:string};

async function loadBaseCases(directory:string,manifest:EvalManifest):Promise<Case[]> {
  if(!manifest.seed_file||!manifest.messy_file)throw new Error("Base evaluation manifest must declare seed_file and messy_file");
  const seed=(await readFile(path.join(directory,manifest.seed_file),"utf8")).trim().split(/\r?\n/).map(line=>JSON.parse(line) as Case);
  const messy=JSON.parse(await readFile(path.join(directory,manifest.messy_file),"utf8")) as {case_groups:Array<Omit<Case,"id"|"current_answer">&{id:string;variants:string[]}>};
  return [...seed,...messy.case_groups.flatMap(group=>group.variants.map((current_answer,index)=>({
    id:`messy-${group.id}-${String(index+1).padStart(2,"0")}`,current_answer,
    ...(group.prior_confirmed_state?{prior_confirmed_state:group.prior_confirmed_state}:{}),
    ...(group.last_guidance?{last_guidance:group.last_guidance}:{}),
    expected_answer_type:group.expected_answer_type,expected_ambiguity:group.expected_ambiguity,
    expected_node_statuses:group.expected_node_statuses,...(group.evidence_terms?{evidence_terms:group.evidence_terms}:{}),
  })))];
}

function applyChange<T>(actual:T,change:Change<T>,label:string):T{if(actual!==change.from)throw new Error(`${label}: expected frozen v1 value ${change.from}, found ${actual}`);return change.to;}

async function applyLabelOverrides(cases:Case[],file:string):Promise<Case[]> {
  const ledger=JSON.parse(await readFile(file,"utf8")) as {schema_version:number;overrides:LabelOverride[]};
  if(ledger.schema_version!==1)throw new Error("Unsupported label override schema");
  const byId=new Map(cases.map(testCase=>[testCase.id,{...testCase,expected_node_statuses:{...testCase.expected_node_statuses},...(testCase.expected_evidence?{expected_evidence:{...testCase.expected_evidence}}:{}),...(testCase.evidence_terms?{evidence_terms:{...testCase.evidence_terms}}:{})}]));
  for(const override of ledger.overrides){
    if(!override.reason.trim())throw new Error("Every v2 label override requires a reason");
    for(const id of override.case_ids){
      const testCase=byId.get(id);if(!testCase)throw new Error(`Unknown label override case: ${id}`);
      if(override.answer_type)testCase.expected_answer_type=applyChange(testCase.expected_answer_type,override.answer_type,`${id} answer_type`);
      if(override.ambiguity)testCase.expected_ambiguity=applyChange(testCase.expected_ambiguity,override.ambiguity,`${id} ambiguity`);
      for(const [nodeId,change] of Object.entries(override.node_statuses??{})){
        const previous=testCase.expected_node_statuses[nodeId];if(!previous)throw new Error(`${id}: unknown node override ${nodeId}`);
        testCase.expected_node_statuses[nodeId]=applyChange(previous,change,`${id} ${nodeId}`);
        if(change.to==="ABSENT"){delete testCase.expected_evidence?.[nodeId];delete testCase.evidence_terms?.[nodeId];}
      }
      if(override.evidence_terms)testCase.evidence_terms={...(testCase.evidence_terms??{}),...override.evidence_terms};
    }
  }
  return cases.map(({id})=>byId.get(id)!);
}

export async function loadEvalManifest(directory:string):Promise<EvalManifest>{return JSON.parse(await readFile(path.join(directory,"manifest.json"),"utf8")) as EvalManifest;}

export async function loadCases(directory:string):Promise<Case[]> {
  const manifest=await loadEvalManifest(directory);
  const baseDirectory=manifest.base_suite?path.resolve(directory,manifest.base_suite):directory;
  const baseManifest=manifest.base_suite?await loadEvalManifest(baseDirectory):manifest;
  let cases=await loadBaseCases(baseDirectory,baseManifest);
  if(manifest.label_overrides_file)cases=await applyLabelOverrides(cases,path.join(directory,manifest.label_overrides_file));
  if(manifest.expected_case_count!==undefined&&cases.length!==manifest.expected_case_count)throw new Error("Evaluation case count does not match manifest");
  return cases;
}

export function parseJudgePromptVersion(value:string):JudgePromptVersion {
  if(!JUDGE_PROMPT_VERSIONS.includes(value as JudgePromptVersion))throw new Error(`Unsupported Judge prompt version: ${value}`);
  return value as JudgePromptVersion;
}

export function assertEvalPromptMatches(manifestPrompt:string,selectedPrompt:JudgePromptVersion){if(manifestPrompt!==selectedPrompt)throw new Error("Evaluation prompt does not match manifest prompt version");}

export const DEFAULT_JUDGE_EVAL_SUITE="v1";
export function resolveJudgeEvalSuite(value?:string):string{const suite=value??DEFAULT_JUDGE_EVAL_SUITE;if(!/^[a-z0-9-]+$/.test(suite))throw new Error("Invalid Judge evaluation suite");return suite;}

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

export function evaluateCriticalLockProxy(
  prior: readonly {nodeId:string;status:Status}[],
  expected: Record<string,Status>,
  predicted: Record<string,Status>,
  policy: {required_nodes:string[];blocking_nodes:string[];lock_threshold:number},
){
  const toNodes=(statuses:Record<string,Status>)=>Object.entries(statuses).map(([nodeId,status])=>({nodeId,status}));
  const expectedEligible=isSemanticLockEligible(mergeSemanticNodeStates(prior,toNodes(expected)),policy);
  const predictedEligible=isSemanticLockEligible(mergeSemanticNodeStates(prior,toNodes(predicted)),policy);
  return {expectedEligible,predictedEligible,prematureLock:!expectedEligible&&predictedEligible,prematureUnlock:expectedEligible&&!predictedEligible};
}

export async function runJudgeEval(options:{suite?:string;promptVersion?:JudgePromptVersion}={}){
  const apiKey=process.env.OPENAI_API_KEY;const model=process.env.PRIMARY_JUDGE_MODEL;
  if(!apiKey||!model)throw new Error("OPENAI_API_KEY and PRIMARY_JUDGE_MODEL are required for real Judge evaluation");
  const suite=resolveJudgeEvalSuite(options.suite??process.env.JUDGE_EVAL_SUITE);
  const directory=path.resolve("eval/judge",suite);
  const manifest=await loadEvalManifest(directory);
  const promptVersion=options.promptVersion??parseJudgePromptVersion(manifest.prompt_version);
  assertEvalPromptMatches(manifest.prompt_version,promptVersion);
  const contentFile=path.resolve("content/approved",`${manifest.content_slug}.v${manifest.content_version}.json`);
  const content=approvedContentSchema.parse(JSON.parse(await readFile(contentFile,"utf8")));
  if(content.slug!==manifest.content_slug||content.version!==manifest.content_version)throw new Error("Evaluation content does not match manifest identity");
  const cases=await loadCases(directory);
  const judge=new OpenAIJudgeAdapter(new OpenAIResponsesJudgeTransport(apiKey),model,undefined,promptVersion);
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
    const predictedNodeStatuses:Record<string,Status>={};
    for(const node of verdict.nodes){const expected=testCase.expected_node_statuses[node.nodeId]!;const nodeMetric=perNode[node.nodeId]!;nodeMetric.total+=1;if(node.status===expected)nodeMetric.correct+=1;for(const status of statuses){if(node.status===status&&expected===status){counts[status].tp+=1;nodeMetric.counts[status].tp+=1;}else if(node.status===status){counts[status].fp+=1;nodeMetric.counts[status].fp+=1;}else if(expected===status){counts[status].fn+=1;nodeMetric.counts[status].fn+=1;}}
      predictedNodeStatuses[node.nodeId]=node.status;
      if(required.has(node.nodeId)&&node.status==="DISCOVERED"){if(expected==="DISCOVERED")coreDiscoveredTp+=1;else{coreDiscoveredFp+=1;discoveredFalsePositiveCaseIds.push(testCase.id);}}
      if(required.has(node.nodeId)&&expected==="DISCOVERED"&&node.status!=="DISCOVERED")coreDiscoveredFn+=1;
      if(expected!=="ABSENT"){evidenceExpected+=1;if(!node.evidence){evidenceMissing+=1;continue;}const literal=testCase.current_answer.slice(node.evidence.start,node.evidence.end);if(!literal){evidenceInvalid+=1;continue;}const accepted=testCase.expected_evidence?.[node.nodeId]??testCase.evidence_terms?.[node.nodeId]??[];if(accepted.length>0&&!accepted.some(term=>literal.includes(term)||term.includes(literal)))evidenceSemanticMismatch+=1;}
      if(node.status!==expected)failures.push({id:testCase.id,kind:"node",nodeId:node.nodeId,expected,actual:node.status});
    }
    const lockProxy=evaluateCriticalLockProxy(testCase.prior_confirmed_state??[],testCase.expected_node_statuses,predictedNodeStatuses,content.SERVER_POLICY);
    if(lockProxy.prematureLock)prematureLockCaseIds.push(testCase.id);
    if(lockProxy.prematureUnlock)prematureUnlockCaseIds.push(testCase.id);
  }
  const statusMetrics=metricsForCounts(counts,statuses);
  const f1Values=Object.values(statusMetrics).map(m=>m.f1).filter((v):v is number=>v!==null);
  const report={timestamp:new Date().toISOString(),git_sha:gitSha(),dataset_version:manifest.dataset_version,content_slug:manifest.content_slug,content_version:manifest.content_version,content_hash:contentVersionHash(content),model,prompt_version:promptVersion,case_count:cases.length,
    metrics:{node:{per_status:statusMetrics,macro_f1:round(f1Values.reduce((a,b)=>a+b,0)/f1Values.length),per_node:Object.fromEntries(Object.entries(perNode).map(([id,c])=>{const perStatus=metricsForCounts(c.counts,statuses);const values=Object.values(perStatus).map(m=>m.f1).filter((v):v is number=>v!==null);return[id,{accuracy:round(ratio(c.correct,c.total)),correct:c.correct,total:c.total,macro_f1:round(values.reduce((a,b)=>a+b,0)/values.length),per_status:perStatus}];}))},critical_lock:{core_discovered_precision:round(ratio(coreDiscoveredTp,coreDiscoveredTp+coreDiscoveredFp)),core_discovered_recall:round(ratio(coreDiscoveredTp,coreDiscoveredTp+coreDiscoveredFn)),precision_numerator:coreDiscoveredTp,precision_denominator:coreDiscoveredTp+coreDiscoveredFp,recall_numerator:coreDiscoveredTp,recall_denominator:coreDiscoveredTp+coreDiscoveredFn,false_positive_count:coreDiscoveredFp,false_negative_count:coreDiscoveredFn,discovered_false_positive_case_ids:[...new Set(discoveredFalsePositiveCaseIds)],designated_subset_rule:`expected merged prior+current semantic state is not lock-eligible: required DISCOVERED >= ${content.SERVER_POLICY.lock_threshold} and no blocking CONTRADICTED`,premature_lock_proxy_count:new Set(prematureLockCaseIds).size,premature_lock_proxy_case_ids:[...new Set(prematureLockCaseIds)],premature_unlock_proxy_count:new Set(prematureUnlockCaseIds).size,premature_unlock_proxy_case_ids:[...new Set(prematureUnlockCaseIds)]},answer_type:{accuracy:round(ratio(answerCorrect,cases.length)),confusion:answerConfusion},ambiguity:{accuracy:round(ratio(ambiguityCorrect,cases.length)),confusion:ambiguityConfusion},evidence:{expected_count:evidenceExpected,missing_count:evidenceMissing,missing_rate:round(ratio(evidenceMissing,evidenceExpected)),invalid_literal_count:evidenceInvalid,invalid_literal_rate:round(ratio(evidenceInvalid,evidenceExpected)),accepted_invalid_literal_count:0,semantic_mismatch_count:evidenceSemanticMismatch,semantic_mismatch_rate:round(ratio(evidenceSemanticMismatch,evidenceExpected))},operational:{schema_valid_rate:round(ratio(schemaValid,cases.length)),retry_count:retryAttempts,retried_case_count:retried,retry_rate:round(ratio(retried,cases.length)),provider_failure_count:providerFailures,schema_failure_count:schemaFailures,latency_ms:{p50:percentile(latencies,.5),p95:percentile(latencies,.95),max:latencies.length?Math.max(...latencies):null},tokens:{input:inputTokens,output:outputTokens,total:totalTokens},estimated_cost_usd:model===manifest.candidate_model?Number(((inputTokens*manifest.pricing_usd_per_million.input+outputTokens*manifest.pricing_usd_per_million.output)/1_000_000).toFixed(8)):null,pricing_basis:model===manifest.candidate_model?manifest.pricing_usd_per_million:null}},
    critical_failures:{false_positive_case_ids:[...new Set(prematureLockCaseIds)],false_negative_case_ids:[...new Set(prematureUnlockCaseIds)]},failures};
  assertEvalReportRedacted(report,cases.map(testCase=>testCase.current_answer));
  const out=path.resolve("artifacts/eval/judge");await mkdir(out,{recursive:true});const file=path.join(out,`${manifest.dataset_version}-${Date.now()}.json`);await writeFile(file,JSON.stringify(report,null,2)+"\n","utf8");
  console.log(`Judge eval ${cases.length} cases | macro F1 ${report.metrics.node.macro_f1} | core DISCOVERED ${coreDiscoveredTp}/${coreDiscoveredTp+coreDiscoveredFp} | schema ${report.metrics.operational.schema_valid_rate} | retries ${retried}`);console.log(`Report: ${file}`);
}

function gitSha(){try{return execFileSync("git",["-c","safe.directory=C:/Users/김성하/Desktop/PJT/ReDiscovery","rev-parse","HEAD"],{encoding:"utf8"}).trim();}catch{return null;}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runJudgeEval();
