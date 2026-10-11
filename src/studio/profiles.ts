import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { z } from "zod";
import type { Preset } from "../preset/schema.js";
import type { WorkdirScope } from "../io/workdir.js";
import { CliError } from "../io/errors.js";
import { getStudioDirPath } from "./store.js";
import { resolveWorkflowPath } from "../workflow/load.js";
import {
  normalizeWorkflow,
  type Workflow,
  type WorkflowObjectInfo,
} from "../workflow/normalize.js";
import { resolveSeedTargets } from "../cli/run/args.js";
import { inferCapability, capabilityFields } from "./capabilities.js";

export const LocalizedSchema = z.object({ ja: z.string().min(1), en: z.string().min(1) }).strict();
export const CapabilityIdSchema = z.enum([
  "text_to_image",
  "image_edit",
  "text_to_video",
  "image_to_video",
  "first_last_frame",
  "reference_to_video",
  "video_to_video",
  "music",
  "sound_effect",
  "speech",
  "upscale",
  "remove_background",
  "other",
]);
export type CapabilityId = z.infer<typeof CapabilityIdSchema>;
export const InputRoleSchema = z.enum([
  "edit_source",
  "start_frame",
  "end_frame",
  "reference",
  "mask",
  "audio_reference",
  "video_source",
]);
const ParamSchema = z.string().min(1);
export const WorkflowProfileSchema = z
  .object({
    version: z.literal(1),
    preset: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    source: z.enum(["auto", "agent"]),
    workflow_hash: z.string().regex(/^[a-f0-9]{64}$/),
    preset_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    auto_revision: z.number().int().positive().optional(),
    output: z.enum(["image", "video", "audio"]),
    audio_track: z.boolean().optional(),
    inputs: z.array(
      z
        .object({
          slot: z.string().min(1),
          kind: z.enum(["image", "mask", "audio", "file", "video"]),
          role: InputRoleSchema,
          label: LocalizedSchema.optional(),
        })
        .strict(),
    ),
    capability: CapabilityIdSchema,
    model_label: z.string().min(1).optional(),
    title: LocalizedSchema.optional(),
    summary: LocalizedSchema.optional(),
    controls: z
      .object({
        prompt: ParamSchema.optional(),
        negative_prompt: ParamSchema.optional(),
        width: ParamSchema.optional(),
        height: ParamSchema.optional(),
        frames: ParamSchema.optional(),
        fps: z.union([ParamSchema, z.number().positive()]).optional(),
        count: z.literal(true).optional(),
        seed: z.literal(true).optional(),
        strength: ParamSchema.optional(),
        other: z.array(ParamSchema).default([]),
      })
      .strict(),
    constraints: z
      .object({
        duration_s: z
          .tuple([z.number().nonnegative(), z.number().positive()])
          .refine(([a, b]) => a <= b)
          .optional(),
        fps: z.number().positive().optional(),
        sizes: z
          .array(z.tuple([z.number().int().positive(), z.number().int().positive()]))
          .min(1)
          .optional(),
      })
      .strict()
      .optional(),
    speed: z.enum(["fast", "normal", "quality"]).optional(),
    recommended: z.boolean().optional(),
  })
  .strict();
