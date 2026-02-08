import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { CliError } from "./errors.js";
import { t } from "../i18n/index.js";

export const WORK_DIR = ".comfy-agent";
export const GLOBAL_WORK_DIR = path.join(os.homedir(), ".config", ".comfy-agent");
export const SUBDIRS = ["workflows", "presets", "outputs", "cache"] as const;
export type WorkdirScope = "local" | "global";

export type InitResult = {
  created: string[];
  skipped: string[];
};

const ensureDir = async (dirPath: string, force: boolean): Promise<"created" | "skipped"> => {
  try {
    const stat = await fs.stat(dirPath);
    if (stat.isDirectory()) {
      return "skipped";
    }
    if (!force) {
      throw new CliError("WORKDIR_CONFLICT", t("workdir.conflict_not_dir", { path: dirPath }), 2, {
        path: dirPath,
      });
    }
    await fs.rm(dirPath, { recursive: true, force: true });
    await fs.mkdir(dirPath, { recursive: true });
    return "created";
  } catch (err) {
    if (err instanceof CliError) {
      throw err;
    }
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      await fs.mkdir(dirPath, { recursive: true });
      return "created";
    }
    throw err;
  }
};

export const getWorkdirPath = (cwd = process.cwd(), scope: WorkdirScope = "local") => {
  return scope === "global" ? GLOBAL_WORK_DIR : path.join(cwd, WORK_DIR);
};

export const getSubdirPath = (
  subdir: (typeof SUBDIRS)[number],
  cwd = process.cwd(),
  scope: WorkdirScope = "local",
) => {
  return path.join(getWorkdirPath(cwd, scope), subdir);
};

export const initWorkdir = async (options?: {
  cwd?: string;
  force?: boolean;
  scope?: WorkdirScope;
}): Promise<InitResult> => {
  const cwd = options?.cwd ?? process.cwd();
  const force = options?.force ?? false;
  const scope = options?.scope ?? "local";
  const created: string[] = [];
  const skipped: string[] = [];

  const workdirPath = getWorkdirPath(cwd, scope);
  const rootResult = await ensureDir(workdirPath, force);
  (rootResult === "created" ? created : skipped).push(workdirPath);

  for (const subdir of SUBDIRS) {
    const subdirPath = getSubdirPath(subdir, cwd, scope);
    const result = await ensureDir(subdirPath, force);
    (result === "created" ? created : skipped).push(subdirPath);
  }

  return { created, skipped };
};
