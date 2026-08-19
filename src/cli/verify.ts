import path from "node:path";
import { createReadStream, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { CliError } from "../io/errors.js";
import { print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";
import { resolveWorkdirRootFrom } from "../io/workdir.js";
import { readRunManifest } from "../jobs/manifest.js";
import { attachVerifySummary, type AttachVerifySummaryResult } from "../jobs/store.js";
import type { JobVerifySummary, RunManifest } from "../jobs/types.js";
import {
  builtinChecks,
  countCheck,
  expectationChecks,
  type VerifyExpectations,
} from "../verify/checks.js";
import {
  FFMPEG_INSTALL_HINT,
  contactSheet,
  detectTools,
  extractFrames,
  ffprobeJson,
  toolErrorTail,
  waveform,
} from "../verify/ffmpeg.js";
import { probeFile, SUPPORTED_FORMATS } from "../verify/probe.js";
import { summarize, toText } from "../verify/report.js";
import type {
  FfprobeResult,
  FileReport,
  ProbeResult,
  VerifyKind,
  VerifyReport,
  VerifyTools,
  VerifyWarning,
} from "../verify/types.js";

export type VerifyOptions = {
  json?: boolean;
  frames?: string;
  sheet?: string;
  noSheet?: boolean;
  noFfmpeg?: boolean;
  out?: string;
  expectKind?: string;
  expectCount?: string;
  expectSize?: string;
  minDuration?: string;
  maxDuration?: string;
  hash?: boolean;
};

type ResolvedOptions = {
  frames: number;
  framesExplicit: boolean;
  sheet?: string;
  sheetExplicit: boolean;
  noSheet: boolean;
  noFfmpeg: boolean;
  expectations: VerifyExpectations;
};

const parseNonNegativeInteger = (value: string, name: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError("INVALID_PARAM", t("verify.invalid_nonnegative_integer", { name }), 2, {
      name,
      value,
    });
  }
  return parsed;
};

const parseNonNegativeNumber = (value: string, name: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CliError("INVALID_PARAM", t("verify.invalid_nonnegative_number", { name }), 2, {
      name,
      value,
    });
  }
  return parsed;
};

const resolveOptions = (options: VerifyOptions): ResolvedOptions => {
  let kind: VerifyExpectations["kind"];
  if (options.expectKind !== undefined) {
    if (!["image", "video", "audio"].includes(options.expectKind)) {
      throw new CliError("INVALID_PARAM", t("verify.invalid_kind"), 2, {
        value: options.expectKind,
      });
    }
    kind = options.expectKind as VerifyExpectations["kind"];
  }
  let size: VerifyExpectations["size"];
  if (options.expectSize !== undefined) {
    const match = /^(\d+)[xX](\d+)$/.exec(options.expectSize);
    if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) {
      throw new CliError("INVALID_PARAM", t("verify.invalid_size"), 2, {
        value: options.expectSize,
      });
    }
    size = { width: Number(match[1]), height: Number(match[2]) };
  }
  const minDuration =
    options.minDuration === undefined
      ? undefined
      : parseNonNegativeNumber(options.minDuration, "min-duration");
  const maxDuration =
    options.maxDuration === undefined
      ? undefined
      : parseNonNegativeNumber(options.maxDuration, "max-duration");
  if (minDuration !== undefined && maxDuration !== undefined && minDuration > maxDuration) {
    throw new CliError(
      "INVALID_PARAM",
      t("verify.invalid_nonnegative_number", { name: "duration range" }),
      2,
      {
        min_duration: minDuration,
        max_duration: maxDuration,
      },
    );
  }
  return {
    frames: options.frames === undefined ? 6 : parseNonNegativeInteger(options.frames, "frames"),
    framesExplicit: options.frames !== undefined,
    ...(options.sheet === undefined ? {} : { sheet: path.resolve(options.sheet) }),
    sheetExplicit: options.sheet !== undefined,
    noSheet: options.noSheet ?? false,
    noFfmpeg: options.noFfmpeg ?? false,
    expectations: {
      ...(kind === undefined ? {} : { kind }),
      ...(options.expectCount === undefined
        ? {}
        : { count: parseNonNegativeInteger(options.expectCount, "expect-count") }),
      ...(size === undefined ? {} : { size }),
      ...(minDuration === undefined ? {} : { minDuration }),
      ...(maxDuration === undefined ? {} : { maxDuration }),
    },
  };
};

