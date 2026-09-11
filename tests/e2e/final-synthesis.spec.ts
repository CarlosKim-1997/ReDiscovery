import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { FINAL_SYNTHESIS_FAKE_FIXTURES } from "../../src/adapters/fake-final-synthesis-verifier/fake-final-synthesis-verifier";
import { FINAL_SYNTHESIS_ENTRY_FAKE_ANSWER } from "../../src/adapters/fake-judge/final-synthesis-entry-fake-judge";
import { assertE2eFixtureSafety } from "../support/e2e-fixture-safety";

const databaseUrl = assertE2eFixtureSafety(process.env);
const fixtureDate = "2099-01-01";
const priorThought = "팀 경계가 소통을 가르고 설계 결정이 그 경계를 따라 모여 결과물 구조도 닮는다고 생각했다.";

async function openFixture(page: Page, initialState: "THINKING" | "SYNTHESIZING") {
  const sql = postgres(databaseUrl, { max: 1 });
  const token = randomUUID(); const tokenHash = createHash("sha256").update(token).digest("hex");
  const deviceId = randomUUID(); const sessionId = randomUUID(); const answerId=randomUUID();
  try {
    await sql.begin(async transaction => {
      const [content] = await transaction<{ id: string }[]>`SELECT v.id FROM content_versions v JOIN content_items i ON i.id=v.content_item_id WHERE i.slug='conway-law' AND v.version=5`;
      if (!content) throw new Error("CONWAY_V5_NOT_SEEDED");
      await transaction`INSERT INTO daily_schedule(canonical_date,sequence_number,release_at,content_version_id) VALUES(${fixtureDate},999999,${`${fixtureDate}T00:00:00+09:00`},${content.id}) ON CONFLICT DO NOTHING`;
      const [daily] = await transaction<{ id: string }[]>`SELECT id FROM daily_schedule WHERE canonical_date=${fixtureDate} AND content_version_id=${content.id}`;
      if (!daily) throw new Error("V5_E2E_DAILY_CONFLICT");
      await transaction`INSERT INTO anonymous_devices(id,token_hash) VALUES(${deviceId},${tokenHash})`;
      if(initialState==="THINKING"){
        await transaction`INSERT INTO play_sessions(id,daily_id,content_version_id,anonymous_device_id,attempt_type,status,stage) VALUES(${sessionId},${daily.id},${content.id},${deviceId},'OFFICIAL','THINKING','BLIND')`;
        await transaction`INSERT INTO node_discoveries(session_id,node_id,status) SELECT ${sessionId},node->>'id','ABSENT' FROM content_versions v CROSS JOIN LATERAL jsonb_array_elements(v.judge_rubric->'nodes') node WHERE v.id=${content.id}`;
      }else{
        await transaction`INSERT INTO play_sessions(id,daily_id,content_version_id,anonymous_device_id,attempt_type,status,stage,turn_count,synthesis_entry_reason,synthesis_entered_at) VALUES(${sessionId},${daily.id},${content.id},${deviceId},'OFFICIAL','SYNTHESIZING','BLIND',1,'DISCOVERY_READY',now())`;
        await transaction`INSERT INTO user_answers(id,session_id,turn,stage,text,char_count) VALUES(${answerId},${sessionId},1,'BLIND',${priorThought},${priorThought.length})`;
        await transaction`INSERT INTO node_discoveries(session_id,node_id,status,first_stage,first_answer_id,evidence_span_start,evidence_span_end) SELECT ${sessionId},node->>'id','DISCOVERED','BLIND',${answerId},0,${priorThought.length} FROM content_versions v CROSS JOIN LATERAL jsonb_array_elements(v.judge_rubric->'nodes') node WHERE v.id=${content.id}`;
      }
    });
  } finally { await sql.end(); }
  await page.context().addCookies([{ name: "g1_device", value: token, url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
  await page.goto(`/play/${sessionId}`);
  return sessionId;
}

async function openSynthesis(page:Page){const sessionId=await openFixture(page,"SYNTHESIZING");await expect(page.getByRole("heading",{name:"이제 당신이 발견한 원리를 스스로 정리해보세요."})).toBeVisible();return sessionId;}

test("parallel v5 fixture creation is idempotent across date and sequence constraints",async()=>{
  const ids=await Promise.all(Array.from({length:8},async()=>{const sql=postgres(databaseUrl,{max:1});try{return await sql.begin(async transaction=>{const [content]=await transaction<{id:string}[]>`SELECT v.id FROM content_versions v JOIN content_items i ON i.id=v.content_item_id WHERE i.slug='conway-law' AND v.version=5`;if(!content)throw new Error("CONWAY_V5_NOT_SEEDED");await transaction`INSERT INTO daily_schedule(canonical_date,sequence_number,release_at,content_version_id) VALUES(${fixtureDate},999999,${`${fixtureDate}T00:00:00+09:00`},${content.id}) ON CONFLICT DO NOTHING`;const [daily]=await transaction<{id:string}[]>`SELECT id FROM daily_schedule WHERE canonical_date=${fixtureDate} AND sequence_number=999999 AND content_version_id=${content.id}`;if(!daily)throw new Error("V5_E2E_DAILY_CONFLICT");return daily.id})}finally{await sql.end()}}));
  expect(new Set(ids).size).toBe(1);
});

async function submitSynthesis(page: Page, text: string) {
  await page.getByLabel("당신의 마지막 정리").fill(text);
  await page.getByRole("button", { name: /마지막.*정리.*제출|마지막으로 다시 정리하기/ }).click();
}

async function row(sessionId: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [session] = await sql<{ status:string;locked_at:Date|null;verified_synthesis_attempt_id:string|null;answer_count:number;attempt_count:number }[]>`
      SELECT s.status,s.locked_at,s.verified_synthesis_attempt_id,
        (SELECT count(*)::int FROM user_answers a WHERE a.session_id=s.id) answer_count,
        (SELECT count(*)::int FROM final_synthesis_attempts a WHERE a.session_id=s.id) attempt_count
      FROM play_sessions s WHERE s.id=${sessionId}`;
    return session!;
  } finally { await sql.end(); }
}

async function latestAttempt(sessionId:string){const sql=postgres(databaseUrl,{max:1});try{const [attempt]=await sql<{attempt_number:number;evaluation_generation:number;evaluation_state:string}[]>`SELECT attempt_number,evaluation_generation,evaluation_state FROM final_synthesis_attempts WHERE session_id=${sessionId} ORDER BY attempt_number DESC LIMIT 1`;return attempt!;}finally{await sql.end();}}

test("browser answer drives the real THINKING to SYNTHESIZING entry transition",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});const sessionId=await openFixture(page,"THINKING");
  const initial=await (await page.request.get(`/api/play-sessions/${sessionId}`)).json();expect(initial.session).toMatchObject({status:"THINKING",turnCount:0});
  const composer=page.getByLabel(/왜 조직이 일하는 방식/);await expect(composer).toBeVisible();await composer.fill(FINAL_SYNTHESIS_ENTRY_FAKE_ANSWER);await page.getByRole("button",{name:"생각 제출하기"}).click();
  await expect(page.getByRole("heading",{name:"이제 당신이 발견한 원리를 스스로 정리해보세요."})).toBeVisible();
  const entered=await (await page.request.get(`/api/play-sessions/${sessionId}`)).json();expect(entered.session).toMatchObject({status:"SYNTHESIZING",turnCount:1});
  await expect(page.getByRole("button",{name:"내 생각 잠그고 공개하기"})).toHaveCount(0);
  await submitSynthesis(page,FINAL_SYNTHESIS_FAKE_FIXTURES.VERIFIED);await expect(page).toHaveURL(`/result/${sessionId}`,{timeout:10_000});
  expect(await row(sessionId)).toMatchObject({status:"REVEALED",answer_count:1,attempt_count:1});
});

