import { promises as fs } from "node:fs";
import { print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";
import { getSubdirPath, getWorkdirPath, SUBDIRS, type WorkdirScope } from "../io/workdir.js";
import { decideComfyBaseUrl } from "../utils/base-url.js";

export type StatusOptions = {
  json?: boolean;
  baseUrl?: string;
  global?: boolean;
};

type PathState = {
  path: string;
  exists: boolean;
  is_dir: boolean;
  writable: boolean;
};

const inspectPath = async (targetPath: string): Promise<PathState> => {
  try {
    const stat = await fs.stat(targetPath);
    const isDir = stat.isDirectory();
    let writable = false;
    if (isDir) {
      try {
        await fs.access(targetPath, fs.constants.W_OK);
        writable = true;
      } catch {
        writable = false;
      }
    }
    return {
      path: targetPath,
      exists: true,
      is_dir: isDir,
      writable,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { path: targetPath, exists: false, is_dir: false, writable: false };
    }
    throw err;
  }
};

const listPresetNames = async (scope: WorkdirScope) => {
  const presetsDir = getSubdirPath("presets", process.cwd(), scope);
  try {
    const entries = await fs.readdir(presetsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
      .map((name) => name.replace(/\.ya?ml$/, ""))
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
};

export const runStatus = async (options: StatusOptions) => {
  const scope: WorkdirScope = options.global ? "global" : "local";
  const scopeLabel = t(scope === "global" ? "scope.global" : "scope.local");

  const baseInfo = decideComfyBaseUrl(options);
  const workdirPath = getWorkdirPath(process.cwd(), scope);
  const workdir = await inspectPath(workdirPath);
  const subdirs = await Promise.all(
    SUBDIRS.map(async (name) => ({
      name,
      ...(await inspectPath(getSubdirPath(name, process.cwd(), scope))),
    })),
  );
  const presets = await listPresetNames(scope);

  const payload = {
    ok: true,
    scope,
    base_url: baseInfo.value,
    base_url_source: baseInfo.source,
    workdir,
    subdirs,
    preset_count: presets.length,
    presets,
  };

  if (options.json) {
    printJson(payload);
    return;
  }

  print(t("status.header"));
  print(t("status.scope", { scope: scopeLabel }));
  print(t("status.base_url", { base: baseInfo.value, source: baseInfo.source }));
  print(t("status.workdir", { path: workdir.path, state: workdir.exists ? "OK" : "MISSING" }));

  for (const subdir of subdirs) {
    const state = subdir.exists ? "OK" : "MISSING";
    print(t("status.subdir", { name: subdir.name, state, path: subdir.path }));
  }

  print(t("status.preset_count", { count: presets.length }));
  if (presets.length > 0) {
    for (const name of presets) {
      print(`- ${name}`);
    }
  }
};
