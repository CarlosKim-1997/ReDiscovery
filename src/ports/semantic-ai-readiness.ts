export type SemanticAiReadiness = "READY" | "UNAVAILABLE";

export interface SemanticAiReadinessProbePort {
  probe(): Promise<SemanticAiReadiness>;
}

export interface SemanticAiReadinessPort {
  check(): Promise<SemanticAiReadiness>;
  recordSuccess(): void;
  recordProviderFailure(): void;
}
