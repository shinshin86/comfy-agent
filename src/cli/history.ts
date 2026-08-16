import path from "node:path";
import { promises as fs } from "node:fs";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { print, printJson } from "../io/output.js";
import type { WorkdirScope } from "../io/workdir.js";
import { readRunManifest } from "../jobs/manifest.js";
import { queryHistory, type HistoryKind } from "../jobs/query.js";
import { readJob, updateJob } from "../jobs/store.js";
import { JobStatusSchema, type JobRecord } from "../jobs/types.js";

type CommonOptions = {
  global?: boolean;
  json?: boolean;
};

export type HistoryListOptions = CommonOptions & {
  preset?: string;
  character?: string;
  kind?: string;
  status?: string;
  tag?: string;
  search?: string;
  since?: string;
  favorite?: boolean;
  rejected?: boolean;
  limit?: string;
  allScopes?: boolean;
  fullPrompts?: boolean;
};

export type HistoryShowOptions = CommonOptions;
export type HistoryNoteOptions = CommonOptions;
export type HistoryTagOptions = CommonOptions & {
  rm?: boolean;
  reason?: string;
};
export type HistoryOpenOptions = CommonOptions;

type HistoryListJob = JobRecord & {
  outputs_abs: string[];
};

const requestedScope = (options: CommonOptions): WorkdirScope =>
  options.global ? "global" : "local";

const requestedScopes = (options: HistoryListOptions): WorkdirScope[] =>
  options.allScopes ? ["local", "global"] : [requestedScope(options)];

const parseLimit = (value: string | undefined) => {
  if (value === undefined) return 30;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CliError("INVALID_PARAM", t("history.invalid_limit"), 2, { value });
  }
  return parsed;
};

const parseKind = (value: string | undefined): HistoryKind | undefined => {
  if (value === undefined) return undefined;
  if (value === "image" || value === "video" || value === "audio") return value;
  throw new CliError("INVALID_PARAM", t("history.invalid_kind"), 2, { kind: value });
};

const parseStatus = (value: string | undefined) => {
  if (value === undefined) return undefined;
  const parsed = JobStatusSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new CliError("INVALID_PARAM", t("history.invalid_status"), 2, { status: value });
};

const outputKind = (record: JobRecord) => record.outputs.find(({ kind }) => kind)?.kind ?? "—";
const truncate = (value: string, length: number) => Array.from(value).slice(0, length).join("");

const printHistoryTable = (jobs: HistoryListJob[]) => {
  print("JOB(8)   DATE        PRESET          CHAR            KIND    STATUS     PROMPT(60)");
  for (const job of jobs) {
    const prompt = truncate(job.prompt_final ?? "—", 60);
    print(
      `${job.job_id.slice(0, 8).padEnd(8)}  ${job.submitted_at.slice(0, 10).padEnd(10)}  ${job.preset.slice(0, 15).padEnd(15)} ${(
        job.character?.name ?? "—"
      )
        .slice(0, 15)
        .padEnd(15)} ${outputKind(job).slice(0, 7).padEnd(7)} ${job.status.padEnd(10)} ${prompt}`,
    );
  }
};

const readVerifySummary = async (outputDir: string): Promise<unknown | null> => {
  const filePath = path.join(outputDir, "verify", "verify.json");
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return (parsed as Record<string, unknown>).summary ?? null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const absoluteOutputs = (record: JobRecord) =>
  record.outputs.map(({ saved_to: savedTo }) => path.join(record.output_dir, savedTo));

const historyListJob = (record: JobRecord): HistoryListJob => ({
  ...record,
  outputs_abs: absoluteOutputs(record),
});

export const runHistoryList = async (options: HistoryListOptions) => {
  const scopes = requestedScopes(options);
  const jobs = (
    await queryHistory({
      cwd: process.cwd(),
      scopes,
      preset: options.preset,
      character: options.character,
      kind: parseKind(options.kind),
      status: parseStatus(options.status),
      tag: options.tag,
      search: options.search,
      since: options.since,
      favorite: options.favorite,
      rejected: options.rejected,
      limit: parseLimit(options.limit),
      fullPrompts: options.fullPrompts,
    })
  ).map(historyListJob);

  if (options.json) {
    printJson({ ok: true, scopes, total: jobs.length, jobs });
    return;
  }
  if (jobs.length === 0) {
    print(t("history.list_empty"));
    return;
  }
  printHistoryTable(jobs);
};

export const runHistoryShow = async (jobId: string, options: HistoryShowOptions) => {
  const resolved = await readJob(jobId, process.cwd(), requestedScope(options));
  const manifestResult = await readRunManifest(resolved.record.output_dir);
  const payload = {
    ok: true,
    scope: resolved.scope,
    job: resolved.record,
    run_manifest: manifestResult?.ok ? manifestResult.manifest : null,
    verify: await readVerifySummary(resolved.record.output_dir),
    outputs_abs: absoluteOutputs(resolved.record),
  };
  printJson(payload);
};

export const runHistoryNote = async (
  jobId: string,
  text: string,
  options: HistoryNoteOptions,
) => {
  const resolved = await readJob(jobId, process.cwd(), requestedScope(options));
  const note = { at: new Date().toISOString(), text };
  const updated = await updateJob(
    resolved.record.job_id,
    { notes: [...(resolved.record.notes ?? []), note] },
    process.cwd(),
    resolved.scope,
  );
  if (options.json) {
    printJson({ ok: true, scope: updated.scope, job: updated.record, note });
    return;
  }
  print(t("history.note_added", { id: updated.record.job_id }));
};

export const runHistoryTag = async (
  jobId: string,
  tags: string[],
  options: HistoryTagOptions,
) => {
  const resolved = await readJob(jobId, process.cwd(), requestedScope(options));
  const includesReject = tags.includes("reject");
  if (includesReject && !options.rm && !options.reason?.trim()) {
    throw new CliError("INVALID_USAGE", t("history.reject_reason_required"), 2, {
      tag: "reject",
    });
  }

  const existing = resolved.record.tags ?? [];
  const nextTags = options.rm
    ? existing.filter((tag) => !tags.includes(tag))
    : [...new Set([...existing, ...tags])];
  const patch = {
    tags: nextTags,
    ...(includesReject
      ? { reject_reason: options.rm ? undefined : options.reason!.trim() }
      : {}),
  };
  const updated = await updateJob(
    resolved.record.job_id,
    patch,
    process.cwd(),
    resolved.scope,
  );
  if (options.json) {
    printJson({ ok: true, scope: updated.scope, job: updated.record });
    return;
  }
  print(t("history.tags_updated", { id: updated.record.job_id }));
};

export const runHistoryOpen = async (jobId: string, options: HistoryOpenOptions) => {
  const resolved = await readJob(jobId, process.cwd(), requestedScope(options));
  if (options.json) {
    printJson({
      ok: true,
      scope: resolved.scope,
      job_id: resolved.record.job_id,
      output_dir: resolved.record.output_dir,
    });
    return;
  }
  print(resolved.record.output_dir);
};
