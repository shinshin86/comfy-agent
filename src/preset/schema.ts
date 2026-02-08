import { z } from "zod";

const NodeTargetSchema = z.object({
  node_id: z.union([z.string(), z.number()]),
  input: z.string(),
});

const ParameterSchema = z.object({
  type: z.enum(["string", "int", "float", "bool", "json"]),
  target: NodeTargetSchema,
  required: z.boolean().optional(),
  default: z.unknown().optional(),
});

const UploadSchema = z.object({
  kind: z.enum(["image", "mask"]),
  cli_flag: z.string(),
  target: NodeTargetSchema,
});

export const PresetSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  workflow: z.string(),
  parameters: z.record(ParameterSchema).optional(),
  uploads: z.record(UploadSchema).optional(),
});

export type Preset = z.infer<typeof PresetSchema>;
export type ParameterDef = z.infer<typeof ParameterSchema>;
export type UploadDef = z.infer<typeof UploadSchema>;
