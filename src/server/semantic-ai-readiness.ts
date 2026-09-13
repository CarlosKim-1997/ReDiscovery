import type { ServerConfig } from "@/config/schema";
import type { ClockPort } from "@/ports/clock";
import type { SemanticAiReadinessPort } from "@/ports/semantic-ai-readiness";
import { CachedSemanticAiReadiness } from "@/application/play/semantic-ai-readiness";
import { OpenAIModelReadinessTransportAdapter, OpenAISemanticReadinessProbe } from "@/adapters/openai-semantic-readiness/openai-semantic-readiness";

export function makeSemanticAiReadiness(
  config: Pick<ServerConfig, "APP_ENV" | "JUDGE_ADAPTER" | "OPENAI_API_KEY" | "PRIMARY_JUDGE_MODEL">,
  clock: ClockPort,
): SemanticAiReadinessPort {
  if (config.JUDGE_ADAPTER === "fake") return {
    check: async () => config.APP_ENV === "test" ? "READY" : "UNAVAILABLE",
    // Fake legacy success must never activate an AI-free adaptive production path.
    recordSuccess: () => {}, recordProviderFailure: () => {},
  };
  return new CachedSemanticAiReadiness(clock,
    new OpenAISemanticReadinessProbe(new OpenAIModelReadinessTransportAdapter(config.OPENAI_API_KEY!), config.PRIMARY_JUDGE_MODEL!));
}
