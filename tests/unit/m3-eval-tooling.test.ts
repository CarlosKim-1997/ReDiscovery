import { describe,expect,it } from "vitest";
import path from "node:path";
import { readFile } from "node:fs/promises";
import raw from "../../content/approved/conway-law.v1.json";
import { approvedContentSchema } from "@/domain/content/schema";
import { mergeSemanticNodeStatus } from "@/domain/play/semantic-state";
import { assertEvalReportRedacted, evaluateCriticalLockProxy, loadCases } from "../../tooling/judge-eval.mts";

const policy=approvedContentSchema.parse(raw).SERVER_POLICY;

describe("M3 versioned Judge evaluation fixtures",()=>{
  it("loads 20 seed and 104 messy/adversarial cases with explicit expectations",async()=>{const root=path.resolve("eval/judge/v1");const cases=await loadCases(root);expect(cases).toHaveLength(124);expect(cases.filter(c=>c.id.startsWith("seed-"))).toHaveLength(20);for(const testCase of cases){expect(testCase.expected_answer_type).toBeTruthy();expect(testCase.expected_ambiguity).toBeTruthy();expect(Object.keys(testCase.expected_node_statuses)).toHaveLength(4);}});
  it("pins dataset, content, prompt, and candidate model versions",async()=>{const manifest=JSON.parse(await readFile(path.resolve("eval/judge/v1/manifest.json"),"utf8"));expect(manifest).toMatchObject({dataset_version:"judge-gold-v1",content_version:1,prompt_version:"judge-v1",candidate_model:"gpt-5.6-luna"});});
  it("rejects raw fixture fields and answers in generated reports",()=>{expect(()=>assertEvalReportRedacted({case_count:1,failures:[{id:"case-1"}]},["synthetic private answer"])).not.toThrow();expect(()=>assertEvalReportRedacted({currentAnswer:"synthetic private answer"},["synthetic private answer"])).toThrow(/forbidden raw field/);expect(()=>assertEvalReportRedacted({detail:"synthetic private answer"},["synthetic private answer"])).toThrow(/raw fixture answer/);});
  it.each([
    ["DISCOVERED","ABSENT","DISCOVERED"],
    ["DISCOVERED","PARTIAL","DISCOVERED"],
    ["PARTIAL","DISCOVERED","DISCOVERED"],
    ["DISCOVERED","CONTRADICTED","CONTRADICTED"],
  ] as const)("merges prior %s with incoming %s as %s",(prior,incoming,expected)=>{expect(mergeSemanticNodeStatus(prior,incoming)).toBe(expected);});
  it("makes the prior-state Gold group lock-eligible and detects a missed blocking node",async()=>{const cases=await loadCases(path.resolve("eval/judge/v1"));const testCase=cases.find(({id})=>id==="messy-prior-state-01")!;const correct=evaluateCriticalLockProxy(testCase.prior_confirmed_state??[],testCase.expected_node_statuses,testCase.expected_node_statuses,policy);expect(correct).toEqual({expectedEligible:true,predictedEligible:true,prematureLock:false,prematureUnlock:false});const missed={...testCase.expected_node_statuses,SYSTEM_RESEMBLANCE:"ABSENT" as const};expect(evaluateCriticalLockProxy(testCase.prior_confirmed_state??[],testCase.expected_node_statuses,missed,policy)).toMatchObject({expectedEligible:true,predictedEligible:false,prematureUnlock:true});});
});
