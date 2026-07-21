import { InMemoryEventBus } from "../adapters/inMemoryEventBus";
import { InMemoryNotificationPort } from "../adapters/inMemoryNotificationPort";
import { InMemoryVisitRepository } from "../adapters/inMemoryVisitRepository";
import { MockConversationService } from "../adapters/mockConversationService";
import { VisitOrchestrator } from "./visitOrchestrator";

export interface DemoRuntime {
  eventBus: InMemoryEventBus;
  notificationPort: InMemoryNotificationPort;
  orchestrator: VisitOrchestrator;
  repository: InMemoryVisitRepository;
}

export const createDemoRuntime = (): DemoRuntime => {
  const eventBus = new InMemoryEventBus();
  const notificationPort = new InMemoryNotificationPort();
  const repository = new InMemoryVisitRepository();
  const orchestrator = new VisitOrchestrator({
    conversationService: new MockConversationService(),
    eventBus,
    notificationPort,
    repository,
  });

  return { eventBus, notificationPort, orchestrator, repository };
};
