import { expect, it } from "vitest";
import { runLockVerifierV2Eval } from "../../tooling/lock-verifier-v2-eval.mts";

it("runs the explicitly approved real-provider Lock Verifier v2 development evaluation", async () => {
  await runLockVerifierV2Eval();
  expect(true).toBe(true);
});
