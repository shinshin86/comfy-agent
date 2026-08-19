import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { getCharactersDirPath, resolveWorkdirRootFrom, type WorkdirScope } from "../io/workdir.js";
import { readJob, updateJob } from "../jobs/store.js";
import { readCharacterFromDir } from "./store.js";
import {
  CharacterGallerySchema,
  GalleryItemSchema,
  type CharacterGallery,
  type GalleryItem,
} from "./schema.js";

const galleryFilePath = (dir: string) => path.join(dir, "gallery.json");

const invalidGallery = (filePath: string, error: unknown) =>
  new CliError("INVALID_CHARACTER", t("character.invalid"), 2, {
    path: filePath,
    cause: error instanceof Error ? error.message : String(error),
  });

export const readGallery = async (dir: string): Promise<CharacterGallery> => {
  const filePath = galleryFilePath(dir);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return CharacterGallerySchema.parse({ version: 1, items: [] });
    }
    throw error;
  }
  try {
    return CharacterGallerySchema.parse(JSON.parse(raw) as unknown);
  } catch (error) {
    throw invalidGallery(filePath, error);
  }
};

export const writeGallery = async (dir: string, value: unknown): Promise<CharacterGallery> => {
  const filePath = galleryFilePath(dir);
  let gallery: CharacterGallery;
  try {
    gallery = CharacterGallerySchema.parse(value);
  } catch (error) {
    throw invalidGallery(filePath, error);
  }
  const tempPath = `${filePath}.tmp`;
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(gallery, null, 2)}\n`, "utf-8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
  return gallery;
};

const galleryJobNotFound = (jobId: string, details: Record<string, unknown> = {}) =>
  new CliError("GALLERY_JOB_NOT_FOUND", t("character.gallery_job_not_found", { id: jobId }), 2, {
    job_id: jobId,
    ...details,
  });

const galleryItemNotFound = (id: string) =>
  new CliError("GALLERY_ITEM_NOT_FOUND", t("character.gallery_item_not_found", { id }), 2, {
    gallery_id: id,
  });

const resolveJob = async (jobId: string, cwd: string) => {
  try {
    return await readJob(jobId, cwd, "local");
  } catch (error) {
    if (error instanceof CliError && error.code === "JOB_NOT_FOUND") {
      throw galleryJobNotFound(jobId);
    }
    throw error;
  }
};

const characterJobContext = (dir: string): { cwd: string; scope: WorkdirScope } => {
  const cwd = process.cwd();
  const globalRoot = getCharactersDirPath(cwd, "global");
  const relativeToGlobal = path.relative(globalRoot, dir);
  const isGlobal = relativeToGlobal !== ".." && !relativeToGlobal.startsWith(`..${path.sep}`);
  return isGlobal ? { cwd, scope: "global" } : { cwd: resolveWorkdirRootFrom(dir), scope: "local" };
};

export const addGalleryItem = async (
  dir: string,
  input: {
    jobId: string;
    outputIndex: number;
    caption?: string;
    tags?: string[];
    form?: string;
  },
  options: { cwd: string },
): Promise<GalleryItem> => {
  const resolved = await resolveJob(input.jobId, options.cwd);
  const output = resolved.record.outputs[input.outputIndex];
  if (!output) {
    throw galleryJobNotFound(input.jobId, { output_index: input.outputIndex });
  }
  if (input.form) {
    const character = await readCharacterFromDir(dir);
    if (!character.forms.some(({ id }) => id === input.form)) {
      throw new CliError(
        "CHARACTER_FORM_NOT_FOUND",
        t("character.form_not_found", { id: input.form }),
        2,
        { character: character.name, form: input.form },
      );
    }
  }
  const source = path.join(resolved.record.output_dir, output.saved_to);
  try {
    if (!(await fs.stat(source)).isFile()) throw new Error("not a file");
  } catch (error) {
    throw galleryJobNotFound(input.jobId, {
      output_index: input.outputIndex,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const id = `g_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const extension = path.extname(source) || path.extname(output.filename);
  const relativeFile = `gallery/${id}${extension}`;
  const destination = path.join(dir, ...relativeFile.split("/"));
  const tempPath = `${destination}.tmp`;
  const item = GalleryItemSchema.parse({
    id,
    job_id: resolved.record.job_id,
    output_index: input.outputIndex,
    file: relativeFile,
    caption: input.caption,
    tags: input.tags,
    form: input.form,
    approved: "pending",
    added_at: new Date().toISOString(),
  });
  const gallery = await readGallery(dir);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.copyFile(source, tempPath);
    await fs.rename(tempPath, destination);
    await writeGallery(dir, { ...gallery, items: [...gallery.items, item] });
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    await fs.unlink(destination).catch(() => undefined);
    throw error;
  }
  return item;
};

export const approveGalleryItems = async (dir: string, ids: string[]): Promise<GalleryItem[]> => {
  const gallery = await readGallery(dir);
  const requested = new Set(ids);
  for (const id of requested) {
    if (!gallery.items.some((item) => item.id === id)) throw galleryItemNotFound(id);
  }
  const context = characterJobContext(dir);
  const approvedAt = new Date().toISOString();
  const approved = gallery.items
    .filter((item) => requested.has(item.id))
    .map((item) => ({ ...item, approved: "human" as const, approved_at: approvedAt }));
  for (const item of approved) {
    try {
      await updateJob(item.job_id, { favorite: true }, context.cwd, context.scope);
    } catch (error) {
      if (error instanceof CliError && error.code === "JOB_NOT_FOUND") {
        throw galleryJobNotFound(item.job_id);
      }
      throw error;
    }
  }
  const byId = new Map(approved.map((item) => [item.id, item]));
  await writeGallery(dir, {
    ...gallery,
    items: gallery.items.map((item) => byId.get(item.id) ?? item),
  });
  return approved;
};

export const removeGalleryItem = async (dir: string, id: string): Promise<GalleryItem> => {
  const gallery = await readGallery(dir);
  const item = gallery.items.find((candidate) => candidate.id === id);
  if (!item) throw galleryItemNotFound(id);
  await writeGallery(dir, {
    ...gallery,
    items: gallery.items.filter((candidate) => candidate.id !== id),
  });
  await fs.unlink(path.join(dir, ...item.file.split("/"))).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
  return item;
};
