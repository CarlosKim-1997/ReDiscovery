import { cookies } from "next/headers";
import { ensureDevice, resolveExistingDevice } from "@/application/play/daily-game";
import { services } from "@/server/container";
import { config } from "@/server/container";

export const DEVICE_COOKIE = "g1_device";
export async function resolveCurrentDevice() {
  const jar = await cookies();
  return resolveExistingDevice(services, jar.get(DEVICE_COOKIE)?.value);
}
// Existing-session authorization convenience: undefined means no usable proof.
export async function currentDevice() {
  const resolution = await resolveCurrentDevice();
  return resolution.kind === "ACTIVE" ? resolution.device : undefined;
}
export async function ensureCurrentDevice(){
  const jar=await cookies();const resolved=await ensureDevice(services,jar.get(DEVICE_COOKIE)?.value);
  if(resolved.token)jar.set(DEVICE_COOKIE,resolved.token,{httpOnly:true,sameSite:"lax",path:"/",secure:config.APP_ENV==="production",maxAge:60*60*24*365});
  return resolved.device;
}
