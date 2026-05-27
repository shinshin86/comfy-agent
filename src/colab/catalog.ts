import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { z } from "zod";
import { CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";

const RelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !path.isAbsolute(value) &&
      !/^[a-zA-Z]:[\\/]/.test(value) &&
      !value.split(/[\\/]/).includes("..") &&
      !value.includes("\0"),
    "path must be relative and must not contain parent traversal",
  );

const TaskSchema = z.enum([
  "text_to_image",
  "image_to_image",
  "image_edit",
  "inpaint",
  "upscale",
  "text_to_video",
  "image_to_video",
  "video_to_video",
  "custom",
]);

const OutputSchema = z.enum(["image", "video"]);

export const ColabWorkflowSchema = z
  .object({
    name: z.string().min(1),
    file: RelativePathSchema,
    task: TaskSchema,
    speed: z.enum(["fast", "medium", "slow", "unknown"]).optional(),
    quality: z.enum(["draft", "standard", "high", "unknown"]).optional(),
    notes: z.string().optional(),
  })
  .strict();

export const ColabKitSchema = z
  .object({
    name: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    path: RelativePathSchema,
    status: z.enum(["verified", "partial", "starter"]),
    tasks: z.array(TaskSchema).min(1),
    outputs: z.array(OutputSchema).min(1),
    gpu: z
      .object({
        minimum: z.string().optional(),
        recommended: z.string().optional(),
      })
      .strict(),
    summary: z.string().min(1),
    setup_file: RelativePathSchema.default("01_setup.py"),
    workflows: z.array(ColabWorkflowSchema).min(1),
    license_notes: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

export const ColabCatalogSchema = z
  .object({
    version: z.literal(1),
    kits: z.array(ColabKitSchema).min(1),
  })
  .strict();

export type ColabCatalog = z.infer<typeof ColabCatalogSchema>;
export type ColabKit = z.infer<typeof ColabKitSchema>;

export const defaultColabCatalogPath = () =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/colab/catalog.yaml");

const sortCatalog = (catalog: ColabCatalog): ColabCatalog => ({
  version: catalog.version,
  kits: [...catalog.kits]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((kit) => ({
      ...kit,
      tasks: [...kit.tasks],
      outputs: [...kit.outputs],
      workflows: [...kit.workflows].sort((a, b) => a.name.localeCompare(b.name)),
      license_notes: kit.license_notes ? [...kit.license_notes] : undefined,
      tags: kit.tags ? [...kit.tags] : undefined,
    })),
});

export const loadColabCatalogFile = async (filePath = defaultColabCatalogPath()) => {
  let parsed: unknown;
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    parsed = YAML.parse(raw);
  } catch (err) {
    throw new CliError("COLAB_CATALOG_READ_FAILED", t("colab.catalog_read_failed"), 2, {
      cause: String(err),
    });
  }

  const result = ColabCatalogSchema.safeParse(parsed);
  if (!result.success) {
    throw new CliError("INVALID_COLAB_CATALOG", t("colab.catalog_invalid"), 2, {
      issues: result.error.issues,
    });
  }

  return sortCatalog(result.data);
};

export const buildColabCatalogPayload = (catalog: ColabCatalog) => ({
  ok: true,
  catalog: sortCatalog(catalog),
});
