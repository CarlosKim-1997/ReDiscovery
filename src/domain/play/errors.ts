export class PlayRuleError extends Error {
  constructor(readonly code: "INVALID_SESSION_STATE" | "EMPTY_THOUGHT" | "REVEAL_NOT_ALLOWED" | "FINAL_SYNTHESIS_REQUIRED") {
    super(code);
  }
}
