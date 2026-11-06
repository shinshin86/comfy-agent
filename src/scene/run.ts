import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CliError, errorPayloadFrom } from "../io/errors.js";
import { buildStudioArgs, cliLauncher, type RunLauncher } from "../studio/rerun.js";
import { contactSheet, runTool } from "../verify/ffmpeg.js";
import { buildEditCommand, executeEdit, requireMediaTools } from "./edit.js";
import { hashFile, FileHashCache } from "./fingerprint.js";
import { buildPlan, type ScenePlan, type StagePlan } from "./plan.js";
import type { ResolvedScene, ResolvedStage } from "./resolve.js";
import { sceneInvalid, type StageKind } from "./schema.js";
import {
  mediaOutputs,
  outputRecord,
  pickedOutput,
  readState,
  writeState,
  withSceneLock,
  type SceneOutput,
  type SceneState,
  type StageState,
} from "./state.js";

export type SceneRunOptions = {
  shot?: string[];
  only?: StageKind;
  force?: string[];
  failFast?: boolean;
  baseUrl?: string;
  dryRun?: boolean;
  lang?: "en" | "ja";
};
export type StageResult = StagePlan & {
  action: "skipped" | "generated" | "copied" | "edited" | "failed" | "dry_run";
  argv?: string[];
  argv_template?: string[];
  job_ids?: string[];
};
export type SceneRunResult = Omit<ScenePlan, "stages"> & {
  ok: boolean;
  dry_run: boolean;
  stages: StageResult[];
};

const inputFiles = (
  resolved: ResolvedScene,
  stage: ResolvedStage,
  state: SceneState,
  pending: boolean,
) =>
  Object.fromEntries(
    Object.entries(stage.inputs).map(([slot, input]) => {
      if (!("keyframe" in input)) return [slot, input.file];
      const selected = pickedOutput(state.stages[`${stage.shot}/keyframe`]);
      const file =
        pending || !selected
          ? `<pending:${stage.shot}/keyframe>`
          : stage.config.input_size
            ? path.join(resolved.dir, "out", stage.shot!, "video", "keyframe.png")
            : path.join(resolved.dir, selected.path);
      return [slot, file];
    }),
  );

export const buildSceneRunArgs = (
  resolved: ResolvedScene,
  stage: ResolvedStage,
  state: SceneState,
  options: SceneRunOptions = {},
  pending = false,
): string[] => {
  if (!stage.preset) return [];
  const args = buildStudioArgs(
    stage.config.preset!,
    resolved.scope,
    stage.preset,
    stage.params,
    inputFiles(resolved, stage, state, pending),
    stage.config.candidates ?? 1,
    stage.config.seed,
    options.lang,
  );
  args[args.indexOf("--timeout-seconds") + 1] = String(
    stage.config.timeout_seconds ?? (stage.kind === "keyframe" ? 300 : 1200),
  );
  if ((stage.config.candidates ?? 1) > 1) args.push("--seed-step", "1");
  if (options.baseUrl !== undefined) args.push(`--base-url=${options.baseUrl}`);
  return args;
};

