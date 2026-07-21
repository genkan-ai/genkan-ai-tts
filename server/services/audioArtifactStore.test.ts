// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AudioArtifactStore } from "./audioArtifactStore";

describe("AudioArtifactStore", () => {
  it("allows playback retries until the short TTL expires", () => {
    const store = new AudioArtifactStore();
    const id = store.put(new Uint8Array([1, 2, 3]), "audio/mpeg");

    expect(store.get(id)?.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(store.get(id)?.data).toEqual(new Uint8Array([1, 2, 3]));
  });
});
