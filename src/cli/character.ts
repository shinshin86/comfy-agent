import path from "node:path";
import { promises as fs } from "node:fs";
import YAML from "yaml";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { print, printJson } from "../io/output.js";
import type { WorkdirScope } from "../io/workdir.js";
import { exportCharacter, importCharacter } from "../characters/export.js";
import {
  addGalleryItem,
  approveGalleryItems,
  readGallery,
  removeGalleryItem,
} from "../characters/gallery.js";
import { readNotes } from "../characters/notes.js";
import {
  addCharacterNote,
  addForm,
  addLora,
  addReference,
  createCharacter,
  listCharacters,
  removeCharacter,
  removeReference,
  resolveCharacter,
  updateCharacter,
  type CharacterPatch,
  type ResolvedCharacter,
} from "../characters/store.js";
import type { Character } from "../characters/schema.js";
import type { UploadRole } from "../preset/schema.js";

type CommonOptions = {
  global?: boolean;
  json?: boolean;
};

export type CharacterCreateOptions = CommonOptions & {
  displayName?: string;
  appearance?: string;
  appearanceFile?: string;
  trigger?: string;
  style?: string;
  negative?: string;
  age?: string;
  allowNsfw?: boolean;
  tag?: string[];
};

export type CharacterShowOptions = CommonOptions & {
  notes?: boolean;
  gallery?: boolean;
  full?: boolean;
};

export type CharacterUpdateOptions = CharacterCreateOptions;
export type CharacterNoteOptions = CommonOptions & { kit?: string };
export type CharacterRefAddOptions = CommonOptions & {
  role?: UploadRole;
  form?: string;
  note?: string;
};
export type CharacterFormAddOptions = CommonOptions & { appearance: string; ref?: string[] };
export type CharacterLoraAddOptions = CommonOptions & { strength?: string; base?: string };
export type CharacterGalleryAddOptions = CommonOptions & {
  output?: string;
  caption?: string;
  tag?: string[];
  form?: string;
};
export type CharacterExportOptions = CommonOptions & {
  out?: string;
  withRefs?: boolean;
  withGallery?: boolean;
};
export type CharacterImportOptions = CommonOptions & { name?: string; force?: boolean };
export type CharacterRemoveOptions = CommonOptions & { force?: boolean };

const requestedScope = (options: CommonOptions): WorkdirScope =>
  options.global ? "global" : "local";

const resolveOptions = (options: CommonOptions) => ({
  cwd: process.cwd(),
  ...(options.global ? { scope: "global" as const } : {}),
});

const payloadFor = (resolved: ResolvedCharacter, extras: Record<string, unknown> = {}) => ({
  ok: true as const,
  character: resolved.character,
  scope: resolved.scope,
  path: resolved.path,
  ...extras,
});

const outputResolved = (
  resolved: ResolvedCharacter,
  options: CommonOptions,
  extras: Record<string, unknown> = {},
) => {
  if (options.json) {
    printJson(payloadFor(resolved, extras));
    return;
  }
  print(t("character.saved", { name: resolved.character.name, scope: resolved.scope }));
};

const readAppearance = async (options: {
  appearance?: string;
  appearanceFile?: string;
}): Promise<string | undefined> => {
  if (options.appearance !== undefined && options.appearanceFile !== undefined) {
    throw new CliError("INVALID_USAGE", t("character.appearance_conflict"), 2);
  }
  if (options.appearanceFile === undefined) return options.appearance;
  try {
    return (await fs.readFile(options.appearanceFile, "utf-8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError(
        "FILE_NOT_FOUND",
        t("character.appearance_file_not_found", { path: options.appearanceFile }),
        2,
        { path: options.appearanceFile, kind: "character_appearance" },
      );
    }
    throw error;
  }
};

