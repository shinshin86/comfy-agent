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
  "remove_background",
  "inpaint",
  "upscale",
  "text_to_audio",
  "audio_to_audio",
  "audio_inpaint",
  "text_to_video",
  "image_to_video",
  "video_to_video",
  "custom",
]);

const OutputSchema = z.enum(["image", "video", "audio"]);
export type ColabTask = z.infer<typeof TaskSchema>;
export type ColabOutput = z.infer<typeof OutputSchema>;
export const COLAB_GPUS = ["T4", "L4", "A100"] as const;
export type ColabGpu = (typeof COLAB_GPUS)[number];

const AudioKindSchema = z.enum(["music", "sound_effect", "speech", "mixed"]);
const ColabCapabilitiesSchema = z
  .object({
    audio_kinds: z.array(AudioKindSchema).min(1),
    lyrics: z.boolean().optional(),
    vocals: z.boolean().optional(),
  })
  .strict();

const TASK_OUTPUTS: Partial<Record<ColabTask, ColabOutput>> = {
  text_to_image: "image",
  image_to_image: "image",
  image_edit: "image",
  remove_background: "image",
  inpaint: "image",
  upscale: "image",
  text_to_audio: "audio",
  audio_to_audio: "audio",
  audio_inpaint: "audio",
  text_to_video: "video",
  image_to_video: "video",
  video_to_video: "video",
};

export const colabOutputForTask = (task: ColabTask) => TASK_OUTPUTS[task];

export const ColabWorkflowSchema = z
  .object({
    name: z.string().min(1),
    file: RelativePathSchema,
    task: TaskSchema,
    output: OutputSchema.optional(),
    capabilities: ColabCapabilitiesSchema.optional(),
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
        verified: z.array(z.enum(COLAB_GPUS)).min(1).optional(),
      })
      .strict(),
    summary: z.string().min(1),
    setup_file: RelativePathSchema.default("01_setup.py"),
    workflows: z.array(ColabWorkflowSchema).min(1),
    license_notes: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((kit, ctx) => {
    kit.workflows.forEach((workflow, index) => {
      const pathPrefix = ["workflows", index] as const;
      const derivedOutput = colabOutputForTask(workflow.task);
      const workflowOutput = workflow.output ?? derivedOutput;

      if (!kit.tasks.includes(workflow.task)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...pathPrefix, "task"],
          message: `workflow task ${workflow.task} must be listed in kit tasks`,
        });
      }

      if (workflow.output && derivedOutput && workflow.output !== derivedOutput) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...pathPrefix, "output"],
          message: `workflow output ${workflow.output} conflicts with task ${workflow.task}`,
        });
      }

      if (!workflowOutput) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...pathPrefix, "output"],
          message: "custom workflows must declare an output",
        });
      } else if (!kit.outputs.includes(workflowOutput)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...pathPrefix, "output"],
          message: `workflow output ${workflowOutput} must be listed in kit outputs`,
        });
      }

      const capabilities = workflow.capabilities;
      if (!capabilities) return;

      if (workflowOutput !== "audio") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...pathPrefix, "capabilities"],
          message: "audio capabilities are allowed only on audio workflows",
        });
      }

      const supportsMusic = capabilities.audio_kinds.some(
        (kind) => kind === "music" || kind === "mixed",
      );
      if ((capabilities.lyrics === true || capabilities.vocals === true) && !supportsMusic) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...pathPrefix, "capabilities"],
          message: "lyrics or vocals support requires music or mixed audio kind",
        });
      }
    });
  });

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
      gpu: {
        ...kit.gpu,
        verified: kit.gpu.verified ? [...kit.gpu.verified] : undefined,
      },
      workflows: [...kit.workflows]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((workflow) => ({
          ...workflow,
          capabilities: workflow.capabilities
            ? {
                ...workflow.capabilities,
                audio_kinds: [...workflow.capabilities.audio_kinds],
              }
            : undefined,
        })),
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
  workflow_output: ColabOutput;
  outputs: ColabOutput[];
  capabilities?: ColabKit["workflows"][number]["capabilities"];
  gpu: ColabKit["gpu"];
  status: ColabKit["status"];
  score: number;
  reasons: string[];
  unmet_requirements?: string[];
};

const GPU_RANK: Record<ColabGpu, number> = {
  T4: 0,
  L4: 1,
  A100: 2,
};

