import path from "node:path";
import { promises as fs } from "node:fs";
import { resolveSeedTargets } from "../cli/run/args.js";
import { EDIT_GRAPH_VERSION } from "./edit.js";
import { changeReasons, fingerprint, FileHashCache } from "./fingerprint.js";
import type { ResolvedScene, ResolvedStage } from "./resolve.js";
import type { StageKind } from "./schema.js";
import {
  dependencyToken,
  mediaOutputs,
  pickedOutput,
  readState,
  type SceneState,
  type StageState,
} from "./state.js";

export type StageStatus = "fresh" | "stale" | "missing" | "needs_pick" | "blocked" | "failed";
export type StagePlan = {
  id: string;
  kind: StageKind;
  status: StageStatus;
  reasons: string[];
  estimate_ms: number | null;
  fingerprint: string;
  inputs: Record<string, unknown>;
  waiting_for: string[];
  outputs: StageState["outputs"];
  error?: StageState["error"];
};
export type ScenePlan = {
  scene: string;
  stages: StagePlan[];
  next_action: string;
  final?: string;
  report?: string;
};

export const stageDependencies = (stage: ResolvedStage): string[] =>
  stage.kind === "video" && !stage.file ? [`${stage.shot}/keyframe`] : [];

export const stageInputs = (
  resolved: ResolvedScene,
  stage: ResolvedStage,
  state: SceneState,
): Record<string, unknown> => {
  if (stage.file) return { file: stage.fileHash };
  const keyframe = stage.shot ? state.stages[`${stage.shot}/keyframe`] : undefined;
  const params = { ...stage.params };
  if (stage.prompt !== undefined) {
    const parameters = stage.preset!.parameters ?? {};
    const name = Object.hasOwn(parameters, "prompt")
      ? "prompt"
      : Object.keys(parameters).find((key) => parameters[key].aliases?.includes("prompt"));
    if (name) delete params[name];
  }
  // Seed parameters are supplied by --seed, including preset defaults.
  for (const { param } of resolveSeedTargets(stage.preset!)) delete params[param];
  return {
    [stage.kind]: {
      preset: stage.config.preset,
      preset_sha256: stage.presetHash,
      workflow_sha256: stage.workflowHash,
      prompt: stage.prompt,
      params,
      seed: stage.config.seed,
      candidates: stage.config.candidates ?? 1,
      ...(stage.kind === "keyframe" && resolved.scene.character
        ? { character: resolved.scene.character, form: resolved.scene.form }
        : {}),
      inputs: Object.fromEntries(
        Object.entries(stage.inputs).map(([slot, input]) => [
          slot,
          "keyframe" in input
            ? {
                sha256: pickedOutput(keyframe)?.sha256 ?? null,
                input_size: stage.config.input_size ?? null,
              }
            : { sha256: input.sha256 },
        ]),
      ),
    },
    ...Object.fromEntries(
      stageDependencies(stage).map((id) => [`upstream:${id}`, dependencyToken(state.stages[id])]),
    ),
  };
};

const editInputs = (resolved: ResolvedScene, state: SceneState): Record<string, unknown> => ({
  edit: {
    clips: resolved.scene.shots.map((shot) => ({
      id: shot.id,
      sha256: mediaOutputs(state.stages[`${shot.id}/video`])[0]?.sha256 ?? null,
    })),
    cut: resolved.scene.shots.map((shot) => ({ id: shot.id, ...shot.cut })),
    bgm: resolved.scene.bgm
      ? {
          sha256: mediaOutputs(state.stages.bgm)[0]?.sha256 ?? null,
          start: resolved.scene.bgm.start,
        }
      : null,
    ...resolved.scene.edit,
    graph_version: EDIT_GRAPH_VERSION,
  },
  ...Object.fromEntries(
    editDependencies(resolved).map((id) => [`upstream:${id}`, dependencyToken(state.stages[id])]),
  ),
});
export const editDependencies = (resolved: ResolvedScene) => [
  ...resolved.scene.shots.map((shot) => `${shot.id}/video`),
  ...(resolved.scene.bgm ? ["bgm"] : []),
];

const estimate = (
  stage: ResolvedStage | undefined,
  record: StageState | undefined,
  state: SceneState,
): number | null => {
  if (record?.duration_ms !== undefined && !record.error) return record.duration_ms;
  if (!stage?.config.preset) return null;
  const times = Object.values(state.stages)
    .filter(
      (entry) =>
        !entry.error &&
        Object.values(entry.inputs).some(
          (value) =>
            value &&
            typeof value === "object" &&
            (value as Record<string, unknown>).preset === stage.config.preset,
        ),
    )
    .map((entry) => entry.duration_ms)
    .sort((a, b) => a - b);
  if (!times.length) return null;
  const mid = Math.floor(times.length / 2);
  return times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
};

