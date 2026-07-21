import type { EventBus, EventListener } from "../application/contracts";
import type { VisitEvent, VisitEventType } from "../domain/events";

export class InMemoryEventBus implements EventBus {
  private readonly events: VisitEvent[] = [];
  private readonly listeners = new Set<EventListener>();

  publish<T extends VisitEventType>(event: VisitEvent<T>): void {
    this.events.push(event as VisitEvent);
    for (const listener of this.listeners) {
      listener(event as VisitEvent);
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(sessionId?: string): VisitEvent[] {
    const selected = sessionId
      ? this.events.filter((event) => event.sessionId === sessionId)
      : this.events;
    return [...selected];
  }
}
