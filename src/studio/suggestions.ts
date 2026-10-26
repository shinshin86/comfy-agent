import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { readResource } from "../io/resources.js";
import { loadStudioPresets } from "./capabilities.js";
import { resolveProfileControls } from "./catalog.js";
import { mapComposerParams, parseGenerate, validateGenerateParams } from "./generate.js";
import { readWorkflowProfile, type WorkflowProfile } from "./profiles.js";
import { getStudioDirPath, listRequests } from "./store.js";

export const MAX_SUGGESTION_BYTES = 256 * 1024;
export const SuggestionRequestIdSchema = z.string().regex(/^req-[A-Za-z0-9_-]{1,59}$/);
const Translation = z
  .object({
    ja: z.string().trim().min(1).max(4000).optional(),
    en: z.string().trim().min(1).max(4000).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.ja || v.en));
export const StudioSuggestionSchema = z
  .object({
    request_id: SuggestionRequestIdSchema,
    preset: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    suggestions: z
      .array(
        z
          .object({
            prompt: z.string().trim().min(1).max(32000),
            explanation: Translation,
            notes: Translation.optional(),
            settings: z
              .object({
                negative_prompt: z.string().max(16000).optional(),
                duration_s: z.number().positive().max(3600).optional(),
                size: z
                  .tuple([
                    z.number().int().positive().max(16384),
                    z.number().int().positive().max(16384),
                  ])
                  .optional(),
                aspect: z.enum(["1:1", "16:9", "9:16", "4:3"]).optional(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();
export type StudioSuggestion = z.infer<typeof StudioSuggestionSchema>;
const dir = (cwd: string) => path.join(getStudioDirPath(cwd), "suggestions");
const file = (cwd: string, id: string) =>
  path.join(dir(cwd), `${SuggestionRequestIdSchema.parse(id)}.json`);
const invalid = (): never => {
  throw new CliError("INVALID_SUGGESTION", t("studio.suggestion_invalid"), 2);
};

export const readSuggestion = async (cwd: string, id: string): Promise<StudioSuggestion | null> => {
  try {
    const filename = file(cwd, id);
    if ((await fs.stat(filename)).size > MAX_SUGGESTION_BYTES) return null;
    const result = StudioSuggestionSchema.safeParse(
      JSON.parse(await fs.readFile(filename, "utf8")),
    );
    return result.success && result.data.request_id === id ? result.data : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError)
      return null;
    throw error;
  }
};
export const listSuggestions = async (cwd: string): Promise<StudioSuggestion[]> => {
  let names: string[];
  try {
    names = await fs.readdir(dir(cwd));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const entries = await Promise.all(
    names
      .filter(
        (name) =>
          name.endsWith(".json") && SuggestionRequestIdSchema.safeParse(name.slice(0, -5)).success,
      )
      .map((name) => readSuggestion(cwd, name.slice(0, -5))),
  );
  return entries.filter((entry): entry is StudioSuggestion => entry !== null);
};

export const loadPromptProfile = async (cwd: string, name: string) => {
  const entry = (await loadStudioPresets(cwd)).find((entry) => entry.name === name);
  if (!entry?.preset)
    throw new CliError("PRESET_NOT_FOUND", t("studio.profile_missing", { name }), 2);
  return {
    preset: entry.preset,
    profile: await readWorkflowProfile(cwd, entry.preset, entry.scope),
  };
};

/** Only local files are read here; assistance never probes or runs a model. */
export const saveSuggestion = async (cwd: string, input: unknown): Promise<StudioSuggestion> => {
  const parsed = StudioSuggestionSchema.safeParse(input);
  if (!parsed.success || Buffer.byteLength(JSON.stringify(input)) > MAX_SUGGESTION_BYTES)
    return invalid();
  const answer = parsed.data;
  const request = (await listRequests(cwd)).find((r) => r.id === answer.request_id);
  if (!request || request.kind !== "prompt_assist" || request.context?.preset !== answer.preset)
    return invalid();
  if (request.lang === "ja" && answer.suggestions.some((s) => !s.explanation.ja)) return invalid();
  const { preset, profile } = await loadPromptProfile(cwd, answer.preset);
  const engine = {
    controls: resolveProfileControls(profile, preset),
    constraints: profile.constraints,
  };
  try {
    for (const suggestion of answer.suggestions) {
      if (!suggestion.settings) continue;
      const defaults = Object.fromEntries(
        Object.entries(preset.parameters ?? {}).flatMap(([key, def]) =>
          def.default === undefined ? [] : [[key, def.default]],
        ),
      );
      const body = parseGenerate({
        preset: preset.name,
        capability: profile.capability,
        params: { ...defaults, ...request.context?.params },
        ...suggestion.settings,
      });
      const params = mapComposerParams(body, engine);
      const keys = new Set(
        Object.keys(suggestion.settings).flatMap((key) => {
          if (key === "duration_s") return ["frames"];
          if (key === "size" || key === "aspect") return ["width", "height"];
          return [key];
        }),
      );
      const changed: Record<string, unknown> = {};
      for (const [key, control] of Object.entries(engine.controls)) {
        if (!keys.has(key) || !control || typeof control !== "object" || !("param" in control))
          continue;
        const value = params[control.param];
        if (
          control.step &&
          typeof value === "number" &&
          Math.abs(
            (value - (control.step_offset ?? 0)) / control.step -
              Math.round((value - (control.step_offset ?? 0)) / control.step),
          ) > 1e-8
        )
          return invalid();
        changed[control.param] = value;
      }
      // Required unrelated inputs may be absent while drafting. Validate suggested controls only.
      validateGenerateParams(
        {
          ...preset,
          parameters: Object.fromEntries(
            Object.entries(preset.parameters ?? {}).map(([key, def]) => [
              key,
              { ...def, required: false },
            ]),
          ),
        },
        changed,
      );
    }
  } catch {
    return invalid();
  }
  const serialized = `${JSON.stringify(answer, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_SUGGESTION_BYTES) return invalid();
  await fs.mkdir(dir(cwd), { recursive: true });
  const target = file(cwd, answer.request_id);
  const tmp = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, serialized, "utf8");
  await fs.rename(tmp, target);
  return answer;
};

export const selectPromptGuide = (
  profile: Pick<WorkflowProfile, "model_label" | "output" | "capability">,
) => {
  const label = profile.model_label ?? "";
  if (profile.output === "video" && /\bH3\b|hailuo/i.test(label))
    return "docs/minimax-h3-prompting.md";
  if (profile.output === "video") return "docs/prompt-guides/video.md";
  if (profile.output === "audio") return "docs/prompt-guides/audio.md";
  if (profile.capability === "text_to_image" && /krea\s*2|qwen.*image/i.test(label))
    return "docs/prompt-guides/krea2.md";
  return "docs/prompt-guides/image.md";
};
export const readPromptGuide = async (cwd: string, name: string) => {
  const { profile } = await loadPromptProfile(cwd, name);
  const guide = selectPromptGuide(profile);
  return {
    preset: name,
    model_label: profile.model_label,
    capability: profile.capability,
    guide,
    text: await readResource(guide),
  };
};