const missingToolError = () =>
  new CliError(
    "MISSING_TOOL",
    t("verify.missing_tool", { tool: "ffmpeg", hint: FFMPEG_INSTALL_HINT }),
    2,
    {
      tool: "ffmpeg",
      hint: FFMPEG_INSTALL_HINT,
      env: "COMFY_AGENT_FFMPEG",
    },
  );

const unavailableTools = (): VerifyTools => ({
  ffmpeg: { available: false, path: null, version: null },
  ffprobe: { available: false, path: null, version: null },
});

const isDirectOutput = (name: string) =>
  name !== "run.json" && name !== ".DS_Store" && !name.startsWith(".");

const listDirectFiles = async (dir: string) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isDirectOutput(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
};

const manifestOutputPaths = (dir: string, manifest: RunManifest) => [
  ...new Set(
    manifest.runs.flatMap((run) => run.outputs.map((output) => path.join(dir, output.saved_to))),
  ),
];

const targetNotFound = (target: string) =>
  new CliError("FILE_NOT_FOUND", t("analyze.file_not_found", { path: target }), 2, {
    path: target,
  });

const blankProbe = (sizeBytes = 0): ProbeResult => ({
  parsed: false,
  format: "unknown",
  kind: "unknown",
  animated: false,
  width: null,
  height: null,
  duration_s: null,
  fps: null,
  frame_count: null,
  channels: null,
  sample_rate: null,
  bits_per_sample: null,
  size_bytes: sizeBytes,
  magic: "",
});

const hashFile = (filePath: string) =>
  new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });

const mismatch = (pure: number | null, external: number | null, tolerance = 0) =>
  pure !== null && external !== null && Math.abs(pure - external) > tolerance;

const mergeProbe = (
  filePath: string,
  pure: ProbeResult,
  external: FfprobeResult | null,
): { report: FileReport; warnings: VerifyWarning[] } => {
  const warnings: VerifyWarning[] = [];
  if (external) {
    const mismatches = [
      ["width", pure.width, external.width, 0],
      ["height", pure.height, external.height, 0],
      ["duration_s", pure.duration_s, external.duration_s, 0.05],
      ["fps", pure.fps, external.fps, 0.05],
      ["frame_count", pure.frame_count, external.frame_count, 1],
      ["channels", pure.channels, external.channels, 0],
      ["sample_rate", pure.sample_rate, external.sample_rate, 0],
    ] as const;
    const differing = mismatches
      .filter(([, pureValue, externalValue, tolerance]) =>
        mismatch(pureValue, externalValue, tolerance),
      )
      .map(([field]) => field);
    if (differing.length > 0) {
      warnings.push({
        code: "PROBE_MISMATCH",
        message: t("verify.warning.probe_mismatch"),
        details: { fields: differing },
      });
    }
  }
  const format = pure.parsed ? pure.format : (external?.format ?? "unknown");
  const kind: VerifyKind = pure.kind !== "unknown" ? pure.kind : (external?.kind ?? "unknown");
  const hasTimeline = kind === "video";
  const report: FileReport = {
    path: filePath,
    kind,
    format,
    animated: pure.animated || kind === "video",
    width: pure.width ?? external?.width ?? null,
    height: pure.height ?? external?.height ?? null,
    duration_s:
      kind === "image" ? null : (pure.duration_s ?? external?.duration_s ?? null),
    fps: hasTimeline ? (pure.fps ?? external?.fps ?? null) : null,
    frame_count: hasTimeline ? (pure.frame_count ?? external?.frame_count ?? null) : null,
    channels: pure.channels ?? external?.channels ?? null,
    sample_rate: pure.sample_rate ?? external?.sample_rate ?? null,
    bits_per_sample: pure.bits_per_sample,
    size_bytes: pure.size_bytes,
    sha256: null,
    probe_source: pure.parsed
      ? external
        ? "pure-js+ffprobe"
        : "pure-js"
      : external
        ? "ffprobe"
        : "none",
    ffprobe: external,
    artifacts: { frames: [], sheet: null, waveform: null },
    checks: [],
    warnings,
  };
  return { report, warnings };
};