export type WorkflowProfile = z.infer<typeof WorkflowProfileSchema>;
export type ProfileSnapshot = WorkflowProfile & { stale: boolean };
export const localized = (ja: string, en: string) => ({ ja, en });
export const CAPABILITY_LABELS: Record<CapabilityId, z.infer<typeof LocalizedSchema>> = {
  text_to_image: localized("画像を作る", "Create an image"),
  image_edit: localized("画像を編集", "Edit an image"),
  text_to_video: localized("動画を作る", "Create a video"),
  image_to_video: localized("画像を動かす", "Animate an image"),
  first_last_frame: localized("2枚のフレームをつなぐ", "Connect two frames"),
  reference_to_video: localized("参照から動画", "Video from references"),
  video_to_video: localized("動画を編集", "Edit a video"),
  music: localized("音楽を作る", "Create music"),
  sound_effect: localized("効果音を作る", "Create sound effects"),
  speech: localized("声を作る", "Create speech"),
  upscale: localized("画像を拡大", "Upscale an image"),
  remove_background: localized("背景を消す", "Remove background"),
  other: localized("その他の制作", "Other creations"),
};
export const CONTROL_LABELS: Record<string, z.infer<typeof LocalizedSchema>> = {
  prompt: localized("プロンプト", "Prompt"),
  negative_prompt: localized("避けたい内容", "Negative prompt"),
  width: localized("幅 (px)", "Width (px)"),
  height: localized("高さ (px)", "Height (px)"),
  frames: localized("長さ (フレーム)", "Length (frames)"),
  fps: localized("フレームレート", "Frame rate"),
  strength: localized("変化の強さ", "Strength"),
  steps: localized("ステップ数", "Steps"),
  guidance: localized("ガイダンス", "Guidance"),
  cfg: localized("ガイダンス", "Guidance"),
  denoise: localized("変化の強さ", "Denoising strength"),
  sampler_name: localized("サンプラー", "Sampler"),
  sampler: localized("サンプラー", "Sampler"),
  scheduler: localized("スケジューラー", "Scheduler"),
  seed: localized("シード", "Seed"),
  filename_prefix: localized("保存名", "Output name"),
  duration: localized("長さ (秒)", "Duration (seconds)"),
  seconds: localized("長さ (秒)", "Duration (seconds)"),
};
export const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const profilePath = (cwd: string, preset: string) =>
  path.join(
    getStudioDirPath(cwd),
    "profiles",
    `${WorkflowProfileSchema.shape.preset.parse(preset)}.json`,
  );
const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const AUTO_PROFILE_REVISION = 2;
const titleCase = (value: string) => value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
export const humanizePresetName = (name: string) => {
  const labels: Record<string, string> = {
    t2i: "Text to Image",
    i2i: "Image Edit",
    t2v: "Text to Video",
    i2v: "Image to Video",
    r2v: "Reference Video",
    flf2v: "First/Last Frames",
    t2a: "Audio",
    gguf: "GGUF",
    h3: "H3",
    qwen21: "Qwen 2.1",
    ltx25: "LTX 2.5",
    sd35: "SD 3.5",
    sdxl: "SDXL",
    "2ref": "2 References",
    api: "API",
    l4: "L4",
    a100: "A100",
  };
  return (
    name
      .split(/[_\s-]+/)
      .filter((token) => token && !/^(?:e2e|test\d*|imported|skilltest\d*|\d{8})$/i.test(token))
      .map((token) => labels[token.toLowerCase()] ?? titleCase(token.toLowerCase()))
      .join(" ") || "Creation"
  );
};
export const cleanModelFilename = (value: string) => {
  const stem = path.basename(value.replace(/\\/g, "/")).replace(/\.[^.]+$/, "");
  return titleCase(
    stem
      .replace(/(?:^|[_\s-])q\d+(?:[_-]k)?(?:[_-][a-z])?(?=$|[_\s-])/gi, " ")
      .replace(
        /(?:^|[_\s-])(?:fp\d+(?:mixed)?|bf\d+|int\d+|scaled|convrot|e\d+m\d+(?:fn)?|gguf)(?=$|[_\s-])/gi,
        " ",
      )
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase(),
  );
};
const modelFamily = (value: string) => {
  const key = words(value);
  for (const [pattern, label] of [
    [/10eros.*max.*h3/, "10Eros Max H3"],
    [/minimax.*h3|h3_|hailuo/, "MiniMax H3"],
    [/qwen.*image_?2_?1(?:_|$)|qwen21/, "Qwen Image 2.1"],
    [/qwen.*image/, "Qwen Image"],
    [/anima/, "Anima"],
    [/krea_?2/, "Krea 2"],
    [/ideogram_?4/, "Ideogram 4"],
    [/hidream.*i_?1/, "HiDream I1"],
    [/hunyuan.*video/, "Hunyuan Video"],
    [/wan_?2_?2|wan22/, "Wan 2.2"],
    [/wan_?2_?1|wan21/, "Wan 2.1"],
    [/sd_?3_?5|sd35/, "SD 3.5"],
    [/stable.*audio_?3/, "Stable Audio 3"],
    [/stable.*audio/, "Stable Audio"],
    [/minimax.*music_?3/, "MiniMax Music 3"],
    [/minimax.*music/, "MiniMax Music"],
    [/moss.*sound.*effect.*v_?2/, "MOSS SoundEffect v2"],
    [/moss.*sound.*effect/, "MOSS SoundEffect"],
    [/ming.*image/, "Ming Image"],
    [/boogu.*turbo/, "Boogu Image Turbo"],
    [/boogu/, "Boogu Image"],
    [/z_?(?:image_?)?anime/, "Z-Image (Anime)"],
    [/ltx.*2_?5|ltx25/, "LTX 2.5"],
    [/ltx/, "LTX Video"],
    [/flux/, "FLUX"],
    [/z_image/, "Z-Image"],
    [/krea/, "Krea"],
    [/sd_?xl/, "SDXL"],
    [/ace_step|acestep/, "ACE-Step"],
    [/musicgen/, "MusicGen"],
    [/irodori/, "Irodori TTS"],
  ] as const)
    if (pattern.test(key)) return label;
  return null;
};
const workflowNodes = (workflow: Workflow) =>
  Object.values(workflow).filter(
    (node): node is { class_type: string; inputs: Record<string, unknown> } =>
      Boolean(node && typeof node === "object" && "class_type" in node && "inputs" in node),
  );
