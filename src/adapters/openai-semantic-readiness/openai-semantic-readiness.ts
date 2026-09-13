import OpenAI from "openai";
import type { SemanticAiReadinessProbePort } from "@/ports/semantic-ai-readiness";

export interface OpenAIModelReadinessTransport {
  retrieveModel(model: string): Promise<Readonly<{ id: string }>>;
}

export class OpenAIModelReadinessTransportAdapter implements OpenAIModelReadinessTransport {
  private readonly client: OpenAI;
  constructor(apiKey: string) { this.client = new OpenAI({ apiKey, maxRetries: 0, timeout: 10_000 }); }
  retrieveModel(model: string) { return this.client.models.retrieve(model, { maxRetries: 0, timeout: 10_000 }); }
}

/** Non-generation connectivity/auth/model-access evidence, not semantic inference. */
export class OpenAISemanticReadinessProbe implements SemanticAiReadinessProbePort {
  constructor(private readonly transport: OpenAIModelReadinessTransport, private readonly model: string) {}
  async probe() {
    try {
      const result = await this.transport.retrieveModel(this.model);
      return result.id === this.model ? "READY" as const : "UNAVAILABLE" as const;
    } catch { return "UNAVAILABLE" as const; }
  }
}
