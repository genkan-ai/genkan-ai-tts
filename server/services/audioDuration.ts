import { spawn } from "node:child_process";

interface FfprobePayload {
  format?: { duration?: string };
  packets?: Array<{
    pts_time?: string;
    dts_time?: string;
    duration_time?: string;
  }>;
}

const positiveNumber = (value: string | undefined): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

export const parseFfprobeDuration = (output: string): number => {
  const payload = JSON.parse(output) as FfprobePayload;
  const formatDuration = positiveNumber(payload.format?.duration);
  if (formatDuration && formatDuration > 0) return formatDuration;

  let firstTimestamp = Number.POSITIVE_INFINITY;
  let lastTimestamp = Number.NEGATIVE_INFINITY;
  for (const packet of payload.packets ?? []) {
    const timestamp = positiveNumber(packet.pts_time) ?? positiveNumber(packet.dts_time);
    if (timestamp === undefined) continue;
    const packetDuration = positiveNumber(packet.duration_time) ?? 0;
    firstTimestamp = Math.min(firstTimestamp, timestamp);
    lastTimestamp = Math.max(lastTimestamp, timestamp + packetDuration);
  }

  const packetDuration = lastTimestamp - firstTimestamp;
  if (Number.isFinite(packetDuration) && packetDuration > 0) return packetDuration;
  throw new Error("ffprobe returned an invalid duration");
};

export const probeAudioDuration = async (audio: Uint8Array): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "format=duration:packet=pts_time,dts_time,duration_time",
        "-of",
        "json",
        "pipe:0",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("ffprobe timed out"));
    }, 3_000);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.stdin.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8") || "ffprobe failed"));
        return;
      }
      try {
        resolve(parseFfprobeDuration(Buffer.concat(stdout).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(Buffer.from(audio));
  });

export const validateAudioDuration = async (
  audio: Uint8Array,
  probe: (value: Uint8Array) => Promise<number>,
  maximumSeconds = 20,
): Promise<"valid" | "too-long"> => {
  const duration = await probe(audio);
  return duration <= maximumSeconds ? "valid" : "too-long";
};
