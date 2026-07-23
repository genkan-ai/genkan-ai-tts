import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { VisitEvent } from "../../src/domain/events";
import type {
  AutomatedOutcome,
  ResidentAutomationSettings,
  ResidentProfile,
  VisitSession,
} from "../../src/domain/visit";

interface VisitRow {
  data: string;
}

interface EventRow {
  data: string;
}

interface SettingsRow {
  data: string;
}

const defaultSettings = (updatedAt = new Date(0).toISOString()): ResidentAutomationSettings => ({
  deliveryPolicy: "notify_only",
  speechVoice: "female",
  updatedAt,
});

const defaultProfile = (updatedAt = new Date(0).toISOString()): ResidentProfile => ({
  householdName: "",
  residentNames: [],
  updatedAt,
});

const normalizeVisit = (raw: unknown): VisitSession => {
  const legacy = raw as Omit<VisitSession, "status"> & {
    status: VisitSession["status"] | "awaiting_resident";
    residentDecision?: "respond" | "decline" | "review_later";
  };
  if (legacy.status === "awaiting_resident") {
    const outcome: AutomatedOutcome =
      legacy.residentDecision === "decline" ? "declined" : "notified";
    legacy.status = "completed";
    legacy.endedAt ??= legacy.startedAt;
    legacy.automatedOutcome ??= outcome;
    if (legacy.summary) {
      legacy.summary.automatedOutcome ??= outcome;
      legacy.summary.completionReason ??= "conversation_complete";
    }
  }
  delete legacy.residentDecision;
  return legacy as VisitSession;
};

export class SqliteStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(path.dirname(databasePath), { recursive: true });
    }
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS visits (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS visit_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resident_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resident_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_visits_started_at ON visits(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_session ON visit_events(session_id, occurred_at);
    `);
  }

  saveVisit(session: VisitSession, retentionDays: number): void {
    const expiresAt = new Date(Date.now() + retentionDays * 86_400_000).toISOString();
    this.database
      .prepare(`
        INSERT INTO visits (id, started_at, expires_at, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          started_at = excluded.started_at,
          expires_at = excluded.expires_at,
          data = excluded.data
      `)
      .run(session.id, session.startedAt, expiresAt, JSON.stringify(session));
  }

  findVisit(id: string): VisitSession | undefined {
    const row = this.database.prepare("SELECT data FROM visits WHERE id = ?").get(id) as
      | VisitRow
      | undefined;
    return row ? normalizeVisit(JSON.parse(row.data)) : undefined;
  }

  listVisits(): VisitSession[] {
    const rows = this.database
      .prepare("SELECT data FROM visits ORDER BY started_at DESC")
      .all() as unknown as VisitRow[];
    return rows.map((row) => normalizeVisit(JSON.parse(row.data)));
  }

  saveEvent(event: VisitEvent): void {
    this.database
      .prepare(`
        INSERT OR REPLACE INTO visit_events (id, session_id, occurred_at, data)
        VALUES (?, ?, ?, ?)
      `)
      .run(event.id, event.sessionId, event.occurredAt, JSON.stringify(event));
  }

  listEvents(sessionId?: string): VisitEvent[] {
    const rows = (sessionId
      ? this.database
          .prepare("SELECT data FROM visit_events WHERE session_id = ? ORDER BY occurred_at")
          .all(sessionId)
      : this.database
          .prepare("SELECT data FROM visit_events ORDER BY occurred_at")
          .all()) as unknown as EventRow[];
    return rows
      .map((row) => JSON.parse(row.data) as { type: string })
      .filter((event) => event.type !== "resident.decision_recorded") as VisitEvent[];
  }

  getResidentSettings(): ResidentAutomationSettings {
    const row = this.database.prepare("SELECT data FROM resident_settings WHERE id = 1").get() as
      | SettingsRow
      | undefined;
    if (!row) return defaultSettings();
    const settings = JSON.parse(row.data) as Partial<ResidentAutomationSettings>;
    return {
      deliveryPolicy: settings.deliveryPolicy ?? "notify_only",
      speechVoice: settings.speechVoice === "male" ? "male" : "female",
      updatedAt:
        typeof settings.updatedAt === "string" ? settings.updatedAt : new Date(0).toISOString(),
    };
  }

  saveResidentSettings(settings: ResidentAutomationSettings): void {
    this.database
      .prepare(`
        INSERT INTO resident_settings (id, updated_at, data)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          updated_at = excluded.updated_at,
          data = excluded.data
      `)
      .run(settings.updatedAt, JSON.stringify(settings));
  }

  getResidentProfile(): ResidentProfile {
    const row = this.database.prepare("SELECT data FROM resident_profile WHERE id = 1").get() as
      | SettingsRow
      | undefined;
    if (!row) return defaultProfile();
    const profile = JSON.parse(row.data) as Partial<ResidentProfile>;
    return {
      householdName: typeof profile.householdName === "string" ? profile.householdName : "",
      residentNames: Array.isArray(profile.residentNames)
        ? profile.residentNames.filter((name): name is string => typeof name === "string")
        : [],
      updatedAt:
        typeof profile.updatedAt === "string" ? profile.updatedAt : new Date(0).toISOString(),
    };
  }

  saveResidentProfile(profile: ResidentProfile): void {
    this.database
      .prepare(`
        INSERT INTO resident_profile (id, updated_at, data)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          updated_at = excluded.updated_at,
          data = excluded.data
      `)
      .run(profile.updatedAt, JSON.stringify(profile));
  }

  deleteExpired(now = new Date()): number {
    const expiredIds = this.database
      .prepare("SELECT id FROM visits WHERE expires_at < ?")
      .all(now.toISOString()) as unknown as Array<{ id: string }>;
    const deleteEvents = this.database.prepare("DELETE FROM visit_events WHERE session_id = ?");
    for (const row of expiredIds) {
      deleteEvents.run(row.id);
    }
    this.database.prepare("DELETE FROM visits WHERE expires_at < ?").run(now.toISOString());
    return expiredIds.length;
  }

  health(): boolean {
    const row = this.database.prepare("SELECT 1 AS ok").get() as { ok?: number } | undefined;
    return row?.ok === 1;
  }

  close(): void {
    this.database.close();
  }
}
