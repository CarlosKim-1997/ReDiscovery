import type { ContentVersion, PublicPlay } from "@/domain/content/schema";
import type { PlaySession, SubmittedThought } from "@/domain/play/session";

export interface DailyRecord {
  readonly id: string;
  readonly canonicalDate: string;
  readonly sequenceNumber: number;
  readonly releaseAt: Date;
  readonly contentVersionId: string;
  readonly publicPlay: PublicPlay;
}

export interface PrimaryStorePort {
  resolveDaily(at: Date): Promise<DailyRecord | undefined>;
  getDaily(id: string): Promise<DailyRecord | undefined>;
  getContentVersion(id: string): Promise<ContentVersion | undefined>;
  findActiveDevice(tokenHash: string): Promise<{ id: string } | undefined>;
  createDevice(tokenHash: string): Promise<{ id: string }>;
  touchDevice(id: string): Promise<void>;
  startOfficialSession(deviceId: string, daily: DailyRecord, nodeIds: readonly string[]): Promise<PlaySession>;
  getOwnedSession(id: string, deviceId: string): Promise<PlaySession | undefined>;
  saveAnswerTransition(expectedVersion: number, answer: SubmittedThought, session: PlaySession): Promise<boolean>;
  saveTransition(expectedVersion: number, session: PlaySession): Promise<boolean>;
  completeReveal(expectedVersion: number, session: PlaySession): Promise<boolean>;
}