const safeBase = (filePath: string) =>
  path.basename(filePath, path.extname(filePath)).replace(/[^a-zA-Z0-9._-]/g, "_");

const toolFailureWarning = (error: unknown): VerifyWarning => ({
  code: "TOOL_FAILED",
  message: t("verify.warning.tool_failed"),
  details: { stderr_tail: toolErrorTail(error) },
});

const animatedWebpNeedsDecoder = (file: FileReport) =>
  file.format === "webp" &&
  file.animated &&
  !((file.ffprobe?.width ?? 0) > 0 && (file.ffprobe?.height ?? 0) > 0);

const addInspectionArtifacts = async (
  files: FileReport[],
  verifyDir: string,
  tools: VerifyTools,
  options: ResolvedOptions,
) => {
  const sheetInputs: string[] = [];
  const decodableVideos = files.filter(
    (file) => file.kind === "video" && !animatedWebpNeedsDecoder(file),
  );
  const includeAllFramesInGlobalSheet = decodableVideos.length === 1;
  for (const file of files) {
    if (file.kind === "image") sheetInputs.push(file.path);
    if (animatedWebpNeedsDecoder(file)) {
      file.warnings.push({
        code: "ANIMATED_WEBP_NO_DECODER",
        message: t("verify.warning.animated_webp_no_decoder"),
        hint: "python3 -c \"from PIL import Image, ImageSequence; im=Image.open('input.webp'); [f.copy().save(f'frame_{i:04d}.png') for i,f in enumerate(ImageSequence.Iterator(im))]\"",
      });
      continue;
    }
    if (file.kind === "video" && options.frames > 0) {
      try {
        file.artifacts.frames = await extractFrames(
          file.path,
          path.join(verifyDir, safeBase(file.path)),
          options.frames,
          { frameCount: file.frame_count, duration: file.duration_s, fps: file.fps },
          tools.ffmpeg.path!,
        );
        if (includeAllFramesInGlobalSheet) {
          sheetInputs.push(...file.artifacts.frames.map(({ path: framePath }) => framePath));
        } else {
          const representative =
            file.artifacts.frames[Math.floor(file.artifacts.frames.length / 2)];
          if (representative) sheetInputs.push(representative.path);
        }
        if (!options.noSheet && file.artifacts.frames.length > 0) {
          const sheetPath = path.join(verifyDir, `${safeBase(file.path)}_sheet.png`);
          file.artifacts.sheet = await contactSheet(
            file.artifacts.frames.map(({ path: framePath }) => framePath),
            sheetPath,
            { ffmpegPath: tools.ffmpeg.path!, thumbSize: 320 },
          );
        }
      } catch (error) {
        file.warnings.push(toolFailureWarning(error));
      }
    }
    if (file.kind === "audio" && !options.noSheet) {
      try {
        file.artifacts.waveform = await waveform(
          file.path,
          path.join(verifyDir, `${safeBase(file.path)}_wave.png`),
          tools.ffmpeg.path!,
        );
      } catch (error) {
        file.warnings.push(toolFailureWarning(error));
      }
    }
  }
  return sheetInputs;
};

