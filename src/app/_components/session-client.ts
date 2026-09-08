import type { DailyPayload } from "./session-types";

export async function loadSession(id:string):Promise<DailyPayload>{
  const response=await fetch(`/api/play-sessions/${id}`,{cache:"no-store"});
  if(!response.ok)throw new Error("SESSION_LOAD_FAILED");
  return response.json() as Promise<DailyPayload>;
}
