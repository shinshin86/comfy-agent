export const DEFAULT_COMFY_BASE_URL = "http://127.0.0.1:8188";

export type BaseUrlSource = "--base-url" | "COMFY_AGENT_BASE_URL" | "default";

export type BaseUrlDecision = {
  source: BaseUrlSource;
  value: string;
};

type BaseUrlOptions = {
  baseUrl?: string;
};

export const decideComfyBaseUrl = (
  options: BaseUrlOptions,
  env: NodeJS.ProcessEnv = process.env,
): BaseUrlDecision => {
  if (options.baseUrl) {
    return { source: "--base-url", value: options.baseUrl };
  }
  if (env.COMFY_AGENT_BASE_URL) {
    return { source: "COMFY_AGENT_BASE_URL", value: env.COMFY_AGENT_BASE_URL };
  }
  return { source: "default", value: DEFAULT_COMFY_BASE_URL };
};

export const resolveComfyBaseUrl = (
  options: BaseUrlOptions,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  return decideComfyBaseUrl(options, env).value;
};
