import { describe,expect,it } from "vitest";
import { runFinalSynthesisLiveEvaluation } from "../../tooling/final-synthesis-eval.mts";
describe("explicit Final Synthesis development live run",()=>{it("runs only with the separately frozen run contract",async()=>{const result=await runFinalSynthesisLiveEvaluation();expect(result.report).toBeDefined()})});
