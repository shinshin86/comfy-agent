import path from "node:path";
import { promises as fs } from "node:fs";
import YAML from "yaml";
import { assertRequiredInputs, resolveDynamicArgs, resolveSeedTargets } from "../cli/run/args.js";
import { referenceCandidates } from "../characters/inject.js";
import { resolveCharacterForm } from "../characters/resolve.js";
import { resolveCharacter } from "../characters/store.js";
import { CliError } from "../io/errors.js";
import { getWorkdirPath, type WorkdirScope } from "../io/workdir.js";
import { loadPresetFile } from "../preset/loader.js";
import { resolvePresetPath } from "../preset/path.js";
import type { Preset } from "../preset/schema.js";
import { resolveWorkflowPath } from "../workflow/load.js";
import { canonicalJson, hashFile } from "./fingerprint.js";
import {
  parseScene,
  sceneInvalid,
  SceneIdSchema,
  type Scene,
  type SceneStage,
  type StageKind,
} from "./schema.js";

const KEYFRAME = "\u0000scene-keyframe\u0000";
export type ResolvedInput = { file: string; sha256: string } | { keyframe: true };
export type ResolvedStage = {
  id: string;
  kind: Exclude<StageKind, "edit">;
  shot?: string;
  field: string;
  config: SceneStage;
  file?: string;
  fileHash?: string;
  preset?: Preset;
  presetHash?: string;
  workflowHash?: string;
  params: Record<string, unknown>;
  prompt?: string;
  inputs: Record<string, ResolvedInput>;
};
export type ResolvedScene = {
  scene: Scene;
  dir: string;
  file: string;
  cwd: string;
  scope: WorkdirScope;
  stages: ResolvedStage[];
  reference?: string;
};
export type ResolveOptions = { cwd?: string; scope?: WorkdirScope };

const exists = async (file: string) => {
  try {
    return (await fs.stat(file)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

export const resolveScenePath = async (
  target: string,
  options: ResolveOptions = {},
): Promise<string> => {
  const cwd = options.cwd ?? process.cwd();
  const direct = path.resolve(cwd, target);
  for (const candidate of [direct, path.join(direct, "scene.yaml")])
    if (await exists(candidate)) return candidate;
  if (SceneIdSchema.safeParse(target).success) {
    for (const scope of options.scope ? [options.scope] : (["local", "global"] as const)) {
      const candidate = path.join(getWorkdirPath(cwd, scope), "scenes", target, "scene.yaml");
      if (await exists(candidate)) return candidate;
    }
  }
  throw new CliError("SCENE_NOT_FOUND", `Scene not found: ${target}`, 2, { scene: target });
};

export const expandPlaceholders = (
  value: string,
  values: Record<string, string | undefined>,
  field: string,
): string =>
  value.replace(/\{\{|\}\}|\{([^{}]+)\}|[{}]/g, (match, name: string | undefined) => {
    if (match === "{{") return "{";
    if (match === "}}") return "}";
    if (name === undefined || !Object.hasOwn(values, name) || values[name] === undefined) {
      throw sceneInvalid(
        field,
        `Unknown or unavailable placeholder ${match}; use {{ and }} for literal braces`,
      );
    }
    return values[name]!;
  });

const expandValue = (
  value: unknown,
  values: Record<string, string | undefined>,
  field: string,
): unknown => {
  if (typeof value === "string") return expandPlaceholders(value, values, field);
  if (Array.isArray(value))
    return value.map((item, index) => expandValue(item, values, `${field}[${index}]`));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        expandValue(item, values, `${field}.${key}`),
      ]),
    );
  return value;
};

const checkedHash = async (file: string, field: string) => {
  try {
    if (!(await fs.stat(file)).isFile()) throw new Error("Not a regular file");
    return await hashFile(file);
  } catch {
    throw sceneInvalid(field, "Input file is missing or unreadable");
  }
};

