import { ComfyClient } from "../../api/client.js";
import { CliError } from "../../io/errors.js";
import { t } from "../../i18n/index.js";
import {
  REMOTE_USERDATA_LIST_ENDPOINTS,
  fetchRemoteTemplateByName,
  fetchRemoteUserdataWorkflows,
} from "../../preset/remote.js";
import {
  applyWorkflowsDirContext,
  collectUserdataJsonPaths,
  normalizeUserdataFilePath,
} from "../../preset/userdata-path.js";
import type { ParameterDef, Preset, UploadDef } from "../../preset/schema.js";
import {
  detectParamType,
  isLiteralValue,
  normalizeWorkflow,
  type Workflow,
} from "../../workflow/normalize.js";

const asString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const normalizeRemoteParameters = (value: unknown): Record<string, ParameterDef> => {
  const parametersObj = asRecord(value);
  if (!parametersObj) return {};

  const parameters: Record<string, ParameterDef> = {};
  const allowedTypes = new Set<ParameterDef["type"]>(["string", "int", "float", "bool", "json"]);
  for (const [name, defValue] of Object.entries(parametersObj)) {
    const def = asRecord(defValue);
    if (!def) continue;
    const type = asString(def.type) as ParameterDef["type"] | undefined;
    const target = asRecord(def.target);
    const targetInput = target ? asString(target.input) : undefined;
    const nodeId = target?.node_id;
    if (
      !type ||
      !allowedTypes.has(type) ||
      !targetInput ||
      (typeof nodeId !== "string" && typeof nodeId !== "number")
    ) {
      continue;
    }
    parameters[name] = {
      type,
      target: { node_id: nodeId, input: targetInput },
      required: def.required === true,
      default: def.default,
    };
  }
  return parameters;
};

const normalizeRemoteUploads = (value: unknown): Record<string, UploadDef> => {
  const uploadsObj = asRecord(value);
  if (!uploadsObj) return {};

  const uploads: Record<string, UploadDef> = {};
  for (const [name, defValue] of Object.entries(uploadsObj)) {
    const def = asRecord(defValue);
    if (!def) continue;
    const kind = asString(def.kind);
    const cliFlag = asString(def.cli_flag);
    const target = asRecord(def.target);
    const targetInput = target ? asString(target.input) : undefined;
    const nodeId = target?.node_id;
    if ((kind !== "image" && kind !== "mask") || !cliFlag || !targetInput) continue;
    if (typeof nodeId !== "string" && typeof nodeId !== "number") continue;
    uploads[name] = {
      kind,
      cli_flag: cliFlag,
      target: { node_id: nodeId, input: targetInput },
    };
  }
  return uploads;
};

const inferParametersFromWorkflow = (workflow: Workflow): Record<string, ParameterDef> => {
  const parameters: Record<string, ParameterDef> = {};

  for (const [nodeId, nodeValue] of Object.entries(workflow)) {
    const node = asRecord(nodeValue);
    if (!node) continue;
    const inputs = asRecord(node.inputs);
    if (!inputs) continue;

    for (const [inputName, inputValue] of Object.entries(inputs)) {
      if (!isLiteralValue(inputValue)) continue;
      const paramName = `${nodeId}_${inputName}`;
      if (parameters[paramName]) continue;
      parameters[paramName] = {
        type: detectParamType(inputValue),
        target: { node_id: nodeId, input: inputName },
        default: inputValue,
        required: false,
      };
    }
  }

  const textParams = Object.values(parameters).filter(
    (p) => p.type === "string" && p.target.input === "text",
  );
  if (!parameters.prompt && textParams[0]) {
    parameters.prompt = { ...textParams[0] };
  }
  if (!parameters.negative && textParams[1]) {
    parameters.negative = { ...textParams[1] };
  }

  const aliasTargets = ["steps", "seed", "cfg", "width", "height", "denoise"] as const;
  for (const alias of aliasTargets) {
    if (parameters[alias]) continue;
    const candidates = Object.values(parameters).filter((p) => p.target.input === alias);
    if (candidates.length === 1) {
      parameters[alias] = { ...candidates[0] };
    }
  }

  return parameters;
};

const normalizeWorkflowCandidate = (value: unknown): Workflow | null => {
  try {
    return normalizeWorkflow(value);
  } catch {
    return null;
  }
};

