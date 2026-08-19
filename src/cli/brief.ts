import path from "node:path";
import { readGallery } from "../characters/gallery.js";
import { applyCharacter } from "../characters/inject.js";
import { readNotes } from "../characters/notes.js";
import { buildPromptFinal, resolveCharacterForm, resolveKitKey } from "../characters/resolve.js";
import { resolveCharacter } from "../characters/store.js";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { print, printJson } from "../io/output.js";
import { queryHistory } from "../jobs/query.js";
import { selectPromptTargets } from "../jobs/summary.js";
import type { JobRecord } from "../jobs/types.js";
import { loadPresetFile } from "../preset/loader.js";
import { resolvePresetPath } from "../preset/path.js";
import type { Preset } from "../preset/schema.js";
import type { VerifyWarning } from "../verify/types.js";

export type BriefOptions = {
  preset?: string;
  form?: string;
  json?: boolean;
};

const loadOptionalPreset = async (name?: string): Promise<Preset | undefined> => {
  if (!name) return undefined;
  try {
    return await loadPresetFile(await resolvePresetPath(name, "local"));
  } catch (error) {
    if (!(error instanceof CliError) || error.code !== "PRESET_NOT_FOUND") throw error;
  }
  return loadPresetFile(await resolvePresetPath(name, "global"));
};

const defaultsFor = (preset: Preset) =>
  Object.fromEntries(
    Object.entries(preset.parameters ?? {})
      .filter(([, definition]) => definition.default !== undefined)
      .map(([name, definition]) => [name, definition.default]),
  );

const eligibleReferences = (
  character: Awaited<ReturnType<typeof resolveCharacter>>["character"],
  form: string,
) => {
  const selectedForm = resolveCharacterForm(character, form);
  return new Set([
    ...selectedForm.refs,
    ...character.references
      .filter(
        (reference) =>
          reference.role === "reference_image" &&
          (reference.forms === undefined || reference.forms.includes(form)),
      )
      .map(({ file }) => file),
  ]);
};

const reason = (condition: boolean, text: string, reasons: string[]) => {
  if (!condition) reasons.push(text);
  return condition;
};

const sortTopJobs = (left: JobRecord, right: JobRecord) => {
  const favorite = Number(right.favorite === true) - Number(left.favorite === true);
  if (favorite !== 0) return favorite;
  const verified =
    Number(right.verify?.checks_failed === 0) - Number(left.verify?.checks_failed === 0);
  if (verified !== 0) return verified;
  return Date.parse(right.submitted_at) - Date.parse(left.submitted_at);
};

const topJob = (record: JobRecord) => ({
  job_id: record.job_id,
  at: record.submitted_at,
  preset: record.preset,
  prompt_final: record.prompt_final,
  seed: record.seed,
  outputs_abs: record.outputs.map(({ saved_to: savedTo }) => path.join(record.output_dir, savedTo)),
  favorite: record.favorite ?? false,
  verify: record.verify ?? null,
});

