import path from "node:path";
import { promises as fs } from "node:fs";
import { getSubdirPath } from "../io/workdir.js";
import { loadPresetFile } from "../preset/loader.js";
import { log, print, printJson } from "../io/output.js";
import { buildErrorPayload, CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";
import { ComfyClient } from "../api/client.js";
import { fetchRemoteTemplateNames, fetchRemoteUserdataWorkflows } from "../preset/remote.js";
import { resolveComfyBaseUrl } from "../utils/base-url.js";

export type ListOptions = {
  json?: boolean;
  global?: boolean;
  source?: string;
  baseUrl?: string;
};

export type ListSource = "local" | "remote" | "remote-catalog" | "all";

type ListedParameter = {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
};

type ListedPreset = {
  name: string;
  workflow?: string;
  file?: string;
  source: "local" | "remote" | "remote-catalog";
  parameters: ListedParameter[];
};

export const resolveListSource = (source?: string): ListSource => {
  if (!source) return "all";
  if (
    source === "local" ||
    source === "remote" ||
    source === "all" ||
    source === "remote-catalog"
  ) {
    return source;
  }
  throw new CliError("INVALID_PARAM", t("list.invalid_source"), 2, { value: source });
};

const listYamlFiles = async (dirPath: string, allowMissing = false) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      if (allowMissing) return [];
      throw new CliError("WORKDIR_NOT_FOUND", t("list.workdir_missing"), 2, { path: dirPath });
    }
    throw err;
  }
};

export const runList = async (options: ListOptions) => {
  const scope = options.global ? "global" : "local";
  const scopeLabel = t(scope === "global" ? "scope.global" : "scope.local");
  const source = resolveListSource(options.source);
  const includeLocal = source === "local" || source === "all";
  const includeRemoteUserdata = source === "remote" || source === "all";
  const includeRemoteCatalog = source === "remote-catalog";

  const presetsDir = getSubdirPath("presets", process.cwd(), scope);

  const presets: ListedPreset[] = [];
  const errors: Array<{ file: string; message: string; details?: unknown }> = [];
  const warnings: string[] = [];

  if (includeLocal) {
    const files = await listYamlFiles(presetsDir, source !== "local");
    for (const file of files) {
      const fullPath = path.join(presetsDir, file);
      try {
        const preset = await loadPresetFile(fullPath);
        const parameters = Object.entries(preset.parameters ?? {}).map(([name, param]) => ({
          name,
          type: param.type,
          required: param.required ?? false,
          default: param.default,
        }));
        presets.push({
          name: preset.name,
          workflow: preset.workflow,
          file,
          source: "local",
          parameters,
        });
      } catch (err) {
        if (err instanceof CliError) {
          errors.push({ file, message: err.message, details: err.details });
        } else {
          errors.push({ file, message: t("list.read_failed"), details: String(err) });
        }
      }
    }
  }

  if (includeRemoteUserdata || includeRemoteCatalog) {
    const baseUrl = resolveComfyBaseUrl(options);
    const client = new ComfyClient(baseUrl);
    if (includeRemoteCatalog) {
      try {
        const { names } = await fetchRemoteTemplateNames(client);
        for (const name of names) {
          presets.push({
            name,
            source: "remote-catalog",
            parameters: [],
          });
        }
      } catch (err) {
        if (source === "remote-catalog") throw err;
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(t("list.remote_fetch_failed", { message }));
      }
    }

    if (includeRemoteUserdata) {
      try {
        const { workflows } = await fetchRemoteUserdataWorkflows(client);
        for (const workflow of workflows) {
          presets.push({
            name: workflow.name,
            file: workflow.file,
            source: "remote",
            parameters: [],
          });
        }
      } catch (err) {
        if (source === "remote") throw err;
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(t("list.remote_userdata_fetch_failed", { message }));
      }
    }
  }

  if (errors.length > 0) {
    if (options.json) {
      printJson({
        ...buildErrorPayload("INVALID_PRESET", t("list.partial_error"), {
          errors,
        }),
        scope,
        source,
      });
    } else {
      log(t("list.partial_error"));
      for (const error of errors) {
        log(`- ${error.file}: ${error.message}`);
      }
    }
    process.exit(2);
  }

  presets.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    if (a.source === b.source) return 0;
    const order: Record<ListedPreset["source"], number> = {
      local: 0,
      remote: 1,
      "remote-catalog": 2,
    };
    return order[a.source] - order[b.source];
  });

  if (options.json) {
    printJson({ ok: true, scope, source, presets, warnings });
    return;
  }

  for (const warning of warnings) {
    log(warning);
  }

  if (presets.length === 0) {
    if (source === "local") {
      print(t("list.no_presets", { scope: scopeLabel }));
      return;
    }
    print(t("list.no_presets_source", { scope: scopeLabel, source }));
    return;
  }

  print(t("list.scope", { scope: scopeLabel }));
  print(t("list.source", { source }));
  for (const preset of presets) {
    if (preset.source === "remote") {
      print(t("list.item.remote", { name: preset.name }));
      continue;
    }
    if (preset.source === "remote-catalog") {
      print(t("list.item.remote_catalog", { name: preset.name }));
      continue;
    }
    print(t("list.item.local_simple", { name: preset.name }));
  }
};
