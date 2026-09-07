import { expect, test, type Page } from "@playwright/test";

const full = "팀 경계가 소통 경계를 만들고 설계 결정이 그 경계를 따라 모여 시스템 구조가 조직 구조를 닮는다.";
const partial = "팀 안에서 소통이 더 쉽고, 팀 경계 밖과는 대화하기 어렵기 때문이다.";
const wrong = "사용자가 우연히 그런 구성을 더 좋아했기 때문이다.";

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "오늘의 문제 시작" }).click();
  await expect(page).toHaveURL(/\/play\/[0-9a-f-]+$/);
}

async function submit(page: Page, thought: string) {
  await page.getByLabel(/왜 조직이 일하는 방식/).fill(thought);
  await page.getByRole("button", { name: "생각 제출하기" }).click();
}

async function lockAndFinish(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "내 생각 잠그고 공개하기" }).click();
  await expect(page).toHaveURL(/\/result\//, { timeout: 10_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Conway's Law");
}

test("Scenario A: immediate discovery locks without guidance and reveals", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  await submit(page, full);
  await expect(page.getByText("여기까지 닿았습니다.")).toBeVisible();
  await expect(page.getByLabel(/도움/)).toHaveCount(0);
  await lockAndFinish(page);
  await expect(page.getByText("핵심 구조를 스스로 발견했습니다.")).toBeVisible();
});

test("Scenario B: partial discovery receives Reflect then reaches Lock", async ({ page }) => {
  await start(page);
  await submit(page, partial);
  await expect(page.getByLabel("REFLECT 도움")).toBeVisible();
  await expect(page.getByText("지금까지의 생각 1개")).toBeVisible();
  await submit(page, full);
  await expect(page.getByText("여기까지 닿았습니다.")).toBeVisible();
  await lockAndFinish(page);
});

test("Scenario C: wrong path receives Nudge, Rescue, and still reveals", async ({ page }) => {
  await start(page);
  await submit(page, wrong);
  await expect(page.getByLabel("NUDGE 도움")).toBeVisible();
  await submit(page, "아직 잘 모르겠다.");
  await expect(page.getByLabel("RESCUE 도움")).toBeVisible();
  await expect(page.getByText("여기까지 닿았습니다.")).toBeVisible();
  await lockAndFinish(page);
  await expect(page.getByText("도움을 통해 핵심 구조와 만났습니다.")).toBeVisible();
});

test("Scenario D: unfinished session resumes after reload", async ({ page }) => {
  await start(page);
  await submit(page, partial);
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByLabel("REFLECT 도움")).toBeVisible();
  await expect(page.getByText("지금까지의 생각 1개")).toBeVisible();
});

test("Scenario E: Reveal refresh keeps the locked session reachable", async ({ page }) => {
  await start(page);
  await submit(page, full);
  await page.getByRole("button", { name: "내 생각 잠그고 공개하기" }).click();
  await expect(page).toHaveURL(/\/reveal\//);
  await page.reload();
  await expect(page.getByText("당신의 생각")).toBeVisible();
  await expect(page).toHaveURL(/\/result\//, { timeout: 10_000 });
});

test("Scenario F: reduced motion preserves ordered information and finishes quickly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  await submit(page, full);
  const started = Date.now();
  await page.getByRole("button", { name: "내 생각 잠그고 공개하기" }).click();
  await expect(page).toHaveURL(/\/result\//, { timeout: 5_000 });
  expect(Date.now() - started).toBeLessThan(2_500);
  await expect(page.getByText("1968 · Melvin Conway")).toBeVisible();
});

test("Reveal secret API is forbidden before Lock and secrets are absent pre-Lock", async ({ page }) => {
  const responses: string[] = [];
  page.on("response", async (response) => {
    if (response.url().includes("/api/demo/")) responses.push(await response.text());
  });
  await start(page);
  const id = page.url().split("/").at(-1);
  const beforeLock = await page.request.get(`/api/demo/sessions/${id}/reveal`);
  expect(beforeLock.status()).toBe(409);
  const resourceUrls = await page.evaluate(() => performance.getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => url.startsWith(location.origin) && url.includes("/_next/static/") && url.endsWith(".js")));
  const scripts = await Promise.all(resourceUrls.map(async (url) => (await page.request.get(url)).text()));
  const storage = await page.evaluate(() => Object.values(localStorage).join(" "));
  const visible = `${await page.content()} ${responses.join(" ")} ${scripts.join(" ")} ${storage}`;
  expect(visible).not.toMatch(/Conway|Melvin|1968/);
});

test("Scenario G: mobile composer and Reveal fit without horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile-specific acceptance");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  const textarea = page.getByLabel(/왜 조직이 일하는 방식/);
  await expect(textarea).toBeVisible();
  const submitButton = page.getByRole("button", { name: "생각 제출하기" });
  expect((await submitButton.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  await textarea.fill(full);
  await submitButton.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await lockAndFinish(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
