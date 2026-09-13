import type { PublicSessionView } from "@/application/play/session-view";

export function canonicalSessionRoute(status: PublicSessionView["status"], sessionId: string, adaptive = false): string | undefined {
  if (adaptive && status === "REVEAL_READY") return undefined;
  if (status === "LOCKED" || status === "REVEAL_READY") return `/reveal/${sessionId}`;
  if (status === "REVEALED") return `/result/${sessionId}`;
  return undefined;
}
