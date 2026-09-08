"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DailyPayload } from "./session-types";

export function HomeScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const response = await fetch("/api/play-sessions", { method: "POST" });
    if (!response.ok) {
      setBusy(false);
      return;
    }
    const payload = await response.json() as DailyPayload;
    router.push(`/play/${payload.session.id}`);
  }

  return (
    <main className="page-shell home-shell">
      <p className="eyebrow">G1 · 오늘의 사고</p>
      <h1>이름을 알기 전에,<br />먼저 생각해봅니다.</h1>
      <p className="lede">낯선 상황 하나를 읽고 원인을 추론해보세요. 약 3분이면 충분합니다.</p>
      <div className="home-actions">
        <button className="primary-button" disabled={busy} onClick={start}>
          {busy ? "준비하는 중…" : "오늘의 문제 시작 또는 이어 하기"}
        </button>
      </div>
      <p className="quiet-note">로그인 없이 진행됩니다 · 점수와 실패는 없습니다</p>
    </main>
  );
}
