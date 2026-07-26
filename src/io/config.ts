import path from "node:path";
import { promises as fs, readFileSync } from "node:fs";
import YAML from "yaml";
import { getWorkdirPath, type WorkdirScope } from "./workdir.js";

export const CONFIG_FILE = "config.yaml";

export type AgentConfig = {
  version: number;
  base_url?: string;
};

export const getConfigPath = (cwd = process.cwd(), scope: WorkdirScope = "local") => {
  return path.join(getWorkdirPath(cwd, scope), CONFIG_FILE);
};

const parseConfig = (raw: string): AgentConfig | null => {
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const baseUrl = typeof obj.base_url === "string" && obj.base_url ? obj.base_url : undefined;
  const version = typeof obj.version === "number" ? obj.version : 1;
  return { version, base_url: baseUrl };
};

/**
 * Synchronous read used by base URL resolution, which is called from
 * synchronous option-parsing paths. Returns null when the file is missing
 * or unparsable (a broken config must never crash unrelated commands).
 */
export const readConfigSync = (
  cwd = process.cwd(),
  scope: WorkdirScope = "local",
): AgentConfig | null => {
  try {
    const raw = readFileSync(getConfigPath(cwd, scope), "utf-8");
    return parseConfig(raw);
  } catch {
    return null;
  }
};

export const writeConfig = async (
  config: AgentConfig,
  cwd = process.cwd(),
  scope: WorkdirScope = "local",
): Promise<string> => {
  const configPath = getConfigPath(cwd, scope);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const existing = readConfigSync(cwd, scope);
  const merged: AgentConfig = { ...existing, ...config, version: 1 };
  await fs.writeFile(configPath, YAML.stringify(merged), "utf-8");
  return configPath;
};
