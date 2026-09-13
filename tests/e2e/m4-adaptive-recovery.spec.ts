import { expect, test } from "@playwright/test";
import { answer, finishReveal, getOwned, reveal, startOfficial } from "../../src/application/play/daily-game";
import { AdaptiveEvaluationPausedError, SemanticAiUnavailableError } from "../../src/application/play/adaptive-evaluation";
import { resumeJudgeOperation, type JudgeSubmission } from "../../src/application/play/judge-operations";
import { adaptiveRuntimeFixture, ADAPTIVE_FULL_FIXTURE_ANSWER, fixtureProviderFailure } from "../support/adaptive-runtime-fixture";

for (const interruptedTurn of [1, 2]) {
  test(`unavailable start and persisted Turn ${interruptedTurn} recovery through the real application`, async ({ page }) => {
    // Real application/domain/readiness with a test-owned CAS store and Judge.
    // No live provider or production schedule mutation.
    const f = adaptiveRuntimeFixture();
    f.setProbeState("UNAVAILABLE");
    await page.route("**/api/play-sessions**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      try {
        if (path === "/api/play-sessions") return route.fulfill({ json: await startOfficial(f.deps, "device") });
        const id = f.session().id;
        if (path.endsWith("/answers")) {
          const result = await answer(f.deps, "device", id, request.postDataJSON() as JudgeSubmission);
          return route.fulfill({ json: result });
        }
        if (path.endsWith("/evaluation-resume")) {
          const input = request.postDataJSON() as { submissionId: string; expectedStateVersion: number };
          const result = await resumeJudgeOperation(f.deps, "device", id, input.submissionId, input.expectedStateVersion);
          return route.fulfill({ json: result });
        }
        if (path.endsWith("/reveal")) {
          if (request.method() === "POST") return route.fulfill({ json: { session: await finishReveal(f.deps, "device", id) } });
          return route.fulfill({ json: { reveal: await reveal(f.deps, "device", id) } });
        }
        return route.fulfill({ json: await getOwned(f.deps, "device", id) });
      } catch (error) {
        if (error instanceof AdaptiveEvaluationPausedError) return route.fulfill({ status: 503, json: { error: error.message, session: error.session } });
        if (error instanceof SemanticAiUnavailableError) return route.fulfill({ status: 503, json: { error: error.message } });
        throw error;
      }
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "오늘의 문제 시작 또는 이어 하기" }).click();
    await expect(page.getByText("오늘의 사고 피드백을 준비하지 못했습니다. 잠시 후 다시 시도해주세요.")).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    expect(f.starts()).toBe(0); expect(f.judgeInputs).toHaveLength(0);
    f.setProbeState("READY"); f.advance(12_000);
    await page.getByRole("button", { name: "다시 시작 또는 이어 하기" }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
    expect(f.starts()).toBe(1);
    if (interruptedTurn === 2) {
      await page.getByRole("textbox").fill("모르겠다.");
      await page.getByRole("button", { name: "생각 제출하기" }).click();
      await expect(page.getByRole("textbox")).toHaveValue("");
    }
    const exactAnswer = `  😀 ${ADAPTIVE_FULL_FIXTURE_ANSWER}  `;
    f.executions.push(fixtureProviderFailure());
    await page.getByRole("textbox").fill(exactAnswer);
    await page.getByRole("button", { name: "생각 제출하기" }).click();
    const resume = page.getByRole("button", { name: "저장된 생각 피드백 이어가기" });
    await expect(resume).toBeVisible();
    await expect(page.getByLabel(`${interruptedTurn}번째 생각 피드백이 일시 중지되었습니다`)).toHaveText(`${interruptedTurn} / 2`);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "원래 통찰 공개하기" })).toHaveCount(0);
    await expect(page.getByLabel("저장된 생각")).toHaveText(exactAnswer.trim());
    expect(f.session()).toMatchObject({ status: "ERROR_RECOVERABLE", turnCount: interruptedTurn });
    expect(f.session().thoughts.at(-1)!.text).toBe(exactAnswer);
    await page.reload();
    await expect(resume).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    const calls = f.judgeInputs.length;
    await resume.click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("아직 피드백을 준비하지 못했습니다. 잠시 후 다시 이어가주세요.");
    expect(f.judgeInputs).toHaveLength(calls);
    f.advance(12_000);
    await resume.click();
    if (interruptedTurn === 1) {
      await expect(page.getByRole("textbox")).toBeVisible();
      await expect(page.getByText(f.session().guidance.at(-1)!.text, { exact: true })).toBeVisible();
      expect(f.session()).toMatchObject({ status: "THINKING", turnCount: 1 });
      await page.getByRole("textbox").fill(ADAPTIVE_FULL_FIXTURE_ANSWER);
      await page.getByRole("button", { name: "생각 제출하기" }).click();
    }
    await expect(page.getByRole("button", { name: "원래 통찰 공개하기" })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(f.session()).toMatchObject({ status: "REVEAL_READY", turnCount: 2 });
    expect(f.session().thoughts).toHaveLength(2); expect(f.reservations()).toBe(2);
    expect(f.judgeInputs).toHaveLength(3); // 2 reasoning evaluations + same-answer resume.
    expect(f.judgeInputs[interruptedTurn]!.currentAnswer).toBe(exactAnswer);
    await expect(page.getByText(f.session().guidance.at(-1)!.text, { exact: true })).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(/Conway|Melvin|1968|콘웨이/);
    await page.getByRole("button", { name: "원래 통찰 공개하기" }).click();
    await expect(page).toHaveURL(/\/result\/adaptive-fixture$/, { timeout: 10_000 });
    expect(f.session().status).toBe("REVEALED");
  });
}