const planStage = async (
  resolved: ResolvedScene,
  state: SceneState,
  plans: StagePlan[],
  id: string,
  kind: StageKind,
  inputs: Record<string, unknown>,
  dependencies: string[],
  forced: ReadonlySet<string>,
  hashes: FileHashCache,
  stage?: ResolvedStage,
): Promise<StagePlan> => {
  const previous = state.stages[id];
  const current = fingerprint(inputs);
  const reasons = previous ? changeReasons(previous.inputs, inputs) : ["no_record"];
  let status: StageStatus = previous
    ? previous.fingerprint === current
      ? "fresh"
      : "stale"
    : "missing";
  if (previous) {
    if (!mediaOutputs(previous).length) {
      status = "missing";
      reasons.push("outputs_missing");
    }
    for (const output of previous.outputs) {
      try {
        if ((await hashes.hash(path.join(resolved.dir, output.path))) !== output.sha256) {
          status = "stale";
          reasons.push(`output_changed:${output.path}`);
        }
      } catch {
        status = "missing";
        reasons.push(`output_missing:${output.path}`);
      }
    }
    if (previous.error) {
      status = "failed";
      reasons.push("last_run_failed");
    }
  }
  if (forced.has(id)) {
    status = previous ? "stale" : "missing";
    reasons.push("forced");
  }
  const waiting = dependencies.filter(
    (id) => plans.find((stage) => stage.id === id)?.status !== "fresh",
  );
  for (const dependency of waiting) reasons.push(`upstream:${dependency}`);
  if (waiting.length) {
    const needsPick = waiting.some(
      (id) => plans.find((stage) => stage.id === id)?.status === "needs_pick",
    );
    status = previous && mediaOutputs(previous).length && !needsPick ? "stale" : "blocked";
  } else if (kind === "keyframe" && status === "fresh") {
    const selected = pickedOutput(previous);
    if (!selected || selected.sha256 !== previous?.picked_sha256) {
      status = "needs_pick";
      reasons.push("pick_required");
    }
  }
  return {
    id,
    kind,
    status,
    reasons: [...new Set(reasons)],
    estimate_ms: estimate(stage, previous, state),
    fingerprint: current,
    inputs,
    waiting_for: waiting,
    outputs: previous?.outputs ?? [],
    ...(previous?.error ? { error: previous.error } : {}),
  };
};

export const buildPlan = async (
  resolved: ResolvedScene,
  state?: SceneState,
  force: string[] = [],
  hashes = new FileHashCache(),
): Promise<ScenePlan> => {
  state ??= await readState(resolved.dir);
  const stages: StagePlan[] = [];
  const forced = new Set(force);
  for (const stage of resolved.stages)
    stages.push(
      await planStage(
        resolved,
        state,
        stages,
        stage.id,
        stage.kind,
        stageInputs(resolved, stage, state),
        stageDependencies(stage),
        forced,
        hashes,
        stage,
      ),
    );
  stages.push(
    await planStage(
      resolved,
      state,
      stages,
      "edit",
      "edit",
      editInputs(resolved, state),
      editDependencies(resolved),
      forced,
      hashes,
    ),
  );
  const pick = stages.find((stage) => stage.status === "needs_pick");
  const failed = stages.find((stage) => stage.status === "failed");
  const target = JSON.stringify(resolved.file);
  const next_action = pick
    ? `comfy-agent scene pick ${target} ${pick.id.split("/")[0]} <n>; see out/${pick.id}/candidates.png`
    : failed
      ? `Inspect ${failed.id}: ${failed.error?.message}; then comfy-agent scene run ${target}`
      : stages.some((stage) => stage.status !== "fresh")
        ? `comfy-agent scene run ${target}`
        : "Scene is up to date.";
  const final =
    stages.at(-1)!.status === "fresh" ? mediaOutputs(state.stages.edit)[0]?.path : undefined;
  const report = path.join(resolved.dir, "out", "report", "report.html");
  const hasReport = await fs
    .stat(report)
    .then((stat) => stat.isFile())
    .catch(() => false);
  return {
    scene: resolved.scene.name,
    stages,
    next_action,
    ...(final ? { final: path.join(resolved.dir, final) } : {}),
    ...(hasReport ? { report } : {}),
  };
};
