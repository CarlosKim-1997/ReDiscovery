import { expect, it } from "vitest";
import { runLockVerifierEval } from "../../tooling/lock-verifier-eval.mts";

it("runs the explicit real-provider Lock Verifier development evaluation", async () => {
  await runLockVerifierEval();
  expect(true).toBe(true);
});
