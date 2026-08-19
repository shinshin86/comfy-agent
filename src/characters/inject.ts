import path from "node:path";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { selectPromptTargets } from "../jobs/summary.js";
import type { Preset } from "../preset/schema.js";
import type { VerifyWarning } from "../verify/types.js";
import type { Character, CharacterLora } from "./schema.js";
import {
  buildPromptFinal,
  resolveCharacterForm,
  resolveKitKey,
  type CharacterPromptMode,
} from "./resolve.js";

export type CharacterInjection = {
  prompt: CharacterPromptMode;
  negative: boolean;
  reference: string | null;
  lora: string | null;
};

export type ApplyCharacterResult = {
  params: Record<string, unknown>;
  uploads: Record<string, string>;
  injected: CharacterInjection;
  prompt_input?: string;
  prompt_final?: string;
  warnings: VerifyWarning[];
  next_action?: string;
  blocked?: boolean;
};

export type ApplyCharacterOptions = {
  form?: string;
  kitKey?: string;
  characterPath?: string;
  characterRef?: string;
  characterPrompt?: CharacterPromptMode;
  lora?: string;
};

const CONTENT_TAGS = new Set(["nsfw", "adult", "explicit"]);

const warning = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
  hint?: string,
): VerifyWarning => ({ code, message, ...(details ? { details } : {}), ...(hint ? { hint } : {}) });

const stringValue = (value: unknown) => (typeof value === "string" ? value : "");

const appendCommaSeparated = (current: string, additions: Array<string | undefined>) =>
  [current, ...additions]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(", ");

const referenceCandidates = (character: Character, formId: string) => {
  const form = resolveCharacterForm(character, formId);
  const declared = character.references
    .filter(
      (reference) =>
        reference.role === "reference_image" &&
        (reference.forms === undefined || reference.forms.includes(formId)),
    )
    .map(({ file }) => file);
  return [...new Set([...form.refs, ...declared])];
};

const selectReference = (candidates: string[], requested?: string): string | undefined => {
  if (requested === undefined) return candidates[0];
  if (/^\d+$/.test(requested)) return candidates[Number(requested)];
  return candidates.find(
    (candidate) => candidate === requested || path.basename(candidate) === path.basename(requested),
  );
};

const loraTargets = (preset: Preset) =>
  Object.entries(preset.parameters ?? {}).filter(([, definition]) => definition.role === "lora");

const loraStrengthTarget = (preset: Preset, loraParam: string) => {
  const parameters = preset.parameters ?? {};
  const loraNode = String(parameters[loraParam]?.target.node_id);
  return Object.entries(parameters).find(
    ([, definition]) =>
      definition.role === "lora_strength" && String(definition.target.node_id) === loraNode,
  );
};

const selectedCharacterLora = (character?: Character): CharacterLora | undefined =>
  character?.loras[0];

