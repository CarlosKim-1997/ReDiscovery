import { test, expect } from "@playwright/test";
import { answer, finishReveal, getOwned, reveal, startOfficial } from "../../src/application/play/daily-game";
import { personalizedRevealFixture } from "../support/personalized-reveal-fixture";
import { fixtureAttempt } from "../support/adaptive-runtime-fixture";

test("two-turn Reveal choreography, mobile skip and stable reload", async ({ page }, testInfo) => {
  const f = personalizedRevealFixture();
  f.executions.push({ verdict: { answerType: "REASONING", ambiguity: "NONE", nodes: f.content.JUDGE_RUBRIC.nodes.map(node => ({ nodeId: node.id, status: "DISCOVERED", evidenceText: "사람들 경계가 결과물에 남는다" })) }, attempts: [fixtureAttempt] });
  await startOfficial(f.deps, "device");
  let revealGets = 0; let completionPosts = 0;
  await page.route("**/api/play-sessions/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/answers")) return route.fulfill({ json: await answer(f.deps, "device", "adaptive-fixture", route.request().postDataJSON()) });
    if (path.endsWith("/reveal")) {
      if (route.request().method() === "POST") { completionPosts++; return route.fulfill({ json: { session: await finishReveal(f.deps, "device", "adaptive-fixture") } }); }
      revealGets++; return route.fulfill({ json: { reveal: await reveal(f.deps, "device", "adaptive-fixture") } });
    }
    return route.fulfill({ json: await getOwned(f.deps, "device", "adaptive-fixture") });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/play/adaptive-fixture");
  await page.getByRole("textbox").fill("사람들 경계가 결과물에 남는다");
  await page.getByRole("button", { name: "생각 제출하기" }).click();
  await page.getByRole("textbox").fill("다시 정리한 생각");
  await page.getByRole("button", { name: "생각 제출하기" }).click();
  const open = page.getByRole("button", { name: "원래 통찰 공개하기" }); await expect(open).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(/1968|Melvin|Conway/);
  await open.click();
  await expect(page.locator("main")).toHaveAttribute("data-reveal-phase", "THOUGHT");
  await expect(page.locator("blockquote")).toHaveText("사람들 경계가 결과물에 남는다");
  expect(await page.locator("main").innerText()).not.toMatch(/1968|Melvin|Conway/);
  await expect.poll(() => completionPosts).toBe(1);
  if (testInfo.project.name === "mobile-chromium") {
    const before = revealGets; await page.getByRole("button", { name: "바로 보기" }).click();
    await expect(page.locator("main")).toHaveAttribute("data-reveal-phase", "COMPLETE");
    expect(revealGets).toBe(before); expect(completionPosts).toBe(1);
  } else {
    await expect(page.locator("main")).toHaveAttribute("data-reveal-phase", "TIME");
    expect(await page.locator("main").innerText()).not.toMatch(/Melvin|Conway/);
    await expect(page.locator("main")).toHaveAttribute("data-reveal-phase", "PERSON");
    await expect(page.locator("main")).toHaveAttribute("data-reveal-phase", "THEORY");
    await expect(page.locator("main")).toHaveAttribute("data-reveal-phase", "COMPLETE");
  }
  await expect(page.getByRole("region", { name: "당신의 생각과 원래 통찰" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/result\/adaptive-fixture$/);
  await expect(page.getByRole("region", { name: "당신의 생각과 원래 통찰" })).toBeVisible();
  await expect(page.getByRole("button", { name: "바로 보기" })).toHaveCount(0);
  expect(completionPosts).toBe(1); expect(f.aiRuns).toHaveLength(2);
});
