import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { resolveSeedTargets } from "../cli/run/args.js";
import { getSubdirPath } from "../io/workdir.js";
import type { JobRecord } from "../jobs/types.js";
import { loadPresetFile } from "../preset/loader.js";
import type { ParameterRole, Preset } from "../preset/schema.js";

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

export const MAX_RERUN_COUNT = 4;

export type RerunUnsupportedReason = "uploads" | "remote_source" | "preset_missing";

export type RerunField = {
  name: string;
  role: ParameterRole;
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
    };

export type RerunRequest = {
  overrides: Record<string, unknown>;
  seed: "same" | "new";
  count: number;
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
  // Upload values are server-side names of already-uploaded files, not local
  // paths, so they cannot be passed back to `run` as-is.
  if (Object.keys(record.uploads).length > 0) return { reason: "uploads" };
  if (record.source !== "local") return { reason: "remote_source" };
  const file = await presetPath(cwd, record);
  if (!file) return { reason: "preset_missing" };
  try {
    return { preset: await loadPresetFile(file) };
  } catch {
    return { reason: "preset_missing" };
  }
};

export const buildRerunForm = (record: JobRecord, preset: Preset): RerunForm => {
  const fields = Object.entries(preset.parameters ?? {})
    .filter(([, def]) => def.role !== undefined && EDITABLE_ROLES.includes(def.role))
    .map(([name, def]) => ({
      name,
      role: def.role!,
      type: def.type,
      description: def.description,
      value: record.params[name] ?? def.default ?? "",
      min: def.min,
      max: def.max,
    }))
    .sort((left, right) => EDITABLE_ROLES.indexOf(left.role) - EDITABLE_ROLES.indexOf(right.role));
  return {
    supported: true,
    preset: preset.name,
    fields,
    seed: record.seed,
    has_seed: resolveSeedTargets(preset).length > 0,
  };
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
  const parameters = preset.parameters ?? {};
  const editable = new Set(
    Object.entries(parameters)
      .filter(([, def]) => def.role !== undefined && EDITABLE_ROLES.includes(def.role))
      .map(([name]) => name),
  );
  const params: Record<string, unknown> = { ...record.params };
  for (const [name, value] of Object.entries(request.overrides)) {
    if (!editable.has(name)) throw new Error(`Parameter cannot be edited: ${name}`);
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

  start(cwd: string, record: JobRecord, args: string[], count: number): StudioRun {
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
    void this.launcher(args, cwd)
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
