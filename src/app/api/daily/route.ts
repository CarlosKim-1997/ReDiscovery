import { currentDaily } from "@/application/play/daily-game";
import { services } from "@/server/container";
export const runtime="nodejs";
export async function GET(){const d=await currentDaily(services);return Response.json(d?{daily:{id:d.id,canonicalDate:d.canonicalDate,sequenceNumber:d.sequenceNumber,label:d.publicPlay.label,estimatedMinutes:d.publicPlay.estimated_minutes,scenario:d.publicPlay.scenario,question:d.publicPlay.question}}:{error:"DAILY_NOT_FOUND"},{status:d?200:404,headers:{"Cache-Control":"no-store"}});}
