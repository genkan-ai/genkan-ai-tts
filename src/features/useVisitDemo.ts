import { useCallback, useEffect, useState } from "react";
import type { DemoRuntime } from "../application/createDemoRuntime";
import type { VisitEvent } from "../domain/events";
import type { VisitSession } from "../domain/visit";

export interface VisitDemoState {
  activeSession?: VisitSession;
  events: VisitEvent[];
  history: VisitSession[];
}

const readState = (runtime: DemoRuntime, activeSessionId?: string): VisitDemoState => ({
  activeSession: activeSessionId
    ? runtime.orchestrator.getSession(activeSessionId)
    : runtime.orchestrator.listSessions()[0],
  events: runtime.orchestrator.listEvents(activeSessionId),
  history: runtime.orchestrator.listSessions(),
});

export const useVisitDemo = (runtime: DemoRuntime) => {
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [state, setState] = useState<VisitDemoState>(() => readState(runtime));

  const refresh = useCallback(
    (sessionId?: string) => {
      setState(readState(runtime, sessionId ?? activeSessionId));
    },
    [activeSessionId, runtime],
  );

  useEffect(() => runtime.eventBus.subscribe(() => refresh()), [refresh, runtime.eventBus]);

  const startVisit = useCallback(() => {
    const session = runtime.orchestrator.startVisit();
    setActiveSessionId(session.id);
    setState(readState(runtime, session.id));
  }, [runtime]);

  const sendVisitorMessage = useCallback(
    (message: string) => {
      if (!activeSessionId) {
        return;
      }
      runtime.orchestrator.receiveVisitorUtterance(activeSessionId, message);
      setState(readState(runtime, activeSessionId));
    },
    [activeSessionId, runtime],
  );

  const endVisit = useCallback(() => {
    if (!activeSessionId) {
      return;
    }
    runtime.orchestrator.endByVisitor(activeSessionId);
    setState(readState(runtime, activeSessionId));
  }, [activeSessionId, runtime]);

  const reset = useCallback(() => {
    setActiveSessionId(undefined);
    setState(readState(runtime));
  }, [runtime]);

  return {
    ...state,
    startVisit,
    sendVisitorMessage,
    endVisit,
    reset,
  };
};
