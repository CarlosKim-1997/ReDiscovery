export class PlayRuleError extends Error {
  constructor(readonly code: "INVALID_SESSION_STATE" | "EMPTY_THOUGHT" | "REVEAL_NOT_ALLOWED") {
    super(code);
  }
}
