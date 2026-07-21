import type { NotificationPort } from "../application/contracts";
import type { VisitSummary } from "../domain/visit";

export interface ResidentNotification {
  sessionId: string;
  summary: VisitSummary;
}

export class InMemoryNotificationPort implements NotificationPort {
  private readonly notifications: ResidentNotification[] = [];

  notify(sessionId: string, summary: VisitSummary): void {
    if (this.notifications.some((notification) => notification.sessionId === sessionId)) {
      return;
    }
    this.notifications.push({ sessionId, summary: structuredClone(summary) });
  }

  list(): ResidentNotification[] {
    return structuredClone(this.notifications);
  }
}
