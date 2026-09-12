import { describe, expect, it } from "vitest";
import { runFinalSynthesisV2ProviderSmoke } from "../../tooling/final-synthesis-v2-smoke.mts";

describe("explicit Final Synthesis v2 one-request provider smoke", () => {
  it("runs only through the sealed smoke entry", async () => {
    const result = await runFinalSynthesisV2ProviderSmoke();
    expect(result.artifact.providerExecutionTotal).toBeLessThanOrEqual(1);
  });
});
