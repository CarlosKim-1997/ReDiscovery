import { cookies } from "next/headers";
import { resolveDevice } from "@/application/play/daily-game";
import { services } from "@/server/container";
import { config } from "@/server/container";

export const DEVICE_COOKIE = "g1_device";
export async function currentDevice(){
  const jar=await cookies();const resolved=await resolveDevice(services,jar.get(DEVICE_COOKIE)?.value);
  if(resolved.token)jar.set(DEVICE_COOKIE,resolved.token,{httpOnly:true,sameSite:"lax",path:"/",secure:config.APP_ENV==="production",maxAge:60*60*24*365});
  return resolved.device;
}
