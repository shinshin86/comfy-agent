import path from "node:path";
import { readCharacterIndex } from "../characters/store.js";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { getCharactersDirPath, type WorkdirScope } from "../io/workdir.js";
import { listJobs, readJob } from "./store.js";
import type { JobRecord, JobStatus } from "./types.js";

export type HistoryKind = "image" | "video" | "audio";

export type QueryHistoryOptions = {
  cwd: string;
  scopes: WorkdirScope[];
  preset?: string;
  character?: string;
  kind?: HistoryKind;
  status?: JobStatus;
  tag?: string;
  search?: string;
  since?: string;
  favorite?: boolean;
  rejected?: boolean;
  limit?: number;
  fullPrompts?: boolean;
};

const relativeSinceMs = (value: string): number | null => {
  const match = /^(\d+)([dh])$/i.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  return amount * (match[2].toLowerCase() === "d" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
};

const resolveSince = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const relativeMs = relativeSinceMs(value);
  if (relativeMs !== null) return Date.now() - relativeMs;
  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) return timestamp;
  throw new CliError("INVALID_PARAM", t("history.invalid_since"), 2, { since: value });
};

const searchableText = (record: JobRecord): string[] => [
  record.prompt_final ?? "",
  record.negative_final ?? "",
  ...(record.notes ?? []).map(({ text }) => text),
  record.preset,
  ...(record.tags ?? []),
];

const truncate = (value: string, length: number) => Array.from(value).slice(0, length).join("");

export const queryHistory = async (options: QueryHistoryOptions): Promise<JobRecord[]> => {
  const scopes = [...new Set(options.scopes)];
  const since = resolveSince(options.since);
  const search = options.search?.toLocaleLowerCase();
  const localRecords = (
    await Promise.all(scopes.map((scope) => listJobs(options.cwd, scope)))
  ).flat();
  const indexedRecords: JobRecord[] = [];
  if (options.character && scopes.includes("global")) {
    const characterDir = path.join(getCharactersDirPath(options.cwd, "global"), options.character);
    const entries = await readCharacterIndex(characterDir);
    for (const entry of entries) {
      try {
        indexedRecords.push((await readJob(entry.job_id, entry.project, "local")).record);
      } catch (error) {
        if (error instanceof CliError && error.code === "JOB_NOT_FOUND") continue;
        throw error;
      }
    }
  }
  const records = [
    ...new Map(
      [...localRecords, ...indexedRecords].map((record) => [
        `${record.job_id}\0${record.output_dir}`,
        record,
      ]),
    ).values(),
  ];

  const filtered = records
    .filter((record) => options.preset === undefined || record.preset === options.preset)
    .filter(
      (record) => options.character === undefined || record.character?.name === options.character,
    )
    .filter(
      (record) =>
        options.kind === undefined || record.outputs.some(({ kind }) => kind === options.kind),
    )
    .filter((record) => options.status === undefined || record.status === options.status)
    .filter((record) => options.tag === undefined || record.tags?.includes(options.tag))
    .filter(
      (record) =>
        search === undefined ||
        searchableText(record).some((value) => value.toLocaleLowerCase().includes(search)),
    )
    .filter((record) => since === undefined || Date.parse(record.submitted_at) >= since)
    .filter((record) => !options.favorite || record.favorite === true)
    .filter((record) => !options.rejected || record.tags?.includes("reject"))
    .sort((left, right) => Date.parse(right.submitted_at) - Date.parse(left.submitted_at));

  const limited =
    options.limit === undefined ? filtered : filtered.slice(0, Math.max(0, options.limit));
  const redactPrompts = (scopes.length > 1 || indexedRecords.length > 0) && !options.fullPrompts;
  return limited.map((record) =>
    redactPrompts && record.prompt_final !== undefined
      ? { ...record, prompt_final: truncate(record.prompt_final, 60) }
      : record,
  );
};
