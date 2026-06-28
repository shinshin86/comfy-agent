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
export type ColabTask = z.infer<typeof TaskSchema>;
export type ColabOutput = z.infer<typeof OutputSchema>;

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
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("COLAB_CATALOG_UNAVAILABLE", t("colab.catalog_unavailable"), 2, {
        path: filePath,
      });
    }
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

export type ColabSuggestOptions = {
  goal?: string;
  task?: ColabTask;
  output?: ColabOutput;
  gpu?: string;
  limit?: number;
};

export type ColabSuggestion = {
  kit: string;
  workflow: string;
  path: string;
  workflow_file: string;
  task: ColabTask;
  outputs: ColabOutput[];
  gpu: { minimum?: string; recommended?: string };
  status: ColabKit["status"];
  score: number;
  reasons: string[];
};

const tokenize = (value: string | undefined) =>
  (value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);

const inferGoalHints = (goal: string | undefined) => {
  const lower = (goal ?? "").toLowerCase();
  return {
    wantsFast: /\b(fast|quick|speed|t4)\b/.test(lower),
    wantsAnime: /\b(anime|manga)\b/.test(lower),
    wantsVideo: /\b(video|movie|motion)\b/.test(lower),
    wantsEdit: /\b(edit|editing|modify|retouch)\b/.test(lower),
  };
};

const textForKit = (kit: ColabKit, workflowName: string) =>
  [
    kit.name,
    kit.summary,
    kit.status,
    kit.gpu.minimum,
    kit.gpu.recommended,
    ...(kit.tags ?? []),
    workflowName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

// Reliability is the primary ranking signal: a verified kit should outrank a
// less-tested one that merely matches the goal's vibe. The goal/hint heuristics
// below only differentiate kits *within* the same reliability tier.
const STATUS_WEIGHT: Record<ColabKit["status"], number> = {
  verified: 50,
  partial: 20,
  starter: 0,
};

export const buildColabSuggestPayload = (
  catalog: ColabCatalog,
  options: ColabSuggestOptions = {},
) => {
  const sorted = sortCatalog(catalog);
  const goalTokens = tokenize(options.goal);
  const hints = inferGoalHints(options.goal);
  const gpu = options.gpu?.toLowerCase();
  const limit = Math.max(1, Math.floor(options.limit ?? 5));

  const suggestions: ColabSuggestion[] = [];
  for (const kit of sorted.kits) {
    if (options.output && !kit.outputs.includes(options.output)) continue;
    if (
      gpu &&
      kit.gpu.minimum?.toLowerCase() !== gpu &&
      kit.gpu.recommended?.toLowerCase() !== gpu
    ) {
      continue;
    }

    for (const workflow of kit.workflows) {
      if (options.task && workflow.task !== options.task) continue;

      // Start from the reliability tier so verified kits lead by default.
      let score = STATUS_WEIGHT[kit.status];
      const reasons: string[] = [`status:${kit.status}`];
      const haystack = textForKit(kit, workflow.name);

      // The hard filters above already removed non-matching candidates, so the
      // task/output/gpu matches are recorded as reasons for transparency but do
      // not inflate the score (every survivor would get the same constant).
      if (options.task) reasons.push(`task:${workflow.task}`);
      if (options.output) reasons.push(`output:${options.output}`);
      if (gpu) reasons.push(`gpu:${options.gpu}`);

      for (const token of goalTokens) {
        if (haystack.includes(token)) score += 2;
      }

      if (goalTokens.includes(kit.name.toLowerCase()) || goalTokens.includes(workflow.name.toLowerCase())) {
        score += 60;
        reasons.push("exact:name");
      }

      if (hints.wantsFast && workflow.speed === "fast") {
        score += 10;
        reasons.push("speed:fast");
      }
      if (hints.wantsAnime && kit.tags?.includes("anime")) {
        score += 10;
        reasons.push("tag:anime");
      }
      if (hints.wantsVideo && kit.outputs.includes("video")) {
        score += 10;
        reasons.push("output:video");
      }
      if (hints.wantsEdit && workflow.task === "image_edit") {
        score += 10;
        reasons.push("task:image_edit");
      }
      if (workflow.quality === "high") score += 5;
      if (workflow.quality === "draft") score -= 5;
      if (kit.license_notes?.some((note) => note.toLowerCase().includes("non-commercial"))) {
        score -= 3;
      }

      suggestions.push({
        kit: kit.name,
        workflow: workflow.name,
        path: kit.path,
        workflow_file: workflow.file,
        task: workflow.task,
        outputs: kit.outputs,
        gpu: kit.gpu,
        status: kit.status,
        score,
        reasons,
      });
    }
  }

  suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const byKit = a.kit.localeCompare(b.kit);
    if (byKit !== 0) return byKit;
    return a.workflow.localeCompare(b.workflow);
  });

  return {
    ok: true,
    query: {
      goal: options.goal,
      task: options.task,
      output: options.output,
      gpu: options.gpu,
      limit,
    },
    suggestions: suggestions.slice(0, limit),
  };
};
