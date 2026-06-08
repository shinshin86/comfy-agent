import { z } from "zod";

const NodeTargetSchema = z.object({
  node_id: z.union([z.string(), z.number()]),
  input: z.string(),
});

const PresetTaskSchema = z.enum([
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

const ParameterRoleSchema = z.enum([
  "prompt",
  "negative_prompt",
  "seed",
  "steps",
  "guidance",
  "width",
  "height",
  "sampler",
  "scheduler",
  "model",
  "strength",
  "denoise",
  "advanced",
  "custom",
]);

const UploadRoleSchema = z.enum([
  "init_image",
  "mask",
  "reference_image",
  "control_image",
  "input_image",
  "custom",
]);

const AliasesSchema = z.array(z.string().min(1)).min(1);

const ParameterSchema = z.object({
  type: z.enum(["string", "int", "float", "bool", "json"]),
  target: NodeTargetSchema,
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  description: z.string().optional(),
  role: ParameterRoleSchema.optional(),
  aliases: AliasesSchema.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  choices: z.array(z.unknown()).min(1).optional(),
  recommended: z.unknown().optional(),
});

const UploadSchema = z.object({
  kind: z.enum(["image", "mask"]),
  cli_flag: z.string(),
  target: NodeTargetSchema,
  description: z.string().optional(),
  role: UploadRoleSchema.optional(),
  aliases: AliasesSchema.optional(),
  required: z.boolean().optional(),
});

export const PresetSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  workflow: z.string(),
  description: z.string().optional(),
  task: PresetTaskSchema.optional(),
  tags: z.array(z.string().min(1)).optional(),
  parameters: z.record(ParameterSchema).optional(),
  uploads: z.record(UploadSchema).optional(),
});

export type Preset = z.infer<typeof PresetSchema>;
export type ParameterDef = z.infer<typeof ParameterSchema>;
export type UploadDef = z.infer<typeof UploadSchema>;
export type PresetTask = z.infer<typeof PresetTaskSchema>;
export type ParameterRole = z.infer<typeof ParameterRoleSchema>;
export type UploadRole = z.infer<typeof UploadRoleSchema>;
