import { describe,expect,it } from "vitest";
import { runFinalSynthesisV2LiveEvaluation } from "../../tooling/final-synthesis-v2-eval.mts";

describe("explicit Final Synthesis v2 development live run",()=>{
  it("runs only through the sealed version-2 live entry",async()=>{
    const result=await runFinalSynthesisV2LiveEvaluation();
    expect(result.report).toBeDefined();
  });
});
