import { randomUUID } from "node:crypto";

interface AudioArtifact {
  data: Uint8Array;
  mimeType: string;
  expiresAt: number;
}

export class AudioArtifactStore {
  private readonly artifacts = new Map<string, AudioArtifact>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60_000) {
    this.ttlMs = ttlMs;
  }

  put(data: Uint8Array, mimeType: string): string {
    this.cleanup();
    const id = randomUUID();
    this.artifacts.set(id, {
      data,
      mimeType,
      expiresAt: Date.now() + this.ttlMs,
    });
    return id;
  }

  get(id: string): AudioArtifact | undefined {
    this.cleanup();
    return this.artifacts.get(id);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, artifact] of this.artifacts) {
      if (artifact.expiresAt <= now) {
        this.artifacts.delete(id);
      }
    }
  }
}