const normalizeTemplatePath = (rawPath: string): string | null => {
  if (!rawPath) return null;
  if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
    try {
      const url = new URL(rawPath);
      return `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  }
  if (rawPath.startsWith("/")) return rawPath;
  return `/${rawPath}`;
};

const buildTemplateNameCandidates = (
  templateName: string,
  rawTemplate: Record<string, unknown>,
) => {
  const names = new Set<string>();
  const rawCandidates = [templateName, asString(rawTemplate.name), asString(rawTemplate.title)];
  for (const candidate of rawCandidates) {
    if (!candidate) continue;
    names.add(candidate);
  }
  return names;
};

const buildTemplateKeywords = (templateName: string, rawTemplate: Record<string, unknown>) => {
  const keywords = new Set<string>();
  for (const name of buildTemplateNameCandidates(templateName, rawTemplate)) {
    keywords.add(name.toLowerCase());
  }
  return keywords;
};

const scoreUserdataCandidate = (pathValue: string, keywords: Set<string>) => {
  const value = pathValue.toLowerCase();
  let score = 0;
  if (value.startsWith("workflows/")) score += 20;
  for (const keyword of keywords) {
    if (!keyword) continue;
    if (value === `${keyword}.json`) score += 80;
    if (value.endsWith(`/${keyword}.json`)) score += 60;
    if (value.includes(keyword)) score += 20;
  }
  return score;
};

export const extractUserdataJsonCandidates = (
  payload: unknown,
  templateName: string,
  rawTemplate: Record<string, unknown>,
) => {
  const allPaths = new Set<string>();
  collectUserdataJsonPaths(payload, allPaths);
  const keywords = buildTemplateKeywords(templateName, rawTemplate);

  const matched = Array.from(allPaths).filter((candidate) => {
    const lower = candidate.toLowerCase();
    for (const keyword of keywords) {
      if (lower.includes(keyword)) return true;
    }
    return false;
  });

  return matched.sort((a, b) => {
    const scoreDiff = scoreUserdataCandidate(b, keywords) - scoreUserdataCandidate(a, keywords);
    if (scoreDiff !== 0) return scoreDiff;
    return a.localeCompare(b);
  });
};

const resolveRemoteUserdataWorkflowPaths = async (
  client: Pick<ComfyClient, "getJson">,
  templateName: string,
  rawTemplate: Record<string, unknown>,
) => {
  const fileCandidates = new Set<string>();
  const templatePathKeys = ["workflow_path", "workflowPath", "path", "file", "filename"];

  for (const key of templatePathKeys) {
    const value = asString(rawTemplate[key]);
    if (!value) continue;
    const normalized = normalizeUserdataFilePath(value);
    if (normalized) fileCandidates.add(normalized);
  }

  const templateNames = buildTemplateNameCandidates(templateName, rawTemplate);
  for (const name of templateNames) {
    fileCandidates.add(`${name}.json`);
    fileCandidates.add(`workflows/${name}.json`);
  }

  for (const endpoint of REMOTE_USERDATA_LIST_ENDPOINTS) {
    try {
      const payload = await client.getJson(endpoint, { retries: 1, retryDelayMs: 300 });
      const extracted = extractUserdataJsonCandidates(payload, templateName, rawTemplate);
      for (const candidate of extracted) {
        fileCandidates.add(applyWorkflowsDirContext(candidate, endpoint));
      }
    } catch {
      continue;
    }
  }

  const fileEndpoints = ["/userdata/", "/api/userdata/"];
  const fetchPaths = new Set<string>();
  for (const filePath of fileCandidates) {
    const encoded = encodeURIComponent(filePath);
    const doubleEncoded = encodeURIComponent(encoded);
    const encodedSegments = filePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    for (const endpoint of fileEndpoints) {
      fetchPaths.add(`${endpoint}${encoded}`);
      fetchPaths.add(`${endpoint}${doubleEncoded}`);
      fetchPaths.add(`${endpoint}${encodedSegments}`);
    }
  }

  return Array.from(fetchPaths);
};

const resolveRemoteWorkflowPaths = (templateName: string, raw: Record<string, unknown>) => {
  const candidates = new Set<string>();
  const directKeys = [
    "workflow_path",
    "workflowPath",
    "path",
    "file",
    "filename",
    "url",
    "template_url",
  ];
  for (const key of directKeys) {
    const value = asString(raw[key]);
    if (!value) continue;
    const normalized = normalizeTemplatePath(value);
    if (normalized) candidates.add(normalized);
  }

  const moduleName = asString(raw.module_name) ?? asString(raw.moduleName);
  if (moduleName) {
    candidates.add(`/templates/${moduleName}/${templateName}.json`);
    candidates.add(`/api/workflow_templates/${moduleName}/${templateName}.json`);
  }

  candidates.add(`/templates/${templateName}.json`);
  candidates.add(`/api/workflow_templates/${templateName}.json`);

  const withJsonExt = new Set<string>();
  for (const pathValue of candidates) {
    withJsonExt.add(pathValue);
    if (!pathValue.endsWith(".json")) {
      withJsonExt.add(`${pathValue}.json`);
    }
  }

  return Array.from(withJsonExt);
};

export const resolveRemoteWorkflow = async (
  client: Pick<ComfyClient, "getJson">,
  templateName: string,
  rawTemplate: unknown,
  options?: { preferUserdata?: boolean },
): Promise<Workflow> => {
  const inline = normalizeWorkflowCandidate(rawTemplate);
  if (inline) return inline;

  const raw = asRecord(rawTemplate) ?? {};
  const candidate =
    normalizeWorkflowCandidate(raw.workflow) ?? normalizeWorkflowCandidate(raw.prompt);
  if (candidate) return candidate;

  const tried: string[] = [];
  const userdataPaths = await resolveRemoteUserdataWorkflowPaths(client, templateName, raw);
  const templatePaths = resolveRemoteWorkflowPaths(templateName, raw);
  const orderedPathGroups = options?.preferUserdata
    ? [userdataPaths, templatePaths]
    : [templatePaths, userdataPaths];

  for (const group of orderedPathGroups) {
    for (const workflowPath of group) {
      tried.push(workflowPath);
      try {
        const payload = await client.getJson(workflowPath, { retries: 1, retryDelayMs: 300 });
        const normalized = normalizeWorkflowCandidate(payload);
        if (normalized) return normalized;
      } catch {
        continue;
      }
    }
  }

  throw new CliError("REMOTE_WORKFLOW_NOT_FOUND", t("run.remote_workflow_not_found"), 2, {
    template: templateName,
    tried_paths: tried,
  });
};

export type RemoteRunTarget = {
  source: "remote" | "remote-catalog";
  preset: Preset;
  workflow: Workflow;
};

export const tryLoadRemoteUserdataRunTarget = async (
  presetName: string,
  client: ComfyClient,
): Promise<RemoteRunTarget | null> => {
  const userdata = await fetchRemoteUserdataWorkflows(client);
  const matched = userdata.workflows.find((item) => item.name === presetName);
  if (!matched) return null;
  const workflow = await resolveRemoteWorkflow(
    client,
    presetName,
    { name: presetName, workflow_path: matched.file },
    { preferUserdata: true },
  );
  const preset: Preset = {
    version: 1,
    name: presetName,
    workflow: "(remote)",
    parameters: inferParametersFromWorkflow(workflow),
  };
  return { source: "remote", preset, workflow };
};

export const tryLoadRemoteCatalogRunTarget = async (
  presetName: string,
  client: ComfyClient,
): Promise<RemoteRunTarget | null> => {
  const remoteResult = await fetchRemoteTemplateByName(client, presetName);
  if (!remoteResult.template) return null;

  const workflow = await resolveRemoteWorkflow(client, presetName, remoteResult.template.raw);
  const raw = asRecord(remoteResult.template.raw) ?? {};
  const remoteParameters = normalizeRemoteParameters(raw.parameters);
  const parameters =
    Object.keys(remoteParameters).length > 0
      ? remoteParameters
      : inferParametersFromWorkflow(workflow);
  const uploads = normalizeRemoteUploads(raw.uploads);

  const preset: Preset = {
    version: 1,
    name: presetName,
    workflow: "(remote)",
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    uploads: Object.keys(uploads).length > 0 ? uploads : undefined,
  };
  return { source: "remote-catalog", preset, workflow };
};

export const tryLoadRemoteRunTarget = async (
  presetName: string,
  client: ComfyClient,
): Promise<RemoteRunTarget | null> => {
  let userdataError: unknown = null;
  try {
    const userdataTarget = await tryLoadRemoteUserdataRunTarget(presetName, client);
    if (userdataTarget) return userdataTarget;
  } catch (err) {
    userdataError = err;
  }

  const catalogTarget = await tryLoadRemoteCatalogRunTarget(presetName, client);
  if (catalogTarget) return catalogTarget;
  if (userdataError) throw userdataError;
  return null;
};
