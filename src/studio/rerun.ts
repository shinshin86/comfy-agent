import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { ComfyClient } from "../api/client.js";
import { resolveSeedTargets } from "../cli/run/args.js";
import { getSubdirPath, getWorkdirPath } from "../io/workdir.js";
import type { JobRecord } from "../jobs/types.js";
import { loadPresetFile } from "../preset/loader.js";
import type { ParameterDef, ParameterRole, Preset, UploadDef } from "../preset/schema.js";

/**
 * Re-running a past job needs no creative judgment: the preset and every
 * parameter are already in the job record. The studio runs these itself via
 * the regular `comfy-agent run`, so CLI, agent and studio share one code path.
 * Anything that needs a new method or model still goes to the agent.
 */

// Roles the user can tweak in the studio. Everything else is replayed as-is.
const EDITABLE_ROLES: ParameterRole[] = [
  "prompt",
  "negative_prompt",
  "width",
  "height",
  "steps",
  "guidance",
  "denoise",
  "strength",
];

// Video timing has no dedicated role; presets expose it through these aliases.
const EDITABLE_ALIASES = [
  "length",
  "frames",
  "num_frames",
  "fps",
  "frame_rate",
  "duration",
  "seconds",
];

const editableAlias = (def: ParameterDef): string | undefined =>
  def.aliases
    ?.find((alias) => EDITABLE_ALIASES.includes(alias.replace(/^--/, "")))
    ?.replace(/^--/, "");

const isEditable = (def: ParameterDef) =>
  (def.role !== undefined && EDITABLE_ROLES.includes(def.role)) || editableAlias(def) !== undefined;

const editableOrder = (def: ParameterDef) => {
  const alias = editableAlias(def);
  if (def.role !== undefined && EDITABLE_ROLES.includes(def.role)) {
    return EDITABLE_ROLES.indexOf(def.role);
  }
  return EDITABLE_ROLES.length + EDITABLE_ALIASES.indexOf(alias ?? "");
};

export const MAX_RERUN_COUNT = 4;

export type RerunUnsupportedReason = "remote_source" | "preset_missing";

export type RerunInput = {
  name: string;
  kind: UploadDef["kind"];
  /** Server-side name recorded when the job was submitted. */
  server_name: string;
  /** "local": the original file is still on disk; "server": only the ComfyUI copy is known. */
  source: "local" | "server";
  url?: string;
};

/** A replacement input picked from the studio gallery. */
export type RerunInputOverride = { job_id: string; output_index: number };

export type RerunField = {
  name: string;
  role?: ParameterRole;
  /** Short label: the role, or the alias that made the field editable (e.g. "length"). */
  label: string;
  type: "string" | "int" | "float" | "bool" | "json";
  description?: string;
  value: unknown;
  min?: number;
  max?: number;
};

export type RerunForm =
  | { supported: false; reason: RerunUnsupportedReason }
  | {
      supported: true;
      preset: string;
      fields: RerunField[];
      seed: number | null;
      has_seed: boolean;
      inputs: RerunInput[];
    };

export type RerunRequest = {
  overrides: Record<string, unknown>;
  seed: "same" | "new";
  count: number;
  /** Local file for every upload slot of the job, resolved by `resolveRerunInputs`. */
  inputs?: Record<string, string>;
  /** Language for the CLI's own error messages shown in the studio. */
  lang?: "en" | "ja";
};

const presetPath = async (cwd: string, record: JobRecord): Promise<string | null> => {
  const base = path.join(getSubdirPath("presets", cwd, record.scope), record.preset);
  for (const candidate of [`${base}.yaml`, `${base}.yml`]) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {
      // try the next extension
    }
  }
  return null;
};

export const loadRerunPreset = async (
  cwd: string,
  record: JobRecord,
): Promise<{ preset: Preset } | { reason: RerunUnsupportedReason }> => {
  if (record.source !== "local") return { reason: "remote_source" };
  const file = await presetPath(cwd, record);
  if (!file) return { reason: "preset_missing" };
  try {
    return { preset: await loadPresetFile(file) };
  } catch {
    return { reason: "preset_missing" };
  }
};

const fileExists = async (filePath: string) => {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
};

export const uploadSlots = (record: JobRecord, preset: Preset) =>
  Object.entries(record.uploads).flatMap(([name, serverName]) => {
    const def =
      preset.uploads && Object.hasOwn(preset.uploads, name) ? preset.uploads[name] : undefined;
    return def ? [{ name, def, serverName }] : [];
  });

