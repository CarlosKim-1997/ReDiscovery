import type { ServerConfig } from "@/config/schema";
import { FakeFinalSynthesisVerifierAdapter } from "@/adapters/fake-final-synthesis-verifier/fake-final-synthesis-verifier";
import {
  FinalSynthesisExecutionError,
  type FinalSynthesisVerifierPort,
} from "@/ports/final-synthesis-verifier";

class UnavailableFinalSynthesisVerifierAdapter implements FinalSynthesisVerifierPort {
  async extractProof(): Promise<never> {
    throw new FinalSynthesisExecutionError([{
      attempt: 1,
      provider: "unconfigured",
      model: "unconfigured",
      promptVersion: "unconfigured",
      schemaValid: false,
      resultStatus: "PROVIDER_ERROR",
      failureCategory: "PROVIDER_UNAVAILABLE",
      latencyMs: 0,
    }]);
  }
}

export function makeFinalSynthesisVerifier(
  config: Pick<ServerConfig, "APP_ENV">,
): FinalSynthesisVerifierPort {
  return config.APP_ENV === "test"
    ? new FakeFinalSynthesisVerifierAdapter()
    : new UnavailableFinalSynthesisVerifierAdapter();
}