test("verified Final Synthesis locks, reveals, and remains separate from thinking turns", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); const sessionId = await openSynthesis(page);
  await expect(page.getByText("지금까지의 생각 1개")).toBeVisible();
  await expect(page.getByRole("button", { name: "내 생각 잠그고 공개하기" })).toHaveCount(0);
  const legacyLock=await page.request.post(`/api/play-sessions/${sessionId}/lock`);expect(legacyLock.status()).toBe(409);expect(await legacyLock.json()).toEqual({error:"FINAL_SYNTHESIS_REQUIRED"});
  await submitSynthesis(page, FINAL_SYNTHESIS_FAKE_FIXTURES.VERIFIED);
  await expect(page).toHaveURL(`/result/${sessionId}`, { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Conway's Law" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "당신이 마지막으로 정리한 생각" })).toBeVisible();
  expect(await row(sessionId)).toMatchObject({ status:"REVEALED",verified_synthesis_attempt_id:expect.any(String),locked_at:expect.any(Date),answer_count:1,attempt_count:1 });
});

test("two insufficient submissions reveal without claiming verified discovery", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); const sessionId = await openSynthesis(page);
  await submitSynthesis(page, FINAL_SYNTHESIS_FAKE_FIXTURES.INSUFFICIENT);
  await expect(page.getByText(/이 글만으로는 결론이 충분히 드러나지 않았어요/)).toBeVisible();
  await expect(page.getByText("제출 1 / 2")).toBeVisible();
  await submitSynthesis(page, FINAL_SYNTHESIS_FAKE_FIXTURES.INSUFFICIENT);
  await expect(page).toHaveURL(`/result/${sessionId}`, { timeout: 10_000 });
  await expect(page.getByText("잠금 없이 공개까지 살펴보았습니다.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /당신이.*생각/ })).toHaveCount(0);
  await expect(page.getByLabel("당신의 마지막 정리")).toHaveCount(0);
  const loaded=await (await page.request.get(`/api/play-sessions/${sessionId}`)).json();
  const third=await page.request.post(`/api/play-sessions/${sessionId}/final-synthesis`,{headers:{"Idempotency-Key":randomUUID()},data:{text:FINAL_SYNTHESIS_FAKE_FIXTURES.INSUFFICIENT,expectedStateVersion:loaded.session.stateVersion}});
  expect(third.status()).toBe(409);
  expect(await row(sessionId)).toMatchObject({ status:"REVEALED",verified_synthesis_attempt_id:null,locked_at:null,answer_count:1,attempt_count:2 });
});

