import { Activity, ChevronDown } from "lucide-react";
import { eventLabels, type VisitEvent } from "../domain/events";

interface EventTimelineProps {
  events: VisitEvent[];
}

export const EventTimeline = ({ events }: EventTimelineProps) => (
  <details className="event-timeline">
    <summary>
      <span className="event-timeline__title">
        <Activity size={17} aria-hidden="true" />
        開発用イベントログ
      </span>
      <span className="event-timeline__count">{events.length}件</span>
      <ChevronDown className="event-timeline__chevron" size={17} aria-hidden="true" />
    </summary>
    <ol>
      {events.map((event) => (
        <li key={event.id}>
          <span className="event-timeline__index" aria-hidden="true" />
          <span>{eventLabels[event.type]}</span>
          <time dateTime={event.occurredAt}>
            {new Intl.DateTimeFormat("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date(event.occurredAt))}
          </time>
        </li>
      ))}
    </ol>
  </details>
);
