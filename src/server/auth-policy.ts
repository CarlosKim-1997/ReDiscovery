export function requireSameOrigin(request: Request, origin: string) {
  if (request.headers.get("origin") !== origin) throw new Error("INVALID_ORIGIN");
}
