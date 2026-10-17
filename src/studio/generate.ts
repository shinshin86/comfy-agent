import { CliError } from "../io/errors.js";
import type { Preset } from "../preset/schema.js";
import { resolveSeedTargets } from "../cli/run/args.js";
import { MAX_RERUN_COUNT } from "./rerun.js";
import { z } from "zod";
import { StudioInputSchema } from "./store.js";
import type { CatalogEngine } from "./catalog.js";

const GenerateSchema = z
  .object({
    preset: z.string().min(1),
    capability: z.string().min(1).optional(),
    prompt: z.string().optional(),
    negative_prompt: z.string().optional(),
    duration_s: z.number().positive().optional(),
    aspect: z.enum(["1:1", "16:9", "9:16", "4:3"]).optional(),
    size: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
    params: z.record(z.unknown()).default({}),
    inputs: z.record(StudioInputSchema).default({}),
    count: z.number().int().min(1).max(MAX_RERUN_COUNT).default(1),
    seed: z
      .union([z.literal("random"), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)])
      .default("random"),
    lang: z.enum(["ja", "en"]).optional(),
    source_job_id: z.string().min(1).optional(),
    skip: z.array(z.string().min(1)).optional(),
  })
  .strict();
export const parseGenerate = (body: unknown) => {
  const result = GenerateSchema.safeParse(body);
  if (!result.success) throw new CliError("INVALID_PARAM", "Invalid generation request.", 2);
  if (typeof result.data.seed === "number" && result.data.count > 1)
    throw new CliError("INVALID_PARAM", "A fixed seed requires count 1.", 2);
  if (result.data.aspect && result.data.size)
    throw new CliError("INVALID_PARAM", "Choose either aspect or size.", 2);
  if (
    !result.data.capability &&
    ["prompt", "negative_prompt", "duration_s", "aspect", "size"].some((key) =>
      Object.hasOwn(result.data, key),
    )
  )
    throw new CliError("INVALID_PARAM", "A capability is required for composer controls.", 2);
  return result.data;
};

export const mapComposerParams = (
  body: ReturnType<typeof parseGenerate>,
  engine: Pick<CatalogEngine, "controls" | "constraints">,
) => {
  const params = { ...body.params };
  const invalid = (key: string): never => {
    throw new CliError("INVALID_PARAM", `Unsupported control: ${key}`, 2);
  };
  const set = (key: string, value: unknown) => {
    const control =
      engine.controls[key as "prompt" | "negative_prompt" | "frames" | "width" | "height"];
    if (!control || typeof control !== "object" || !("param" in control)) return invalid(key);
    params[String(control.param)] = value;
  };
  if (body.prompt !== undefined) set("prompt", body.prompt);
  if (body.negative_prompt !== undefined) set("negative_prompt", body.negative_prompt);
  if (body.duration_s !== undefined) {
    const control = engine.controls.fps;
    const fps =
      typeof control === "number"
        ? control
        : control && typeof control === "object" && "param" in control
          ? Number(params[String(control.param)] ?? control.default ?? engine.constraints?.fps)
          : engine.constraints?.fps;
    if (!fps || !Number.isFinite(fps) || fps <= 0) invalid("duration_s");
    const bounds = engine.constraints?.duration_s;
    if (bounds && (body.duration_s < bounds[0] || body.duration_s > bounds[1]))
      invalid("duration_s");
    set("frames", Math.round(body.duration_s * fps!));
  }
  let size = body.size;
  if (body.aspect) {
    const [a, b] = body.aspect.split(":").map(Number);
    size = engine.constraints?.sizes?.find(([w, h]) => Math.abs(w / h - a! / b!) < 0.025);
    if (!size) invalid("aspect");
  }
  if (size) {
    if (
      engine.constraints?.sizes &&
      !engine.constraints.sizes.some(([w, h]) => w === size![0] && h === size![1])
    )
      invalid("size");
    set("width", size[0]);
    set("height", size[1]);
  }
  if (body.count > 1 && !engine.controls.count) invalid("count");
  if (typeof body.seed === "number" && !engine.controls.seed) invalid("seed");
  const frames = engine.controls.frames;
  if (frames && Object.hasOwn(params, frames.param)) {
    const value = Number(params[frames.param]);
    if (
      (frames.min !== undefined && value < frames.min) ||
      (frames.max !== undefined && value > frames.max) ||
      (frames.choices && !frames.choices.includes(value)) ||
      (frames.step &&
        Math.abs(
          (value - (frames.step_offset ?? 0)) / frames.step -
            Math.round((value - (frames.step_offset ?? 0)) / frames.step),
        ) > 1e-8)
    )
      invalid("duration_s");
  }
  return params;
};

export const validateGenerateParams = (
  preset: Preset,
  params: Record<string, unknown>,
  liveNodes?: Set<string>,
) => {
  const invalid = (name: string): never => {
    throw new CliError("INVALID_PARAM", `Invalid parameter: ${name}`, 2);
  };
  const seedParams = new Set(resolveSeedTargets(preset).map(({ param }) => param));
  for (const [name, value] of Object.entries(params)) {
    const def = Object.hasOwn(preset.parameters ?? {}, name) ? preset.parameters![name] : undefined;
    if (!def || seedParams.has(name)) return invalid(name);
    if (def.type === "string" && typeof value !== "string") invalid(name);
    if (def.type === "bool" && typeof value !== "boolean") invalid(name);
    if (["int", "float"].includes(def.type)) {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        (def.type === "int" && !Number.isInteger(value))
      )
        invalid(name);
      if (
        typeof value === "number" &&
        ((def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max))
      )
        invalid(name);
    }
    if (
      def.choices &&
      !def.choices.some((choice) => JSON.stringify(choice) === JSON.stringify(value))
    )
      invalid(name);
  }
  for (const [name, def] of Object.entries(preset.parameters ?? {})) {
    if (
      !seedParams.has(name) &&
      (!liveNodes || liveNodes.has(String(def.target.node_id))) &&
      def.required &&
      def.default === undefined &&
      (!Object.hasOwn(params, name) || params[name] === "")
    )
      invalid(name);
  }
};
