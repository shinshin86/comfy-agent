import type { Preset } from "../preset/schema.js";
import type { JobPromptSource } from "./types.js";

export type PromptTarget = {
  param: string;
  source: JobPromptSource;
};

export type PromptTargets = {
  prompt?: PromptTarget;
  negative?: PromptTarget;
};

const selectTarget = (
  preset: Preset,
  alias: "prompt" | "negative",
  role: "prompt" | "negative_prompt",
): PromptTarget | undefined => {
  const parameters = Object.entries(preset.parameters ?? {});
  const aliasMatch = parameters.find(([, definition]) => definition.aliases?.includes(alias));
  if (aliasMatch) return { param: aliasMatch[0], source: "alias" };

  const roleMatch = parameters.find(
    ([, definition]) => definition.role === role && definition.type === "string",
  );
  return roleMatch ? { param: roleMatch[0], source: "role_fallback" } : undefined;
};

export const selectPromptTargets = (preset: Preset): PromptTargets => {
  const prompt = selectTarget(preset, "prompt", "prompt");
  const negative = selectTarget(preset, "negative", "negative_prompt");
  return {
    ...(prompt ? { prompt } : {}),
    ...(negative ? { negative } : {}),
  };
};

export const summarizePromptFields = (
  preset: Preset,
  params: Record<string, unknown>,
): {
  prompt_input?: string;
  prompt_source?: JobPromptSource;
  negative?: string;
} => {
  const targets = selectPromptTargets(preset);
  const promptValue = targets.prompt ? params[targets.prompt.param] : undefined;
  const negativeValue = targets.negative ? params[targets.negative.param] : undefined;

  return {
    ...(typeof promptValue === "string" ? { prompt_input: promptValue } : {}),
    ...(targets.prompt ? { prompt_source: targets.prompt.source } : {}),
    ...(typeof negativeValue === "string" ? { negative: negativeValue } : {}),
  };
};
