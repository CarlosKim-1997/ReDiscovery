import { expect, it } from "vitest";
import { runLockVerifierV3Eval } from "../../tooling/lock-verifier-v3-eval.mts";

it("runs the explicitly approved real-provider Lock Verifier v3 development evaluation", async () => {
  await runLockVerifierV3Eval();
  expect(true).toBe(true);
});