const parseAge = (value?: string): Character["content_rating"]["age_depicted"] | undefined => {
  if (value === undefined) return undefined;
  if (value === "child" || value === "teen" || value === "adult" || value === "unspecified") {
    return value;
  }
  throw new CliError("INVALID_CHARACTER", t("character.invalid_age"), 2, { age: value });
};

const editablePatch = async (options: CharacterUpdateOptions): Promise<CharacterPatch> => {
  const appearance = await readAppearance(options);
  const age = parseAge(options.age);
  return {
    ...(options.displayName === undefined ? {} : { display_name: options.displayName }),
    ...(appearance === undefined ? {} : { appearance }),
    ...(options.trigger === undefined ? {} : { triggers: { default: options.trigger } }),
    ...(options.style === undefined ? {} : { style: options.style }),
    ...(options.negative === undefined ? {} : { negative: options.negative }),
    ...(age === undefined && options.allowNsfw === undefined
      ? {}
      : {
          content_rating: {
            ...(age === undefined ? {} : { age_depicted: age }),
            ...(options.allowNsfw === undefined ? {} : { allow_nsfw: options.allowNsfw }),
          },
        }),
    ...(options.tag === undefined ? {} : { tags: options.tag }),
  };
};

export const runCharacterList = async (options: CommonOptions) => {
  const scope = requestedScope(options);
  const resolved = await listCharacters({ cwd: process.cwd(), scope });
  if (options.json) {
    printJson({
      ok: true,
      scope,
      characters: resolved.map(({ character, path: characterPath }) => ({
        ...character,
        path: characterPath,
      })),
    });
    return;
  }
  if (resolved.length === 0) {
    print(t("character.list_empty"));
    return;
  }
  for (const { character } of resolved) {
    print(`- ${character.name}${character.display_name ? ` (${character.display_name})` : ""}`);
  }
};

export const runCharacterCreate = async (name: string, options: CharacterCreateOptions) => {
  const appearance = await readAppearance(options);
  const age = parseAge(options.age);
  const resolved = await createCharacter(
    {
      name,
      display_name: options.displayName,
      appearance,
      triggers: options.trigger === undefined ? undefined : { default: options.trigger },
      style: options.style,
      negative: options.negative,
      content_rating:
        age === undefined && options.allowNsfw === undefined
          ? undefined
          : { age_depicted: age, allow_nsfw: options.allowNsfw },
      tags: options.tag,
    },
    { cwd: process.cwd(), scope: requestedScope(options) },
  );
  outputResolved(resolved, options);
};

export const runCharacterShow = async (name: string, options: CharacterShowOptions) => {
  const resolved = await resolveCharacter(name, resolveOptions(options));
  const notes = options.notes
    ? await readNotes(resolved.path, options.full ? {} : { tail: 4000 })
    : undefined;
  const gallery = options.gallery ? await readGallery(resolved.path) : undefined;
  if (options.json) {
    printJson(
      payloadFor(resolved, {
        ...(notes === undefined ? {} : { notes }),
        ...(gallery === undefined ? {} : { gallery: gallery.items }),
      }),
    );
    return;
  }
  print(YAML.stringify(resolved.character).trimEnd());
  if (notes !== undefined) print(`\nnotes:\n${notes}`);
  if (gallery !== undefined) print(`\ngallery:\n${JSON.stringify(gallery.items, null, 2)}`);
};

export const runCharacterUpdate = async (name: string, options: CharacterUpdateOptions) => {
  const resolved = await updateCharacter(
    name,
    await editablePatch(options),
    resolveOptions(options),
  );
  outputResolved(resolved, options);
};

export const runCharacterNote = async (
  name: string,
  text: string,
  options: CharacterNoteOptions,
) => {
  const resolved = await addCharacterNote(
    name,
    { text, kit: options.kit },
    resolveOptions(options),
  );
  const notes = await readNotes(resolved.path, { tail: 4000 });
  outputResolved(resolved, options, { notes });
};