test("skip permits unverified Reveal without consuming a submission", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); const sessionId = await openSynthesis(page);
  await page.getByRole("button", { name: "정리 없이 공개로 넘어가기" }).click();
  await expect(page).toHaveURL(`/result/${sessionId}`, { timeout: 10_000 });
  await expect(page.getByText("잠금 없이 공개까지 살펴보았습니다.")).toBeVisible();
  expect(await row(sessionId)).toMatchObject({ status:"REVEALED",verified_synthesis_attempt_id:null,locked_at:null,attempt_count:0 });
});

test("insufficient state and the final rewrite budget survive refresh", async ({ page }) => {
  const sessionId = await openSynthesis(page); await submitSynthesis(page, FINAL_SYNTHESIS_FAKE_FIXTURES.INSUFFICIENT);
  await expect(page.getByText("제출 1 / 2")).toBeVisible(); await page.reload();
  await expect(page).toHaveURL(`/play/${sessionId}`);
  await expect(page.getByText(/이 글만으로는 결론이 충분히 드러나지 않았어요/)).toBeVisible();
  await expect(page.getByRole("button", { name: "마지막으로 다시 정리하기" })).toBeVisible();
});

test("UTF-16 500-unit synthesis is accepted and 501 units are rejected by server authority", async ({ page }) => {
  const sessionId = await openSynthesis(page); const accepted = "😀".repeat(250);
  await page.getByLabel("당신의 마지막 정리").fill(accepted); await expect(page.getByText("500 / 500")).toBeVisible();
  await page.getByRole("button", { name: "마지막 정리 제출하기" }).click(); await expect(page.getByText("제출 1 / 2")).toBeVisible();
  const payload = await (await page.request.get(`/api/play-sessions/${sessionId}`)).json();
  const rejected = await page.request.post(`/api/play-sessions/${sessionId}/final-synthesis`, { headers:{"Idempotency-Key":randomUUID()}, data:{ text:`${accepted}a`,expectedStateVersion:payload.session.stateVersion } });
  expect(rejected.status()).toBe(400); expect(await rejected.json()).toEqual({ error:"INVALID_SYNTHESIS_TEXT" });
  expect((await row(sessionId)).attempt_count).toBe(1);
});

test("operational retry re-evaluates the same submission generation without consuming budget",async({page})=>{
  const sessionId=await openSynthesis(page);await submitSynthesis(page,FINAL_SYNTHESIS_FAKE_FIXTURES.OPERATIONAL_FAILURE);
  await expect(page.getByText(/같은 글로 다시 시도할 수 있어요/)).toBeVisible();
  await expect(page.getByRole("button",{name:"같은 글 다시 살펴보기"})).toBeVisible();
  expect(await latestAttempt(sessionId)).toEqual({attempt_number:1,evaluation_generation:1,evaluation_state:"ERROR_RECOVERABLE"});
  await page.getByRole("button",{name:"같은 글 다시 살펴보기"}).click();
  await expect(page.getByRole("button",{name:"같은 글 다시 살펴보기"})).toBeVisible();
  expect(await latestAttempt(sessionId)).toEqual({attempt_number:1,evaluation_generation:2,evaluation_state:"ERROR_RECOVERABLE"});
  expect((await row(sessionId)).attempt_count).toBe(1);
});

test("lost VERIFIED response follows recovered LOCKED state to Reveal",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});const sessionId=await openSynthesis(page);
  await page.route(/\/final-synthesis$/,async route=>{await route.fetch();await route.abort("failed");},{times:1});
  await submitSynthesis(page,FINAL_SYNTHESIS_FAKE_FIXTURES.VERIFIED);
  await expect(page).toHaveURL(`/result/${sessionId}`,{timeout:10_000});expect(await row(sessionId)).toMatchObject({status:"REVEALED",verified_synthesis_attempt_id:expect.any(String)});
});

test("lost second INSUFFICIENT response follows recovered REVEAL_READY state to Reveal",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});const sessionId=await openSynthesis(page);await submitSynthesis(page,FINAL_SYNTHESIS_FAKE_FIXTURES.INSUFFICIENT);
  await page.route(/\/final-synthesis$/,async route=>{await route.fetch();await route.abort("failed");},{times:1});
  await submitSynthesis(page,FINAL_SYNTHESIS_FAKE_FIXTURES.INSUFFICIENT);
  await expect(page).toHaveURL(`/result/${sessionId}`,{timeout:10_000});expect(await row(sessionId)).toMatchObject({status:"REVEALED",verified_synthesis_attempt_id:null,locked_at:null,attempt_count:2});
});
