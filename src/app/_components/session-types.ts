import type { PublicSessionView } from "@/application/play/session-view";
import type { reveal } from "@/application/play/daily-game";
export interface PublicDaily { readonly id:string;readonly canonicalDate:string;readonly sequenceNumber:number;readonly label:string;readonly estimatedMinutes:number;readonly scenario:string;readonly question:string }
export interface DailyPayload { readonly daily:PublicDaily;readonly session:PublicSessionView }
export type RevealView = NonNullable<Awaited<ReturnType<typeof reveal>>>;
