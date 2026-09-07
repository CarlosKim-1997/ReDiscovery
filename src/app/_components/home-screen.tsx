"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearCurrentDemo, getCurrentDemoId, loadDemoSession, saveDemoSnapshot } from "./demo-storage";
import type { DemoPayload } from "./demo-types";

export function HomeScreen() {
  const router = useRouter();
  const [resumable, setResumable] = useState<DemoPayload | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = getCurrentDemoId();
    if (!id) return;
    void loadDemoSession(id).then(setResumable).catch(clearCurrentDemo);
  }, []);

  async function start() {
    setBusy(true);
    const response = await fetch("/api/demo/sessions", { method: "POST" });
    if (!response.ok) {
      setBusy(false);
      return;
    }
    const payload = await response.json() as DemoPayload;
    saveDemoSnapshot(payload.session);
    router.push(`/play/${payload.session.id}`);
  }

  const resumePath = resumable?.session.status === "LOCKED" ? `/reveal/${resumable.session.id}`
    : resumable?.session.status === "REVEALED" ? `/result/${resumable.session.id}`
      : resumable ? `/play/${resumable.session.id}` : undefined;

  return (
    <main className="page-shell home-shell">
      <p className="eyebrow">G1 · 오늘의 사고</p>
      <h1>이름을 알기 전에,<br />먼저 생각해봅니다.</h1>
      <p className="lede">낯선 상황 하나를 읽고 원인을 추론해보세요. 약 3분이면 충분합니다.</p>
      <div className="home-actions">
        {resumePath ? (
          <button className="primary-button" onClick={() => router.push(resumePath)}>이어 하기</button>
        ) : null}
        <button className={resumePath ? "secondary-button" : "primary-button"} disabled={busy} onClick={start}>
          {busy ? "준비하는 중…" : resumePath ? "새로 시작하기" : "오늘의 문제 시작"}
        </button>
      </div>
      <p className="quiet-note">로그인 없이 진행됩니다 · 점수와 실패는 없습니다</p>
    </main>
  );
}