export const inferModelLabel = (preset: Preset, workflow: Workflow, output: string) => {
  const models = workflowNodes(workflow)
    .flatMap((node) => {
      if (!/Loader|Checkpoint/i.test(node.class_type)) return [];
      return Object.entries(node.inputs).flatMap(([input, value]) => {
        if (
          typeof value !== "string" ||
          !/\.(?:safetensors|sft|gguf|ckpt|bin|pt|pth|onnx|vae)$/i.test(value)
        )
          return [];
        const priority = /UNETLoader|UnetLoaderGGUF|(?:ImageOnly)?CheckpointLoader/i.test(
          node.class_type,
        )
          ? 0
          : /^(?:unet_name|ckpt_name|model_name)$/.test(input)
            ? 1
            : 2;
        return [{ value, priority }];
      });
    })
    .sort((a, b) => a.priority - b.priority);
  const primary = models.find((model) => model.priority < 2);
  if (primary) return modelFamily(primary.value) ?? cleanModelFilename(primary.value);
  return (
    modelFamily(preset.name) ??
    workflowNodes(workflow)
      .map((node) => modelFamily(node.class_type))
      .find(Boolean) ??
    (models[0]
      ? (modelFamily(models[0].value) ?? cleanModelFilename(models[0].value))
      : output === "video"
        ? "Video model"
        : output === "audio"
          ? "Audio model"
          : "Image model")
  );
};
export const inputRoleLabel = (
  role: z.infer<typeof InputRoleSchema>,
  capability: CapabilityId,
  index = 1,
) => {
  const labels = {
    edit_source: localized("編集する画像", "Image to edit"),
    start_frame:
      capability === "first_last_frame"
        ? localized("最初のフレーム", "First frame")
        : localized("動かす画像", "Image to animate"),
    end_frame: localized("最後のフレーム", "Last frame"),
    reference: localized(`参照画像 ${index}`, `Reference image ${index}`),
    mask: localized("編集する範囲", "Mask"),
    audio_reference: localized("参照音声", "Reference audio"),
    video_source: localized("編集する動画", "Video to edit"),
  };
  return labels[role];
};
export const generateAutoProfile = (
  preset: Preset,
  workflow: Workflow,
  workflowHash: string,
): WorkflowProfile => {
  const inferred = inferCapability(preset, workflow);
  const name = words(preset.name);
  const uploads = Object.entries(preset.uploads ?? {});
  const framePair =
    /(?:^|_)flf2v(?:_|$)/.test(name) ||
    uploads.some(([slot, def]) =>
      /(?:^|_)(?:last|end)(?:_|$)/.test(words([slot, ...(def.aliases ?? [])].join(" "))),
    );
  let capability: CapabilityId =
    inferred.task === "custom" || inferred.task === "inpaint"
      ? "other"
      : inferred.task === "audio"
        ? /tts|speech|voice/.test(name)
          ? "speech"
          : /(?:^|_)(?:sfx|soundeffect|sound_effect|foley)(?:_|$)/.test(name)
            ? "sound_effect"
            : "music"
        : inferred.task;
  if (inferred.output === "video" && framePair) capability = "first_last_frame";
  const images = uploads.filter(([, def]) => def.kind === "image");
  let ref = 0;
  const inputs = uploads.map(([slot, def]) => {
    const tokens = words([slot, def.role, ...(def.aliases ?? [])].join(" "));
    const role: z.infer<typeof InputRoleSchema> =
      def.kind === "mask"
        ? "mask"
        : def.kind === "audio"
          ? "audio_reference"
          : /video/.test(def.role ?? "")
            ? "video_source"
            : capability === "first_last_frame"
              ? /(?:^|_)(?:last|end|final)(?:_|$)/.test(tokens)
                ? "end_frame"
                : /(?:^|_)(?:first|start|initial)(?:_|$)/.test(tokens)
                  ? "start_frame"
                  : images.findIndex(([key]) => key === slot) === 0
                    ? "start_frame"
                    : "end_frame"
              : capability === "image_to_video"
                ? "start_frame"
                : capability === "image_edit" &&
                    def.role !== "reference_image" &&
                    images.findIndex(([key]) => key === slot) === 0
                  ? "edit_source"
                  : "reference";
    if (role === "reference") ref++;
    return {
      slot,
      kind: /video/.test(def.role ?? "") ? ("video" as const) : def.kind,
      role,
      label: inputRoleLabel(role, capability, ref),
    };
  });
  const fields = capabilityFields(preset);
  const controls: WorkflowProfile["controls"] = {
    count: true,
    ...(resolveSeedTargets(preset).length ? { seed: true } : {}),
    other: [],
  };
  const find = (candidates: string[]) =>
    fields.find(
      (f) =>
        candidates.includes(f.role ?? "") ||
        candidates.includes(words(f.label)) ||
        candidates.includes(words(preset.parameters![f.name]!.target.input)),
    );
  for (const [key, candidates] of [
    ["prompt", ["prompt", "text", "positive_prompt"]],
    ["negative_prompt", ["negative_prompt", "negative"]],
    ["width", ["width"]],
    ["height", ["height"]],
    ["frames", ["length", "frames", "num_frames", "video_length"]],
    ["fps", ["fps", "frame_rate"]],
    ["strength", ["strength", "denoise"]],
  ] as const) {
    const field = find([...candidates]);
    if (field) controls[key] = field.name;
  }
  let fps =
    typeof controls.fps === "string" ? Number(preset.parameters?.[controls.fps]?.default) : 0;
  if (!Number.isFinite(fps) || fps <= 0)
    fps = Number(workflowNodes(workflow).find((node) => node?.inputs?.fps)?.inputs.fps) || 24;
  if (controls.frames && !controls.fps) controls.fps = fps;
  const assigned = new Set(
    Object.values(controls).filter((v): v is string => typeof v === "string"),
  );
  controls.other = fields.filter((f) => !assigned.has(f.name)).map((f) => f.name);
  const constraints: NonNullable<WorkflowProfile["constraints"]> = {};
  if (controls.frames) {
    const frames = preset.parameters![controls.frames]!;
    constraints.duration_s = [
      (frames.min ?? 1) / fps,
      (frames.max ?? Math.max(Number(frames.default) || 120, 240)) / fps,
    ];
    constraints.fps = fps;
  }
  if (controls.width && controls.height) {
    const w = preset.parameters![controls.width]!,
      h = preset.parameters![controls.height]!;
    const base = Number(w.default) || 1024;
    const allowed = (n: number, def: typeof w) =>
      (def.min === undefined || n >= def.min) &&
      (def.max === undefined || n <= def.max) &&
      (!def.choices || def.choices.includes(n));
    const sizes = [
      [Number(w.default) || 1024, Number(h.default) || 1024],
      [base, base],
      [base, Math.round((base * 9) / 16 / 8) * 8],
      [Math.round((base * 9) / 16 / 8) * 8, base],
      [base, Math.round((base * 3) / 4 / 8) * 8],
    ].filter(([x, y]) => allowed(x!, w) && allowed(y!, h));
    constraints.sizes = [
      ...new Map(sizes.map((size) => [size.join("x"), size as [number, number]])).values(),
    ];
    if (!constraints.sizes.length) delete constraints.sizes;
  }
  const model_label = inferModelLabel(preset, workflow, inferred.output);
  const title = localized(
    preset.description?.trim() || humanizePresetName(preset.name),
    preset.description?.trim() || humanizePresetName(preset.name),
  );
  return WorkflowProfileSchema.parse({
    version: 1,
    preset: preset.name,
    source: "auto",
    workflow_hash: workflowHash,
    preset_hash: hash(JSON.stringify(preset)),
    auto_revision: AUTO_PROFILE_REVISION,
    output: inferred.output,
    audio_track:
      inferred.output === "video" &&
      (/minimax.*h3|hailuo/.test(name) ||
        workflowNodes(workflow).some((node) => node?.inputs?.audio)),
    inputs,
    capability,
    model_label,
    title,
    summary: localized(`${model_label} で${title.ja}`, `${title.en} with ${model_label}`),
    controls,
    constraints,
    speed: /(?:^|_)(?:turbo|fast|lightning)(?:_|$)/.test(name)
      ? "fast"
      : /(?:^|_)(?:quality|hq)(?:_|$)/.test(name)
        ? "quality"
        : "normal",
  });
};
const writeProfile = async (cwd: string, profile: WorkflowProfile) => {
  const target = profilePath(cwd, profile.preset);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, `${JSON.stringify(profile, null, 2)}\n`, { flag: "wx" });
    await fs.rename(tmp, target);
  } finally {
    await fs.rm(tmp, { force: true });
  }
};
export const validateProfileMapping = (profile: WorkflowProfile, preset: Preset) => {
  const parameters = preset.parameters ?? {};
  const seedNames = new Set(resolveSeedTargets(preset).map(({ param }) => param));
  const names = [
    ...Object.values(profile.controls).filter(
      (value): value is string => typeof value === "string",
    ),
    ...profile.controls.other,
  ];
  const numericControls = ["width", "height", "frames", "fps", "strength"];
  const badType = Object.entries(profile.controls).some(
    ([key, param]) =>
      typeof param === "string" &&
      parameters[param] &&
      ((numericControls.includes(key) && !["int", "float"].includes(parameters[param]!.type)) ||
        (["prompt", "negative_prompt"].includes(key) && parameters[param]!.type !== "string")),
  );
  if (
    profile.preset !== preset.name ||
    badType ||
    (profile.controls.seed && !seedNames.size) ||
    names.some((name) => !Object.hasOwn(parameters, name) || seedNames.has(name)) ||
    profile.inputs.some((input) => {
      const def = preset.uploads?.[input.slot];
      return !def || (def.kind !== "file" && input.kind !== def.kind);
    }) ||
    Object.entries(preset.uploads ?? {}).some(
      ([slot, def]) => def.required && !profile.inputs.some((input) => input.slot === slot),
    ) ||
    new Set(profile.inputs.map((input) => input.slot)).size !== profile.inputs.length
  )
    throw new CliError("INVALID_PROFILE", "Profile controls or inputs do not match the preset.", 2);
};
export const readWorkflowProfile = async (
  cwd: string,
  preset: Preset,
  scope: WorkdirScope,
  objectInfo?: WorkflowObjectInfo,
): Promise<ProfileSnapshot> => {
  const raw = await fs.readFile(resolveWorkflowPath(preset, scope, cwd), "utf8");
  const workflowHash = hash(raw),
    presetHash = hash(JSON.stringify(preset));
  let profile: WorkflowProfile | undefined;
  try {
    profile = WorkflowProfileSchema.parse(
      JSON.parse(await fs.readFile(profilePath(cwd, preset.name), "utf8")),
    );
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(error instanceof SyntaxError) &&
      !(error instanceof z.ZodError)
    )
      throw error;
  }
  if (profile?.source === "agent")
    return {
      ...profile,
      stale:
        profile.workflow_hash !== workflowHash ||
        (profile.preset_hash !== undefined && profile.preset_hash !== presetHash),
    };
  if (
    !profile ||
    profile.workflow_hash !== workflowHash ||
    profile.preset_hash !== presetHash ||
    profile.auto_revision !== AUTO_PROFILE_REVISION
  ) {
    profile = generateAutoProfile(
      preset,
      normalizeWorkflow(JSON.parse(raw), { objectInfo }),
      workflowHash,
    );
    await writeProfile(cwd, profile);
  }
  return { ...profile, stale: false };
};
export const saveAgentProfile = async (
  cwd: string,
  preset: Preset,
  scope: WorkdirScope,
  input: unknown,
) => {
  const profile = WorkflowProfileSchema.parse(input);
  validateProfileMapping(profile, preset);
  const raw = await fs.readFile(resolveWorkflowPath(preset, scope, cwd), "utf8");
  const confirmed: WorkflowProfile = {
    ...profile,
    source: "agent",
    workflow_hash: hash(raw),
    preset_hash: hash(JSON.stringify(preset)),
  };
  await writeProfile(cwd, confirmed);
  return { ...confirmed, stale: false };
};