const createGlobalSheets = async (
  inputs: string[],
  verifyDir: string,
  tools: VerifyTools,
  options: ResolvedOptions,
  warnings: VerifyWarning[],
): Promise<string | string[] | null> => {
  if (options.noSheet || inputs.length === 0) return null;
  const outputs: string[] = [];
  for (let offset = 0; offset < inputs.length; offset += 36) {
    const chunk = inputs.slice(offset, offset + 36);
    const part = Math.floor(offset / 36) + 1;
    const outputPath =
      options.sheet && inputs.length <= 36
        ? options.sheet
        : options.sheet
          ? path.join(
              path.dirname(options.sheet),
              `${path.basename(options.sheet, path.extname(options.sheet))}_${String(part).padStart(2, "0")}${path.extname(options.sheet) || ".png"}`,
            )
          : path.join(
              verifyDir,
              inputs.length > 36 ? `sheet_${String(part).padStart(2, "0")}.png` : "sheet.png",
            );
    try {
      outputs.push(
        await contactSheet(chunk, outputPath, {
          ffmpegPath: tools.ffmpeg.path!,
          thumbSize: 320,
        }),
      );
    } catch (error) {
      warnings.push(toolFailureWarning(error));
    }
  }
  return outputs.length === 0 ? null : outputs.length === 1 ? outputs[0] : outputs;
};

const dominantKind = (files: FileReport[]): VerifyKind => {
  const counts = new Map<VerifyKind, number>();
  let selected: VerifyKind = files[0]?.kind ?? "unknown";
  let selectedCount = 0;
  for (const file of files) {
    const count = (counts.get(file.kind) ?? 0) + 1;
    counts.set(file.kind, count);
    if (count > selectedCount) {
      selected = file.kind;
      selectedCount = count;
    }
  }
  return selected;
};

const summedValue = (values: Array<number | null>) => {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? undefined : present.reduce((total, value) => total + value, 0);
};

const buildJobVerifySummary = (
  files: FileReport[],
  checksFailed: number,
  sheet: VerifyReport["sheet"],
): JobVerifySummary => {
  const kinds = new Set(files.map(({ kind }) => kind));
  const first = kinds.size === 1 ? files[0] : undefined;
  const duration = summedValue(
    files
      .filter(({ kind }) => kind === "video" || kind === "audio")
      .map(({ duration_s: value }) => value),
  );
  const frameCount = summedValue(
    files.filter(({ kind }) => kind === "video").map(({ frame_count: value }) => value),
  );
  const sheetPath = typeof sheet === "string" ? sheet : sheet?.[0];

  return {
    at: new Date().toISOString(),
    files: files.length,
    kind: dominantKind(files),
    ...(first?.width === null || first?.width === undefined ? {} : { width: first.width }),
    ...(first?.height === null || first?.height === undefined ? {} : { height: first.height }),
    ...(duration === undefined ? {} : { duration_s: duration }),
    ...(frameCount === undefined ? {} : { frame_count: frameCount }),
    checks_failed: checksFailed,
    ...(sheetPath === undefined ? {} : { sheet: sheetPath }),
  };
};

const recordUpdateError = (result: AttachVerifySummaryResult): Record<string, unknown> => {
  if (result.status !== "error") return {};
  if (result.error instanceof CliError) {
    return {
      code: result.error.code,
      message: result.error.message,
      ...(result.error.details === undefined ? {} : { details: result.error.details }),
    };
  }
  return {
    message: result.error instanceof Error ? result.error.message : String(result.error),
  };
};

