import path from "node:path";
import { promises as fs } from "node:fs";
import YAML from "yaml";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { getCharactersDirPath, type WorkdirScope } from "../io/workdir.js";
import { appendNote } from "./notes.js";
import {
  CharacterFormSchema,
  CharacterGallerySchema,
  CharacterIndexEntrySchema,
  CharacterLoraSchema,
  CharacterNameSchema,
  CharacterReferenceSchema,
  CharacterSchema,
  type Character,
  type CharacterForm,
  type CharacterIndexEntry,
  type CharacterLora,
  type CharacterReference,
} from "./schema.js";

export type CharacterScopeOptions = {
  cwd: string;
  scope?: WorkdirScope;
};

export type ResolvedCharacter = {
  character: Character;
  scope: WorkdirScope;
  path: string;
};

export type CreateCharacterInput = {
  name: string;
  display_name?: string;
  appearance?: string;
  triggers?: Record<string, string>;
  style?: string;
  negative?: string;
  prompt_template?: string;
  forms?: Array<Omit<CharacterForm, "refs"> & { refs?: string[] }>;
  references?: Array<Omit<CharacterReference, "role"> & { role?: CharacterReference["role"] }>;
  loras?: Array<Omit<CharacterLora, "strength"> & { strength?: number }>;
  content_rating?: Partial<Character["content_rating"]>;
  kits?: Character["kits"];
  privacy?: Partial<Character["privacy"]>;
  tags?: string[];
};

export type CharacterPatch = Partial<
  Omit<
    Character,
    "version" | "name" | "created_at" | "updated_at" | "content_rating" | "privacy" | "kits"
  >
> & {
  content_rating?: Partial<Character["content_rating"]>;
  privacy?: Partial<Character["privacy"]>;
  kits?: Character["kits"];
};

const causeMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const invalidCharacter = (details: Record<string, unknown>, error?: unknown) =>
  new CliError("INVALID_CHARACTER", t("character.invalid"), 2, {
    ...details,
    ...(error === undefined ? {} : { cause: causeMessage(error) }),
  });

const characterNotFound = (name: string, scope?: WorkdirScope) =>
  new CliError("CHARACTER_NOT_FOUND", t("character.not_found", { name }), 2, {
    name,
    ...(scope ? { scope } : {}),
  });

const validateName = (name: string): string => {
  const parsed = CharacterNameSchema.safeParse(name);
  if (!parsed.success) throw invalidCharacter({ name }, parsed.error);
  return parsed.data;
};

const parseCharacter = (value: unknown, filePath: string): Character => {
  const parsed = CharacterSchema.safeParse(value);
  if (!parsed.success) throw invalidCharacter({ path: filePath }, parsed.error);
  return parsed.data;
};

const characterFilePath = (dir: string) => path.join(dir, "character.yaml");

export const readCharacterFromDir = async (dir: string): Promise<Character> => {
  const filePath = characterFilePath(dir);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw characterNotFound(path.basename(dir));
    }
    throw error;
  }
  try {
    return parseCharacter(YAML.parse(raw) as unknown, filePath);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw invalidCharacter({ path: filePath }, error);
  }
};

