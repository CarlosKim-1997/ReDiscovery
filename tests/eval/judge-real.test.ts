import { expect,it } from "vitest";
import { runJudgeEval } from "../../tooling/judge-eval.mts";

it("runs the explicit real-provider Judge Gold evaluation",async()=>{
  await runJudgeEval();
  expect(true).toBe(true);
});
