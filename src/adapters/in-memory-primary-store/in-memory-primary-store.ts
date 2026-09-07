import type { PlaySession } from "@/domain/play/session";
import type { PrimaryStorePort } from "@/ports/primary-store";

export class InMemoryPrimaryStore implements PrimaryStorePort {
  private readonly sessions = new Map<string, PlaySession>();

  async getSession(id: string) {
    return this.sessions.get(id);
  }

  async saveSession(session: PlaySession) {
    this.sessions.set(session.id, session);
  }
}
