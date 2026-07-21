import type { VisitRepository } from "../application/contracts";
import type { VisitSession } from "../domain/visit";

const cloneSession = (session: VisitSession): VisitSession => structuredClone(session);

export class InMemoryVisitRepository implements VisitRepository {
  private readonly sessions = new Map<string, VisitSession>();

  save(session: VisitSession): void {
    this.sessions.set(session.id, cloneSession(session));
  }

  findById(sessionId: string): VisitSession | undefined {
    const session = this.sessions.get(sessionId);
    return session ? cloneSession(session) : undefined;
  }

  list(): VisitSession[] {
    return [...this.sessions.values()]
      .map(cloneSession)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
}
