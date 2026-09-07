export function apiError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const status = code === "REVEAL_NOT_ALLOWED" || code === "INVALID_SESSION_STATE" ? 409
    : code === "ANSWER_TOO_LONG" || code === "EMPTY_THOUGHT" || (error instanceof Error && error.name === "ZodError") ? 400
      : 500;
  return Response.json({ error: code }, { status });
}

export function noStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}