/** Validate edits before resolving files or starting a run. */
export const validateRerunRequest = (
  record: JobRecord,
  preset: Preset,
  overrides: Record<string, unknown>,
  inputOverrides: Record<string, RerunInputOverride> = {},
): void => {
  const editable = new Set(
    Object.entries(preset.parameters ?? {})
      .filter(([, def]) => isEditable(def))
      .map(([name]) => name),
  );
  for (const name of Object.keys(overrides)) {
    if (!editable.has(name)) throw new Error(`Parameter cannot be edited: ${name}`);
  }
  const inputs = new Set(uploadSlots(record, preset).map(({ name }) => name));
  for (const name of Object.keys(inputOverrides)) {
    if (!inputs.has(name)) throw new Error(`Unknown input: ${name}`);
  }
};

export const buildRerunForm = async (record: JobRecord, preset: Preset): Promise<RerunForm> => {
  const inputs: RerunInput[] = [];
  for (const { name, def, serverName } of uploadSlots(record, preset)) {
    const local = record.upload_sources?.[name];
    const source = local && (await fileExists(local)) ? "local" : "server";
    inputs.push({
      name,
      kind: def.kind,
      server_name: serverName,
      source,
      ...(source === "local"
        ? {
            url: `/api/media/input/${encodeURIComponent(record.job_id)}/${encodeURIComponent(name)}`,
          }
        : {}),
    });
  }
  const fields = Object.entries(preset.parameters ?? {})
    .filter(([, def]) => isEditable(def))
    .sort(([, left], [, right]) => editableOrder(left) - editableOrder(right))
    .map(([name, def]) => ({
      name,
      role: def.role,
      label:
        def.role !== undefined && EDITABLE_ROLES.includes(def.role)
          ? def.role
          : (editableAlias(def) ?? name),
      type: def.type,
      description: def.description,
      value: record.params[name] ?? def.default ?? "",
      min: def.min,
      max: def.max,
    }));
  return {
    supported: true,
    preset: preset.name,
    fields,
    seed: record.seed,
    has_seed: resolveSeedTargets(preset).length > 0,
    inputs,
  };
};

const acceptsKind = (uploadKind: UploadDef["kind"], outputKind: string) =>
  uploadKind === "file" ||
  (uploadKind === "audio" ? outputKind === "audio" : outputKind === "image");

export type InputResolverDeps = {
  /** Absolute path and kind of a gallery output, or null if it does not exist. */
  outputFile: (selection: RerunInputOverride) => Promise<{ path: string; kind: string } | null>;
  /** Downloads a file from the ComfyUI input folder (used when the local original is gone). */
  fetchServerInput: (serverName: string) => Promise<Buffer>;
};

/**
 * Picks a local file for every upload slot: a gallery output the user chose,
 * else the recorded original, else a copy fetched from the ComfyUI server.
 */
export const resolveRerunInputs = async (
  cwd: string,
  record: JobRecord,
  preset: Preset,
  overrides: Record<string, RerunInputOverride>,
  deps: InputResolverDeps,
): Promise<Record<string, string>> => {
  validateRerunRequest(record, preset, {}, overrides);
  const slots = uploadSlots(record, preset);
  const resolved: Record<string, string> = {};
  for (const { name, def, serverName } of slots) {
    const override = Object.hasOwn(overrides, name) ? overrides[name] : undefined;
    if (override) {
      const output = await deps.outputFile(override);
      if (!output || !(await fileExists(output.path))) {
        throw new Error(`Output not found for input ${name}.`);
      }
      if (!acceptsKind(def.kind, output.kind)) {
        throw new Error(`Input ${name} needs a ${def.kind} file, got ${output.kind}.`);
      }
      resolved[name] = output.path;
      continue;
    }
    const local = record.upload_sources?.[name];
    if (local && (await fileExists(local))) {
      resolved[name] = local;
      continue;
    }
    const cacheDir = path.join(getWorkdirPath(cwd, "local"), "cache", "studio-inputs");
    await fs.mkdir(cacheDir, { recursive: true });
    const safeName = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, "_");
    const basename = path.posix.basename(serverName.replace(/\\/g, "/"));
    // Unique paths keep concurrent runs and previously recorded sources independent.
    const filename = [
      safeName(record.job_id.slice(0, 8)),
      safeName(name).slice(0, 40),
      randomUUID(),
      safeName(basename).slice(-120),
    ].join("-");
    const target = path.join(cacheDir, filename);
    const data = await deps.fetchServerInput(serverName);
    try {
      await fs.writeFile(target, data, { flag: "wx" });
    } catch (error) {
      await fs.rm(target, { force: true });
      throw error;
    }
    resolved[name] = target;
  }
  return resolved;
};

