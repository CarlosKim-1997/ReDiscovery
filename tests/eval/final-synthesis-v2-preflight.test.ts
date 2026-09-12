import { readFile } from "node:fs/promises";
import { describe,expect,it } from "vitest";
import { auditFinalSynthesisV2Suite,loadFinalSynthesisV2DevelopmentSuite,preflightFinalSynthesisV2DevelopmentSuite,validateFinalSynthesisV2ProvenanceRows } from "../../tooling/final-synthesis-v2-eval.mts";

async function provenanceFixture(){
  const suite=await loadFinalSynthesisV2DevelopmentSuite();
  const v1=String(await readFile("eval/final-synthesis/v1/cases.jsonl")).trimEnd().split(/\r?\n/u).map(line=>JSON.parse(line));
  const manifest=JSON.parse(await readFile("eval/final-synthesis/v1/manifest.json","utf8"));
  return{suite,v1,v1Critical:manifest.required_regression_case_ids as string[]};
}

describe("Final Synthesis v2 provider-free preflight",()=>{
  it("freezes v2 identities and validates all 480 gold facts plus 96 request builds without a provider",async()=>{await expect(preflightFinalSynthesisV2DevelopmentSuite()).resolves.toMatchObject({datasetVersion:"final-synthesis-dev-v2",promptVersion:"final-synthesis-verify-v2",proofVersion:"final-synthesis-proof-v2",productVersion:"final-synthesis-v1",evaluatorVersion:"final-synthesis-eval-v2.1",caseCount:96,criticalCount:24,candidateModel:"UNSELECTED",goldConsistency:{expected:480,valid:480},providerRequestBuild:{total:96,successful:96,single:48,multi:48,tupleFree:true}})});
  it("rejects a component boolean that disagrees with its proof-v2 gold",async()=>{const {suite}=await provenanceFixture(),cases=structuredClone(suite.cases);cases[0]!.expected_components.ACTOR_GROUPING=!cases[0]!.expected_components.ACTOR_GROUPING;expect(()=>auditFinalSynthesisV2Suite({...suite,cases})).toThrow(/GOLD_CONSISTENCY_MISMATCH/)});
  it("rejects UNCHANGED when proof-v2 gold differs",async()=>{const {suite,v1,v1Critical}=await provenanceFixture(),entries=structuredClone(suite.ledger.entries);entries[0]!.status="UNCHANGED";expect(()=>validateFinalSynthesisV2ProvenanceRows(suite.cases,entries,v1,v1Critical,suite.manifest.required_regression_case_ids)).toThrow(/LEDGER_UNCHANGED_MISMATCH/)});
  it("rejects REANNOTATED when text changes",async()=>{const {suite,v1,v1Critical}=await provenanceFixture(),cases=structuredClone(suite.cases);cases[0]!.synthesis+=" 변경";expect(()=>validateFinalSynthesisV2ProvenanceRows(cases,suite.ledger.entries,v1,v1Critical,suite.manifest.required_regression_case_ids)).toThrow(/LEDGER_REANNOTATED_MISMATCH/)});
  it("rejects REWRITTEN when text is identical",async()=>{const {suite,v1,v1Critical}=await provenanceFixture(),entries=structuredClone(suite.ledger.entries);entries[0]!.status="REWRITTEN";expect(()=>validateFinalSynthesisV2ProvenanceRows(suite.cases,entries,v1,v1Critical,suite.manifest.required_regression_case_ids)).toThrow(/LEDGER_REWRITTEN_MISMATCH/)});
  it("rejects a replacement without a meaningful reason",async()=>{const {suite,v1,v1Critical}=await provenanceFixture(),entries=structuredClone(suite.ledger.entries),entry=entries.find(x=>x.status==="REPLACEMENT")!;entry.semantic_reason="short";expect(()=>validateFinalSynthesisV2ProvenanceRows(suite.cases,entries,v1,v1Critical,suite.manifest.required_regression_case_ids)).toThrow(/LEDGER_REPLACEMENT_MISMATCH/)});
  it("rejects duplicate source mappings",async()=>{const {suite,v1,v1Critical}=await provenanceFixture(),entries=structuredClone(suite.ledger.entries);entries[1]!.source_v1_case_id=entries[0]!.source_v1_case_id;expect(()=>validateFinalSynthesisV2ProvenanceRows(suite.cases,entries,v1,v1Critical,suite.manifest.required_regression_case_ids)).toThrow(/LEDGER_SOURCE_IDENTITY_MISMATCH/)});
});
