import { test, expect } from "@playwright/test";
import { finishReveal, getOwned, reveal, startOfficial } from "../../src/application/play/daily-game";
import { answer } from "../support/judge-submission";
import { personalizedRevealFixture } from "../support/personalized-reveal-fixture";
import { fixtureAttempt } from "../support/adaptive-runtime-fixture";

for (const withEvidence of [true, false]) {
  test(`personalized Reveal with ${withEvidence ? "literal evidence" : "no evidence"} remains readable on Result`, async ({ page }) => {
    const f = personalizedRevealFixture();
    const excerpts: Record<string, string> = { TEAM_BOUNDARIES: "사람들 묶음", COMMUNICATION_FRICTION: "소통 차이", DECISION_CLUSTERING: "설계 결정", SYSTEM_RESEMBLANCE: "결과물 구조 😀" };
    if (withEvidence) f.executions.push({ verdict: { answerType: "REASONING", ambiguity: "NONE", nodes: f.content.JUDGE_RUBRIC.nodes.map(node => ({ nodeId: node.id, status: "DISCOVERED", evidenceText: excerpts[node.id]! })) }, attempts: [fixtureAttempt] });
    await startOfficial(f.deps, "device");
    await answer(f.deps, "device", "adaptive-fixture", "사람들 묶음 / 소통 차이 / 설계 결정 / 결과물 구조 😀");
    await answer(f.deps, "device", "adaptive-fixture", "다시 정리한 생각");
    await page.route("**/api/play-sessions/**", async route => {
      if (new URL(route.request().url()).pathname.endsWith("/reveal")) {
        if (route.request().method() === "POST") return route.fulfill({ json: { session: await finishReveal(f.deps, "device", "adaptive-fixture") } });
        return route.fulfill({ json: { reveal: await reveal(f.deps, "device", "adaptive-fixture") } });
      }
      return route.fulfill({ json: await getOwned(f.deps, "device", "adaptive-fixture") });
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/play/adaptive-fixture");
    expect(await page.locator("main").innerText()).not.toMatch(/Conway|1968|당신이 짚은 부분|원래 통찰$/);
    await page.getByRole("button", { name: "원래 통찰 공개하기" }).click();
    await expect(page.locator("main")).toHaveAttribute("data-reveal-phase", "COMPLETE");
    const section = page.getByRole("region", { name: "당신의 생각과 원래 통찰" });
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { name: withEvidence ? "독립 재발견" : "Reveal에서 연결", exact: true })).toBeVisible();
    await expect(section.getByRole("heading", { name: "원래 통찰", exact: true })).toBeVisible();
    await expect(section.getByText(f.content.REVEAL_CONTENT.explanation, { exact: true })).toBeVisible();
    await expect(section.locator("blockquote")).toHaveCount(withEvidence ? 2 : 0);
    if (withEvidence) {
      await expect(section.locator("blockquote").nth(0)).toHaveText("결과물 구조 😀");
      await expect(section.locator("blockquote").nth(1)).toHaveText("설계 결정");
    }
    expect(await section.innerText()).not.toMatch(/TEAM_BOUNDARIES|SYSTEM_RESEMBLANCE|score|\d|%/i);
    await page.reload();
    await expect(section).toBeVisible();
    expect(f.aiRuns).toHaveLength(2);
  });
}
