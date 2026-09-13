"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DailyPayload } from "./session-types";

export function HomeScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  async function start() {
    setBusy(true);
    let response: Response;
    try { response = await fetch("/api/play-sessions", { method: "POST" }); }
    catch { setUnavailable(true); setBusy(false); return; }
    if (!response.ok) {
      setUnavailable(true);
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
          {busy ? "준비하는 중…" : unavailable ? "다시 시작 또는 이어 하기" : "오늘의 문제 시작 또는 이어 하기"}
        </button>
      </div>
      {unavailable ? <p role="status">오늘의 사고 피드백을 준비하지 못했습니다. 잠시 후 다시 시도해주세요.</p> : null}
      <p className="quiet-note">로그인 없이 진행됩니다 · 점수와 실패는 없습니다</p>
    </main>
  );
}
