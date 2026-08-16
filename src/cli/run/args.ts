import { CliError } from "../../io/errors.js";
import { t } from "../../i18n/index.js";
import type { Preset } from "../../preset/schema.js";
import { KNOWN_RUN_FLAGS } from "./flags.js";
import type { RunOptions } from "./types.js";

export { KNOWN_RUN_FLAGS } from "./flags.js";

export type SeedTarget = {
  param: string;
  matched_by: "name" | "alias" | "role";
};

export const resolveSeedTargets = (preset: Preset): SeedTarget[] => {
  const parameters = preset.parameters ?? {};
  if (parameters.seed) {
    return [{ param: "seed", matched_by: "name" }];
  }

  const aliasTargets = Object.entries(parameters)
    .filter(([, def]) => def.aliases?.includes("seed"))
    .map(([param]) => ({ param, matched_by: "alias" as const }));
  if (aliasTargets.length > 0) return aliasTargets;

  return Object.entries(parameters)
    .filter(([, def]) => def.role === "seed")
    .map(([param]) => ({ param, matched_by: "role" as const }));
};

export const applySeedValue = (
  params: Record<string, unknown>,
  targets: SeedTarget[],
  seed: number,
): Record<string, unknown> => {
  const seeded = { ...params };
  for (const target of targets) {
    if (!Object.hasOwn(seeded, target.param)) {
      seeded[target.param] = seed;
    }
  }
  return seeded;
};

export const extractRunPassthrough = (presetName: string, commandArgs: string[]): string[] => {
  if (presetName.startsWith("--")) {
    throw new CliError("INVALID_USAGE", t("run.preset_name_first"), 2, {
      received: presetName,
    });
  }
  return commandArgs[0] === presetName ? commandArgs.slice(1) : commandArgs;
};

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

export const parseArgv = (argv: string[]) => {
  const map: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
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
  return { map, positionals };
};

export const resolveDynamicArgs = (
  rawArgs: string[],
  preset: Preset,
): {
  params: Record<string, unknown>;
  uploads: Record<string, string>;
  explicitParams: Set<string>;
} => {
  const { map: parsed, positionals } = parseArgv(rawArgs);
  if (positionals.length > 0) {
    throw new CliError(
      "INVALID_USAGE",
      t("run.unexpected_argument", { value: positionals[0] }),
      2,
      { unexpected: positionals },
    );
  }
  const params: Record<string, unknown> = {};
  const uploads: Record<string, string> = {};
  const explicitParams = new Set<string>();

  const parameters = preset.parameters ?? {};
  const uploadsDef = preset.uploads ?? {};

  const paramNames = new Set(Object.keys(parameters));
  const paramAliases = new Map<string, string>();
  for (const [name, def] of Object.entries(parameters)) {
    for (const alias of def.aliases ?? []) {
      paramAliases.set(alias, name);
    }
  }
  const uploadFlags = new Map<string, string>();
  for (const [name, def] of Object.entries(uploadsDef)) {
    const flag = def.cli_flag.replace(/^--/, "");
    uploadFlags.set(flag, name);
    for (const alias of def.aliases ?? []) {
      uploadFlags.set(alias.replace(/^--/, ""), name);
    }
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
    const paramName = paramNames.has(key) ? key : paramAliases.get(key);
    if (!paramName) {
      throw new CliError("UNKNOWN_PARAM", t("run.unknown_param", { key }), 2, {
        param: key,
      });
    }
    const def = parameters[paramName]!;
    if (typeof value === "boolean" && def.type !== "bool") {
      throw new CliError("INVALID_PARAM", t("run.value_required", { key }), 2, { param: key });
    }
    params[paramName] = coerceParamValue(def.type, value);
    explicitParams.add(paramName);
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

  for (const [name, def] of Object.entries(uploadsDef)) {
    if (uploads[name] !== undefined || !def.required) continue;
    throw new CliError("MISSING_REQUIRED_UPLOAD", t("param.required", { param: def.cli_flag }), 2, {
      upload: name,
      flag: def.cli_flag,
    });
  }

  return { params, uploads, explicitParams };
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

  if (resolveSeedTargets(preset).length === 0) {
    throw new CliError("MISSING_SEED_TARGET", t("run.missing_seed_target"), 2, {
      hint: "add role: seed (or aliases: [seed]) to the seed parameter",
    });
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
