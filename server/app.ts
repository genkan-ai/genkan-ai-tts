import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import type {
  EndVisitRequest,
  HealthResponse,
  ResidentProfileResponse,
  ResidentSettingsResponse,
  TextTurnRequest,
  UpdateResidentProfileRequest,
  UpdateResidentSettingsRequest,
  VisitDetailResponse,
  VisitListResponse,
  VisitMutationResponse,
} from "../src/domain/api";
import {
  deliveryPolicies,
  RESIDENT_PROFILE_MAX_NAME_LENGTH,
  RESIDENT_PROFILE_MAX_RESIDENTS,
  type VisitEndReason,
} from "../src/domain/visit";
import type { SqliteStore } from "./adapters/sqliteStore";
import type { AppConfig } from "./config";
import type { AudioArtifactStore } from "./services/audioArtifactStore";
import { probeAudioDuration, validateAudioDuration } from "./services/audioDuration";
import { type VisitService, VisitServiceError } from "./services/visitService";

const allowedAudioTypes = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
]);

const audioExtension = (mimeType: string): string => {
  if (mimeType === "audio/webm") return "webm";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/ogg") return "ogg";
  return "wav";
};

const containsControlCharacters = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });

const normalizeResidentProfile = (
  body: UpdateResidentProfileRequest | undefined,
): UpdateResidentProfileRequest | undefined => {
  if (!body || typeof body.householdName !== "string" || !Array.isArray(body.residentNames)) {
    return undefined;
  }
  const householdName = body.householdName.trim();
  if (
    householdName.length > RESIDENT_PROFILE_MAX_NAME_LENGTH ||
    containsControlCharacters(householdName)
  ) {
    return undefined;
  }
  if (
    body.residentNames.length > RESIDENT_PROFILE_MAX_RESIDENTS ||
    body.residentNames.some((name) => typeof name !== "string")
  ) {
    return undefined;
  }
  const residentNames = [...new Set(body.residentNames.map((name) => name.trim()))].filter(Boolean);
  if (
    residentNames.some(
      (name) => name.length > RESIDENT_PROFILE_MAX_NAME_LENGTH || containsControlCharacters(name),
    )
  ) {
    return undefined;
  }
  return { householdName, residentNames };
};

export interface CreateAppOptions {
  config: AppConfig;
  visitService: VisitService;
  store: SqliteStore;
  audioArtifacts: AudioArtifactStore;
  providerHealth: {
    whisper: () => Promise<boolean>;
    conversation: () => Promise<boolean>;
    speechSynthesis: () => Promise<boolean>;
  };
  audioDurationProbe?: (audio: Uint8Array) => Promise<number>;
  logger?: boolean;
}

