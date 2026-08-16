import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import type { Preset } from "../preset/schema.js";
import type { Character } from "./schema.js";

export type CharacterPromptMode = "replace" | "prefix" | "off";

const knownKitKeys = (character: Character) =>
  new Set([
    ...Object.keys(character.kits),
    ...Object.keys(character.triggers).filter((key) => key !== "default"),
  ]);

export const resolveKitKey = (character: Character, preset: Preset): string | undefined => {
  const known = knownKitKeys(character);
  if (known.has(preset.name)) return preset.name;
  return preset.tags?.find((tag) => known.has(tag));
};

export const resolveCharacterForm = (character: Character, formId = "default") => {
  const form = character.forms.find(({ id }) => id === formId);
  if (!form) {
    throw new CliError(
      "CHARACTER_FORM_NOT_FOUND",
      t("character.form_not_found", { id: formId }),
      2,
      { character: character.name, form: formId },
    );
  }
  return form;
};

const compactTemplate = (value: string) =>
  value
    .replace(/[ \t]+,/g, ",")
    .replace(/,\s*,+/g, ",")
    .replace(/^\s*,\s*|,\s*$/g, "")
    .trim();

export const buildPromptFinal = (
  character: Character,
  options: {
    form?: string;
    kitKey?: string;
    promptInput: string;
    mode: CharacterPromptMode;
  },
): string => {
  if (options.mode === "off") return options.promptInput;
  const form = resolveCharacterForm(character, options.form);
  const appearance = form.appearance ?? character.appearance;
  const kit = options.kitKey ? character.kits[options.kitKey] : undefined;
  const triggers = character.triggers as Record<string, string>;
  const trigger =
    (options.kitKey === undefined ? undefined : triggers[options.kitKey]) ?? triggers.default;

  if (options.mode === "prefix") {
    return compactTemplate(`${trigger} ${appearance}, ${options.promptInput}`);
  }

  const prompt = [kit?.prompt_prefix?.trim(), options.promptInput]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const template = kit?.prompt_template ?? character.prompt_template;
  return compactTemplate(
    template.replace(/\{(trigger|appearance|prompt|style)\}/g, (_match, key: string) => {
      if (key === "trigger") return trigger;
      if (key === "appearance") return appearance;
      if (key === "prompt") return prompt;
      return character.style;
    }),
  );
};
