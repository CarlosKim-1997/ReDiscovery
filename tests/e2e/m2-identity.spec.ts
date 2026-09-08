import { expect,test } from "@playwright/test";

test("anonymous identity is HttpOnly and owns exactly one current Official session",async({browser})=>{
  const a=await browser.newContext();const pageA=await a.newPage();
  const dailyResponse=await pageA.request.get("/api/daily");expect(dailyResponse.ok()).toBe(true);
  const cookie=(await a.cookies()).find(c=>c.name==="g1_device");expect(cookie).toMatchObject({httpOnly:true,sameSite:"Lax",path:"/"});
  const first=await (await pageA.request.post("/api/play-sessions")).json();const second=await (await pageA.request.post("/api/play-sessions")).json();expect(second.session.id).toBe(first.session.id);
  const b=await browser.newContext();const pageB=await b.newPage();const other=await (await pageB.request.post("/api/play-sessions")).json();expect(other.session.id).not.toBe(first.session.id);
  expect((await pageB.request.get(`/api/play-sessions/${first.session.id}`)).status()).toBe(404);
  expect((await pageB.request.post(`/api/play-sessions/${first.session.id}/lock`)).status()).toBe(404);
  const c=await browser.newContext();await c.addCookies([{name:"g1_device",value:"malformed-or-unknown",url:"http://127.0.0.1:3100"}]);const pageC=await c.newPage();const fresh=await (await pageC.request.post("/api/play-sessions")).json();expect(fresh.session.id).not.toBe(first.session.id);
  await a.close();await b.close();await c.close();
});

test("browser clock disagreement cannot select another Daily",async({page})=>{
  const serverDaily=(await (await page.request.get("/api/daily")).json()).daily.canonicalDate;
  await page.addInitScript(()=>{const NativeDate=Date;class AlteredDate extends NativeDate{constructor(...args:ConstructorParameters<typeof Date>){super(...(args.length?args:["2035-01-01T00:00:00Z"] as ConstructorParameters<typeof Date>));}static now(){return new NativeDate("2035-01-01T00:00:00Z").valueOf();}};Object.defineProperty(window,"Date",{value:AlteredDate});});
  const response=await page.request.get("/api/daily");const selected=(await response.json()).daily.canonicalDate;expect(selected).toBe(serverDaily);expect(selected).not.toBe("2035-01-01");
});
