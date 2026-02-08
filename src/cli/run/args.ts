import { CliError } from "../../io/errors.js";
import { t } from "../../i18n/index.js";
import type { Preset } from "../../preset/schema.js";
import type { RunOptions } from "./types.js";

export const parseNumeric = (value: string, name: string, integer = false) => {
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    throw new CliError("INVALID_PARAM", t("run.invalid_number", { name }), 2, {
      value,
    });
  }
  if (integer && !Number.isInteger(num)) {
    throw new CliError("INVALID_PARAM", t("run.invalid_integer", { name }), 2, {
      value,
    });
  }
  return num;
};

const parseBool = (value: string) => {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new CliError("INVALID_PARAM", t("run.invalid_bool"), 2, {
    value,
  });
};

const coerceParamValue = (type: string, rawValue: string | boolean) => {
  if (type === "string") return String(rawValue);
  if (type === "int") return parseNumeric(String(rawValue), "int", true);
  if (type === "float") return parseNumeric(String(rawValue), "float", false);
  if (type === "bool") {
    if (typeof rawValue === "boolean") return rawValue;
    return parseBool(String(rawValue));
  }
  if (type === "json") {
    if (typeof rawValue !== "string") return rawValue;
    try {
      return JSON.parse(rawValue);
    } catch {
      throw new CliError("INVALID_PARAM", t("run.invalid_json"), 2, {
        value: rawValue,
      });
    }
  }
  return rawValue;
};

const parseArgv = (argv: string[]) => {
  const map: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const trimmed = token.slice(2);
    if (trimmed.length === 0) continue;

    const delimiterIndex = trimmed.indexOf("=");
    if (delimiterIndex >= 0) {
      const name = trimmed.slice(0, delimiterIndex);
      const inlineValue = trimmed.slice(delimiterIndex + 1);
      if (!name) continue;
      map[name] = inlineValue;
      continue;
    }

    const name = trimmed;
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      map[name] = true;
      continue;
    }
    map[name] = next;
    i += 1;
  }
  return map;
};

const KNOWN_RUN_FLAGS = new Set([
  "json",
  "dry-run",
  "out",
  "n",
  "seed",
  "seed-step",
  "poll-interval-ms",
  "timeout-seconds",
  "base-url",
  "source",
  "global",
  "lang",
]);

export const resolveDynamicArgs = (
  rawArgs: string[],
  preset: Preset,
): { params: Record<string, unknown>; uploads: Record<string, string> } => {
  const parsed = parseArgv(rawArgs);
  const params: Record<string, unknown> = {};
  const uploads: Record<string, string> = {};

  const parameters = preset.parameters ?? {};
  const uploadsDef = preset.uploads ?? {};

  const paramNames = new Set(Object.keys(parameters));
  const uploadFlags = new Map<string, string>();
  for (const [name, def] of Object.entries(uploadsDef)) {
    const flag = def.cli_flag.replace(/^--/, "");
    uploadFlags.set(flag, name);
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (KNOWN_RUN_FLAGS.has(key)) continue;
    if (uploadFlags.has(key)) {
      if (typeof value !== "string") {
        throw new CliError("INVALID_PARAM", t("run.file_path_required", { key }), 2, {
          flag: key,
        });
      }
      uploads[uploadFlags.get(key)!] = value;
      continue;
    }
    if (!paramNames.has(key)) {
      throw new CliError("UNKNOWN_PARAM", t("run.unknown_param", { key }), 2, {
        param: key,
      });
    }
    const def = parameters[key]!;
    if (typeof value === "boolean" && def.type !== "bool") {
      throw new CliError("INVALID_PARAM", t("run.value_required", { key }), 2, { param: key });
    }
    params[key] = coerceParamValue(def.type, value);
  }

  for (const [name, def] of Object.entries(parameters)) {
    if (params[name] !== undefined) continue;
    if (def.default !== undefined) {
      params[name] = def.default;
      continue;
    }
    if (def.required) {
      throw new CliError("MISSING_REQUIRED_PARAM", t("param.required", { param: name }), 2, {
        param: name,
      });
    }
  }

  return { params, uploads };
};

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export const resolveSeedValues = (
  preset: Preset,
  _params: Record<string, unknown>,
  options: RunOptions,
  runCount: number,
) => {
  const seedOption = options.seed;
  const seedStepOption = options.seedStep;

  if (!seedOption && !seedStepOption) {
    return Array.from({ length: runCount }, () => null);
  }

  const hasSeedParam = preset.parameters && "seed" in preset.parameters;
  if (!hasSeedParam) {
    throw new CliError("MISSING_SEED_TARGET", t("run.missing_seed_target"), 2);
  }

  if (!seedOption && seedStepOption) {
    throw new CliError("INVALID_PARAM", t("run.seed_step_requires_seed"), 2);
  }

  if (seedOption === "random") {
    return Array.from({ length: runCount }, () => randomSeed());
  }

  const baseSeed = parseNumeric(seedOption!, "seed", true);
  const step = seedStepOption ? parseNumeric(seedStepOption, "seed-step", true) : 0;
  return Array.from({ length: runCount }, (_, idx) => baseSeed + step * idx);
};
