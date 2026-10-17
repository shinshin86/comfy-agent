import path from "node:path";
import { randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import { z } from "zod";
import { CliError } from "../io/errors.js";
import { JobRecordSchema, OutputRecordSchema } from "../jobs/types.js";

export const DeleteOutputSchema = z
  .object({
    saved_to: OutputRecordSchema.shape.saved_to,
    reason: z.string().trim().max(4000).optional(),
  })
  .strict();
const FeedbackSchema = z.object({
  kind: z.literal("deleted"),
  at: z.string().datetime(),
  preset: z.string().max(256),
  prompt: z.string().max(32000),
  params: z.record(z.union([z.number().finite(), z.boolean()])),
  reason: z.string().min(1).max(4000),
});
export type DeletedFeedback = z.infer<typeof FeedbackSchema>;
const fail = (code: string, message: string): never => {
  throw new CliError(code, message, 2);
};
const inside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
/** Traverse from a canonical root; never mutate through a directory symlink. */
const safeDirectory = async (root: string, target: string) => {
  if (!inside(root, target))
    fail("FORBIDDEN_OUTPUT_PATH", "Only local workdir outputs can be deleted.");
  let current = root;
  for (const part of path.relative(root, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      fail("FORBIDDEN_OUTPUT_PATH", "Deletion through a directory link is not allowed.");
  }
};
const regularFile = async (filename: string, missing = false) => {
  try {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink())
      fail("FORBIDDEN_OUTPUT_PATH", "Deletion requires a regular local file.");
    return true;
  } catch (error) {
    if (missing && (error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

export const listDeletedFeedback = async (cwd: string): Promise<DeletedFeedback[]> => {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(cwd, ".comfy-agent", "studio", "feedback.jsonl"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return raw.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const parsed = FeedbackSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
};

const performDelete = async (cwd: string, jobId: string, index: number, input: unknown) => {
  const parsed = DeleteOutputSchema.safeParse(input);
  if (
    !parsed.success ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(jobId) ||
    !Number.isSafeInteger(index) ||
    index < 0
  )
    return fail("INVALID_PARAM", "Invalid output deletion request.");
  const root = await fs.realpath(cwd),
    workdir = path.join(root, ".comfy-agent");
  const jobs = path.join(workdir, "jobs"),
    outputs = path.join(workdir, "outputs");
  await safeDirectory(root, jobs);
  const recordPath = path.join(jobs, `${jobId}.json`);
  let record;
  try {
    await regularFile(recordPath);
    const handle = await fs.open(recordPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      record = JobRecordSchema.parse(JSON.parse(await handle.readFile("utf8")));
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return fail("JOB_NOT_FOUND", "Local job not found.");
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return fail("INVALID_JOB_RECORD", "Invalid job record.");
    throw error;
  }
  if (record.scope !== "local" || record.job_id !== jobId)
    return fail("FORBIDDEN_OUTPUT_PATH", "Only exact local job IDs can be deleted.");
  if (["submitted", "running"].includes(record.status))
    return fail("JOB_BUSY", "Wait until the job finishes before deleting its outputs.");
  const output = record.outputs[index];
  if (!output || output.saved_to !== parsed.data.saved_to)
    return fail("OUTPUT_CHANGED", "This output changed. Reload it before deleting.");
  await safeDirectory(root, outputs);
  const outputDir = await fs.realpath(record.output_dir);
  await safeDirectory(outputs, outputDir);
  const target = path.join(outputDir, output.saved_to);
  const hasMedia = await regularFile(target, true);
  const removed = record.outputs.flatMap((value, i) =>
    value.saved_to === output.saved_to ? [i] : [],
  );
  const remaining = record.outputs.filter((value) => value.saved_to !== output.saved_to);
  const id = randomUUID();
  const mediaStage = path.join(outputDir, `.studio-delete-${id}.tmp`);
  const recordStage = path.join(jobs, `.studio-delete-${id}.tmp`);
  const replacement = path.join(jobs, `.studio-replace-${id}.tmp`);
  let mediaMoved = false,
    recordMoved = false,
    committed = false;
  let feedback: Awaited<ReturnType<typeof fs.open>> | undefined;
  let feedbackSize = 0;
  try {
    // Prepare every write before removing anything. Staged files allow rollback
    // if a record or feedback write fails before the final media unlink.
    if (remaining.length)
      await fs.writeFile(
        replacement,
        `${JSON.stringify({ ...record, outputs: remaining }, null, 2)}\n`,
        { flag: "wx", mode: 0o600 },
      );
    if (parsed.data.reason) {
      const studioDir = path.join(workdir, "studio");
      await fs.mkdir(studioDir, { recursive: true });
      await safeDirectory(root, studioDir);
      const feedbackPath = path.join(studioDir, "feedback.jsonl");
      await regularFile(feedbackPath, true);
      feedback = await fs.open(
        feedbackPath,
        constants.O_CREAT | constants.O_RDWR | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      feedbackSize = (await feedback.stat()).size;
    }
    await safeDirectory(outputs, outputDir);
    await safeDirectory(root, jobs);
    if (hasMedia) {
      await regularFile(target);
      await fs.rename(target, mediaStage);
      mediaMoved = true;
    }
    await fs.rename(recordPath, recordStage);
    recordMoved = true;
    if (remaining.length) await fs.rename(replacement, recordPath);
    if (feedback) {
      const entry: DeletedFeedback = {
        kind: "deleted",
        at: new Date().toISOString(),
        preset: record.preset.slice(0, 256),
        prompt: (record.prompt_final ?? record.prompt_input ?? "")
          .replace(/data:[^,\s]+;base64,[A-Za-z0-9+/=]+/g, "[media omitted]")
          .slice(0, 32000),
        params: Object.fromEntries(
          Object.entries(record.params)
            .filter(
              ([key, value]) =>
                key.length <= 128 &&
                (typeof value === "boolean" ||
                  (typeof value === "number" && Number.isFinite(value))),
            )
            .slice(0, 64),
        ) as Record<string, number | boolean>,
        reason: parsed.data.reason!,
      };
      await feedback.writeFile(`${JSON.stringify(entry)}\n`);
    }
    if (mediaMoved) {
      await safeDirectory(outputs, outputDir);
      await fs.unlink(mediaStage);
    }
    committed = true;
    await fs.unlink(recordStage).catch(() => undefined);
    return {
      job_id: jobId,
      removed_indices: removed,
      job_removed: remaining.length === 0,
      feedback_saved: Boolean(parsed.data.reason),
    };
  } catch (error) {
    if (!committed) {
      if (feedback) await feedback.truncate(feedbackSize);
      if (recordMoved) await fs.rename(recordStage, recordPath);
      if (mediaMoved) await fs.rename(mediaStage, target);
    }
    throw error;
  } finally {
    await feedback?.close();
    await fs.unlink(replacement).catch(() => undefined);
  }
};

// A single writer also makes feedback rollback safe across different jobs.
let deletionQueue: Promise<unknown> = Promise.resolve();
export const deleteStudioOutput = (cwd: string, jobId: string, index: number, input: unknown) => {
  const operation = deletionQueue
    .catch(() => undefined)
    .then(() => performDelete(cwd, jobId, index, input));
  deletionQueue = operation;
  return operation;
};