export const runCharacterRefAdd = async (
  name: string,
  source: string,
  options: CharacterRefAddOptions,
) => {
  const resolved = await addReference(
    name,
    {
      source,
      role: options.role,
      forms: options.form ? [options.form] : undefined,
      note: options.note,
    },
    resolveOptions(options),
  );
  outputResolved(resolved, options);
};

export const runCharacterRefRemove = async (name: string, file: string, options: CommonOptions) => {
  const resolved = await removeReference(name, file, resolveOptions(options));
  outputResolved(resolved, options);
};

export const runCharacterFormAdd = async (
  name: string,
  id: string,
  options: CharacterFormAddOptions,
) => {
  const resolved = await addForm(
    name,
    { id, appearance: options.appearance, refs: options.ref },
    resolveOptions(options),
  );
  outputResolved(resolved, options);
};

export const runCharacterLoraAdd = async (
  name: string,
  file: string,
  options: CharacterLoraAddOptions,
) => {
  const strength = options.strength === undefined ? 1 : Number(options.strength);
  if (!Number.isFinite(strength)) {
    throw new CliError("INVALID_CHARACTER", t("character.invalid_strength"), 2, {
      strength: options.strength,
    });
  }
  const resolved = await addLora(
    name,
    { file, strength, base: options.base },
    resolveOptions(options),
  );
  outputResolved(resolved, options);
};

export const runCharacterGalleryAdd = async (
  name: string,
  jobId: string,
  options: CharacterGalleryAddOptions,
) => {
  const outputIndex = options.output === undefined ? 0 : Number(options.output);
  if (!Number.isInteger(outputIndex) || outputIndex < 0) {
    throw new CliError("INVALID_CHARACTER", t("character.invalid_output"), 2, {
      output: options.output,
    });
  }
  const resolved = await resolveCharacter(name, resolveOptions(options));
  await addGalleryItem(
    resolved.path,
    {
      jobId,
      outputIndex,
      caption: options.caption,
      tags: options.tag,
      form: options.form,
    },
    { cwd: process.cwd() },
  );
  outputResolved(resolved, options, { gallery: (await readGallery(resolved.path)).items });
};

export const runCharacterGalleryApprove = async (
  name: string,
  ids: string[],
  options: CommonOptions,
) => {
  const resolved = await resolveCharacter(name, resolveOptions(options));
  await approveGalleryItems(resolved.path, ids);
  outputResolved(resolved, options, { gallery: (await readGallery(resolved.path)).items });
};

export const runCharacterGalleryRemove = async (
  name: string,
  id: string,
  options: CommonOptions,
) => {
  const resolved = await resolveCharacter(name, resolveOptions(options));
  await removeGalleryItem(resolved.path, id);
  outputResolved(resolved, options, { gallery: (await readGallery(resolved.path)).items });
};

export const runCharacterExport = async (name: string, options: CharacterExportOptions) => {
  const resolved = await resolveCharacter(name, resolveOptions(options));
  const outDir = path.resolve(options.out ?? `${name}-character`);
  const exported = await exportCharacter(resolved.path, outDir, {
    withRefs: options.withRefs,
    withGallery: options.withGallery,
  });
  outputResolved(resolved, options, { export_path: exported.path, files: exported.files });
};

export const runCharacterImport = async (srcDir: string, options: CharacterImportOptions) => {
  const resolved = await importCharacter(path.resolve(srcDir), {
    cwd: process.cwd(),
    scope: requestedScope(options),
    name: options.name,
    force: options.force,
  });
  outputResolved(resolved, options);
};

export const runCharacterRemove = async (name: string, options: CharacterRemoveOptions) => {
  if (!options.force) {
    throw new CliError("INVALID_USAGE", t("character.remove_force_required"), 2, { name });
  }
  const resolved = await removeCharacter(name, { ...resolveOptions(options), force: true });
  if (options.json) {
    printJson(payloadFor(resolved, { removed: true }));
    return;
  }
  print(t("character.removed", { name: resolved.character.name }));
};
