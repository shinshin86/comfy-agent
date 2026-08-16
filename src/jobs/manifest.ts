import path from "node:path";
import { promises as fs } from "node:fs";
import { t } from "../i18n/index.js";
import { getPackageVersion } from "../utils/version.js";
import {
  RunManifestSchema,
  type RunManifest,
  type RunManifestEntry,
  type RunManifestHeader,
} from "./types.js";

export const RUN_MANIFEST_FILE = "run.json";

export type RunManifestIssue = {
  code: "INVALID_RUN_MANIFEST" | "RUN_MANIFEST_READ_FAILED" | "RUN_MANIFEST_WRITE_FAILED";
  message: string;
  details: {
    path: string;
    cause: string;
  };
};

export type ReadRunManifestResult =
  | { ok: true; manifest: RunManifest }
  | { ok: false; error: RunManifestIssue };

export type UpsertRunManifestResult = ReadRunManifestResult;

const errorCause = (error: unknown) => (error instanceof Error ? error.message : String(error));

const manifestIssue = (
  code: RunManifestIssue["code"],
  filePath: string,
  error: unknown,
): RunManifestIssue => ({
  code,
  message: t(
    code === "INVALID_RUN_MANIFEST"
      ? "jobs.manifest_invalid"
      : code === "RUN_MANIFEST_READ_FAILED"
        ? "jobs.manifest_read_failed"
        : "jobs.manifest_write_failed",
    { path: filePath },
  ),
  details: { path: filePath, cause: errorCause(error) },
});

export const readRunManifest = async (outputDir: string): Promise<ReadRunManifestResult | null> => {
  const filePath = path.join(outputDir, RUN_MANIFEST_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return { ok: false, error: manifestIssue("RUN_MANIFEST_READ_FAILED", filePath, error) };
  }

  try {
    const manifest = RunManifestSchema.parse(JSON.parse(raw) as unknown);
    return { ok: true, manifest };
  } catch (error) {
    return { ok: false, error: manifestIssue("INVALID_RUN_MANIFEST", filePath, error) };
  }
};

export const upsertRunManifest = async (
  outputDir: string,
  header: RunManifestHeader,
  runEntry: RunManifestEntry,
): Promise<UpsertRunManifestResult> => {
  const filePath = path.join(outputDir, RUN_MANIFEST_FILE);
  const existing = await readRunManifest(outputDir);
  if (existing?.ok === false) return existing;

  const currentRuns = existing?.manifest.runs ?? [];
  const matchingIndex = currentRuns.findIndex(
    ({ prompt_id: promptId }) => promptId === runEntry.prompt_id,
  );
  const runs = [...currentRuns];
  if (matchingIndex === -1) runs.push(runEntry);
  else runs[matchingIndex] = runEntry;

  let manifest: RunManifest;
  try {
    manifest = RunManifestSchema.parse({
      ...header,
      schema: 1,
      comfy_agent_version: getPackageVersion(),
      created_at: existing?.manifest.created_at ?? new Date().toISOString(),
      runs,
    });
  } catch (error) {
    return { ok: false, error: manifestIssue("INVALID_RUN_MANIFEST", filePath, error) };
  }

  const tempPath = `${filePath}.tmp`;
  try {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
    await fs.rename(tempPath, filePath);
    return { ok: true, manifest };
  } catch (error) {
    return {
      ok: false,
      error: manifestIssue("RUN_MANIFEST_WRITE_FAILED", filePath, error),
    };
  }
};