export const writeCharacterToDir = async (dir: string, value: unknown): Promise<Character> => {
  const filePath = characterFilePath(dir);
  const character = parseCharacter(value, filePath);
  const tempPath = `${filePath}.tmp`;
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.writeFile(tempPath, YAML.stringify(character), "utf-8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
  return character;
};

const characterDir = (name: string, cwd: string, scope: WorkdirScope) =>
  path.join(getCharactersDirPath(cwd, scope), name);

const exists = async (target: string): Promise<boolean> => {
  try {
    await fs.stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

export const resolveCharacter = async (
  name: string,
  options: CharacterScopeOptions,
): Promise<ResolvedCharacter> => {
  const validName = validateName(name);
  const scopes: WorkdirScope[] = options.scope ? [options.scope] : ["local", "global"];
  for (const scope of scopes) {
    const dir = characterDir(validName, options.cwd, scope);
    if (!(await exists(characterFilePath(dir)))) continue;
    return { character: await readCharacterFromDir(dir), scope, path: dir };
  }
  throw characterNotFound(validName, options.scope);
};

export const listCharacters = async (options: {
  cwd: string;
  scope: WorkdirScope;
}): Promise<ResolvedCharacter[]> => {
  const root = getCharactersDirPath(options.cwd, options.scope);
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const characters = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && CharacterNameSchema.safeParse(entry.name).success)
      .map(async (entry) => {
        const dir = path.join(root, entry.name);
        return {
          character: await readCharacterFromDir(dir),
          scope: options.scope,
          path: dir,
        };
      }),
  );
  return characters.sort((left, right) => left.character.name.localeCompare(right.character.name));
};

export const createCharacter = async (
  input: CreateCharacterInput,
  options: { cwd: string; scope?: WorkdirScope },
): Promise<ResolvedCharacter> => {
  const scope = options.scope ?? "local";
  const name = validateName(input.name);
  const dir = characterDir(name, options.cwd, scope);
  if (await exists(dir)) {
    throw new CliError("CHARACTER_EXISTS", t("character.exists", { name }), 2, {
      name,
      scope,
    });
  }
  const now = new Date().toISOString();
  const forms = input.forms?.some(({ id }) => id === "default")
    ? input.forms
    : [{ id: "default", refs: [] }, ...(input.forms ?? [])];
  const character = parseCharacter(
    {
      version: 1,
      ...input,
      name,
      forms,
      content_rating: input.content_rating,
      privacy: input.privacy,
      created_at: now,
      updated_at: now,
    },
    characterFilePath(dir),
  );
  await fs.mkdir(getCharactersDirPath(options.cwd, scope), { recursive: true });
  try {
    await fs.mkdir(dir);
    await writeCharacterToDir(dir, character);
    await fs.writeFile(path.join(dir, "notes.md"), "", "utf-8");
    await fs.writeFile(
      path.join(dir, "gallery.json"),
      `${JSON.stringify(CharacterGallerySchema.parse({ version: 1, items: [] }), null, 2)}\n`,
      "utf-8",
    );
    await Promise.all([
      fs.mkdir(path.join(dir, "refs"), { recursive: true }),
      fs.mkdir(path.join(dir, "gallery"), { recursive: true }),
    ]);
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new CliError("CHARACTER_EXISTS", t("character.exists", { name }), 2, {
        name,
        scope,
      });
    }
    throw error;
  }
  return { character, scope, path: dir };
};

const mergePatch = (character: Character, patch: CharacterPatch, now: string): Character =>
  parseCharacter(
    {
      ...character,
      ...patch,
      triggers:
        patch.triggers === undefined
          ? character.triggers
          : { ...character.triggers, ...patch.triggers },
      content_rating:
        patch.content_rating === undefined
          ? character.content_rating
          : { ...character.content_rating, ...patch.content_rating },
      privacy:
        patch.privacy === undefined
          ? character.privacy
          : { ...character.privacy, ...patch.privacy },
      kits: patch.kits === undefined ? character.kits : { ...character.kits, ...patch.kits },
      version: 1,
      name: character.name,
      created_at: character.created_at,
      updated_at: now,
    },
    characterFilePath(character.name),
  );

export const updateCharacter = async (
  name: string,
  patch: CharacterPatch,
  options: CharacterScopeOptions,
): Promise<ResolvedCharacter> => {
  const resolved = await resolveCharacter(name, options);
  const now = new Date().toISOString();
  const updated = mergePatch(resolved.character, patch, now);
  await writeCharacterToDir(resolved.path, updated);
  if (patch.appearance !== undefined && patch.appearance !== resolved.character.appearance) {
    await appendNote(resolved.path, {
      at: now,
      text: `Appearance changed:\n\n${resolved.character.appearance} → ${patch.appearance}`,
    });
  }
  return { ...resolved, character: updated };
};

export const removeCharacter = async (
  name: string,
  options: CharacterScopeOptions & { force?: boolean },
): Promise<ResolvedCharacter> => {
  if (!options.force) {
    throw new CliError("INVALID_USAGE", t("character.remove_force_required"), 2, { name });
  }
  const resolved = await resolveCharacter(name, options);
  await fs.rm(resolved.path, { recursive: true, force: true });
  return resolved;
};

const numberedBasename = async (
  dir: string,
  source: string,
  reserved: Set<string>,
): Promise<string> => {
  const parsed = path.parse(path.basename(source));
  const stem = parsed.name || "reference";
  const extension = parsed.ext;
  let candidate = `${stem}${extension}`;
  for (
    let index = 2;
    reserved.has(candidate) || (await exists(path.join(dir, candidate)));
    index += 1
  ) {
    candidate = `${stem}_${index}${extension}`;
  }
  return candidate;
};

