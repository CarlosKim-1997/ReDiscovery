import { createHash } from "node:crypto";
import { mkdtemp,mkdir,readFile,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach,describe,expect,it,vi } from "vitest";
import {
  FinalSynthesisV2ProviderExecutionAuthority,
  finalSynthesisV2RunContractSchema,
  loadFinalSynthesisV2DevelopmentSuite,
  runFinalSynthesisV2LiveEvaluation,
  validateFinalSynthesisV2LiveEntry,
  validateFinalSynthesisV2RunContract,
  type FinalSynthesisV2GitResult,
  type FinalSynthesisV2RunContract,
  type FinalSynthesisV2RunSealDependencies,
} from "../../tooling/final-synthesis-v2-eval.mts";

const gitSha="4432a93aab07165afbb719a9a2025452f8e3abb8";
const temporaryRoots:string[]=[];
afterEach(async()=>{await Promise.all(temporaryRoots.splice(0).map(root=>rm(root,{recursive:true,force:true})))});

async function fixture(){
  const repoRoot=await mkdtemp(path.join(tmpdir(),"rediscovery-v2-seal-"));temporaryRoots.push(repoRoot);
  const contractRoot=path.join(repoRoot,"artifacts/eval/final-synthesis/run-contracts");await mkdir(contractRoot,{recursive:true});
  const suite=await loadFinalSynthesisV2DevelopmentSuite();
  const contract:FinalSynthesisV2RunContract={schema_version:2,git_sha:gitSha,dataset_version:suite.manifest.dataset_version,corpus_sha256:suite.corpusHash,revision_ledger_sha256:suite.ledgerHash,prompt_version:suite.manifest.prompt_version,prompt_sha256:suite.promptHash,proof_contract_version:suite.manifest.proof_contract_version,product_contract_version:suite.manifest.product_contract_version,evaluator_version:suite.manifest.evaluator_version,content_slug:suite.manifest.content_slug,content_version:suite.manifest.content_version,content_sha256:suite.contentHash,candidate_model:"test-model"};
  const contractFile=path.join(contractRoot,"candidate.json");await writeFile(contractFile,JSON.stringify(contract));
  const git=(overrides:Partial<Record<string,FinalSynthesisV2GitResult>>={})=>(args:readonly string[])=>{const command=args.join(" ");return overrides[command]??(command==="status --porcelain --untracked-files=all"?{status:0,stdout:""}:command.startsWith("ls-files --")?{status:0,stdout:""}:command.startsWith("check-ignore --quiet --")?{status:0,stdout:""}:command==="rev-parse HEAD"||command==="rev-parse origin/main"?{status:0,stdout:`${gitSha}\n`}:command==="rev-list --left-right --count HEAD...origin/main"?{status:0,stdout:"0\t0\n"}:{status:1,stdout:""})};
  const deps=(overrides:Partial<FinalSynthesisV2RunSealDependencies>={}):FinalSynthesisV2RunSealDependencies=>({repoRoot,runGit:git(),pathExists:async()=>false,...overrides});
  return{repoRoot,contractRoot,contractFile,contract,deps,git};
}

describe("Final Synthesis v2 run-contract schema",()=>{
  it("accepts only the strict version-2 identity shape",async()=>{const f=await fixture();expect(finalSynthesisV2RunContractSchema.parse(f.contract)).toEqual(f.contract);expect(()=>finalSynthesisV2RunContractSchema.parse({...f.contract,schema_version:1})).toThrow();expect(()=>finalSynthesisV2RunContractSchema.parse({...f.contract,extra:true})).toThrow();expect(()=>finalSynthesisV2RunContractSchema.parse({...f.contract,revision_ledger_sha256:undefined})).toThrow();expect(()=>finalSynthesisV2RunContractSchema.parse({...f.contract,product_contract_version:undefined})).toThrow();expect(()=>finalSynthesisV2RunContractSchema.parse({...f.contract,git_sha:"short"})).toThrow();expect(()=>finalSynthesisV2RunContractSchema.parse({...f.contract,corpus_sha256:"x".repeat(64)})).toThrow()});

  it("rejects every frozen repository identity mismatch",async()=>{const f=await fixture();const changes:Partial<FinalSynthesisV2RunContract>[]=[{git_sha:"a".repeat(40)},{dataset_version:"wrong" as never},{corpus_sha256:"a".repeat(64)},{revision_ledger_sha256:"a".repeat(64)},{prompt_version:"wrong" as never},{prompt_sha256:"a".repeat(64)},{proof_contract_version:"wrong" as never},{product_contract_version:"wrong" as never},{evaluator_version:"wrong" as never},{content_slug:"wrong" as never},{content_version:4 as never},{content_sha256:"a".repeat(64)}];for(const change of changes){await writeFile(f.contractFile,JSON.stringify({...f.contract,...change}));await expect(validateFinalSynthesisV2RunContract({contractFile:f.contractFile,sealDependencies:f.deps()})).rejects.toThrow(/FINAL_SYNTHESIS_V2_RUN_CONTRACT_(?:MISMATCH|SCHEMA_INVALID)/u)}});
});

