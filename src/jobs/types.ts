import path from "node:path";
import { z } from "zod";

const JobScopeSchema = z.enum(["local", "global"]);
const JobSourceSchema = z.enum(["local", "remote", "remote-catalog"]);

const isAbsolutePath = (value: string) => path.isAbsolute(value) || path.win32.isAbsolute(value);

const isRelativeBasename = (value: string) =>
  value.length > 0 &&
  !isAbsolutePath(value) &&
  path.posix.basename(value) === value &&
  path.win32.basename(value) === value &&
  value !== "." &&
  value !== "..";

export const JobStatusSchema = z.enum(["submitted", "running", "completed", "failed", "lost"]);

export const OutputRecordSchema = z.object({
  filename: z.string(),
  subfolder: z.string().optional(),
  type: z.string().optional(),
  kind: z.string().optional(),
  saved_to: z.string().refine(isRelativeBasename, {
    message: "saved_to must be a relative basename",
  }),
});

export const JobOutputSchema = OutputRecordSchema;

export const JobPromptSourceSchema = z.enum(["alias", "role_fallback"]);

export const JobCharacterSchema = z.object({
  name: z.string(),
  scope: JobScopeSchema,
  form: z.string().optional(),
});

export const JobNoteSchema = z.object({
  at: z.string(),
  text: z.string(),
});

export const JobVerifySummarySchema = z.object({
  at: z.string(),
  files: z.number(),
  kind: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  duration_s: z.number().optional(),
  frame_count: z.number().optional(),
  checks_failed: z.number(),
  sheet: z.string().optional(),
});

export const JobRecordSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  job_id: z.string(),
  prompt_id: z.string(),
  client_id: z.string(),
  batch_id: z.string(),
  batch_index: z.number().int().min(1),
  batch_count: z.number().int().min(1),
  scope: JobScopeSchema,
  base_url: z.string(),
  preset: z.string(),
  source: JobSourceSchema,
  params: z.record(z.unknown()),
  uploads: z.record(z.string()),
  seed: z.number().nullable(),
  output_dir: z.string().refine(isAbsolutePath, {
    message: "output_dir must be an absolute path",
  }),
  submitted_at: z.string(),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  status: JobStatusSchema,
  outputs: z.array(JobOutputSchema),
  duration_ms: z.number().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    })
    .optional(),
  prompt_input: z.string().optional(),
  prompt_final: z.string().optional(),
  prompt_source: JobPromptSourceSchema.optional(),
  negative_final: z.string().optional(),
  character: JobCharacterSchema.optional(),
  tags: z.array(z.string()).optional(),
  notes: z.array(JobNoteSchema).optional(),
  reject_reason: z.string().optional(),
  verify: JobVerifySummarySchema.optional(),
  favorite: z.boolean().optional(),
});

const RunManifestEntrySchema = z.object({
  index: z.number().int().min(1),
  job_id: z.string(),
  prompt_id: z.string(),
  status: JobStatusSchema,
  seed: z.number().nullable(),
  duration_ms: z.number().optional(),
  outputs: z.array(OutputRecordSchema),
});

export const RunManifestSchema = z.object({
  schema: z.literal(1),
  comfy_agent_version: z.string(),
  created_at: z.string(),
  preset: z.string(),
  source: JobSourceSchema,
  base_url: z.string(),
  scope: JobScopeSchema,
  params: z.record(z.unknown()),
  uploads: z.record(z.string()),
  character: JobCharacterSchema.optional(),
  runs: z.array(RunManifestEntrySchema),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type OutputRecord = z.infer<typeof OutputRecordSchema>;
export type JobOutput = z.infer<typeof JobOutputSchema>;
export type JobPromptSource = z.infer<typeof JobPromptSourceSchema>;
export type JobCharacter = z.infer<typeof JobCharacterSchema>;
export type JobNote = z.infer<typeof JobNoteSchema>;
export type JobVerifySummary = z.infer<typeof JobVerifySummarySchema>;
export type JobRecord = z.infer<typeof JobRecordSchema>;
export type RunManifestEntry = z.infer<typeof RunManifestEntrySchema>;
export type RunManifest = z.infer<typeof RunManifestSchema>;
export type RunManifestHeader = Pick<
  RunManifest,
  "preset" | "source" | "base_url" | "scope" | "params" | "uploads" | "character"
>;
