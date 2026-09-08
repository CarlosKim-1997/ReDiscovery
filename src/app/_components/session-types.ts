import type { PublicSessionView } from "@/application/play/session-view";
export interface PublicDaily { readonly id:string;readonly canonicalDate:string;readonly sequenceNumber:number;readonly label:string;readonly estimatedMinutes:number;readonly scenario:string;readonly question:string }
export interface DailyPayload { readonly daily:PublicDaily;readonly session:PublicSessionView }
export interface RevealView { readonly year:string;readonly person:string;readonly theory:string;readonly explanation:string;readonly representativeThought:string;readonly substantialGuidanceUsed:boolean;readonly connection:string }
