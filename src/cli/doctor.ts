import path from "node:path";
import { promises as fs } from "node:fs";
import { ComfyClient } from "../api/client.js";
import { CliError } from "../io/errors.js";
import { log, print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";
import { getSubdirPath, getWorkdirPath, SUBDIRS, type WorkdirScope } from "../io/workdir.js";
import { decideComfyBaseUrl } from "../utils/base-url.js";
import { loadPresetFile } from "../preset/loader.js";
import { resolvePresetPath } from "../preset/path.js";
import { loadLocalWorkflow } from "../workflow/load.js";
import { classifyServerError, fetchPreflightReport } from "../workflow/preflight.js";

export type DoctorOptions = {
  json?: boolean;
  baseUrl?: string;
  global?: boolean;
  allScopes?: boolean;
  preset?: string;
};

const baseUrlDecision = (options: DoctorOptions) => decideComfyBaseUrl(options);

type DirStatus = {
  path: string;
  exists: boolean;
  is_dir: boolean;
  writable: boolean;
  issue?: string;
};

const checkDir = async (dirPath: string): Promise<DirStatus> => {
  try {
    const stat = await fs.stat(dirPath);
    const isDir = stat.isDirectory();
    let writable = false;
    if (isDir) {
      try {
        await fs.access(dirPath, fs.constants.W_OK);
        writable = true;
      } catch {
        writable = false;
      }
    }
    return {
      path: dirPath,
      exists: true,
      is_dir: isDir,
      writable,
      issue: isDir ? (writable ? undefined : "NOT_WRITABLE") : "NOT_DIRECTORY",
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { path: dirPath, exists: false, is_dir: false, writable: false, issue: "MISSING" };
    }
    throw err;
  }
};

const checkWorkdir = async (scope: WorkdirScope) => {
  const rootPath = getWorkdirPath(process.cwd(), scope);
  const root = await checkDir(rootPath);
  const subdirs: DirStatus[] = [];
  for (const subdir of SUBDIRS) {
    subdirs.push(await checkDir(getSubdirPath(subdir, process.cwd(), scope)));
  }
  const issues = [root, ...subdirs].filter((item) => item.issue);
  return { root, subdirs, issues };
};

const checkConnection = async (baseUrl: string) => {
  try {
    const client = new ComfyClient(baseUrl);
    await client.queue();
    return { ok: true } as const;
  } catch (err) {
    const message = err instanceof CliError ? err.message : t("doctor.connection_failed");
    const code = classifyServerError(err) === "unreachable" ? "SERVER_UNREACHABLE" : "API_ERROR";
    return {
      ok: false,
      error: { code, message, details: String(err) },
    } as const;
  }
};

const checkPresetPreflight = async (presetName: string, baseUrl: string, scope: WorkdirScope) => {
  const presetPath = await resolvePresetPath(presetName, scope);
  const preset = await loadPresetFile(presetPath);
  const client = new ComfyClient(baseUrl);
  const { workflow } = await loadLocalWorkflow(preset, scope, client);
  const report = await fetchPreflightReport(client, workflow);
  return { preset: preset.name, ...report };
};

export const runDoctor = async (options: DoctorOptions) => {
  const baseInfo = baseUrlDecision(options);
  const baseUrl = baseInfo.value;
  const scopes: WorkdirScope[] = options.allScopes
    ? ["local", "global"]
    : [options.global ? "global" : "local"];
  const workdirs = await Promise.all(
    scopes.map(async (scope) => ({ scope, ...(await checkWorkdir(scope)) })),
  );
  const connection = await checkConnection(baseUrl);

  let preflight: Awaited<ReturnType<typeof checkPresetPreflight>> | null = null;
  if (options.preset && connection.ok) {
    preflight = await checkPresetPreflight(
      options.preset,
      baseUrl,
      options.global ? "global" : "local",
    );
  }
  const preflightFailed =
    preflight !== null &&
    preflight.checked &&
    (preflight.missing_nodes.length > 0 || preflight.missing_models.length > 0);

  const hasWorkdirIssues = workdirs.some((workdir) => workdir.issues.length > 0);
  const exitCode = !connection.ok || preflightFailed ? 3 : hasWorkdirIssues ? 2 : 0;

  if (options.json) {
    if (options.allScopes) {
      printJson({
        ok: exitCode === 0,
        base_url: baseUrl,
        base_url_source: baseInfo.source,
        scopes: workdirs.map((entry) => ({
          scope: entry.scope,
          workdir: { root: entry.root, subdirs: entry.subdirs },
        })),
        connection,
        ...(preflight ? { preflight } : {}),
      });
    } else {
      const workdir = workdirs[0]!;
      printJson({
        ok: exitCode === 0,
        base_url: baseUrl,
        base_url_source: baseInfo.source,
        scope: workdir.scope,
        workdir: {
          root: workdir.root,
          subdirs: workdir.subdirs,
        },
        connection,
        ...(preflight ? { preflight } : {}),
      });
    }
    process.exit(exitCode);
  }

  print(t("doctor.result_header"));
  print(t("doctor.base_url", { base: baseUrl, source: baseInfo.source }));

  if (connection.ok) {
    print(t("doctor.connection_ok"));
  } else {
    log(t("doctor.connection_ng", { message: connection.error.message }));
  }

  for (const workdir of workdirs) {
    const scopeLabel = t(workdir.scope === "global" ? "scope.global" : "scope.local");
    print(t("doctor.scope", { scope: scopeLabel }));
    if (!workdir.root.exists) {
      log(t("doctor.workdir_missing", { path: workdir.root.path }));
      log(t("doctor.workdir_fix"));
    } else if (!workdir.root.is_dir) {
      log(t("doctor.workdir_not_dir", { path: workdir.root.path }));
    } else if (!workdir.root.writable) {
      log(t("doctor.workdir_not_writable", { path: workdir.root.path }));
    } else {
      print(t("doctor.workdir_ok", { path: workdir.root.path }));
    }

    for (const subdir of workdir.subdirs) {
      if (subdir.issue) {
        log(t("doctor.subdir_issue", { name: path.basename(subdir.path), issue: subdir.issue }));
      }
    }
  }

  if (!connection.ok) {
    log(t("doctor.connection_fix"));
  }

  if (preflight) {
    if (!preflight.checked) {
      log(t("doctor.preflight_skipped", { preset: preflight.preset }));
    } else if (preflightFailed) {
      log(t("doctor.preflight_ng", { preset: preflight.preset }));
      for (const node of preflight.missing_nodes) {
        log(t("doctor.preflight_missing_node", { node: node.class_type, id: node.node_id }));
      }
      for (const model of preflight.missing_models) {
        log(
          t("doctor.preflight_missing_model", {
            value: model.value,
            node: model.class_type,
            input: model.input,
          }),
        );
      }
    } else {
      print(t("doctor.preflight_ok", { preset: preflight.preset }));
    }
  }

  process.exit(exitCode);
};