const resultSchema = z.object({
  ok: z.boolean(),
  output_dir: z.string().optional(),
  jobs: z.array(z.object({ job_id: z.string() })).optional(),
  runs: z
    .array(
      z.object({
        outputs: z.array(z.object({ saved_to: z.string(), kind: z.string().optional() })),
      }),
    )
    .optional(),
  error: z
    .object({ code: z.string(), message: z.string(), details: z.unknown().optional() })
    .optional(),
});
const extensions = {
  keyframe: new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]),
  video: new Set([".mp4", ".webm", ".mov", ".mkv"]),
  bgm: new Set([".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".opus"]),
};

const copyOutputs = async (
  resolved: ResolvedScene,
  stage: ResolvedStage,
  files: string[],
): Promise<SceneOutput[]> => {
  const destination = path.join(resolved.dir, "out", stage.id);
  await fs.mkdir(destination, { recursive: true });
  const outputs: SceneOutput[] = [];
  for (const [index, file] of files.entries()) {
    const extension = path.extname(file).toLowerCase();
    if (!extensions[stage.kind].has(extension))
      throw new CliError(
        "SCENE_OUTPUT_INVALID",
        `Unexpected ${stage.kind} output extension: ${extension}`,
        3,
      );
    const basename =
      stage.kind === "keyframe" ? String(index + 1) : stage.kind === "video" ? "clip" : "bgm";
    const target = path.join(destination, `${basename}${extension}`);
    if (path.resolve(file) !== target) {
      const temporary = path.join(destination, `.${randomUUID()}${extension}`);
      try {
        await fs.copyFile(file, temporary);
        await fs.rename(temporary, target);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    }
    outputs.push(await outputRecord(resolved.dir, target));
  }
  if (stage.kind === "keyframe" && files.length > 1) {
    const tools = await requireMediaTools();
    const sheet = path.join(destination, "candidates.png");
    await contactSheet(
      outputs.map((output) => path.join(resolved.dir, output.path)),
      sheet,
      { ffmpegPath: tools.ffmpeg, thumbSize: 320 },
    );
    outputs.push(await outputRecord(resolved.dir, sheet, "sheet"));
  }
  return outputs;
};

const resizeKeyframe = async (resolved: ResolvedScene, stage: ResolvedStage, state: SceneState) => {
  if (!stage.config.input_size || !Object.values(stage.inputs).some((input) => "keyframe" in input))
    return;
  const selected = pickedOutput(state.stages[`${stage.shot}/keyframe`]);
  if (!selected) throw sceneInvalid(stage.field, "Pick a keyframe first");
  const tools = await requireMediaTools();
  const target = path.join(resolved.dir, "out", stage.shot!, "video", "keyframe.png");
  await fs.mkdir(path.dirname(target), { recursive: true });
  const [width, height] = stage.config.input_size;
  await runTool(tools.ffmpeg, [
    "-v",
    "error",
    "-nostdin",
    "-i",
    path.join(resolved.dir, selected.path),
    "-vf",
    `scale=${width}:${height}`,
    "-frames:v",
    "1",
    "-y",
    target,
  ]);
};

const isSelected = (id: string, kind: StageKind, options: SceneRunOptions) =>
  (!options.only || options.only === kind) &&
  (!options.shot?.length || options.shot.some((shot) => id.startsWith(`${shot}/`)));

const validateOptions = (resolved: ResolvedScene, options: SceneRunOptions) => {
  for (const shot of options.shot ?? [])
    if (!resolved.scene.shots.some((item) => item.id === shot))
      throw sceneInvalid("--shot", `Unknown shot: ${shot}`);
  if (options.only && !["keyframe", "video", "bgm", "edit"].includes(options.only))
    throw sceneInvalid("--only", "Choose keyframe, video, bgm or edit");
  const ids = new Set([...resolved.stages.map((stage) => stage.id), "edit"]);
  for (const id of options.force ?? [])
    if (!ids.has(id)) throw sceneInvalid("--force", `Unknown stage: ${id}`);
};

const dryRun = async (
  resolved: ResolvedScene,
  state: SceneState,
  options: SceneRunOptions,
  force: string[],
): Promise<SceneRunResult> => {
  const plan = await buildPlan(resolved, state, force);
  const stages: StageResult[] = [];
  for (const entry of plan.stages) {
    const result: StageResult = { ...entry, action: "skipped" };
    if (
      isSelected(entry.id, entry.kind, options) &&
      entry.status !== "fresh" &&
      entry.status !== "needs_pick"
    ) {
      const stage = resolved.stages.find((stage) => stage.id === entry.id);
      if (entry.waiting_for.length) {
        result.status = "blocked";
        if (stage) result.argv_template = buildSceneRunArgs(resolved, stage, state, options, true);
        else
          result.argv_template = [
            "ffmpeg",
            ...resolved.scene.shots.flatMap((shot) => ["-i", `<pending:${shot.id}/video>`]),
            ...(resolved.scene.bgm ? ["-i", "<pending:bgm>"] : []),
            "-filter_complex",
            "<pending:clip-metadata>",
            path.join(resolved.dir, "out", "final", resolved.scene.edit.output),
          ];
      } else {
        result.action = "dry_run";
        if (stage?.preset) result.argv = buildSceneRunArgs(resolved, stage, state, options);
        if (!stage) result.argv = ["ffmpeg", ...(await buildEditCommand(resolved, state)).args];
      }
    }
    stages.push(result);
  }
  return { ...plan, ok: true, dry_run: true, stages };
};

const runSceneUnlocked = async (
  resolved: ResolvedScene,
  options: SceneRunOptions,
  launcher: RunLauncher,
): Promise<SceneRunResult> => {
  validateOptions(resolved, options);
  const state = await readState(resolved.dir);
  const force = (options.force ?? []).filter((id) =>
    isSelected(
      id,
      id === "edit" ? "edit" : resolved.stages.find((stage) => stage.id === id)!.kind,
      options,
    ),
  );
  if (options.dryRun) return dryRun(resolved, state, options, force);
  const actions = new Map<string, Partial<StageResult>>();
  let stopped = false;
  const remainingForce = new Set(force);
  const hashes = new FileHashCache();
  for (const id of [...resolved.stages.map((stage) => stage.id), "edit"]) {
    const plan = await buildPlan(resolved, state, [...remainingForce], hashes);
    const entry = plan.stages.find((item) => item.id === id)!;
    actions.set(id, { action: "skipped" });
    if (options.failFast && isSelected(id, entry.kind, options) && entry.status === "needs_pick") {
      stopped = true;
    }
    if (
      stopped ||
      !isSelected(id, entry.kind, options) ||
      entry.status === "fresh" ||
      entry.status === "needs_pick" ||
      entry.waiting_for.length
    )
      continue;
    const stage = resolved.stages.find((item) => item.id === id);
    const start = Date.now();
    let jobIds: string[] = [];
    let argv: string[] | undefined;
    try {
      let outputs: SceneOutput[];
      let action: StageResult["action"];
      if (!stage) {
        const edited = await executeEdit(resolved, state);
        outputs = [
          { ...(await outputRecord(resolved.dir, edited.file)), metadata: { ...edited.metadata } },
        ];
        action = "edited";
      } else if (stage.file) {
        outputs = await copyOutputs(resolved, stage, [stage.file]);
        action = "copied";
      } else {
        if ((stage.config.candidates ?? 1) > 1) await requireMediaTools();
        await resizeKeyframe(resolved, stage, state);
        argv = buildSceneRunArgs(resolved, stage, state, options);
        const result = await launcher(argv, resolved.cwd);
        let parsed: z.infer<typeof resultSchema>;
        try {
          parsed = resultSchema.parse(JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))));
        } catch {
          throw new CliError("SCENE_RUN_FAILED", "Generation returned invalid JSON", 3, {
            stderr: result.stderr.slice(-8000),
          });
        }
        jobIds = parsed.jobs?.map(({ job_id }) => job_id) ?? [];
        if (result.exitCode !== 0 || !parsed.ok)
          throw new CliError(
            parsed.error?.code ?? "SCENE_RUN_FAILED",
            parsed.error?.message ?? "Generation failed",
            3,
            { cause: parsed.error?.details, stderr: result.stderr.slice(-8000) },
          );
        const files = (parsed.runs ?? [])
          .flatMap((run) => run.outputs)
          .filter((output) =>
            extensions[stage.kind].has(path.extname(output.saved_to).toLowerCase()),
          )
          .map((output) => path.resolve(parsed.output_dir ?? resolved.cwd, output.saved_to));
        const expected = stage.kind === "keyframe" ? (stage.config.candidates ?? 1) : 1;
        if (files.length !== expected)
          throw new CliError(
            "SCENE_OUTPUT_INVALID",
            `Expected ${expected} ${stage.kind} output(s), received ${files.length}`,
            3,
          );
        outputs = await copyOutputs(resolved, stage, files);
        action = "generated";
      }
      const record: StageState = {
        fingerprint: entry.fingerprint,
        inputs: entry.inputs,
        outputs,
        job_ids: jobIds,
        duration_ms: Date.now() - start,
        completed_at: new Date().toISOString(),
        revision: randomUUID(),
      };
      if (entry.kind === "keyframe" && mediaOutputs(record).length === 1) {
        record.pick = 1;
        record.picked_sha256 = mediaOutputs(record)[0].sha256;
      }
      state.stages[id] = record;
      await writeState(resolved.dir, state);
      remainingForce.delete(id);
      actions.set(id, { action, ...(argv ? { argv } : {}), job_ids: jobIds });
      if (options.failFast && entry.kind === "keyframe" && !record.pick) stopped = true;
    } catch (error) {
      const failure = errorPayloadFrom(error).error;
      state.stages[id] = {
        fingerprint: entry.fingerprint,
        inputs: entry.inputs,
        outputs: [],
        job_ids: jobIds,
        duration_ms: Date.now() - start,
        completed_at: new Date().toISOString(),
        revision: randomUUID(),
        error: failure,
      };
      await writeState(resolved.dir, state);
      actions.set(id, { action: "failed", ...(argv ? { argv } : {}), job_ids: jobIds });
      if (options.failFast) stopped = true;
    }
  }
  const plan = await buildPlan(resolved, state, [], hashes);
  return {
    ...plan,
    ok: ![...actions.values()].some((action) => action.action === "failed"),
    dry_run: false,
    stages: plan.stages.map((entry) => ({ ...entry, action: "skipped", ...actions.get(entry.id) })),
  };
};

