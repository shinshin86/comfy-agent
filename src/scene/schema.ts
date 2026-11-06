import path from "node:path";
import { z } from "zod";
import { CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";

export const SceneIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const number = z.number().finite();
const relativeFile = z
  .string()
  .min(1)
  .refine(
    (value) => !path.isAbsolute(value) && !path.win32.isAbsolute(value),
    "Use a path relative to the scene directory",
  );
const stageFields = z
  .object({
    file: relativeFile.optional(),
    preset: SceneIdSchema.optional(),
    prompt: z.string().optional(),
    params: z.record(z.unknown()).optional(),
    inputs: z.record(z.string()).optional(),
    seed: number.int().safe().nonnegative().optional(),
    candidates: number.int().positive().optional(),
    input_size: z.tuple([number.int().positive(), number.int().positive()]).optional(),
    timeout_seconds: number.positive().optional(),
  })
  .strict();

const stageSchema = stageFields.superRefine((stage, ctx) => {
  if (stage.file !== undefined && stage.prompt !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["prompt"],
      message: "file and prompt are mutually exclusive",
    });
  }
  if (stage.file === undefined && stage.preset === undefined) {
    ctx.addIssue({ code: "custom", path: ["preset"], message: "A generated stage needs a preset" });
  }
  if (stage.file === undefined && stage.seed === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["seed"],
      message: "A generated stage needs an explicit seed",
    });
  }
});

export const EditSchema = z
  .object({
    fps_look: number.positive().nullable().default(12),
    saturation: number.min(0).max(3).default(0.96),
    grain: number.int().min(0).max(100).default(7),
    voice_gain: number.nonnegative().default(2.2),
    bgm_gain: number.nonnegative().default(0.32),
    duck: z
      .object({
        threshold: number.min(0.00097563).max(1).default(0.05),
        ratio: number.min(1).max(20).default(5),
        attack_ms: number.min(0.01).max(2000).default(15),
        release_ms: number.min(0.01).max(9000).default(280),
      })
      .strict()
      .default({}),
    fade_out: number.nonnegative().default(1),
    limiter: number.min(0.0625).max(1).default(0.95),
    crf: number.int().min(0).max(51).default(15),
    output: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.mp4$/)
      .default("final.mp4"),
  })
  .strict()
  .default({});

const sceneFields = {
  version: z.literal(1),
  name: SceneIdSchema,
  character: SceneIdSchema.optional(),
  form: SceneIdSchema.default("default"),
  vars: z.record(z.string()).default({}),
  checks: z
    .object({ transcribe_cmd: z.string().min(1).optional() })
    .strict()
    .optional(),
  defaults: z
    .object({ keyframe: stageFields.optional(), video: stageFields.optional() })
    .strict()
    .optional(),
  bgm: stageFields
    .extend({ start: number.nonnegative().default(0) })
    .strict()
    .optional(),
  edit: EditSchema,
};
const cutSchema = z
  .object({
    start: number.nonnegative().default(0),
    duration: number.positive().optional(),
  })
  .strict()
  .default({});
const rawSchema = z
  .object({
    ...sceneFields,
    shots: z
      .array(
        z
          .object({
            id: SceneIdSchema,
            dialogue: z.string().optional(),
            keyframe: stageFields,
            video: stageFields,
            cut: cutSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
const mergedSchema = z
  .object({
    ...sceneFields,
    shots: z
      .array(
        z
          .object({
            id: SceneIdSchema,
            dialogue: z.string().optional(),
            keyframe: stageSchema,
            video: stageSchema,
            cut: cutSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((scene, ctx) => {
    const ids = new Set<string>();
    scene.shots.forEach((shot, index) => {
      if (ids.has(shot.id))
        ctx.addIssue({
          code: "custom",
          path: ["shots", index, "id"],
          message: "Duplicate shot ID",
        });
      ids.add(shot.id);
      if (shot.video.candidates !== undefined && shot.video.candidates !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["shots", index, "video", "candidates"],
          message: "Only keyframes support multiple candidates",
        });
      }
      if (shot.keyframe.input_size)
        ctx.addIssue({
          code: "custom",
          path: ["shots", index, "keyframe", "input_size"],
          message: "input_size is only supported for video",
        });
    });
    if (scene.bgm) {
      const result = stageSchema.safeParse(
        Object.fromEntries(Object.entries(scene.bgm).filter(([key]) => key !== "start")),
      );
      if (!result.success)
        for (const issue of result.error.issues)
          ctx.addIssue({ ...issue, path: ["bgm", ...issue.path] });
      if (scene.bgm.candidates !== undefined && scene.bgm.candidates !== 1)
        ctx.addIssue({
          code: "custom",
          path: ["bgm", "candidates"],
          message: "Only keyframes support multiple candidates",
        });
      if (scene.bgm.input_size)
        ctx.addIssue({
          code: "custom",
          path: ["bgm", "input_size"],
          message: "input_size is only supported for video",
        });
    }
    for (const key of ["appearance", "ref", "keyframe"]) {
      if (Object.hasOwn(scene.vars, key))
        ctx.addIssue({ code: "custom", path: ["vars", key], message: "Reserved placeholder name" });
    }
  });

export type Scene = z.infer<typeof mergedSchema>;
export type SceneStage = z.infer<typeof stageFields>;
export type StageKind = "keyframe" | "video" | "bgm" | "edit";
export type Edit = z.infer<typeof EditSchema>;

export const fieldPath = (parts: Array<string | number>) =>
  parts.reduce<string>(
    (value, part) =>
      typeof part === "number" ? `${value}[${part}]` : `${value}${value ? "." : ""}${part}`,
    "",
  );
export const sceneInvalid = (field: string, reason: string): CliError =>
  new CliError("SCENE_INVALID", t("scene.invalid", { path: field, reason }), 2, {
    path: field,
    reason,
  });

const mergeStage = (defaults: SceneStage | undefined, stage: SceneStage): SceneStage => {
  if (stage.file !== undefined) return stage;
  return {
    ...defaults,
    ...stage,
    params: { ...defaults?.params, ...stage.params },
    inputs: { ...defaults?.inputs, ...stage.inputs },
  };
};

export const parseScene = (value: unknown): Scene => {
  try {
    const raw = rawSchema.parse(value);
    return mergedSchema.parse({
      ...raw,
      shots: raw.shots.map((shot) => ({
        ...shot,
        keyframe: mergeStage(raw.defaults?.keyframe, shot.keyframe),
        video: mergeStage(raw.defaults?.video, shot.video),
      })),
    });
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    const issue = error.issues[0];
    throw sceneInvalid(fieldPath(issue.path) || "scene", issue.message);
  }
};