describe("Final Synthesis v2 provider-free seal",()=>{
  it("validates a canonical ignored contract without opt-in, model env, API key, or provider",async()=>{const f=await fixture();const result=await validateFinalSynthesisV2RunContract({contractFile:path.relative(f.repoRoot,f.contractFile),expectedCandidateModel:"test-model",sealDependencies:f.deps()});expect(result.contract).toEqual(f.contract);expect(result.contractSha256).toMatch(/^[0-9a-f]{64}$/u)});

  it("rejects root, outside, traversal, and realpath escape",async()=>{const f=await fixture();await expect(validateFinalSynthesisV2RunContract({contractFile:f.contractRoot,sealDependencies:f.deps()})).rejects.toThrow(/PATH_INVALID/u);const outside=path.join(f.repoRoot,"outside.json");await writeFile(outside,JSON.stringify(f.contract));await expect(validateFinalSynthesisV2RunContract({contractFile:outside,sealDependencies:f.deps()})).rejects.toThrow(/PATH_INVALID/u);await expect(validateFinalSynthesisV2RunContract({contractFile:"artifacts/eval/final-synthesis/run-contracts/../../../outside.json",sealDependencies:f.deps()})).rejects.toThrow(/PATH_INVALID/u);const escaped=path.join(f.repoRoot,"escaped.json");await expect(validateFinalSynthesisV2RunContract({contractFile:f.contractFile,sealDependencies:f.deps({resolveRealPath:async value=>value===f.contractFile?escaped:path.resolve(value)})})).rejects.toThrow(/PATH_INVALID/u)});

  it("rejects tracked, non-ignored, dirty, divergent, and unavailable Git states",async()=>{const f=await fixture();const cases:FinalSynthesisV2RunSealDependencies[]=[f.deps({runGit:f.git({[`ls-files -- ${path.relative(f.repoRoot,f.contractFile)}`]:{status:0,stdout:"tracked\n"}})}),f.deps({runGit:f.git({[`check-ignore --quiet -- ${path.relative(f.repoRoot,f.contractFile)}`]:{status:1,stdout:""}})}),f.deps({runGit:f.git({"status --porcelain --untracked-files=all":{status:0,stdout:" M source.ts\n"}})}),f.deps({runGit:f.git({"rev-parse origin/main":{status:0,stdout:`${"a".repeat(40)}\n`}})}),f.deps({runGit:f.git({"rev-list --left-right --count HEAD...origin/main":{status:0,stdout:"1\t0\n"}})}),f.deps({runGit:f.git({"rev-parse origin/main":{status:1,stdout:""}})})];for(const sealDependencies of cases)await expect(validateFinalSynthesisV2RunContract({contractFile:f.contractFile,sealDependencies})).rejects.toThrow(/FINAL_SYNTHESIS_V2_/u)});
});

