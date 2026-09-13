import { expect, test } from "@playwright/test";
import raw from "../../content/approved/conway-law.v6.json" with { type: "json" };
import { approvedContentSchema } from "../../src/domain/content/schema";
import { createPlaySession } from "../../src/domain/play/session";
import { applyJudgeVerdict, beginEvaluation, completeReveal } from "../../src/domain/play/policy";
import { toPublicSessionView } from "../../src/application/play/session-view";
import { validateJudgeVerdict } from "../../src/application/play/judge-verdict";
import type { JudgePort } from "../../src/ports/judge";

const content = approvedContentSchema.parse(raw);
const full = "팀 경계가 소통을 가르고 설계 결정이 모여 시스템 구조가 조직 구조를 닮는다.";

for (const first of ["모르겠다.", full]) {
  test(`adaptive two-turn UI, explicit Reveal, reload (${first === full ? "complete" : "off-track"})`, async ({ page }) => {
    // Test-owned API fixture: real domain policy/public projection, fake Judge;
    // no production schedule mutation or external provider/database required.
    let session = createPlaySession({ id: "adaptive-e2e", dailyId: "fixture", contentVersionId: "v6", anonymousDeviceId: "device", nodeIds: content.JUDGE_RUBRIC.nodes.map(n => n.id) });
    let judgeCalls = 0;
    let revealReads = 0;
    const judge: JudgePort = { evaluate: async input => ({
      verdict: { answerType: "REASONING", ambiguity: "NONE", nodes: input.rubric.nodes.map(node => input.currentAnswer === full
        ? { nodeId: node.id, status: "DISCOVERED", evidenceText: input.currentAnswer }
        : { nodeId: node.id, status: "ABSENT" }) }, attempts: [],
    }) };
    const payload = () => ({ daily: { id: "fixture", canonicalDate: "2099-01-02", sequenceNumber: 999998, label: content.PUBLIC_PLAY.label, estimatedMinutes: 3, scenario: content.PUBLIC_PLAY.scenario, question: content.PUBLIC_PLAY.question }, session: toPublicSessionView(session, content.SERVER_POLICY) });
    await page.route("**/api/play-sessions/adaptive-e2e**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/answers")) {
        const text = (request.postDataJSON() as { thought: string }).thought;
        expect(session.status).toBe("THINKING");
        expect(session.turnCount).toBeLessThan(2);
        const execution = await judge.evaluate({ rubric: content.JUDGE_RUBRIC, currentAnswer: text, priorConfirmedState: session.discoveries });
        judgeCalls++;
        const thought = { id: `a${judgeCalls}`, turn: session.turnCount + 1, stage: session.stage, text };
        const result = applyJudgeVerdict(beginEvaluation(session, thought), validateJudgeVerdict(execution.verdict, content.JUDGE_RUBRIC, text), content.SERVER_POLICY);
        session = { ...result.session, stateVersion: session.stateVersion + 2 };
        return route.fulfill({ json: { outcome: result.outcome, session: payload().session } });
      }
      if (path.endsWith("/reveal")) {
        expect(session.turnCount).toBe(2);
        if (request.method() === "POST") { session = completeReveal(session); return route.fulfill({ json: { session: payload().session } }); }
        revealReads++;
        return route.fulfill({ json: { reveal: { ...content.REVEAL_CONTENT, discoveryOutcome: "UNVERIFIED_REVEAL", substantialGuidanceUsed: false } } });
      }
      return route.fulfill({ json: payload() });
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/play/adaptive-e2e");
    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    await expect(page.getByRole("button", { name: "원래 통찰 공개하기" })).toHaveCount(0);
    await input.fill(first);
    await page.getByRole("button", { name: "생각 제출하기" }).click();
    await expect(input).toHaveValue("");
    await expect(page.getByText(session.guidance.at(-1)?.text ?? "", { exact: true })).toBeVisible();
    await expect(input).toBeVisible();
    await expect(page.getByRole("button", { name: "원래 통찰 공개하기" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(session.guidance.at(-1)!.text, { exact: true })).toBeVisible();
    await input.fill(full);
    await page.getByRole("button", { name: "생각 제출하기" }).click();
    const revealButton = page.getByRole("button", { name: "원래 통찰 공개하기" });
    await expect(revealButton).toBeVisible();
    await expect(input).toHaveCount(0);
    await expect(page.getByText(session.guidance.at(-1)!.text, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/play\/adaptive-e2e$/);
    expect(judgeCalls).toBe(2);
    expect(revealReads).toBe(0);
    expect(session).toMatchObject({ status: "REVEAL_READY", turnCount: 2 });
    await page.reload();
    await expect(revealButton).toBeVisible();
    await expect(input).toHaveCount(0);
    expect(revealReads).toBe(0);
    expect(await page.locator("main").innerText()).not.toMatch(/Conway|Melvin|1968|콘웨이/);
    await revealButton.click();
    await expect(page).toHaveURL(/\/result\/adaptive-e2e$/, { timeout: 10_000 });
    expect(revealReads).toBeGreaterThan(0);
    expect(session.status).toBe("REVEALED");
    expect(judgeCalls).toBe(2);
  });
}
