import type { TranscriptEntry } from "../domain/visit";

interface TranscriptProps {
  entries: TranscriptEntry[];
  compact?: boolean;
}

const speakerLabels: Record<TranscriptEntry["speaker"], string> = {
  ai: "AI",
  visitor: "来訪者",
};

export const Transcript = ({ entries, compact = false }: TranscriptProps) => (
  <div className={`transcript${compact ? " transcript--compact" : ""}`} aria-live="polite">
    {entries.map((entry) => (
      <div className={`transcript__row transcript__row--${entry.speaker}`} key={entry.id}>
        <span className="transcript__speaker">{speakerLabels[entry.speaker]}</span>
        <p>{entry.text}</p>
      </div>
    ))}
  </div>
);