export const applyCharacter = (
  preset: Preset,
  params: Record<string, unknown>,
  uploads: Record<string, string>,
  explicitParams: ReadonlySet<string>,
  character: Character | undefined,
  options: ApplyCharacterOptions = {},
): ApplyCharacterResult => {
  const nextParams = { ...params };
  const nextUploads = { ...uploads };
  const warnings: VerifyWarning[] = [];
  const mode = options.characterPrompt ?? "replace";
  const formId = options.form ?? "default";
  const kitKey = options.kitKey ?? (character ? resolveKitKey(character, preset) : undefined);
  const kit = character && kitKey ? character.kits[kitKey] : undefined;

  if (character) {
    resolveCharacterForm(character, formId);
    const blockedTags = (preset.tags ?? []).filter((tag) => CONTENT_TAGS.has(tag.toLowerCase()));
    if (!character.content_rating.allow_nsfw && blockedTags.length > 0) {
      throw new CliError(
        "CHARACTER_CONTENT_BLOCKED",
        t("character.content_blocked", { name: character.name, preset: preset.name }),
        2,
        { character: character.name, preset: preset.name, tags: blockedTags },
      );
    }
  }

  const targets = selectPromptTargets(preset);
  const promptInput = targets.prompt ? stringValue(nextParams[targets.prompt.param]) : undefined;
  let promptFinal = promptInput;
  let injectedPrompt: CharacterPromptMode = "off";
  if (character && targets.prompt) {
    promptFinal = buildPromptFinal(character, {
      form: formId,
      kitKey,
      promptInput: promptInput ?? "",
      mode,
    });
    if (mode !== "off") nextParams[targets.prompt.param] = promptFinal;
    injectedPrompt = mode;
  }

  let injectedNegative = false;
  if (character && targets.negative) {
    const additions = [character.negative, kit?.negative];
    if (additions.some((value) => Boolean(value?.trim()))) {
      nextParams[targets.negative.param] = appendCommaSeparated(
        stringValue(nextParams[targets.negative.param]),
        additions,
      );
      injectedNegative = true;
    }
  }

  let injectedReference: string | null = null;
  let hasUsableReference = false;
  if (character) {
    const candidates = referenceCandidates(character, formId);
    const selected = selectReference(candidates, options.characterRef);
    if (options.characterRef !== undefined && selected === undefined) {
      throw new CliError(
        "CHARACTER_REF_NOT_FOUND",
        t("character.ref_not_found", { file: options.characterRef }),
        2,
        { character: character.name, reference: options.characterRef, form: formId },
      );
    }
    const target = Object.entries(preset.uploads ?? {}).find(
      ([, definition]) => definition.role === "reference_image",
    );
    hasUsableReference = Boolean(target && selected);
    if (target && selected && nextUploads[target[0]] === undefined) {
      nextUploads[target[0]] = options.characterPath
        ? path.join(options.characterPath, ...selected.split("/"))
        : selected;
      injectedReference = selected;
    } else if (selected && (!target || nextUploads[target[0]] !== undefined)) {
      warnings.push(
        warning("CHARACTER_REF_NOT_USED", t("character.warning.ref_not_used"), {
          reference: selected,
          preset: preset.name,
        }),
      );
    }
  }

  const candidates = loraTargets(preset);
  const characterLora = selectedCharacterLora(character);
  const requestedLora = options.lora ?? characterLora?.file;
  if (requestedLora && candidates.length > 1) {
    throw new CliError("LORA_TARGET_AMBIGUOUS", t("character.lora_ambiguous"), 2, {
      targets: candidates.map(([name]) => name),
      next_action: candidates.map(([name]) => `--${name} <file>`).join(" / "),
    });
  }

  let injectedLora: string | null = null;
  if (requestedLora && candidates.length === 1) {
    const [param] = candidates[0];
    const explicitlySelected = options.lora !== undefined;
    const occupied = explicitParams.has(param) || stringValue(nextParams[param]).trim().length > 0;
    if (explicitlySelected || !occupied) {
      nextParams[param] = requestedLora;
      injectedLora = requestedLora;
      if (characterLora && options.lora === undefined) {
        const strength = loraStrengthTarget(preset, param);
        if (strength) nextParams[strength[0]] = characterLora.strength;
      }
    } else {
      warnings.push(
        warning(
          "CHARACTER_LORA_SLOT_OCCUPIED",
          t("character.warning.lora_occupied"),
          { param, current: nextParams[param], requested: requestedLora },
          `Use --lora ${requestedLora} to overwrite the existing slot.`,
        ),
      );
    }
    if (
      characterLora?.base &&
      !(preset.tags ?? []).some((tag) => tag.toLowerCase() === characterLora.base!.toLowerCase())
    ) {
      warnings.push(
        warning("CHARACTER_LORA_BASE_MISMATCH", t("character.warning.lora_base_mismatch"), {
          lora: characterLora.file,
          base: characterLora.base,
          preset_tags: preset.tags ?? [],
        }),
      );
    }
  }

  const applicable = Boolean(
    (character && targets.prompt) ||
    (character && targets.negative) ||
    hasUsableReference ||
    candidates.length > 0,
  );
  const nextAction =
    character && !applicable
      ? "import --force the workflow to refresh roles, or try a kit with prompt/reference/LoRA support"
      : undefined;
  if (character && !applicable) {
    warnings.push(
      warning(
        "CHARACTER_NOT_APPLICABLE",
        t("character.warning.not_applicable"),
        { character: character.name, preset: preset.name, next_action: nextAction },
        nextAction,
      ),
    );
  }

  return {
    params: nextParams,
    uploads: nextUploads,
    injected: {
      prompt: injectedPrompt,
      negative: injectedNegative,
      reference: injectedReference,
      lora: injectedLora,
    },
    ...(promptInput === undefined ? {} : { prompt_input: promptInput }),
    ...(promptFinal === undefined ? {} : { prompt_final: promptFinal }),
    warnings,
    ...(nextAction ? { next_action: nextAction } : {}),
  };
};