export const runScene = async (
  resolved: ResolvedScene,
  options: SceneRunOptions = {},
  launcher: RunLauncher = cliLauncher,
): Promise<SceneRunResult> => {
  validateOptions(resolved, options);
  return options.dryRun
    ? runSceneUnlocked(resolved, options, launcher)
    : withSceneLock(resolved.dir, () => runSceneUnlocked(resolved, options, launcher));
};

export const pickScene = async (resolved: ResolvedScene, shot: string, choice: number) =>
  withSceneLock(resolved.dir, async () => {
    if (!resolved.scene.shots.some((item) => item.id === shot))
      throw sceneInvalid("shot", `Unknown shot: ${shot}`);
    const state = await readState(resolved.dir);
    const id = `${shot}/keyframe`;
    const plan = await buildPlan(resolved, state);
    const entry = plan.stages.find((stage) => stage.id === id)!;
    if (!["fresh", "needs_pick"].includes(entry.status))
      throw sceneInvalid("pick", "Keyframes are missing or stale; run the keyframe stage first");
    const record = state.stages[id];
    const output = mediaOutputs(record)[choice - 1];
    if (!Number.isInteger(choice) || !output)
      throw sceneInvalid("pick", `Choose a candidate from 1 to ${mediaOutputs(record).length}`);
    record.pick = choice;
    record.picked_sha256 = await hashFile(path.join(resolved.dir, output.path));
    await writeState(resolved.dir, state);
    return buildPlan(resolved, state);
  });
