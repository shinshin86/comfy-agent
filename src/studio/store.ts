import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { getWorkdirPath } from "../io/workdir.js";

// Studio state lives next to jobs and characters so any agent session (new,
// resumed, Claude Code or Codex) can pick up the same production context.
export const STUDIO_DIR = "studio";
const PLANS_DIR = "plans";
const REQUESTS_FILE = "requests.jsonl";

const StudioIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);

export const StudioStepStatusSchema = z.enum(["pending", "running", "done", "failed", "skipped"]);
export const StudioPlanStatusSchema = z.enum(["proposed", "running", "done", "cancelled"]);

export const StudioStepSchema = z.object({
  title: z.string().min(1),
  /** What the step achieves in creative terms ("animate this image"). */
  purpose: z.string().optional(),
  /** Technical method the agent chose (t2i, i2i, i2v, r2v, upscale, ...). */
  method: z.string().optional(),
  model: z.string().optional(),
  preset: z.string().optional(),
  character: z.string().optional(),
  /** Job IDs or file paths used as inputs. */
  inputs: z.array(z.string()).default([]),
  prompt: z.string().optional(),
  settings: z.record(z.unknown()).default({}),
  /** Why the agent chose this method/model, shown to the user as-is. */
  reason: z.string().optional(),
  status: StudioStepStatusSchema.default("pending"),
  job_ids: z.array(z.string()).default([]),
});

export const StudioPlanSchema = z.object({
  version: z.literal(1).default(1),
  id: StudioIdSchema,
  title: z.string().min(1),
  request_id: z.string().optional(),
  /** The user's request in their own words. */
  intent: z.string().optional(),
  /** The agent's interpretation of the request. */
  summary: z.string().optional(),
  status: StudioPlanStatusSchema.default("proposed"),
  steps: z.array(StudioStepSchema).min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const StudioSelectionSchema = z.object({
  job_id: z.string().min(1),
  output_index: z.number().int().min(0),
});

export const StudioRequestSchema = z.object({
  id: z.string().min(1),
  at: z.string().datetime(),
  text: z.string().min(1),
  selected: z.array(StudioSelectionSchema).default([]),
  character: z.string().optional(),
});

export type StudioStep = z.infer<typeof StudioStepSchema>;
export type StudioPlan = z.infer<typeof StudioPlanSchema>;
export type StudioSelection = z.infer<typeof StudioSelectionSchema>;
export type StudioRequest = z.infer<typeof StudioRequestSchema>;

export const getStudioDirPath = (cwd: string) =>
  path.join(getWorkdirPath(cwd, "local"), STUDIO_DIR);
const plansDir = (cwd: string) => path.join(getStudioDirPath(cwd), PLANS_DIR);
export const getRequestsFilePath = (cwd: string) => path.join(getStudioDirPath(cwd), REQUESTS_FILE);

export const ensureStudioDir = async (cwd: string) => {
  await fs.mkdir(plansDir(cwd), { recursive: true });
};

const readJsonFile = async (filePath: string): Promise<unknown | null> => {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
};

/** Malformed plans are skipped so one bad file never blanks the whole UI. */
export const listPlans = async (cwd: string): Promise<StudioPlan[]> => {
  let names: string[];
  try {
    names = await fs.readdir(plansDir(cwd));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const plans = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) =>
        StudioPlanSchema.safeParse(await readJsonFile(path.join(plansDir(cwd), name))),
      ),
  );
  return plans
    .flatMap((result) => (result.success ? [result.data] : []))
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
};

/**
 * Creates or replaces a plan. `created_at` is preserved across updates so an
 * agent can rewrite the whole plan file as steps progress.
 */
export const savePlan = async (
  cwd: string,
  input: unknown,
  now = new Date(),
): Promise<StudioPlan> => {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const id = StudioIdSchema.parse(raw.id);
  const filePath = path.join(plansDir(cwd), `${id}.json`);
  const existing = StudioPlanSchema.safeParse(await readJsonFile(filePath));
  const timestamp = now.toISOString();
  const plan = StudioPlanSchema.parse({
    ...raw,
    created_at: existing.success ? existing.data.created_at : (raw.created_at ?? timestamp),
    updated_at: timestamp,
  });
  await ensureStudioDir(cwd);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(plan, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
  return plan;
};

export const listRequests = async (cwd: string): Promise<StudioRequest[]> => {
  let raw: string;
  try {
    raw = await fs.readFile(getRequestsFilePath(cwd), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return parseRequestLines(raw);
};

export const parseRequestLines = (raw: string): StudioRequest[] =>
  raw.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const parsed = StudioRequestSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });

export const appendRequest = async (
  cwd: string,
  input: Omit<StudioRequest, "id" | "at">,
  now = new Date(),
): Promise<StudioRequest> => {
  const request = StudioRequestSchema.parse({
    ...input,
    id: `req-${now
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14)}-${randomUUID().slice(0, 6)}`,
    at: now.toISOString(),
  });
  await ensureStudioDir(cwd);
  await fs.appendFile(getRequestsFilePath(cwd), `${JSON.stringify(request)}\n`, "utf-8");
  return request;
};

/** A request counts as handled once a plan references it. */
export const handledRequestIds = (plans: StudioPlan[]) =>
  new Set(plans.flatMap(({ request_id: requestId }) => (requestId ? [requestId] : [])));