export const addReference = async (
  name: string,
  input: { source: string; role?: CharacterReference["role"]; forms?: string[]; note?: string },
  options: CharacterScopeOptions,
): Promise<ResolvedCharacter> => {
  const resolved = await resolveCharacter(name, options);
  const formIds = new Set(resolved.character.forms.map(({ id }) => id));
  const missingForm = input.forms?.find((form) => !formIds.has(form));
  if (missingForm) {
    throw new CliError(
      "CHARACTER_FORM_NOT_FOUND",
      t("character.form_not_found", { id: missingForm }),
      2,
      {
        character: name,
        form: missingForm,
      },
    );
  }
  try {
    if (!(await fs.stat(input.source)).isFile()) throw new Error("not a file");
  } catch (error) {
    throw new CliError(
      "CHARACTER_REF_NOT_FOUND",
      t("character.ref_not_found", { file: input.source }),
      2,
      {
        file: input.source,
        cause: causeMessage(error),
      },
    );
  }
  const refsDir = path.join(resolved.path, "refs");
  await fs.mkdir(refsDir, { recursive: true });
  const basename = await numberedBasename(
    refsDir,
    input.source,
    new Set(resolved.character.references.map(({ file }) => path.posix.basename(file))),
  );
  const destination = path.join(refsDir, basename);
  const tempPath = `${destination}.tmp`;
  try {
    await fs.copyFile(input.source, tempPath);
    await fs.rename(tempPath, destination);
    let reference: CharacterReference;
    try {
      reference = CharacterReferenceSchema.parse({
        file: `refs/${basename}`,
        role: input.role,
        forms: input.forms,
        note: input.note,
      });
    } catch (error) {
      throw invalidCharacter({ name, reference: input.source }, error);
    }
    return await updateCharacter(
      name,
      { references: [...resolved.character.references, reference] },
      { cwd: options.cwd, scope: resolved.scope },
    );
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    await fs.unlink(destination).catch(() => undefined);
    throw error;
  }
};

export const removeReference = async (
  name: string,
  file: string,
  options: CharacterScopeOptions,
): Promise<ResolvedCharacter> => {
  const resolved = await resolveCharacter(name, options);
  const normalized = file.replace(/\\/g, "/");
  const storedFile = normalized.startsWith("refs/") ? normalized : `refs/${path.basename(file)}`;
  if (!resolved.character.references.some((reference) => reference.file === storedFile)) {
    throw new CliError("CHARACTER_REF_NOT_FOUND", t("character.ref_not_found", { file }), 2, {
      character: name,
      file,
    });
  }
  const references = resolved.character.references.filter(
    (reference) => reference.file !== storedFile,
  );
  const forms = resolved.character.forms.map((form) => ({
    ...form,
    refs: form.refs.filter((ref) => ref !== storedFile),
  }));
  const updated = await updateCharacter(
    name,
    { references, forms },
    { cwd: options.cwd, scope: resolved.scope },
  );
  await fs.unlink(path.join(resolved.path, ...storedFile.split("/"))).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
  return updated;
};

export const addForm = async (
  name: string,
  input: { id: string; appearance: string; refs?: string[] },
  options: CharacterScopeOptions,
): Promise<ResolvedCharacter> => {
  const resolved = await resolveCharacter(name, options);
  if (resolved.character.forms.some(({ id }) => id === input.id)) {
    throw invalidCharacter({ name, form: input.id }, `form already exists: ${input.id}`);
  }
  let form: CharacterForm;
  try {
    form = CharacterFormSchema.parse({
      ...input,
      refs: (input.refs ?? []).map((ref) =>
        ref.replace(/\\/g, "/").startsWith("refs/") ? ref : `refs/${path.basename(ref)}`,
      ),
    });
  } catch (error) {
    throw invalidCharacter({ name, form: input.id }, error);
  }
  return updateCharacter(
    name,
    { forms: [...resolved.character.forms, form] },
    { cwd: options.cwd, scope: resolved.scope },
  );
};

export const addLora = async (
  name: string,
  input: { file: string; strength?: number; base?: string },
  options: CharacterScopeOptions,
): Promise<ResolvedCharacter> => {
  const resolved = await resolveCharacter(name, options);
  let lora: CharacterLora;
  try {
    lora = CharacterLoraSchema.parse(input);
  } catch (error) {
    throw invalidCharacter({ name, lora: input.file }, error);
  }
  return updateCharacter(
    name,
    { loras: [...resolved.character.loras, lora] },
    { cwd: options.cwd, scope: resolved.scope },
  );
};

export const addCharacterNote = async (
  name: string,
  input: { text: string; kit?: string; at?: string },
  options: CharacterScopeOptions,
): Promise<ResolvedCharacter> => {
  const resolved = await resolveCharacter(name, options);
  const at = input.at ?? new Date().toISOString();
  await appendNote(resolved.path, { at, kit: input.kit, text: input.text });
  const kits = input.kit
    ? {
        ...resolved.character.kits,
        [input.kit]: { ...resolved.character.kits[input.kit], note: input.text },
      }
    : resolved.character.kits;
  const character = parseCharacter(
    { ...resolved.character, kits, updated_at: at },
    characterFilePath(resolved.path),
  );
  await writeCharacterToDir(resolved.path, character);
  return { ...resolved, character };
};

export const readCharacterIndex = async (dir: string): Promise<CharacterIndexEntry[]> => {
  const filePath = path.join(dir, "index.jsonl");
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  try {
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => CharacterIndexEntrySchema.parse(JSON.parse(line) as unknown));
  } catch (error) {
    throw invalidCharacter({ path: filePath }, error);
  }
};