export const comfyInputFetcher =
  (baseUrl: string) =>
  async (serverName: string): Promise<Buffer> => {
    const subfolder = path.posix.dirname(serverName);
    return new ComfyClient(baseUrl).viewFile({
      filename: path.posix.basename(serverName),
      ...(subfolder && subfolder !== "." ? { subfolder } : {}),
      type: "input",
    });
  };

const argValue = (type: string, value: unknown) =>
  type === "json" ? JSON.stringify(value) : String(value);

/**
 * Builds `comfy-agent run` arguments that replay the record with the user's
 * edits. Every parameter is passed explicitly so the result matches the
 * original job, except seed params when a new seed is requested.
 */
export const buildRerunArgs = (
  record: JobRecord,
  preset: Preset,
  request: RerunRequest,
): string[] => {
  validateRerunRequest(record, preset, request.overrides);
  const parameters = preset.parameters ?? {};
  const params: Record<string, unknown> = { ...record.params };
  for (const [name, value] of Object.entries(request.overrides)) {
    params[name] = value;
  }
  const seedTargets = resolveSeedTargets(preset).map(({ param }) => param);
  const newSeed = request.seed === "new" && seedTargets.length > 0;
  if (newSeed) for (const name of seedTargets) delete params[name];

  const args = ["run", record.preset, "--json", "--source", "local", "--timeout-seconds", "3600"];
  if (record.scope === "global") args.push("--global");
  if (request.count > 1) args.push("--n", String(request.count));
  if (newSeed) args.push("--seed", "random");
  if (request.lang) args.push("--lang", request.lang);
  for (const { name, def } of uploadSlots(record, preset)) {
    const file = request.inputs?.[name];
    if (!file) throw new Error(`No local file for input ${name}.`);
    args.push(`--${def.cli_flag.replace(/^--/, "")}=${file}`);
  }
  for (const [name, value] of Object.entries(params)) {
    const def = parameters[name];
    if (!def || value === undefined || value === null) continue;
    // `--name=value` keeps values that start with "--" from being read as flags.
    args.push(`--${name}=${argValue(def.type, value)}`);
  }
  return args;
};

export type LaunchResult = { exitCode: number; stdout: string; stderr: string };
export type RunLauncher = (args: string[], cwd: string) => Promise<LaunchResult>;

/** Re-invokes this same CLI binary (works for both `dist/` and `tsx` dev runs). */
export const cliLauncher: RunLauncher = (args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, process.argv[1]!, ...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf-8")));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf-8")).slice(-8000);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });

export type StudioRun = {
  id: string;
  source_job_id: string;
  preset: string;
  count: number;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at?: string;
  job_ids: string[];
  error?: { code: string; message: string };
};

const parseRunOutput = (result: LaunchResult) => {
  const start = result.stdout.indexOf("{");
  try {
    return JSON.parse(result.stdout.slice(start)) as {
      ok?: boolean;
      jobs?: Array<{ job_id: string }>;
      error?: { code?: string; message?: string };
    };
  } catch {
    return null;
  }
};

/** In-memory list of runs started from this studio process. */
export class StudioRuns {
  private runs: StudioRun[] = [];

  constructor(
    private readonly launcher: RunLauncher,
    private readonly onChange: () => void,
  ) {}

  list(): StudioRun[] {
    return [...this.runs].reverse().slice(0, 20);
  }

  /** `prepare` resolves inputs (possibly downloading them) before `run` starts. */
  start(
    cwd: string,
    record: JobRecord,
    prepare: () => Promise<string[]>,
    count: number,
  ): StudioRun {
    const run: StudioRun = {
      id: randomUUID(),
      source_job_id: record.job_id,
      preset: record.preset,
      count,
      status: "running",
      started_at: new Date().toISOString(),
      job_ids: [],
    };
    this.runs.push(run);
    this.onChange();
    void prepare()
      .then((args) => this.launcher(args, cwd))
      .then((result) => {
        const parsed = parseRunOutput(result);
        run.job_ids = parsed?.jobs?.map(({ job_id: id }) => id) ?? [];
        if (result.exitCode === 0 && parsed?.ok !== false) {
          run.status = "completed";
        } else {
          run.status = "failed";
          run.error = {
            code: parsed?.error?.code ?? "RUN_FAILED",
            message:
              parsed?.error?.message ??
              result.stderr.trim().split("\n").slice(-3).join("\n") ??
              "comfy-agent run failed.",
          };
        }
      })
      .catch((error: unknown) => {
        run.status = "failed";
        run.error = {
          code: "RUN_FAILED",
          message: error instanceof Error ? error.message : String(error),
        };
      })
      .finally(() => {
        run.finished_at = new Date().toISOString();
        this.onChange();
      });
    return run;
  }
}