export const normalizeColabGpu = (value: string | undefined): ColabGpu | undefined => {
  const normalized = value?.trim().toUpperCase();
  return COLAB_GPUS.find((gpu) => gpu === normalized);
};

const tokenize = (value: string | undefined) =>
  (value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);

const normalizeName = (value: string | undefined) =>
  (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[._\-\s]+/g, " ")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const goalContainsName = (goal: string | undefined, name: string) => {
  const normalizedGoal = normalizeName(goal);
  const normalizedName = normalizeName(name);
  return normalizedName.length > 0 && ` ${normalizedGoal} `.includes(` ${normalizedName} `);
};

const inferGoalHints = (goal: string | undefined) => {
  const normalized = (goal ?? "").normalize("NFKC");
  const lower = normalized.toLowerCase();
  const musicVideo =
    /\bmusic[\s_-]*video\b|\bmv\b/.test(lower) || /ミュージック[・\s]*ビデオ/.test(normalized);
  const parallelMedia =
    /\b(?:music|audio)\s*(?:and|&|\+)\s*(?:video|movie)\b/.test(lower) ||
    /(?:音楽|音声)\s*(?:と|＆|&|\+)\s*(?:動画|映像)/.test(normalized);
  const requestedGpu = normalizeColabGpu(lower.match(/\b(t4|l4|a100)\b/)?.[1]);
  return {
    wantsFast: /\b(fast|quick|speedy|rapid)\b/.test(lower) || /高速|速く/.test(normalized),
    wantsAnime: /\b(anime|manga)\b/.test(lower) || /アニメ|漫画/.test(normalized),
    wantsImageGeneration:
      /\b(image generation|generate (?:an )?image|text[-_ ]to[-_ ]image|t2i)\b/.test(lower) ||
      /画像(?:生成|を生成|を作成)/.test(normalized),
    wantsVideo: /\b(video|movie|motion|t2v|i2v)\b/.test(lower) || /動画|映像/.test(normalized),
    wantsAudio: /\b(audio|sound)\b/.test(lower) || /音声|音響/.test(normalized),
    wantsMusic:
      /\b(music|song|bgm|instrumental|track)\b/.test(lower) ||
      /音楽|楽曲|曲を|曲が|インスト|歌を/.test(normalized),
    wantsSoundEffect:
      /\b(sound[\s_-]*effects?|sfx|foley)\b/.test(lower) || /効果音/.test(normalized),
    wantsLyrics: /\blyrics?\b/.test(lower) || /歌詞/.test(normalized),
    wantsVocals:
      /\b(vocals?|singing|singer|sung)\b/.test(lower) || /ボーカル|歌声|歌入り/.test(normalized),
    wantsEdit: /\b(edit|editing|modify|retouch)\b/.test(lower) || /編集|修正/.test(normalized),
    wantsUpscale:
      /\b(upscale|upscaling|restore|restoration|enhance)\b/.test(lower) ||
      /高解像度化|アップスケール|復元/.test(normalized),
    wantsBackgroundRemoval:
      /\b(background removal|remove background|cutout|segmentation)\b/.test(lower) ||
      /背景(?:除去|削除)|切り抜き/.test(normalized),
    musicVideo,
    parallelMedia,
    requestedGpu,
  };
};

const workflowOutput = (workflow: ColabKit["workflows"][number]) =>
  workflow.output ?? colabOutputForTask(workflow.task);

