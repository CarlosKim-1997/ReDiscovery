"use client";
import { useEffect, useState } from "react";

interface AuthState { configured: boolean; authenticated: boolean; currentSessionClaimed?: boolean }
export function AuthControls({ sessionId }: { readonly sessionId: string }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [claimNotApplied, setClaimNotApplied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/auth/status?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("AUTH_STATUS_UNAVAILABLE");
        const result = await response.json() as AuthState;
        if (!cancelled) {
          setState({ configured: result.configured === true, authenticated: result.authenticated === true, currentSessionClaimed: result.currentSessionClaimed === true });
          setClaimNotApplied(new URLSearchParams(window.location.search).get("auth") === "claim_not_applied");
        }
      } catch { if (!cancelled) setState({ configured: false, authenticated: false }); }
    }
    void load(); return () => { cancelled = true; };
  }, [sessionId]);
  return <section className="result-card" aria-label="계정 연결">
    {state?.authenticated ? <>
      <p>로그인됨</p>
      {state.currentSessionClaimed ? <p>이번 공식 세션이 계정에 연결되었습니다.</p> : claimNotApplied ? <p>로그인은 완료했지만 이번 세션은 연결되지 않았습니다.</p> : null}
      <form method="post" action="/auth/logout"><button className="secondary-button" type="submit">로그아웃</button></form>
    </> : <>
      <form method="post" action="/auth/google"><input type="hidden" name="sessionId" value={sessionId} /><button className="secondary-button" type="submit" disabled={!state?.configured}>Google로 로그인</button></form>
      {state && !state.configured ? <p className="status-copy">로그인은 아직 설정되지 않았습니다. (AUTH_NOT_CONFIGURED)</p> : null}
    </>}
  </section>;
}
