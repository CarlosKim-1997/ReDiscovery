import { expect, test } from "@playwright/test";
import { authFixture, AUTH_FIXTURE_DEVICE as device, AUTH_FIXTURE_SESSION as session } from "../support/m6-auth-fixture";
import { authenticatedAccount, completeAuthentication, validateClaimIntent } from "@/application/identity/authentication";

test("Google affordance, fake callback single claim and logout preserve anonymous Result", async ({ page }) => {
  const f = authFixture(); let pending: string | undefined;
  // Browser-local interception, no fake-auth production mode or external endpoint.
  await page.route("**/api/play-sessions/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/reveal")) return route.fulfill({ json: { reveal: { theory: "Conway's Law", year: "1968", person: "Melvin Conway", connection: "승인된 연결", explanation: "승인된 통찰", substantialGuidanceUsed: false } } });
    return route.fulfill({ json: { session: { id: session, status: "REVEALED" } } });
  });
  await page.route("**/api/auth/status?**", async route => {
    const account = await authenticatedAccount(f.deps);
    return route.fulfill({ json: account ? { configured: true, authenticated: true, account: { id: account.id }, currentSessionClaimed: f.sessions.get(session)?.accountId === account.id } : { configured: true, authenticated: false } });
  });
  await page.route("**/auth/google", async route => {
    expect(route.request().method()).toBe("POST");
    const form = new URLSearchParams(route.request().postData()!);
    pending = await validateClaimIntent(f.deps, form.get("sessionId")!, device);
    await f.auth.startGoogleLogin("http://127.0.0.1:3100/auth/callback");
    // Interception handles only the first request of a redirect chain. Model
    // the provider's fresh document navigation so the fake callback is routed.
    return route.fulfill({ contentType: "text/html", body: "<script>location.replace('/auth/callback?code=valid')</script>" });
  });
  await page.route("**/auth/callback?**", async route => {
    const result = await completeAuthentication(f.deps, "valid", pending, device); pending = undefined;
    return route.fulfill({ status: 303, headers: { location: result.destination }, body: "" });
  });
  await page.route("**/auth/logout", async route => {
    await f.auth.logout(); return route.fulfill({ status: 303, headers: { location: `/result/${session}` }, body: "" });
  });
  await page.goto(`/result/${session}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Conway's Law");
  await page.getByRole("button", { name: "Google로 로그인" }).click();
  await expect(page).toHaveURL(`/result/${session}`);
  await expect(page.getByText("로그인됨", { exact: true })).toBeVisible();
  await expect(page.getByText("이번 공식 세션이 계정에 연결되었습니다.")).toBeVisible();
  expect(f.claims).toEqual([session]);
  const claimed = f.sessions.get(session);
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("button", { name: "Google로 로그인" })).toBeEnabled();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Conway's Law");
  expect(f.sessions.get(session)).toBe(claimed);
});
