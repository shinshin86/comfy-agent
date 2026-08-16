import path from "node:path";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import type { FfprobeResult, FrameArtifact, ToolInfo, VerifyTools } from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 16 * 1024 * 1024;
export const FFMPEG_INSTALL_HINT =
  "brew install ffmpeg / apt-get install ffmpeg / winget install Gyan.FFmpeg";

export class ToolExecutionError extends Error {
  tool: string;
  stderr: string;
  timedOut: boolean;

  constructor(tool: string, message: string, stderr: string, timedOut: boolean) {
    super(message);
    this.tool = tool;
    this.stderr = stderr;
    this.timedOut = timedOut;
  }
}

type ExecOptions = {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

const resolvedTimeout = (env: NodeJS.ProcessEnv, override?: number) => {
  if (override !== undefined) return override;
  const parsed = Number(env.COMFY_AGENT_FFMPEG_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
};

export const runTool = async (
  command: string,
  args: string[],
  options: ExecOptions = {},
): Promise<{ stdout: string; stderr: string }> => {
  const env = options.env ?? process.env;
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        env,
        timeout: resolvedTimeout(env, options.timeoutMs),
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        encoding: "utf-8",
      },
      (error, stdout, stderr) => {
        if (error) {
          const timedOut = Boolean((error as NodeJS.ErrnoException & { killed?: boolean }).killed);
          reject(
            new ToolExecutionError(
              command,
              timedOut ? `${command} timed out.` : `${command} failed.`,
              stderr,
              timedOut,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
};

const versionFrom = (output: string) => {
  const firstLine = output.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.match(/version\s+([^\s]+)/i)?.[1] ?? null;
};

const detectTool = async (
  name: "ffmpeg" | "ffprobe",
  env: NodeJS.ProcessEnv,
  timeoutMs?: number,
): Promise<ToolInfo> => {
  const envKey = name === "ffmpeg" ? "COMFY_AGENT_FFMPEG" : "COMFY_AGENT_FFPROBE";
  const command = env[envKey] || name;
  try {
    const { stdout, stderr } = await runTool(command, ["-version"], { env, timeoutMs });
    return {
      available: true,
      path: command,
      version: versionFrom(stdout || stderr),
    };
  } catch {
    return { available: false, path: null, version: null };
  }
};

const toolCache = new Map<string, Promise<VerifyTools>>();

export const detectTools = async (
  options: { env?: NodeJS.ProcessEnv; timeoutMs?: number; refresh?: boolean } = {},
): Promise<VerifyTools> => {
  const env = options.env ?? process.env;
  const key = [
    env.COMFY_AGENT_FFMPEG ?? "ffmpeg",
    env.COMFY_AGENT_FFPROBE ?? "ffprobe",
    env.PATH ?? "",
    String(options.timeoutMs ?? "default"),
  ].join("\0");
  if (options.refresh) toolCache.delete(key);
  let pending = toolCache.get(key);
  if (!pending) {
    pending = Promise.all([
      detectTool("ffmpeg", env, options.timeoutMs),
      detectTool("ffprobe", env, options.timeoutMs),
    ]).then(([ffmpeg, ffprobe]) => ({ ffmpeg, ffprobe }));
    toolCache.set(key, pending);
  }
  return pending;
};

const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "N/A" || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const rateOrNull = (value: unknown) => {
  if (typeof value !== "string") return numberOrNull(value);
  const [left, right] = value.split("/").map(Number);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right === 0) return null;
  return left / right;
};

export const ffprobeJson = async (
  filePath: string,
  toolPath = process.env.COMFY_AGENT_FFPROBE || "ffprobe",
  options: ExecOptions = {},
): Promise<FfprobeResult> => {
  const { stdout } = await runTool(
    toolPath,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
    options,
  );
  const parsed = JSON.parse(stdout) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  const duration =
    numberOrNull(parsed.format?.duration) ??
    numberOrNull(video?.duration) ??
    numberOrNull(audio?.duration);
  const fps = rateOrNull(video?.avg_frame_rate ?? video?.r_frame_rate);
  let frameCount = numberOrNull(video?.nb_frames);
  let estimated = false;
  if (frameCount === null && duration !== null && fps !== null) {
    frameCount = Math.round(duration * fps);
    estimated = true;
  }
  return {
    kind: video ? "video" : audio ? "audio" : "unknown",
    format:
      typeof parsed.format?.format_name === "string"
        ? parsed.format.format_name.split(",")[0]
        : null,
    codec:
      typeof video?.codec_name === "string"
        ? video.codec_name
        : typeof audio?.codec_name === "string"
          ? audio.codec_name
          : null,
    width: numberOrNull(video?.width),
    height: numberOrNull(video?.height),
    duration_s: duration,
    fps,
    frame_count: frameCount,
    frame_count_estimated: estimated,
    channels: numberOrNull(audio?.channels),
    sample_rate: numberOrNull(audio?.sample_rate),
    bit_rate: numberOrNull(parsed.format?.bit_rate ?? video?.bit_rate ?? audio?.bit_rate),
  };
};

const uniqueFrameNumbers = (count: number, requested: number) => {
  if (requested <= 0 || count <= 0) return [];
  if (requested === 1) return [Math.round((count - 1) / 2)];
  const numbers = Array.from({ length: requested }, (_, index) =>
    Math.round(((count - 1) * index) / (requested - 1)),
  );
  return [...new Set(numbers)];
};

const runFrameExtraction = async (
  ffmpegPath: string,
  args: string[],
  outputPattern: string,
  options: ExecOptions,
) => {
  try {
    await runTool(ffmpegPath, [...args, "-fps_mode", "vfr", outputPattern], options);
  } catch (error) {
    if (!(error instanceof ToolExecutionError)) throw error;
    await runTool(ffmpegPath, [...args, "-vsync", "vfr", outputPattern], options);
  }
};

export const extractFrames = async (
  filePath: string,
  outputDir: string,
  requested: number,
  metadata: { frameCount: number | null; duration: number | null; fps: number | null },
  ffmpegPath = process.env.COMFY_AGENT_FFMPEG || "ffmpeg",
  options: ExecOptions = {},
): Promise<FrameArtifact[]> => {
  if (requested <= 0) return [];
  await fs.mkdir(outputDir, { recursive: true });
  const outputPattern = path.join(outputDir, "frame_%03d.png");
  const inferredCount =
    metadata.frameCount ??
    (metadata.duration !== null && metadata.fps !== null
      ? Math.max(1, Math.round(metadata.duration * metadata.fps))
      : null);
  let numbers: number[] = [];
  let filter: string;
  if (inferredCount !== null) {
    numbers = uniqueFrameNumbers(inferredCount, requested);
    filter = `select='${numbers.map((number) => `eq(n\\,${number})`).join("+")}'`;
  } else if (metadata.duration !== null && metadata.duration > 0) {
    filter = `fps=${requested}/${metadata.duration}`;
  } else {
    filter = `select='eq(n\\,0)'`;
  }
  await runFrameExtraction(
    ffmpegPath,
    ["-v", "error", "-i", filePath, "-vf", filter, "-y"],
    outputPattern,
    options,
  );
  const generated = (await fs.readdir(outputDir))
    .filter((name) => /^frame_\d+\.png$/.test(name))
    .sort();
  const artifacts: FrameArtifact[] = [];
  for (let index = 0; index < generated.length; index += 1) {
    const frameN = numbers[index] ?? null;
    const time =
      frameN !== null && metadata.fps
        ? frameN / metadata.fps
        : metadata.duration && generated.length > 1
          ? (metadata.duration * index) / (generated.length - 1)
          : null;
    const suffix = `frame_${String(index + 1).padStart(2, "0")}_n${frameN === null ? "unknown" : String(frameN).padStart(4, "0")}_t${time === null ? "unknown" : time.toFixed(2)}s.png`;
    const destination = path.join(outputDir, suffix);
    await fs.rm(destination, { force: true });
    await fs.rename(path.join(outputDir, generated[index]), destination);
    artifacts.push({ index: index + 1, frame_n: frameN, t_s: time, path: destination });
  }
  return artifacts;
};

export const contactSheet = async (
  inputs: string[],
  outputPath: string,
  options: ExecOptions & { ffmpegPath?: string; thumbSize?: number; cols?: number } = {},
) => {
  if (inputs.length === 0) throw new Error("contactSheet requires at least one input");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const cols = options.cols ?? Math.ceil(Math.sqrt(inputs.length));
  const rows = Math.ceil(inputs.length / cols);
  const args = ["-v", "error"];
  for (const input of inputs) args.push("-i", input);
  const streams = inputs.map((_, index) => {
    const resize = options.thumbSize
      ? `scale=${options.thumbSize}:${options.thumbSize}:force_original_aspect_ratio=decrease,pad=${options.thumbSize}:${options.thumbSize}:(ow-iw)/2:(oh-ih)/2:color=0x202020,`
      : "";
    return `[${index}:v]${resize}setpts=PTS-STARTPTS[v${index}]`;
  });
  const labels = inputs.map((_, index) => `[v${index}]`).join("");
  const sequence =
    inputs.length === 1
      ? `[v0]tile=${cols}x${rows}:padding=4:margin=4:color=0x202020[out]`
      : `${labels}concat=n=${inputs.length}:v=1:a=0,tile=${cols}x${rows}:padding=4:margin=4:color=0x202020[out]`;
  args.push(
    "-filter_complex",
    `${streams.join(";")};${sequence}`,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    "-y",
    outputPath,
  );
  await runTool(options.ffmpegPath ?? process.env.COMFY_AGENT_FFMPEG ?? "ffmpeg", args, options);
  return outputPath;
};

export const waveform = async (
  input: string,
  outputPath: string,
  ffmpegPath = process.env.COMFY_AGENT_FFMPEG || "ffmpeg",
  options: ExecOptions = {},
) => {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runTool(
    ffmpegPath,
    [
      "-v",
      "error",
      "-i",
      input,
      "-filter_complex",
      "showwavespic=s=1280x240:split_channels=1",
      "-frames:v",
      "1",
      "-y",
      outputPath,
    ],
    options,
  );
  return outputPath;
};

export const toolErrorTail = (error: unknown) => {
  const stderr = error instanceof ToolExecutionError ? error.stderr : String(error);
  return stderr.split(/\r?\n/).slice(-20).join("\n");
};
