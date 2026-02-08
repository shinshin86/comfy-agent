import path from "node:path";
import { print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";
import { getSubdirPath } from "../io/workdir.js";
import { loadPresetFile } from "../preset/loader.js";
import { resolvePresetPath } from "../preset/path.js";
import { CliError } from "../io/errors.js";
import { ComfyClient } from "../api/client.js";
import { fetchRemoteTemplateByName, type RemoteTemplate } from "../preset/remote.js";
import { resolveComfyBaseUrl } from "../utils/base-url.js";

export type PresetShowOptions = {
  json?: boolean;
  global?: boolean;
  source?: string;
  baseUrl?: string;
};

export type PresetShowSource = "auto" | "local" | "remote";

export const resolvePresetShowSource = (source?: string): PresetShowSource => {
  if (!source) return "auto";
  if (source === "local" || source === "remote") return source;
  throw new CliError("INVALID_PARAM", t("preset_show.invalid_source"), 2, { value: source });
};

const tryResolveLocalPresetPath = async (name: string, scope: "local" | "global") => {
  try {
    return await resolvePresetPath(name, scope, "preset_show.not_found");
  } catch (err) {
    if (err instanceof CliError && err.code === "PRESET_NOT_FOUND") {
      return null;
    }
    throw err;
  }
};

export const resolvePresetShowSelectedSource = (
  requested: PresetShowSource,
  hasLocal: boolean,
  hasRemote: boolean,
): "local" | "remote" => {
  if (requested === "local") {
    if (!hasLocal) throw new CliError("PRESET_NOT_FOUND", t("preset_show.not_found"), 2);
    return "local";
  }
  if (requested === "remote") {
    if (!hasRemote) throw new CliError("PRESET_NOT_FOUND", t("preset_show.not_found"), 2);
    return "remote";
  }

  if (hasLocal && hasRemote) {
    throw new CliError("PRESET_SOURCE_AMBIGUOUS", t("preset_show.ambiguous_source"), 2);
  }
  if (hasLocal) return "local";
  if (hasRemote) return "remote";
  throw new CliError("PRESET_NOT_FOUND", t("preset_show.not_found"), 2);
};

const normalizeRemoteParameters = (template: RemoteTemplate) => {
  const raw = template.raw;
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const params = obj.parameters;
  if (!params || typeof params !== "object") return [];
  return Object.entries(params as Record<string, unknown>).map(([name, value]) => {
    const def = (value ?? {}) as Record<string, unknown>;
    return {
      name,
      type: typeof def.type === "string" ? def.type : "json",
      required: def.required === true,
      default: def.default,
      target:
        def.target && typeof def.target === "object"
          ? ((def.target as { node_id?: string | number; input?: string }) ?? undefined)
          : undefined,
    };
  });
};

const normalizeRemoteUploads = (template: RemoteTemplate) => {
  const raw = template.raw;
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const uploads = obj.uploads;
  if (!uploads || typeof uploads !== "object") return [];
  return Object.entries(uploads as Record<string, unknown>).map(([name, value]) => {
    const def = (value ?? {}) as Record<string, unknown>;
    return {
      name,
      kind: typeof def.kind === "string" ? def.kind : "image",
      cli_flag: typeof def.cli_flag === "string" ? def.cli_flag : "--input",
      target:
        def.target && typeof def.target === "object"
          ? ((def.target as { node_id?: string | number; input?: string }) ?? undefined)
          : undefined,
    };
  });
};

export const runPresetShow = async (presetName: string, options: PresetShowOptions) => {
  const scope = options.global ? "global" : "local";
  const scopeLabel = t(scope === "global" ? "scope.global" : "scope.local");
  const requestedSource = resolvePresetShowSource(options.source);

  const localPresetPath = await tryResolveLocalPresetPath(presetName, scope);
  const hasLocal = Boolean(localPresetPath);

  const baseUrl = resolveComfyBaseUrl(options);
  const client = new ComfyClient(baseUrl);
  let remoteTemplate: RemoteTemplate | null = null;
  let remoteEndpoint = "";
  let remoteError: unknown = null;
  try {
    const remoteResult = await fetchRemoteTemplateByName(client, presetName);
    remoteTemplate = remoteResult.template;
    remoteEndpoint = remoteResult.endpoint;
  } catch (err) {
    remoteError = err;
    if (requestedSource === "remote") throw err;
  }

  const hasRemote = Boolean(remoteTemplate);
  const source = resolvePresetShowSelectedSource(requestedSource, hasLocal, hasRemote);

  if (source === "local") {
    const presetPath = localPresetPath!;
    const preset = await loadPresetFile(presetPath);
    const workflowPath = path.join(
      getSubdirPath("workflows", process.cwd(), scope),
      preset.workflow,
    );

    const parameters = Object.entries(preset.parameters ?? {}).map(([name, param]) => ({
      name,
      type: param.type,
      required: param.required ?? false,
      default: param.default,
      target: param.target,
    }));

    const uploads = Object.entries(preset.uploads ?? {}).map(([name, def]) => ({
      name,
      kind: def.kind,
      cli_flag: def.cli_flag,
      target: def.target,
    }));

    const payload = {
      ok: true,
      scope,
      source,
      preset: {
        name: preset.name,
        version: preset.version,
        preset_path: presetPath,
        workflow_file: preset.workflow,
        workflow_path: workflowPath,
        parameters,
        uploads,
      },
    };

    if (options.json) {
      printJson(payload);
      return;
    }

    print(t("preset_show.header", { name: preset.name }));
    print(t("preset_show.scope", { scope: scopeLabel }));
    print(t("preset_show.source", { source }));
    print(t("preset_show.file", { path: presetPath }));
    print(t("preset_show.workflow", { workflow: preset.workflow, path: workflowPath }));

    if (parameters.length === 0) {
      print(t("preset_show.parameters_none"));
    } else {
      print(t("preset_show.parameters_header"));
      for (const param of parameters) {
        const required = param.required ? t("preset_show.required") : t("preset_show.optional");
        const defaultValue =
          param.default !== undefined ? ` default=${JSON.stringify(param.default)}` : "";
        print(
          `- ${param.name}: ${param.type} (${required}) target=${String(param.target.node_id)}.${param.target.input}${defaultValue}`,
        );
      }
    }

    if (uploads.length === 0) {
      print(t("preset_show.uploads_none"));
      return;
    }

    print(t("preset_show.uploads_header"));
    for (const upload of uploads) {
      print(
        `- ${upload.name}: ${upload.kind} ${upload.cli_flag} target=${String(upload.target.node_id)}.${upload.target.input}`,
      );
    }
    return;
  }

  const remote = remoteTemplate!;
  const parameters = normalizeRemoteParameters(remote);
  const uploads = normalizeRemoteUploads(remote);
  const remoteRaw = remote.raw as Record<string, unknown> | undefined;
  const workflowFile = typeof remoteRaw?.workflow === "string" ? remoteRaw.workflow : "(remote)";
  const payload = {
    ok: true,
    scope,
    source,
    preset: {
      name: remote.name,
      version: 1,
      preset_path: null,
      workflow_file: workflowFile,
      workflow_path: null,
      remote_endpoint: remoteEndpoint,
      parameters,
      uploads,
      raw: remote.raw,
    },
  };

  if (options.json) {
    printJson(payload);
    return;
  }

  if (remoteError) {
    const message = remoteError instanceof Error ? remoteError.message : String(remoteError);
    print(t("preset_show.remote_warning", { message }));
  }

  print(t("preset_show.header", { name: remote.name }));
  print(t("preset_show.scope", { scope: scopeLabel }));
  print(t("preset_show.source", { source }));
  print(t("preset_show.file", { path: "(remote)" }));
  print(t("preset_show.remote_endpoint", { endpoint: remoteEndpoint }));
  print(t("preset_show.workflow", { workflow: workflowFile, path: "(remote)" }));

  if (parameters.length === 0) {
    print(t("preset_show.parameters_none"));
  } else {
    print(t("preset_show.parameters_header"));
    for (const param of parameters) {
      const required = param.required ? t("preset_show.required") : t("preset_show.optional");
      const defaultValue =
        param.default !== undefined ? ` default=${JSON.stringify(param.default)}` : "";
      print(
        `- ${param.name}: ${param.type} (${required})${param.target ? ` target=${String(param.target.node_id)}.${param.target.input}` : ""}${defaultValue}`,
      );
    }
  }

  if (uploads.length === 0) {
    print(t("preset_show.uploads_none"));
  } else {
    print(t("preset_show.uploads_header"));
    for (const upload of uploads) {
      print(
        `- ${upload.name}: ${upload.kind} ${upload.cli_flag}${upload.target ? ` target=${String(upload.target.node_id)}.${upload.target.input}` : ""}`,
      );
    }
  }
};
