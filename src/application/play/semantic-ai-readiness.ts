import type { ClockPort } from "@/ports/clock";
import type { SemanticAiReadiness, SemanticAiReadinessPort, SemanticAiReadinessProbePort } from "@/ports/semantic-ai-readiness";

export const SEMANTIC_AI_READY_TTL_MS = 60_000;
export const SEMANTIC_AI_FAILURE_BACKOFF_MS = 12_000;

/** One configured provider/model per monitor; process-local Internal Alpha cache. */
export class CachedSemanticAiReadiness implements SemanticAiReadinessPort {
  private cached?: Readonly<{ state: SemanticAiReadiness; expiresAt: number }>;
  private pending: Promise<SemanticAiReadiness> | undefined;
  private generation = 0;

  constructor(private readonly clock: ClockPort, private readonly probePort: SemanticAiReadinessProbePort) {}

  check(): Promise<SemanticAiReadiness> {
    if (this.cached && this.clock.now().getTime() < this.cached.expiresAt) return Promise.resolve(this.cached.state);
    if (this.pending) return this.pending;
    const generation = this.generation;
    const pending = Promise.resolve().then(() => this.probePort.probe()).catch(() => "UNAVAILABLE" as const).then(state => {
      // A real Judge execution is stronger/newer evidence than an older probe.
      if (generation === this.generation) this.cache(state);
      return this.cached!.state;
    }).finally(() => { if (this.pending === pending) this.pending = undefined; });
    this.pending = pending;
    return pending;
  }

  recordSuccess(): void { this.generation++; this.cache("READY"); }
  recordProviderFailure(): void { this.generation++; this.cache("UNAVAILABLE"); }

  private cache(state: SemanticAiReadiness): void {
    this.cached = { state, expiresAt: this.clock.now().getTime() + (state === "READY" ? SEMANTIC_AI_READY_TTL_MS : SEMANTIC_AI_FAILURE_BACKOFF_MS) };
  }
}
