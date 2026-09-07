import type { PlaySession } from "@/domain/play/session";

export interface PrimaryStorePort {
  getSession(id: string): Promise<PlaySession | undefined>;
  saveSession(session: PlaySession): Promise<void>;
}
