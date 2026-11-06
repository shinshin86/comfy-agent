import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { contactSheet, extractFrames, ffprobeJson, runTool } from "../verify/ffmpeg.js";
import { probeFile } from "../verify/probe.js";
import type { FfprobeResult } from "../verify/types.js";
import {
  detectSpeech,
  emptySpeech,
  measureLoudness,
  speechCutChecks,
  type Interval,
  type SpeechAnalysis,
} from "./audio.js";
import { requireMediaTools, resolveCut, type ResolvedCut } from "./edit.js";
import { buildPlan, type StageStatus } from "./plan.js";
import type { ResolvedScene, ResolvedStage } from "./resolve.js";
import { mediaOutputs, readState, withSceneLock } from "./state.js";
import { expectedDialogue, transcribe, transcribeArgv, type Transcript } from "./transcribe.js";
import { boundarySheet, uniqueFrames } from "./report-media.js";
import { renderReportHtml } from "./report-html.js";

export type ReportWarning = { code: string; message: string };
export type ScopedReportWarning = ReportWarning & { scope: "scene" | "final" | `shot:${string}` };
export type ShotReport = {
  id: string;
  keyframe: {
    status: StageStatus;
    pick: number | null;
    expected_size: { width: number | null; height: number | null };
    candidates: Array<{
      file: string;
      width: number | null;
      height: number | null;
      size_ok: boolean | null;
    }>;
    sheet: string | null;
    reference: string | null;
  };
  video: {
    status: StageStatus;
    file: string | null;
    metadata: FfprobeResult | null;
    sheet: string | null;
    cut: ResolvedCut | null;
    speech: SpeechAnalysis;
    suggested_cut_start: number | null;
    missed_speech_s: number | null;
    expected_dialogue: string;
    transcript: Transcript;
  };
  warnings: ReportWarning[];
};
export type FinalReport = {
  status: StageStatus;
  file: string;
  metadata: FfprobeResult;
  boundaries: string | null;
  boundary_frames: Array<{ frame: number; time_s: number }>;
  expected_duration_s: number | null;
  duration_delta_s: number | null;
  unique_frames:
    | (Awaited<ReturnType<typeof uniqueFrames>> & { expected_ratio: number | null })
    | null;
  loudness: Awaited<ReturnType<typeof measureLoudness>>;
  speech: SpeechAnalysis;
  speech_timeline: Array<Interval & { shot: string }>;
  warnings: ReportWarning[];
};
export type SceneReport = {
  ok: true;
  version: 1;
  scene: string;
  generated_at: string;
  report: string;
  report_json: string;
  artifact_base: string;
  shots: ShotReport[];
  final: FinalReport | null;
  warnings: ReportWarning[];
  warning_count: number;
  all_warnings: ScopedReportWarning[];
  next_action: string;
};
export type ReportOptions = { transcribeCmd?: string; transcribeTimeoutMs?: number };

const warn = (warnings: ReportWarning[], code: string, message: string) =>
  warnings.push({ code, message });
const relative = (root: string, file: string) =>
  path.relative(root, file).split(path.sep).join("/");
const exists = async (file: string) =>
  fs
    .stat(file)
    .then((stat) => stat.isFile())
    .catch(() => false);
const expectedSize = (stage: ResolvedStage) => {
  const dimension = (role: "width" | "height") => {
    const target = Object.entries(stage.preset?.parameters ?? {}).find(
      ([name, def]) => name === role || def.role === role || def.aliases?.includes(role),
    );
    const value = target ? (stage.params[target[0]] ?? target[1].default) : undefined;
    const number = Number(value);
    return value !== undefined && Number.isFinite(number) && number > 0 ? number : null;
  };
  return { width: dimension("width"), height: dimension("height") };
};
const attempt = async <T>(
  warnings: ReportWarning[],
  code: string,
  action: () => Promise<T>,
): Promise<T | null> => {
  try {
    return await action();
  } catch (error) {
    warn(warnings, code, error instanceof Error ? error.message : String(error));
    return null;
  }
};

