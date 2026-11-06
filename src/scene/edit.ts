import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { CliError } from "../io/errors.js";
import {
  detectTools,
  ffprobeJson,
  FFMPEG_INSTALL_HINT,
  runTool,
  toolErrorTail,
} from "../verify/ffmpeg.js";
import type { FfprobeResult } from "../verify/types.js";
import type { ResolvedScene } from "./resolve.js";
import { sceneInvalid } from "./schema.js";
import type { Scene } from "./schema.js";
import { mediaOutputs, type SceneState } from "./state.js";

export const EDIT_GRAPH_VERSION = 1;
export const requireMediaTools = async () => {
  const tools = await detectTools();
  for (const name of ["ffmpeg", "ffprobe"] as const)
    if (!tools[name].available) {
      throw new CliError("MISSING_TOOL", `${name} is required: ${FFMPEG_INSTALL_HINT}`, 2, {
        tool: name,
        hint: FFMPEG_INSTALL_HINT,
      });
    }
  return { ffmpeg: tools.ffmpeg.path!, ffprobe: tools.ffprobe.path! };
};

export type EditCommand = { args: string[]; output: string; duration_s: number };
export type ResolvedCut = {
  start: number;
  end: number;
  duration: number;
  start_frame: number;
  end_frame: number;
};
export const resolveCut = (
  metadata: FfprobeResult,
  cut: Scene["shots"][number]["cut"],
  field: string,
  shot: string,
): ResolvedCut => {
  const fps = metadata.fps;
  const duration = metadata.duration_s;
  if (!fps || !duration) throw sceneInvalid(field, `Cannot read video timing for shot ${shot}`);
  const requestedEnd = cut.duration === undefined ? duration : cut.start + cut.duration;
  const startFrame = Math.round(cut.start * fps);
  const endFrame = Math.round(requestedEnd * fps);
  const maxFrames = metadata.frame_count ?? Math.round(duration * fps);
  if (
    cut.start >= duration ||
    requestedEnd > duration + 0.5 / fps + 1e-6 ||
    endFrame > maxFrames ||
    endFrame <= startFrame
  ) {
    throw sceneInvalid(field, `Cut is outside shot ${shot} (${duration}s, ${maxFrames} frames)`);
  }
  return {
    start: startFrame / fps,
    end: endFrame / fps,
    duration: (endFrame - startFrame) / fps,
    start_frame: startFrame,
    end_frame: endFrame,
  };
};
export const buildEditCommand = async (
  resolved: ResolvedScene,
  state: SceneState,
): Promise<EditCommand> => {
  const { scene, dir } = resolved;
  const tools = await requireMediaTools();
  const args = ["-v", "error", "-nostdin"];
  const graph: string[] = [];
  let source: FfprobeResult | undefined;
  let total = 0;
  for (const [index, shot] of scene.shots.entries()) {
    const output = mediaOutputs(state.stages[`${shot.id}/video`])[0];
    if (!output) throw sceneInvalid(`shots[${index}].video`, `No clip for shot ${shot.id}`);
    const file = path.join(dir, output.path);
    const metadata = await ffprobeJson(file, tools.ffprobe);
    const fps = metadata.fps;
    const duration = metadata.duration_s;
    if (!fps || !duration || !metadata.width || !metadata.height)
      throw sceneInvalid(`shots[${index}].video`, `Cannot read video timing for shot ${shot.id}`);
    source ??= metadata;
    if (metadata.width !== source.width || metadata.height !== source.height)
      throw sceneInvalid(
        `shots[${index}].video`,
        `Shot ${shot.id} must match the first clip dimensions (${source.width}x${source.height})`,
      );
    const {
      start,
      end,
      start_frame: startFrame,
      end_frame: endFrame,
    } = resolveCut(metadata, shot.cut, `shots[${index}].cut`, shot.id);
    const length = end - start;
    total += length;
    args.push("-i", file);
    graph.push(
      `[${index}:v:0]trim=start_frame=${startFrame}:end_frame=${endFrame},setpts=PTS-STARTPTS,settb=AVTB,fps=${source.fps},setsar=1[v${index}]`,
    );
    const audio = metadata.channels
      ? `[${index}:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${length}`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${length},asetpts=PTS-STARTPTS`;
    const fade = Math.min(0.02, length / 2);
    graph.push(
      `${audio},afade=t=in:st=0:d=${fade},afade=t=out:st=${length - fade}:d=${fade}[a${index}]`,
    );
  }
  const count = scene.shots.length;
  const edit = scene.edit;
  const look = edit.fps_look === null ? "" : `fps=${edit.fps_look},fps=${source!.fps},`;
  const noise = edit.grain > 0 ? `noise=alls=${edit.grain}:allf=t,` : "";
  graph.push(
    `${scene.shots.map((_, index) => `[v${index}]`).join("")}concat=n=${count}:v=1:a=0,${look}eq=saturation=${edit.saturation},${noise}format=yuv420p[video]`,
  );
  graph.push(
    `${scene.shots.map((_, index) => `[a${index}]`).join("")}concat=n=${count}:v=0:a=1,volume=${edit.voice_gain}[dialogue]`,
  );
  if (scene.bgm) {
    const output = mediaOutputs(state.stages.bgm)[0];
    if (!output) throw sceneInvalid("bgm", "No BGM output");
    const file = path.join(dir, output.path);
    const metadata = await ffprobeJson(file, tools.ffprobe);
    if (!metadata.channels || !metadata.duration_s || scene.bgm.start >= metadata.duration_s)
      throw sceneInvalid("bgm.start", "BGM must contain audio after the requested start");
    args.push("-i", file);
    graph.push("[dialogue]asplit=2[voice][sc]");
    graph.push(
      `[${count}:a:0]atrim=start=${scene.bgm.start}:end=${scene.bgm.start + total},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${total},volume=${edit.bgm_gain}[music]`,
    );
    graph.push(
      `[music][sc]sidechaincompress=threshold=${edit.duck.threshold}:ratio=${edit.duck.ratio}:attack=${edit.duck.attack_ms}:release=${edit.duck.release_ms}[duck]`,
    );
    graph.push("[voice][duck]amix=inputs=2:normalize=0:duration=first[mixed]");
  }
  const fade = Math.min(edit.fade_out, total);
  graph.push(
    `[${scene.bgm ? "mixed" : "dialogue"}]${fade > 0 ? `afade=t=out:st=${total - fade}:d=${fade},` : ""}alimiter=limit=${edit.limiter}:latency=1[audio]`,
  );
  const output = path.join(dir, "out", "final", edit.output);
  args.push(
    "-filter_complex",
    graph.join(";"),
    "-map",
    "[video]",
    "-map",
    "[audio]",
    "-c:v",
    "libx264",
    "-crf",
    String(edit.crf),
    "-preset",
    "slow",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-y",
    output,
  );
  return { args, output, duration_s: total };
};

export const executeEdit = async (resolved: ResolvedScene, state: SceneState) => {
  const command = await buildEditCommand(resolved, state);
  const tools = await requireMediaTools();
  await fs.mkdir(path.dirname(command.output), { recursive: true });
  const temporary = path.join(path.dirname(command.output), `.${randomUUID()}.mp4`);
  try {
    await runTool(tools.ffmpeg, [...command.args.slice(0, -1), temporary]);
    const metadata = await ffprobeJson(temporary, tools.ffprobe);
    if (!metadata.width || !metadata.height || !metadata.duration_s || !metadata.frame_count)
      throw new Error("The edited output has no readable video stream");
    await fs.rename(temporary, command.output);
    return { file: command.output, metadata };
  } catch (error) {
    throw new CliError("SCENE_EDIT_FAILED", "Video edit failed", 3, {
      cause: toolErrorTail(error),
    });
  } finally {
    await fs.rm(temporary, { force: true });
  }
};