export const runBrief = async (name: string, options: BriefOptions) => {
  const resolved = await resolveCharacter(name, { cwd: process.cwd() });
  const character = resolved.character;
  const form = options.form ?? "default";
  const selectedForm = resolveCharacterForm(character, form);
  const preset = await loadOptionalPreset(options.preset);
  const kitKey = preset ? resolveKitKey(character, preset) : undefined;
  const kit = kitKey ? character.kits[kitKey] : undefined;
  const triggers = character.triggers as Record<string, string>;
  const trigger = (kitKey ? triggers[kitKey] : undefined) ?? triggers.default;
  const reasons: string[] = [];
  let applicable = { prompt: false, negative: false, reference: false, lora: false, reasons };
  const warnings: VerifyWarning[] = [];

  if (preset) {
    const targets = selectPromptTargets(preset);
    const refs = eligibleReferences(character, form);
    const referenceTarget = Object.values(preset.uploads ?? {}).some(
      ({ role }) => role === "reference_image",
    );
    const loraTargets = Object.values(preset.parameters ?? {}).filter(
      ({ role }) => role === "lora",
    );
    const characterLora = character.loras[0];
    const loraSlotEmpty =
      loraTargets.length === 1 &&
      (typeof loraTargets[0].default !== "string" || loraTargets[0].default.trim() === "");
    const contentBlocked =
      !character.content_rating.allow_nsfw &&
      (preset.tags ?? []).some((tag) => ["nsfw", "adult", "explicit"].includes(tag.toLowerCase()));
    const prompt = reason(Boolean(targets.prompt), "preset has no prompt role or alias", reasons);
    const negative = reason(
      Boolean(targets.negative && (character.negative.trim() || kit?.negative?.trim())),
      targets.negative
        ? "character has no negative prompt additions"
        : "preset has no role: negative_prompt",
      reasons,
    );
    const reference = reason(
      referenceTarget && refs.size > 0,
      referenceTarget
        ? "character form has no reference_image"
        : "preset has no role: reference_image",
      reasons,
    );
    const lora = reason(
      loraSlotEmpty && Boolean(characterLora),
      loraTargets.length > 1
        ? "preset has multiple role: lora targets"
        : loraTargets.length === 0
          ? "preset has no role: lora"
          : !loraSlotEmpty
            ? "preset role: lora target is occupied by its default"
            : "character has no LoRA",
      reasons,
    );
    applicable = contentBlocked
      ? {
          prompt: false,
          negative: false,
          reference: false,
          lora: false,
          reasons: ["character content policy blocks the preset tags", ...reasons],
        }
      : { prompt, negative, reference, lora, reasons };
    try {
      warnings.push(
        ...applyCharacter(preset, defaultsFor(preset), {}, new Set(), character, {
          form,
          kitKey,
          characterPath: resolved.path,
        }).warnings,
      );
    } catch (error) {
      if (
        error instanceof CliError &&
        (error.code === "CHARACTER_CONTENT_BLOCKED" || error.code === "LORA_TARGET_AMBIGUOUS")
      ) {
        warnings.push({ code: error.code, message: error.message, details: error.details });
      } else {
        throw error;
      }
    }
  } else {
    reasons.push("no preset selected");
  }

  const history = await queryHistory({
    cwd: process.cwd(),
    scopes: ["local", "global"],
    character: character.name,
    preset: preset?.name,
  });
  const gallery = (await readGallery(resolved.path)).items
    .filter(
      (item) =>
        item.approved === "human" &&
        (!options.form || item.form === form || (form === "default" && item.form === undefined)),
    )
    .map(({ id, file, caption, form: itemForm }) => ({
      id,
      file,
      ...(caption === undefined ? {} : { caption }),
      ...(itemForm === undefined ? {} : { form: itemForm }),
    }));
  const promptPreview = buildPromptFinal(character, {
    form,
    kitKey,
    promptInput: "{prompt}",
    mode: "replace",
  });
  const payload = {
    ok: true as const,
    character: {
      name: character.name,
      scope: resolved.scope,
      form,
      appearance: selectedForm.appearance ?? character.appearance,
      trigger,
      style: character.style,
      negative: character.negative,
      content_rating: character.content_rating,
    },
    ...(preset ? { preset: preset.name } : {}),
    applicable,
    prompt_preview: promptPreview,
    kit_notes: kitKey ? { key: kitKey, ...(kit ?? {}) } : null,
    top_jobs: history
      .filter(({ tags }) => !tags?.includes("reject"))
      .sort(sortTopJobs)
      .slice(0, 5)
      .map(topJob),
    avoid: history
      .filter(({ tags }) => tags?.includes("reject"))
      .map((record) => ({
        job_id: record.job_id,
        reject_reason: record.reject_reason,
        prompt_final: record.prompt_final,
      })),
    gallery,
    recent_notes: await readNotes(resolved.path, { tail: 2000 }),
    warnings,
  };

  if (options.json) {
    printJson(payload);
    return;
  }
  print(
    `${t("brief.heading.character")}: ${character.display_name ?? character.name} (${resolved.scope}/${form})`,
  );
  print(`\n${t("brief.heading.prompt")}\n${promptPreview}`);
  print(`\n${t("brief.heading.applicable")}\n${JSON.stringify(applicable, null, 2)}`);
  print(`\n${t("brief.heading.top_jobs")}\n${JSON.stringify(payload.top_jobs, null, 2)}`);
  print(`\n${t("brief.heading.avoid")}\n${JSON.stringify(payload.avoid, null, 2)}`);
  print(`\n${t("brief.heading.gallery")}\n${JSON.stringify(gallery, null, 2)}`);
  print(`\n${t("brief.heading.notes")}\n${payload.recent_notes || "—"}`);
};