const reportUnlocked = async (
  resolved: ResolvedScene,
  options: ReportOptions,
): Promise<SceneReport> => {
  const command = options.transcribeCmd ?? resolved.scene.checks?.transcribe_cmd;
  if (command) transcribeArgv(command, "cut.wav");
  const tools = await requireMediaTools();
  const state = await readState(resolved.dir);
  const plan = await buildPlan(resolved, state);
  const destination = path.join(resolved.dir, "out", "report");
  await fs.mkdir(destination, { recursive: true });
  const status = (id: string) => plan.stages.find((stage) => stage.id === id)!.status;
  const shots: ShotReport[] = [];
  for (const [index, shot] of resolved.scene.shots.entries()) {
    const dir = path.join(destination, shot.id);
    await fs.mkdir(dir, { recursive: true });
    const warnings: ReportWarning[] = [];
    const keyframeStage = resolved.stages.find((stage) => stage.id === `${shot.id}/keyframe`)!;
    const videoStage = resolved.stages.find((stage) => stage.id === `${shot.id}/video`)!;
    const expected_size = expectedSize(keyframeStage);
    const candidates: ShotReport["keyframe"]["candidates"] = [];
    const images: string[] = [];
    for (const output of mediaOutputs(state.stages[keyframeStage.id])) {
      const file = path.join(resolved.dir, output.path);
      const metadata = await attempt(warnings, "keyframe_unreadable", () => probeFile(file));
      if (!metadata?.width || !metadata.height) continue;
      const size_ok =
        expected_size.width === null && expected_size.height === null
          ? null
          : (expected_size.width === null || metadata.width === expected_size.width) &&
            (expected_size.height === null || metadata.height === expected_size.height);
      candidates.push({
        file: output.path,
        width: metadata.width,
        height: metadata.height,
        size_ok,
      });
      images.push(file);
      if (size_ok === false)
        warn(
          warnings,
          "keyframe_size_mismatch",
          `Candidate ${candidates.length}: ${metadata.width}x${metadata.height}, expected ${expected_size.width ?? "any"}x${expected_size.height ?? "any"}`,
        );
    }
    let keyframeSheet: string | null = null;
    if (images.length)
      keyframeSheet = await attempt(warnings, "keyframe_sheet_failed", async () =>
        relative(
          destination,
          await contactSheet(images, path.join(dir, "keyframes.png"), {
            ffmpegPath: tools.ffmpeg,
            thumbSize: 320,
          }),
        ),
      );
    else warn(warnings, "keyframes_missing", "No readable keyframe candidates are available.");
    let reference: string | null = null;
    if (resolved.reference)
      reference = await attempt(warnings, "reference_unreadable", async () => {
        const file = path.join(dir, "reference.png");
        await runTool(tools.ffmpeg, [
          "-v",
          "error",
          "-nostdin",
          "-i",
          resolved.reference!,
          "-frames:v",
          "1",
          "-y",
          file,
        ]);
        return relative(destination, file);
      });
    const promptTarget = Object.entries(videoStage.preset?.parameters ?? {}).find(
      ([name, def]) => name === "prompt" || def.aliases?.includes("prompt"),
    );
    const expected_dialogue =
      shot.dialogue ??
      expectedDialogue(
        videoStage.prompt ??
          String(
            promptTarget
              ? (videoStage.params[promptTarget[0]] ?? promptTarget[1].default ?? "")
              : "",
          ),
      );
    const video: ShotReport["video"] = {
      status: status(videoStage.id),
      file: null,
      metadata: null,
      sheet: null,
      cut: null,
      speech: emptySpeech(),
      suggested_cut_start: null,
      missed_speech_s: null,
      expected_dialogue,
      transcript: { status: "skipped", reason: command ? "clip_unavailable" : "no_command" },
    };
    const output = mediaOutputs(state.stages[videoStage.id])[0];
    if (output && (await exists(path.join(resolved.dir, output.path)))) {
      video.file = output.path;
      const file = path.join(resolved.dir, output.path);
      video.metadata = await attempt(warnings, "clip_unreadable", () =>
        ffprobeJson(file, tools.ffprobe),
      );
      if (video.metadata) {
        const metadata = video.metadata;
        video.sheet = await attempt(warnings, "clip_sheet_failed", async () => {
          const frames = await extractFrames(
            file,
            path.join(dir, "frames"),
            3,
            { frameCount: metadata.frame_count, duration: metadata.duration_s, fps: metadata.fps },
            tools.ffmpeg,
          );
          return relative(
            destination,
            await contactSheet(
              frames.map((frame) => frame.path),
              path.join(dir, "clip.png"),
              { ffmpegPath: tools.ffmpeg, thumbSize: 320, cols: 3 },
            ),
          );
        });
        video.cut = await attempt(warnings, "invalid_cut", async () =>
          resolveCut(metadata, shot.cut, `shots[${index}].cut`, shot.id),
        );
        if (metadata.channels && metadata.duration_s) {
          video.speech =
            (await attempt(warnings, "speech_analysis_failed", () =>
              detectSpeech(file, metadata.duration_s!, tools.ffmpeg),
            )) ?? emptySpeech("failed");
        } else video.speech = emptySpeech("no_audio");
        if (video.cut) {
          const checks = speechCutChecks(video.speech, video.cut);
          video.suggested_cut_start = checks.suggested_cut_start;
          video.missed_speech_s = checks.missed_speech_s;
          for (const code of checks.warnings)
            warn(
              warnings,
              code,
              code === "no_speech"
                ? "No speech-like energy was detected."
                : code === "speech_cut_at_end"
                  ? "Speech-like energy reaches the final 0.25 seconds of the cut."
                  : `The cut excludes ${checks.missed_speech_s?.toFixed(2)} seconds of detected speech.`,
            );
          if (command && metadata.channels) {
            const cut = video.cut;
            const audio = path.join(dir, "cut.wav");
            const exported = await attempt(warnings, "transcription_audio_failed", async () => {
              await runTool(tools.ffmpeg, [
                "-v",
                "error",
                "-nostdin",
                "-i",
                file,
                "-map",
                "0:a:0",
                "-vn",
                "-af",
                `atrim=start=${cut.start}:end=${cut.end},asetpts=PTS-STARTPTS`,
                "-ar",
                "16000",
                "-ac",
                "1",
                "-c:a",
                "pcm_s16le",
                "-y",
                audio,
              ]);
              return audio;
            });
            if (exported) {
              video.transcript = await transcribe(
                command,
                exported,
                expected_dialogue,
                resolved.dir,
                options.transcribeTimeoutMs,
              );
              if (video.transcript.status === "failed")
                warn(warnings, "transcription_failed", video.transcript.reason);
              else if (
                video.transcript.status === "completed" &&
                video.transcript.similarity !== null &&
                video.transcript.similarity < 0.6
              )
                warn(
                  warnings,
                  "transcript_mismatch",
                  `Dialogue similarity ${video.transcript.similarity.toFixed(3)} is below 0.6.`,
                );
            } else video.transcript = { status: "failed", reason: "audio_export_failed" };
          } else if (command) video.transcript = { status: "skipped", reason: "no_audio" };
        } else if (command) video.transcript = { status: "skipped", reason: "invalid_cut" };
      }
    } else warn(warnings, "clip_missing", "No readable video output is available.");
    if (video.status !== "fresh")
      warn(
        warnings,
        "clip_not_fresh",
        `Video stage status: ${video.status}. Measurements describe the stored output.`,
      );
    shots.push({
      id: shot.id,
      keyframe: {
        status: status(keyframeStage.id),
        pick: state.stages[keyframeStage.id]?.pick ?? null,
        expected_size,
        candidates,
        sheet: keyframeSheet,
        reference,
      },
      video,
      warnings,
    });
  }

  const warnings: ReportWarning[] = [];
  const finalOutput = mediaOutputs(state.stages.edit)[0];
  let final: FinalReport | null = null;
  if (finalOutput && (await exists(path.join(resolved.dir, finalOutput.path)))) {
    const file = path.join(resolved.dir, finalOutput.path);
    const metadata = await attempt(warnings, "final_unreadable", () =>
      ffprobeJson(file, tools.ffprobe),
    );
    if (metadata) {
      const expected = shots.every((shot) => shot.video.cut)
        ? shots.reduce((sum, shot) => sum + shot.video.cut!.duration, 0)
        : null;
      const finalWarnings: ReportWarning[] = [];
      const timeline: FinalReport["speech_timeline"] = [];
      const boundaries: number[] = [];
      let offset = 0;
      for (const shot of shots) {
        const cut = shot.video.cut;
        if (!cut) break;
        for (const interval of shot.video.speech.intervals) {
          const start = Math.max(cut.start, interval.start);
          const end = Math.min(cut.end, interval.end);
          if (end > start)
            timeline.push({
              shot: shot.id,
              start: offset + start - cut.start,
              end: offset + end - cut.start,
            });
        }
        offset += cut.duration;
        boundaries.push(offset);
      }
      const sheet =
        metadata.fps && metadata.frame_count
          ? await attempt(finalWarnings, "boundary_sheet_failed", () =>
              boundarySheet(
                file,
                boundaries.slice(0, -1),
                metadata.fps!,
                metadata.frame_count!,
                path.join(destination, "final"),
                tools.ffmpeg,
              ),
            )
          : null;
      const unique = await attempt(finalWarnings, "frame_analysis_failed", () =>
        uniqueFrames(file, tools.ffmpeg),
      );
      const loudness = metadata.channels
        ? await attempt(finalWarnings, "loudness_failed", () => measureLoudness(file, tools.ffmpeg))
        : null;
      const speech =
        metadata.channels && metadata.duration_s
          ? await attempt(finalWarnings, "speech_analysis_failed", () =>
              detectSpeech(file, metadata.duration_s!, tools.ffmpeg),
            )
          : null;
      if (loudness?.max_db !== null && loudness?.max_db !== undefined && loudness.max_db > -0.1)
        warn(
          finalWarnings,
          "audio_peak_high",
          `Peak level is ${loudness.max_db} dBFS (above -0.1).`,
        );
      const delta =
        expected !== null && metadata.duration_s !== null ? metadata.duration_s - expected : null;
      if (delta !== null && Math.abs(delta) > 1 / (metadata.fps ?? 24) + 0.01)
        warn(
          finalWarnings,
          "duration_mismatch",
          `Duration differs from the sum of cuts by ${delta.toFixed(3)} seconds.`,
        );
      if (status("edit") !== "fresh")
        warn(
          finalWarnings,
          "final_not_fresh",
          "The final edit is not current; comparisons use the current scene cuts.",
        );
      final = {
        status: status("edit"),
        file: finalOutput.path,
        metadata,
        boundaries: sheet ? relative(destination, sheet.sheet) : null,
        boundary_frames: sheet?.frames ?? [],
        expected_duration_s: expected,
        duration_delta_s: delta,
        unique_frames: unique
          ? {
              ...unique,
              expected_ratio: metadata.fps
                ? Math.min(1, (resolved.scene.edit.fps_look ?? metadata.fps) / metadata.fps)
                : null,
            }
          : null,
        loudness: loudness ?? { mean_db: null, max_db: null },
        speech: speech ?? emptySpeech(metadata.channels ? "failed" : "no_audio"),
        speech_timeline: timeline,
        warnings: finalWarnings,
      };
    }
  } else
    warn(
      warnings,
      "final_missing",
      "No final edit is available. Generate or select the required stages, then run the scene.",
    );
  const all_warnings: ScopedReportWarning[] = [
    ...warnings.map((warning) => ({ scope: "scene" as const, ...warning })),
    ...(final?.warnings ?? []).map((warning) => ({ scope: "final" as const, ...warning })),
    ...shots.flatMap((shot) =>
      shot.warnings.map((warning) => ({ scope: `shot:${shot.id}` as const, ...warning })),
    ),
  ];
  const report: SceneReport = {
    ok: true,
    version: 1,
    scene: resolved.scene.name,
    generated_at: new Date().toISOString(),
    report: "out/report/report.html",
    report_json: "out/report/report.json",
    artifact_base: "out/report",
    shots,
    final,
    warnings,
    warning_count: all_warnings.length,
    all_warnings,
    next_action:
      "Review warnings and suggested_cut_start, adjust cut or prompt in scene.yaml, then run scene plan and scene run again.",
  };
  for (const [name, contents] of [
    ["report.json", JSON.stringify(report, null, 2) + "\n"],
    ["report.html", renderReportHtml(report)],
  ]) {
    const target = path.join(destination, name);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, contents);
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  return report;
};

export const reportScene = (
  resolved: ResolvedScene,
  options: ReportOptions = {},
): Promise<SceneReport> => withSceneLock(resolved.dir, () => reportUnlocked(resolved, options));
