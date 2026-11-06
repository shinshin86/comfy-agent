import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CliError } from "../io/errors.js";
import { fingerprint, hashFile } from "./fingerprint.js";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const outputSchema = z.object({
  path: z
    .string()
    .refine(
      (value) =>
        !path.isAbsolute(value) &&
        !path.win32.isAbsolute(value) &&
        !value.split(/[\\/]/).includes(".."),
    ),
  sha256: sha,
  role: z.enum(["media", "sheet"]).default("media"),
  metadata: z.record(z.unknown()).optional(),
});
const stageStateSchema = z.object({
  fingerprint: sha,
  inputs: z.record(z.unknown()),
  outputs: z.array(outputSchema),
  job_ids: z.array(z.string()),
  duration_ms: z.number().nonnegative(),
  completed_at: z.string(),
  revision: z.string(),
  error: z
    .object({ code: z.string(), message: z.string(), details: z.unknown().optional() })
    .optional(),
  pick: z.number().int().positive().optional(),
  picked_sha256: sha.optional(),
});
const stateSchema = z.object({ version: z.literal(1), stages: z.record(stageStateSchema) });
export type SceneState = z.infer<typeof stateSchema>;
export type StageState = z.infer<typeof stageStateSchema>;
export type SceneOutput = z.infer<typeof outputSchema>;

export const readState = async (dir: string): Promise<SceneState> => {
  try {
    return stateSchema.parse(
      JSON.parse(await fs.readFile(path.join(dir, ".scene", "state.json"), "utf-8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, stages: {} };
    throw new CliError("SCENE_STATE_INVALID", "Cannot read scene state", 2, {
      cause: String(error),
    });
  }
};
export const writeState = async (dir: string, state: SceneState): Promise<void> => {
  const target = path.join(dir, ".scene", "state.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(stateSchema.parse(state), null, 2)}\n`, {
      flag: "wx",
    });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
};
export const mediaOutputs = (state?: StageState): SceneOutput[] =>
  state?.outputs.filter((output) => output.role === "media") ?? [];
export const pickedOutput = (state?: StageState): SceneOutput | undefined =>
  state?.pick ? mediaOutputs(state)[state.pick - 1] : undefined;
export const dependencyToken = (state?: StageState): string | null =>
  state
    ? fingerprint({
        revision: state.revision,
        fingerprint: state.fingerprint,
        pick: state.pick,
        picked_sha256: state.picked_sha256,
      })
    : null;
export const outputRecord = async (
  dir: string,
  file: string,
  role: SceneOutput["role"] = "media",
): Promise<SceneOutput> => ({
  path: path.relative(dir, file).split(path.sep).join("/"),
  sha256: await hashFile(file),
  role,
});

/** Serialize runs and picks so two processes cannot replace each other's state. */
export const withSceneLock = async <T>(dir: string, action: () => Promise<T>): Promise<T> => {
  const file = path.join(dir, ".scene", "write.lock");
  await fs.mkdir(path.dirname(file), { recursive: true });
  let handle;
  try {
    handle = await fs.open(file, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new CliError("SCENE_BUSY", "Another scene command holds the write lock", 2, {
      lock: file,
      next_action:
        "Wait for the running command. After an interrupted process, confirm it has stopped before removing .scene/write.lock.",
    });
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid }));
    return await action();
  } finally {
    await handle.close();
    await fs.rm(file, { force: true });
  }
};