const resolveStage = async (
  id: string,
  kind: ResolvedStage["kind"],
  config: SceneStage,
  field: string,
  context: Omit<ResolvedScene, "stages">,
  values: Record<string, string | undefined>,
  shot?: string,
): Promise<ResolvedStage> => {
  const stage: ResolvedStage = { id, kind, shot, config, field, params: {}, inputs: {} };
  if (config.file !== undefined) {
    stage.file = path.resolve(context.dir, config.file);
    stage.fileHash = await checkedHash(stage.file, `${field}.file`);
    return stage;
  }
  let presetFile: string;
  try {
    presetFile = await resolvePresetPath(
      config.preset!,
      context.scope,
      "run.preset_not_found",
      context.cwd,
    );
    stage.preset = await loadPresetFile(presetFile);
    stage.presetHash = await hashFile(presetFile);
    stage.workflowHash = await hashFile(
      resolveWorkflowPath(stage.preset, context.scope, context.cwd),
    );
  } catch (error) {
    throw sceneInvalid(`${field}.preset`, error instanceof Error ? error.message : String(error));
  }
  const preset = stage.preset;
  if (!resolveSeedTargets(preset).length)
    throw sceneInvalid(`${field}.seed`, "The preset has no seed target");
  const seedParams = new Set(resolveSeedTargets(preset).map(({ param }) => param));
  const supplied = new Set<string>();
  const parameters = preset.parameters ?? {};
  const addParam = (key: string, value: unknown, location: string) => {
    const name = Object.hasOwn(parameters, key)
      ? key
      : Object.keys(parameters).find((name) => parameters[name].aliases?.includes(key));
    if (!name) throw sceneInvalid(location, `Unknown preset parameter: ${key}`);
    if (supplied.has(name)) throw sceneInvalid(location, `Parameter supplied twice: ${name}`);
    if (seedParams.has(name))
      throw sceneInvalid(location, "Use the stage seed field instead of a seed parameter");
    supplied.add(name);
    const def = parameters[name];
    try {
      const raw = def.type === "json" ? JSON.stringify(value) : String(value);
      const parsed = resolveDynamicArgs([`--${name}=${raw}`], preset).params[name];
      if (parsed === undefined)
        throw new Error(`Parameter name conflicts with a CLI flag: ${name}`);
      if (
        typeof parsed === "number" &&
        ((def.min !== undefined && parsed < def.min) || (def.max !== undefined && parsed > def.max))
      )
        throw new Error("Value is outside the preset range");
      if (
        def.choices &&
        !def.choices.some((choice) => canonicalJson(choice) === canonicalJson(parsed))
      )
        throw new Error("Value is not one of the preset choices");
      stage.params[name] = parsed;
    } catch (error) {
      throw sceneInvalid(location, error instanceof Error ? error.message : String(error));
    }
  };
  if (config.prompt !== undefined) {
    stage.prompt = expandPlaceholders(config.prompt, values, `${field}.prompt`);
    addParam("prompt", stage.prompt, `${field}.prompt`);
  }
  for (const [key, value] of Object.entries(config.params ?? {}))
    addParam(key, expandValue(value, values, `${field}.params.${key}`), `${field}.params.${key}`);
  for (const [key, value] of Object.entries(config.inputs ?? {})) {
    const location = `${field}.inputs.${key}`;
    const uploads = preset.uploads ?? {};
    const slot = Object.hasOwn(uploads, key)
      ? key
      : Object.keys(uploads).find(
          (name) =>
            uploads[name].cli_flag.replace(/^--/, "") === key ||
            uploads[name].aliases?.some((alias) => alias.replace(/^--/, "") === key),
        );
    if (!slot) throw sceneInvalid(location, `Unknown upload slot: ${key}`);
    if (Object.hasOwn(stage.inputs, slot))
      throw sceneInvalid(location, `Upload supplied twice: ${slot}`);
    const expanded = expandPlaceholders(
      value,
      { ...values, ...(kind === "video" ? { keyframe: KEYFRAME } : {}) },
      location,
    );
    if (expanded === KEYFRAME) stage.inputs[slot] = { keyframe: true };
    else {
      if (expanded.includes(KEYFRAME))
        throw sceneInvalid(location, "{keyframe} must occupy the whole input value");
      const file = path.resolve(context.dir, expanded);
      stage.inputs[slot] = { file, sha256: await checkedHash(file, location) };
    }
  }
  try {
    assertRequiredInputs(
      preset,
      {
        ...Object.fromEntries(
          Object.entries(parameters)
            .filter(([, def]) => def.default !== undefined)
            .map(([name, def]) => [name, def.default]),
        ),
        ...stage.params,
        ...Object.fromEntries([...seedParams].map((name) => [name, config.seed])),
      },
      Object.fromEntries(Object.keys(stage.inputs).map((key) => [key, "input"])),
    );
  } catch (error) {
    throw sceneInvalid(field, error instanceof Error ? error.message : String(error));
  }
  return stage;
};

export const resolveScene = async (
  target: string,
  options: ResolveOptions = {},
): Promise<ResolvedScene> => {
  const cwd = options.cwd ?? process.cwd();
  const file = await resolveScenePath(target, options);
  let scene: Scene;
  try {
    scene = parseScene(YAML.parse(await fs.readFile(file, "utf-8")));
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw sceneInvalid("scene", String(error));
  }
  const dir = path.dirname(file);
  const globalRoot = path.join(getWorkdirPath(cwd, "global"), "scenes") + path.sep;
  const scope = options.scope ?? (dir.startsWith(globalRoot) ? "global" : "local");
  const context = { scene, dir, file, cwd, scope };
  const values: Record<string, string | undefined> = { ...scene.vars };
  if (scene.character) {
    try {
      const resolved = await resolveCharacter(scene.character, {
        cwd,
        ...(scope === "global" ? { scope } : {}),
      });
      const form = resolveCharacterForm(resolved.character, scene.form);
      values.appearance = form.appearance ?? resolved.character.appearance;
      const ref = referenceCandidates(resolved.character, scene.form)[0];
      values.ref = ref ? path.join(resolved.path, ref) : undefined;
    } catch (error) {
      throw sceneInvalid("character", error instanceof Error ? error.message : String(error));
    }
  }
  const stages: ResolvedStage[] = [];
  for (const [index, shot] of scene.shots.entries()) {
    for (const kind of ["keyframe", "video"] as const)
      stages.push(
        await resolveStage(
          `${shot.id}/${kind}`,
          kind,
          shot[kind],
          `shots[${index}].${kind}`,
          context,
          values,
          shot.id,
        ),
      );
  }
  if (scene.bgm) stages.push(await resolveStage("bgm", "bgm", scene.bgm, "bgm", context, values));
  return { ...context, stages, ...(values.ref ? { reference: values.ref } : {}) };
};
