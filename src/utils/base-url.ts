import { readConfigSync } from "../io/config.js";

export const DEFAULT_COMFY_BASE_URL = "http://127.0.0.1:8188";

export type BaseUrlSource = "--base-url" | "COMFY_AGENT_BASE_URL" | "config" | "default";

export type BaseUrlDecision = {
  source: BaseUrlSource;
  value: string;
  config_path?: string;
};

type BaseUrlOptions = {
  baseUrl?: string;
  global?: boolean;
};

export type ConfigReader = (scope: "local" | "global") => { base_url?: string } | null;

const defaultConfigReader: ConfigReader = (scope) => readConfigSync(process.cwd(), scope);

export const decideComfyBaseUrl = (
  options: BaseUrlOptions,
  env: NodeJS.ProcessEnv = process.env,
  readConfig: ConfigReader = defaultConfigReader,
): BaseUrlDecision => {
  if (options.baseUrl) {
    return { source: "--base-url", value: options.baseUrl };
  }
  if (env.COMFY_AGENT_BASE_URL) {
    return { source: "COMFY_AGENT_BASE_URL", value: env.COMFY_AGENT_BASE_URL };
  }
  // Config lookup honors the command's scope first, then falls back to the
  // other scope so a `connect` done in either scope is still discoverable.
  const scopes = options.global ? (["global", "local"] as const) : (["local", "global"] as const);
  for (const scope of scopes) {
    const config = readConfig(scope);
    if (config?.base_url) {
      return { source: "config", value: config.base_url };
    }
  }
  return { source: "default", value: DEFAULT_COMFY_BASE_URL };
};

export const resolveComfyBaseUrl = (
  options: BaseUrlOptions,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  return decideComfyBaseUrl(options, env).value;
};
