"use client";

import type { PublicSessionView } from "@/application/play/session-view";
import type { DemoPayload } from "./demo-types";

const CURRENT_KEY = "g1:m1:current-session";
const snapshotKey = (id: string) => `g1:m1:snapshot:${id}`;

interface DemoSnapshot {
  readonly id: string;
  readonly thoughts: readonly string[];
  readonly status: "THINKING" | "LOCKABLE" | "LOCKED" | "REVEALED";
}

function resumableStatus(status: PublicSessionView["status"]): DemoSnapshot["status"] {
  if (status === "LOCKABLE" || status === "LOCKED" || status === "REVEALED") return status;
  return "THINKING";
}

export function saveDemoSnapshot(session: PublicSessionView) {
  const snapshot: DemoSnapshot = {
    id: session.id,
    thoughts: session.thoughts.map(({ text }) => text),
    status: resumableStatus(session.status),
  };
  localStorage.setItem(CURRENT_KEY, session.id);
  localStorage.setItem(snapshotKey(session.id), JSON.stringify(snapshot));
}

export function getCurrentDemoId() {
  return localStorage.getItem(CURRENT_KEY);
}

export function clearCurrentDemo() {
  localStorage.removeItem(CURRENT_KEY);
}

export async function loadDemoSession(id: string): Promise<DemoPayload> {
  let response = await fetch(`/api/demo/sessions/${id}`, { cache: "no-store" });
  if (response.status === 404) {
    const stored = localStorage.getItem(snapshotKey(id));
    if (!stored) throw new Error("SESSION_NOT_FOUND");
    response = await fetch("/api/demo/sessions/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stored,
    });
  }
  if (!response.ok) throw new Error("SESSION_LOAD_FAILED");
  const payload = await response.json() as DemoPayload;
  saveDemoSnapshot(payload.session);
  return payload;
}