export const createApp = async (options: CreateAppOptions): Promise<FastifyInstance> => {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 5 * 1024 * 1024 });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 4 },
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof VisitServiceError) {
      return reply.status(error.statusCode).send({ error: error.message, code: error.code });
    }
    if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.status(413).send({ error: "Audio file is too large", code: "AUDIO_TOO_LARGE" });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "Unexpected server error", code: "INTERNAL_ERROR" });
  });

  app.post("/api/visits", async (_request, reply) => {
    const result = await options.visitService.startVisit();
    return reply.status(201).send(result satisfies VisitMutationResponse);
  });

  app.post<{ Params: { id: string } }>("/api/visits/:id/turns", async (request, reply) => {
    if (request.isMultipart()) {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "Audio file is required", code: "AUDIO_REQUIRED" });
      }
      const mimeType = file.mimetype.split(";")[0] ?? file.mimetype;
      if (!allowedAudioTypes.has(mimeType)) {
        return reply
          .status(415)
          .send({ error: `Unsupported audio type: ${mimeType}`, code: "UNSUPPORTED_AUDIO" });
      }
      const audio = await file.toBuffer();
      try {
        const durationResult = await validateAudioDuration(
          audio,
          options.audioDurationProbe ?? probeAudioDuration,
        );
        if (durationResult === "too-long") {
          return reply
            .status(413)
            .send({ error: "Audio must be 20 seconds or shorter", code: "AUDIO_TOO_LONG" });
        }
      } catch (error) {
        request.log.warn(
          { err: error, audioBytes: audio.byteLength, mimeType },
          "Audio duration validation failed",
        );
        return reply
          .status(422)
          .send({ error: "Audio duration could not be validated", code: "INVALID_AUDIO" });
      }
      const result = await options.visitService.receiveTurn(request.params.id, {
        audio: {
          audio,
          fileName: `utterance.${audioExtension(mimeType)}`,
          mimeType,
        },
      });
      return reply.send(result satisfies VisitMutationResponse);
    }

    const body = request.body as TextTurnRequest | undefined;
    const result = await options.visitService.receiveTurn(request.params.id, {
      text: body?.text,
    });
    return reply.send(result satisfies VisitMutationResponse);
  });

  app.post<{ Params: { id: string }; Body: Partial<EndVisitRequest> }>(
    "/api/visits/:id/end",
    async (request, reply) => {
      const reason = request.body?.reason ?? "visitor_ended";
      if (!["visitor_ended", "inactivity"].includes(reason)) {
        return reply.status(400).send({
          error: "End reason must be visitor_ended or inactivity",
          code: "INVALID_END_REASON",
        });
      }
      return reply.send(
        await options.visitService.endVisit(request.params.id, reason as VisitEndReason),
      );
    },
  );

  app.get("/api/visits", async (_request, reply) => {
    return reply.send({ visits: options.visitService.listVisits() } satisfies VisitListResponse);
  });

  app.get<{ Params: { id: string } }>("/api/visits/:id", async (request, reply) => {
    const session = options.visitService.getVisit(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: "Visit not found", code: "VISIT_NOT_FOUND" });
    }
    return reply.send({
      session,
      events: options.visitService.listEvents(request.params.id),
    } satisfies VisitDetailResponse);
  });

  app.get("/api/resident/visits", async (_request, reply) => {
    return reply.send({
      visits: options.visitService.listResidentVisits(),
    } satisfies VisitListResponse);
  });

  app.get<{ Params: { id: string } }>("/api/resident/visits/:id", async (request, reply) => {
    const session = options.visitService.getResidentVisit(request.params.id);
    if (!session) {
      return reply
        .status(404)
        .send({ error: "Completed visit not found", code: "VISIT_NOT_FOUND" });
    }
    return reply.send({
      session,
      events: options.visitService.listEvents(request.params.id),
    } satisfies VisitDetailResponse);
  });

  app.get("/api/resident/settings", async (_request, reply) => {
    return reply.send({
      settings: options.visitService.getResidentSettings(),
    } satisfies ResidentSettingsResponse);
  });

  app.put("/api/resident/settings", async (request, reply) => {
    const body = request.body as UpdateResidentSettingsRequest | undefined;
    if (!body || !deliveryPolicies.includes(body.deliveryPolicy)) {
      return reply.status(400).send({
        error: "Unsupported delivery policy",
        code: "INVALID_DELIVERY_POLICY",
      });
    }
    return reply.send({
      settings: options.visitService.updateResidentSettings(body.deliveryPolicy),
    } satisfies ResidentSettingsResponse);
  });

  app.get("/api/resident/profile", async (_request, reply) => {
    return reply.send({
      profile: options.visitService.getResidentProfile(),
    } satisfies ResidentProfileResponse);
  });

  app.put("/api/resident/profile", async (request, reply) => {
    const profile = normalizeResidentProfile(
      request.body as UpdateResidentProfileRequest | undefined,
    );
    if (!profile) {
      return reply.status(400).send({
        error: `Household and resident names must be ${RESIDENT_PROFILE_MAX_NAME_LENGTH} characters or fewer; up to ${RESIDENT_PROFILE_MAX_RESIDENTS} residents are allowed`,
        code: "INVALID_RESIDENT_PROFILE",
      });
    }
    return reply.send({
      profile: options.visitService.updateResidentProfile(
        profile.householdName,
        profile.residentNames,
      ),
    } satisfies ResidentProfileResponse);
  });

  app.get<{ Querystring: { sessionId?: string } }>("/api/events", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    let unsubscribe: () => void = () => undefined;
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
    };
    reply.raw.on("error", cleanup);
    reply.raw.on("close", cleanup);
    request.raw.on("aborted", cleanup);

    const writeEvent = (event: string, data: unknown) => {
      if (closed || reply.raw.destroyed || reply.raw.writableEnded) return;
      try {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        cleanup();
      }
    };

    writeEvent("connected", {});
    const sessionId = request.query.sessionId;
    unsubscribe = options.visitService.subscribe((event) => {
      if (!sessionId || event.sessionId === sessionId) writeEvent("visit", event);
    });
    if (closed) unsubscribe();
  });

  app.get("/api/resident/events", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    let unsubscribe: () => void = () => undefined;
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
    };
    reply.raw.on("error", cleanup);
    reply.raw.on("close", cleanup);
    request.raw.on("aborted", cleanup);
    const writeEvent = (event: string, data: unknown) => {
      if (closed || reply.raw.destroyed || reply.raw.writableEnded) return;
      try {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        cleanup();
      }
    };
    writeEvent("connected", {});
    unsubscribe = options.visitService.subscribe((event) => {
      if (event.type === "notification.requested") writeEvent("notification", event);
    });
    if (closed) unsubscribe();
  });

  app.get<{ Params: { id: string } }>("/api/audio/:id", async (request, reply) => {
    const artifact = options.audioArtifacts.get(request.params.id);
    if (!artifact) {
      return reply.status(404).send({ error: "Audio expired", code: "AUDIO_EXPIRED" });
    }
    reply.header("Content-Type", artifact.mimeType);
    reply.header("Cache-Control", "no-store");
    return reply.send(Buffer.from(artifact.data));
  });

  app.get("/api/health", async (_request, reply) => {
    const [whisper, conversation, speechSynthesis] = await Promise.all([
      options.providerHealth.whisper(),
      options.providerHealth.conversation(),
      options.providerHealth.speechSynthesis(),
    ]);
    const services = {
      app: true,
      database: options.store.health(),
      whisper,
      conversation,
      speechSynthesis,
    };
    const result: HealthResponse = {
      status: services.database && services.whisper && services.conversation ? "ok" : "degraded",
      services,
    };
    return reply.send(result);
  });

  app.addHook("onClose", async () => {
    options.visitService.close();
    options.store.close();
  });

  return app;
};
