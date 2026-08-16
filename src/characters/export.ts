import path from "node:path";
import { promises as fs } from "node:fs";
import YAML from "yaml";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { getCharactersDirPath, type WorkdirScope } from "../io/workdir.js";
import { readGallery, writeGallery } from "./gallery.js";
import { readCharacterFromDir, writeCharacterToDir, type ResolvedCharacter } from "./store.js";
import { CharacterNameSchema, CharacterSchema } from "./schema.js";

const copyRelativeIfPresent = async (sourceDir: string, outDir: string, relative: string) => {
  const parts = relative.replace(/\\/g, "/").split("/");
  const source = path.join(sourceDir, ...parts);
  const destination = path.join(outDir, ...parts);
  try {
    if (!(await fs.stat(source)).isFile()) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
};

export const exportCharacter = async (
  dir: string,
  outDir: string,
  options: { withRefs?: boolean; withGallery?: boolean } = {},
): Promise<{ path: string; files: string[] }> => {
  const character = await readCharacterFromDir(dir);
  const gallery = await readGallery(dir);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "character.yaml"), YAML.stringify(character), "utf-8");
  let notes = "";
  try {
    notes = await fs.readFile(path.join(dir, "notes.md"), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.writeFile(path.join(outDir, "notes.md"), notes, "utf-8");
  await fs.writeFile(
    path.join(outDir, "gallery.json"),
    `${JSON.stringify(gallery, null, 2)}\n`,
    "utf-8",
  );

  const files = ["character.yaml", "notes.md", "gallery.json"];
  if (options.withRefs) {
    for (const reference of character.references) {
      await copyRelativeIfPresent(dir, outDir, reference.file);
      files.push(reference.file);
    }
  }
  if (options.withGallery) {
    for (const item of gallery.items) {
      await copyRelativeIfPresent(dir, outDir, item.file);
      files.push(item.file);
    }
  }
  return { path: outDir, files: [...new Set(files)] };
};

const readImportedCharacter = async (srcDir: string) => {
  const filePath = path.join(srcDir, "character.yaml");
  try {
    return CharacterSchema.parse(YAML.parse(await fs.readFile(filePath, "utf-8")) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("INVALID_CHARACTER", t("character.invalid"), 2, {
        path: filePath,
        cause: "character.yaml not found",
      });
    }
    if (error instanceof CliError) throw error;
    throw new CliError("INVALID_CHARACTER", t("character.invalid"), 2, {
      path: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

const pathExists = async (target: string) => {
  try {
    await fs.stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

export const importCharacter = async (
  srcDir: string,
  options: { cwd: string; scope: WorkdirScope; name?: string; force?: boolean },
): Promise<ResolvedCharacter> => {
  const imported = await readImportedCharacter(srcDir);
  const nameResult = CharacterNameSchema.safeParse(options.name ?? imported.name);
  if (!nameResult.success) {
    throw new CliError("INVALID_CHARACTER", t("character.invalid"), 2, {
      name: options.name ?? imported.name,
      cause: nameResult.error.message,
    });
  }
  const name = nameResult.data;
  const charactersDir = getCharactersDirPath(options.cwd, options.scope);
  const destination = path.join(charactersDir, name);
  if ((await pathExists(destination)) && !options.force) {
    throw new CliError("CHARACTER_IMPORT_CONFLICT", t("character.import_conflict", { name }), 2, {
      name,
      scope: options.scope,
    });
  }

  let gallery;
  try {
    gallery = await readGallery(srcDir);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("INVALID_CHARACTER", t("character.invalid"), 2, {
      path: path.join(srcDir, "gallery.json"),
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  let notes = "";
  try {
    notes = await fs.readFile(path.join(srcDir, "notes.md"), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await fs.mkdir(charactersDir, { recursive: true });
  const tempDir = path.join(charactersDir, `.${name}.import-${process.pid}-${Date.now()}`);
  await fs.mkdir(tempDir);
  try {
    const character = await writeCharacterToDir(tempDir, { ...imported, name });
    await fs.writeFile(path.join(tempDir, "notes.md"), notes, "utf-8");
    await writeGallery(tempDir, gallery);
    for (const reference of character.references) {
      await copyRelativeIfPresent(srcDir, tempDir, reference.file);
    }
    for (const item of gallery.items) {
      await copyRelativeIfPresent(srcDir, tempDir, item.file);
    }
    if (await pathExists(destination)) {
      await fs.rm(destination, { recursive: true, force: true });
    }
    await fs.rename(tempDir, destination);
    return { character, scope: options.scope, path: destination };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
};