const textForKit = (kit: ColabKit, workflow: ColabKit["workflows"][number]) =>
  [
    kit.name,
    kit.summary,
    kit.status,
    kit.gpu.minimum,
    kit.gpu.recommended,
    ...(kit.tags ?? []),
    workflow.name,
    workflow.task,
    workflowOutput(workflow),
    ...(workflow.capabilities?.audio_kinds ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

// Reliability is the primary ranking signal only after incompatible workflows
// have been removed. A verified image workflow must never outrank a starter
// audio workflow for an explicit music request.
const STATUS_WEIGHT: Record<ColabKit["status"], number> = {
  verified: 50,
  partial: 20,
  starter: 0,
};

const isGpuCompatible = (minimum: string | undefined, requested: ColabGpu) => {
  const minimumGpu = normalizeColabGpu(minimum);
  if (!minimumGpu) return minimum?.trim().toUpperCase() === requested;
  return GPU_RANK[requested] >= GPU_RANK[minimumGpu];
};

type GoalHints = ReturnType<typeof inferGoalHints>;

const inferPrimaryOutput = (hints: GoalHints): ColabOutput | undefined => {
  if (hints.musicVideo) return "video";
  if (hints.parallelMedia) return undefined;

  const outputs = new Set<ColabOutput>();
  if (
    hints.wantsImageGeneration ||
    hints.wantsEdit ||
    hints.wantsUpscale ||
    hints.wantsBackgroundRemoval
  ) {
    outputs.add("image");
  }
  if (hints.wantsVideo) outputs.add("video");
  if (
    hints.wantsAudio ||
    hints.wantsMusic ||
    hints.wantsSoundEffect ||
    hints.wantsLyrics ||
    hints.wantsVocals
  ) {
    outputs.add("audio");
  }
  return outputs.size === 1 ? [...outputs][0] : undefined;
};

const matchesRequestedAudioKind = (
  capabilities: ColabSuggestion["capabilities"],
  hints: GoalHints,
) => {
  const requestedKinds: Array<"music" | "sound_effect"> = [];
  if (hints.wantsMusic || hints.wantsLyrics || hints.wantsVocals) requestedKinds.push("music");
  if (hints.wantsSoundEffect) requestedKinds.push("sound_effect");
  if (requestedKinds.length === 0) return true;
  if (!capabilities) return false;
  return requestedKinds.every((requestedKind) =>
    capabilities.audio_kinds.some(
      (supportedKind) => supportedKind === "mixed" || supportedKind === requestedKind,
    ),
  );
};

const compareSuggestions = (a: ColabSuggestion, b: ColabSuggestion) => {
  if (b.score !== a.score) return b.score - a.score;
  const byKit = a.kit.localeCompare(b.kit);
  if (byKit !== 0) return byKit;
  return a.workflow.localeCompare(b.workflow);
};

const sortSuggestions = (suggestions: ColabSuggestion[]) => suggestions.sort(compareSuggestions);

export const buildColabSuggestPayload = (
  catalog: ColabCatalog,
  options: ColabSuggestOptions = {},
) => {
  const sorted = sortCatalog(catalog);
  const goalTokens = tokenize(options.goal);
  const hints = inferGoalHints(options.goal);
  const requestedGpu = normalizeColabGpu(options.gpu) ?? hints.requestedGpu;
  const primaryOutput = options.output ?? inferPrimaryOutput(hints);
  const limit = Math.max(1, Math.floor(options.limit ?? 5));

  const suggestions: ColabSuggestion[] = [];
  const alternativeCandidates: ColabSuggestion[] = [];
  for (const kit of sorted.kits) {
    for (const workflow of kit.workflows) {
      if (options.task && workflow.task !== options.task) continue;
      const output = workflowOutput(workflow);
      if (!output) continue;
      if (primaryOutput && output !== primaryOutput) continue;
      if (hints.parallelMedia && output !== "audio" && output !== "video") continue;
      if (
        output === "audio" &&
        !hints.musicVideo &&
        !matchesRequestedAudioKind(workflow.capabilities, hints)
      ) {
        continue;
      }

      let score = STATUS_WEIGHT[kit.status];
      const reasons: string[] = [`status:${kit.status}`];
      const haystack = textForKit(kit, workflow);
      const unmetRequirements: string[] = [];

      if (options.task) reasons.push(`task:${workflow.task}`);
      if (primaryOutput) reasons.push(`output:${primaryOutput}`);

      for (const token of goalTokens) {
        if (haystack.includes(token)) score += 2;
      }

      if (
        goalContainsName(options.goal, kit.name) ||
        goalContainsName(options.goal, workflow.name)
      ) {
        score += 60;
        reasons.push("name:exact");
      }

      if (hints.wantsFast && workflow.speed === "fast") {
        score += 10;
        reasons.push("speed:fast");
      }
      if (hints.wantsAnime && kit.tags?.includes("anime")) {
        score += 10;
        reasons.push("tag:anime");
      }
      if (hints.wantsImageGeneration && workflow.task === "text_to_image") {
        score += 10;
        reasons.push("task:text_to_image");
      }
      if ((hints.wantsVideo || hints.musicVideo) && output === "video") {
        score += 10;
        reasons.push("output:video");
      }
      if ((hints.wantsAudio || hints.wantsMusic) && output === "audio") {
        score += 10;
        reasons.push("output:audio");
      }
      if (output === "audio" && matchesRequestedAudioKind(workflow.capabilities, hints)) {
        if (hints.wantsMusic || hints.wantsLyrics || hints.wantsVocals) {
          score += 15;
          reasons.push("capability:music");
          if (
            workflow.capabilities?.audio_kinds.length === 1 &&
            workflow.capabilities.audio_kinds[0] === "music"
          ) {
            score += 5;
            reasons.push("capability:music:dedicated");
          }
        }
        if (hints.wantsSoundEffect) {
          score += 15;
          reasons.push("capability:sound_effect");
          if (
            workflow.capabilities?.audio_kinds.length === 1 &&
            workflow.capabilities.audio_kinds[0] === "sound_effect"
          ) {
            score += 5;
            reasons.push("capability:sound_effect:dedicated");
          }
        }
      }
      if (hints.wantsLyrics) {
        if (workflow.capabilities?.lyrics === true) {
          score += 15;
          reasons.push("capability:lyrics");
        } else {
          unmetRequirements.push("missing:lyrics");
        }
      }
      if (hints.wantsVocals) {
        if (workflow.capabilities?.vocals === true) {
          score += 15;
          reasons.push("capability:vocals");
        } else {
          unmetRequirements.push("missing:vocals");
        }
      }
      if (requestedGpu) {
        if (isGpuCompatible(kit.gpu.minimum, requestedGpu)) {
          reasons.push(`gpu:${requestedGpu}`);
          if (kit.gpu.verified) {
            reasons.push(
              kit.gpu.verified.includes(requestedGpu)
                ? `gpu_verified:${requestedGpu}`
                : `gpu_unverified:${requestedGpu}`,
            );
          }
          if (normalizeColabGpu(kit.gpu.recommended) === requestedGpu) score += 3;
        } else {
          unmetRequirements.push(`requires_gpu:${kit.gpu.minimum ?? "unknown"}`);
        }
      }
      if (hints.parallelMedia && (output === "audio" || output === "video")) {
        score += 10;
        reasons.push("compound_request");
      }
      if (hints.wantsEdit && workflow.task === "image_edit") {
        score += 10;
        reasons.push("task:image_edit");
      }
      if (hints.wantsUpscale && workflow.task === "upscale") {
        score += 10;
        reasons.push("task:upscale");
      }
      if (hints.wantsBackgroundRemoval && workflow.task === "remove_background") {
        score += 10;
        reasons.push("task:remove_background");
      }
      if (workflow.quality === "high") score += 5;
      if (workflow.quality === "draft") score -= 5;
      if (kit.license_notes?.some((note) => note.toLowerCase().includes("non-commercial"))) {
        score -= 3;
      }

      const suggestion: ColabSuggestion = {
        kit: kit.name,
        workflow: workflow.name,
        path: kit.path,
        workflow_file: workflow.file,
        task: workflow.task,
        workflow_output: output,
        outputs: [...kit.outputs],
        capabilities: workflow.capabilities
          ? {
              ...workflow.capabilities,
              audio_kinds: [...workflow.capabilities.audio_kinds],
            }
          : undefined,
        gpu: {
          ...kit.gpu,
          verified: kit.gpu.verified ? [...kit.gpu.verified] : undefined,
        },
        status: kit.status,
        score,
        reasons: [...new Set(reasons)],
      };

      if (unmetRequirements.length === 0) {
        suggestions.push(suggestion);
      } else {
        alternativeCandidates.push({
          ...suggestion,
          unmet_requirements: unmetRequirements,
          reasons: [
            ...new Set([
              ...suggestion.reasons,
              ...unmetRequirements.map((item) => `unmet:${item}`),
            ]),
          ],
        });
      }
    }
  }

  sortSuggestions(suggestions);
  alternativeCandidates.sort((a, b) => {
    const byUnmet = (a.unmet_requirements?.length ?? 0) - (b.unmet_requirements?.length ?? 0);
    if (byUnmet !== 0) return byUnmet;
    return compareSuggestions(a, b);
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
    alternatives: suggestions.length === 0 ? alternativeCandidates.slice(0, limit) : [],
  };
};