export const runVerify = async (targetInput: string, options: VerifyOptions) => {
  const resolved = resolveOptions(options);
  const target = path.resolve(targetInput);
  let targetStat;
  try {
    targetStat = await fs.stat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw targetNotFound(target);
    throw error;
  }
  if (!targetStat.isDirectory() && !targetStat.isFile()) throw targetNotFound(target);

  const targetType = targetStat.isDirectory() ? "dir" : "file";
  const baseDir = targetType === "dir" ? target : path.dirname(target);
  const verifyDir = path.resolve(options.out ?? path.join(baseDir, "verify"));
  const reportWarnings: VerifyWarning[] = [];
  let manifest: RunManifest | null = null;
  let files: string[];
  let extraFiles: string[] = [];

  if (targetType === "dir") {
    const manifestResult = await readRunManifest(target);
    if (manifestResult?.ok) manifest = manifestResult.manifest;
    else if (manifestResult?.ok === false) {
      reportWarnings.push({
        code: manifestResult.error.code,
        message: manifestResult.error.message,
        details: manifestResult.error.details,
      });
    }
    const directFiles = await listDirectFiles(target);
    if (manifest) {
      files = manifestOutputPaths(target, manifest);
      const expectedSet = new Set(files.map((filePath) => path.resolve(filePath)));
      extraFiles = directFiles.filter((filePath) => !expectedSet.has(path.resolve(filePath)));
      if (extraFiles.length > 0) {
        reportWarnings.push({
          code: "EXTRA_FILES",
          message: "Files not listed in run.json were excluded.",
          details: { files: extraFiles },
        });
      }
      for (const run of manifest.runs) {
        if (run.status !== "completed") {
          reportWarnings.push({
            code: "RUN_INCOMPLETE",
            message: t("verify.warning.run_incomplete"),
            details: { job_id: run.job_id, prompt_id: run.prompt_id, status: run.status },
          });
        }
      }
    } else {
      files = directFiles;
    }
  } else {
    files = [target];
  }

  const tools = resolved.noFfmpeg ? unavailableTools() : await detectTools();
  const explicitlyNeedsFfmpeg =
    (resolved.framesExplicit && resolved.frames > 0) ||
    (resolved.sheetExplicit && !resolved.noSheet);
  if (!tools.ffmpeg.available && explicitlyNeedsFfmpeg) throw missingToolError();
  if (!tools.ffmpeg.available && files.length > 0) {
    reportWarnings.push({
      code: "MISSING_TOOL",
      message: t("verify.missing_tool", { tool: "ffmpeg", hint: FFMPEG_INSTALL_HINT }),
      hint: FFMPEG_INSTALL_HINT,
      details: { tool: "ffmpeg", env: "COMFY_AGENT_FFMPEG" },
    });
  }

  const fileReports: FileReport[] = [];
  const magicByFile = new Map<string, string>();
  for (const filePath of files) {
    let pure: ProbeResult;
    try {
      pure = await probeFile(filePath);
    } catch {
      pure = blankProbe();
    }
    magicByFile.set(filePath, pure.magic);
    let external: FfprobeResult | null = null;
    if (tools.ffprobe.available && pure.size_bytes > 0) {
      try {
        external = await ffprobeJson(filePath, tools.ffprobe.path!);
      } catch (error) {
        reportWarnings.push({
          ...toolFailureWarning(error),
          details: { path: filePath, stderr_tail: toolErrorTail(error) },
        });
      }
    }
    const { report } = mergeProbe(filePath, pure, external);
    if (options.hash && pure.size_bytes > 0) report.sha256 = await hashFile(filePath);
    report.checks = [...builtinChecks(report), ...expectationChecks(report, resolved.expectations)];
    fileReports.push(report);
  }

  const reportChecks = [];
  const existingCount = fileReports.filter(({ size_bytes: sizeBytes }) => sizeBytes > 0).length;
  if (resolved.expectations.count !== undefined) {
    reportChecks.push(countCheck(existingCount, resolved.expectations.count));
  } else if (manifest) {
    const expected = manifest.runs.reduce((count, run) => count + run.outputs.length, 0);
    if (expected !== existingCount) {
      reportWarnings.push({
        code: "MANIFEST_COUNT_MISMATCH",
        message: "The manifest output count differs from the files found.",
        details: { expected, actual: existingCount },
      });
    }
  }

  let sheet: VerifyReport["sheet"] = null;
  if (tools.ffmpeg.available) {
    const sheetInputs = await addInspectionArtifacts(fileReports, verifyDir, tools, resolved);
    sheet = await createGlobalSheets(sheetInputs, verifyDir, tools, resolved, reportWarnings);
  } else {
    for (const file of fileReports) {
      if (file.format === "webp" && file.animated) {
        file.warnings.push({
          code: "ANIMATED_WEBP_NO_DECODER",
          message: t("verify.warning.animated_webp_no_decoder"),
          hint: "Use Python Pillow ImageSequence to extract frames.",
        });
      }
    }
  }

  const manifestExpected = manifest
    ? manifest.runs.reduce((count, run) => count + run.outputs.length, 0)
    : undefined;
  const preRecordSummary = summarize(fileReports, reportChecks, reportWarnings);
  const jobVerifySummary = buildJobVerifySummary(
    fileReports,
    preRecordSummary.checks_failed,
    sheet,
  );
  let recordUpdated = false;
  if (manifest) {
    const jobIds = [...new Set(manifest.runs.map(({ job_id: jobId }) => jobId).filter(Boolean))];
    if (jobIds.length > 0) {
      const cwd = resolveWorkdirRootFrom(target);
      const results = await Promise.all(
        jobIds.map(async (jobId) => ({
          jobId,
          result: await attachVerifySummary(jobId, jobVerifySummary, {
            cwd,
            scope: manifest.scope,
          }),
        })),
      );
      recordUpdated = results.every(({ result }) => result.status === "written");
      for (const { jobId, result } of results) {
        if (result.status === "written") continue;
        reportWarnings.push({
          code: "VERIFY_RECORD_NOT_UPDATED",
          message: t("verify.warning.record_not_updated"),
          details: {
            job_id: jobId,
            status: result.status,
            ...recordUpdateError(result),
          },
        });
      }
    }
  }
  const reportSummary = {
    ...summarize(fileReports, reportChecks, reportWarnings),
    record_updated: recordUpdated,
  };
  const report: VerifyReport = {
    ok: false,
    target,
    target_type: targetType,
    manifest: manifest
      ? {
          found: true,
          preset: manifest.preset,
          runs: manifest.runs.length,
          expected_outputs: manifestExpected,
        }
      : { found: false },
    tools,
    verify_dir: verifyDir,
    files: fileReports,
    extra_files: extraFiles,
    sheet,
    checks: reportChecks,
    summary: reportSummary,
    warnings: reportWarnings,
  };
  report.ok = report.summary.checks_failed === 0;

  await fs.mkdir(verifyDir, { recursive: true });
  await fs.writeFile(
    path.join(verifyDir, "verify.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf-8",
  );

  if (targetType === "file" && fileReports[0]?.format === "unknown") {
    throw new CliError(
      "UNSUPPORTED_FORMAT",
      t("verify.unsupported_format", { path: target, ext: path.extname(target) || "(none)" }),
      2,
      {
        path: target,
        magic: magicByFile.get(target) ?? "",
        ext: path.extname(target).toLowerCase(),
        supported: [...SUPPORTED_FORMATS],
      },
    );
  }

  if (report.summary.checks_failed > 0) {
    if (!options.json) print(toText(report));
    const failed = [
      ...report.checks.filter(({ pass }) => !pass),
      ...report.files.flatMap((file) => file.checks.filter(({ pass }) => !pass)),
    ].map(({ id }) => id);
    throw new CliError(
      "VERIFY_CHECKS_FAILED",
      t("verify.checks_failed", { count: failed.length }),
      3,
      { failed: [...new Set(failed)], report },
    );
  }

  if (options.json) printJson(report);
  else print(toText(report));
  return report;
};