describe("Final Synthesis v2 live provider boundary",()=>{
  const validEnv=(file:string)=>({FINAL_SYNTHESIS_V2_LIVE_RUN:"1",FINAL_SYNTHESIS_V2_RUN_CONTRACT:file,FINAL_SYNTHESIS_V2_MODEL:"test-model",OPENAI_API_KEY:"not-used"});

  it("rejects all live environment and credential failures before provider construction",async()=>{const f=await fixture();const base=validEnv(f.contractFile);const invalid=[{...base,FINAL_SYNTHESIS_V2_LIVE_RUN:undefined},{...base,FINAL_SYNTHESIS_V2_LIVE_RUN:"yes"},{...base,FINAL_SYNTHESIS_V2_RUN_CONTRACT:undefined},{...base,FINAL_SYNTHESIS_V2_MODEL:undefined},{...base,FINAL_SYNTHESIS_V2_MODEL:"other"},{...base,OPENAI_API_KEY:undefined}];for(const env of invalid){const factory=vi.fn();await expect(runFinalSynthesisV2LiveEvaluation({env,sealDependencies:f.deps(),makeVerifier:factory as never})).rejects.toThrow();expect(factory).not.toHaveBeenCalled()}const factory=vi.fn();await expect(runFinalSynthesisV2LiveEvaluation({env:base,sealDependencies:f.deps({pathExists:async value=>value.endsWith(".env.local")}),makeVerifier:factory as never})).rejects.toThrow(/PERSISTENT_CREDENTIAL/u);expect(factory).not.toHaveBeenCalled()});

  it("never constructs a provider for schema, path, identity, or Git seal failures",async()=>{const f=await fixture();const factory=vi.fn();const attempt=async(contractFile:string,deps:FinalSynthesisV2RunSealDependencies)=>{await expect(runFinalSynthesisV2LiveEvaluation({env:validEnv(contractFile),sealDependencies:deps,makeVerifier:factory as never})).rejects.toThrow();expect(factory).not.toHaveBeenCalled()};await writeFile(f.contractFile,JSON.stringify({...f.contract,extra:true}));await attempt(f.contractFile,f.deps());await writeFile(f.contractFile,JSON.stringify({...f.contract,corpus_sha256:"a".repeat(64)}));await attempt(f.contractFile,f.deps());await writeFile(f.contractFile,JSON.stringify(f.contract));const outside=path.join(f.repoRoot,"outside.json");await writeFile(outside,JSON.stringify(f.contract));await attempt(outside,f.deps());await attempt(f.contractFile,f.deps({runGit:f.git({"status --porcelain --untracked-files=all":{status:0,stdout:"?? source.ts\n"}})}));await attempt(f.contractFile,f.deps({runGit:f.git({"rev-list --left-right --count HEAD...origin/main":{status:0,stdout:"0\t1\n"}})}))});

  it("constructs a fake provider exactly once only after every seal passes",async()=>{const f=await fixture();const authority=new FinalSynthesisV2ProviderExecutionAuthority(),verifier={extractProof:vi.fn()};const factory=vi.fn(()=>({verifier,authority}));const runner=vi.fn(async(receivedVerifier,model,receivedAuthority,options)=>{expect(receivedVerifier).toBe(verifier);expect(model).toBe("test-model");expect(receivedAuthority).toBe(authority);expect(options.liveIdentity.runContractSha256).toMatch(/^[0-9a-f]{64}$/u);await options.beforeWrite();return{file:"fake.json",report:{accepted:true}}});const result=await runFinalSynthesisV2LiveEvaluation({env:validEnv(f.contractFile),sealDependencies:f.deps(),makeVerifier:factory as never,runEvaluation:runner as never,now:()=>new Date("2026-09-12T00:00:00.000Z")});expect(factory).toHaveBeenCalledOnce();expect(factory).toHaveBeenCalledWith("not-used","test-model");expect(runner).toHaveBeenCalledOnce();expect(result.identity.timestamp).toBe("2026-09-12T00:00:00.000Z")});

  it("records the validated bytes hash and detects contract mutation before artifact write",async()=>{const f=await fixture();const original=await readFile(f.contractFile);let recorded="";const runner=vi.fn(async(_verifier,_model,_authority,options)=>{recorded=options.liveIdentity.runContractSha256;await writeFile(f.contractFile,Buffer.concat([original,Buffer.from(" ")]));await options.beforeWrite();return{file:"none",report:{accepted:false}}});await expect(runFinalSynthesisV2LiveEvaluation({env:validEnv(f.contractFile),sealDependencies:f.deps(),makeVerifier:()=>({verifier:{extractProof:vi.fn()} as never,authority:new FinalSynthesisV2ProviderExecutionAuthority()}),runEvaluation:runner as never})).rejects.toThrow(/RUN_CONTRACT_MUTATED/u);expect(recorded).toBe(createHash("sha256").update(original).digest("hex"))});

  it("keeps live validation separate from provider-free validation",async()=>{const f=await fixture();await expect(validateFinalSynthesisV2LiveEntry({env:{},sealDependencies:f.deps()})).rejects.toThrow(/LIVE_OPT_IN_REQUIRED/u);await expect(validateFinalSynthesisV2RunContract({contractFile:f.contractFile,sealDependencies:f.deps()})).resolves.toBeDefined()});
});
