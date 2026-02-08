import { ComfyClient } from "../api/client.js";
import { CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";
import { applyWorkflowsDirContext, collectUserdataJsonPaths } from "./userdata-path.js";

export const REMOTE_TEMPLATE_ENDPOINTS = [
  "/workflow_templates",
  "/api/workflow_templates",
] as const;
export const REMOTE_TEMPLATE_STATIC_ENDPOINTS = ["/templates/index.json"] as const;
export const ALL_REMOTE_TEMPLATE_ENDPOINTS = [
  ...REMOTE_TEMPLATE_ENDPOINTS,
  ...REMOTE_TEMPLATE_STATIC_ENDPOINTS,
] as const;
export const REMOTE_USERDATA_LIST_ENDPOINTS = [
  "/userdata?dir=workflows&recurse=true",
  "/userdata?dir=workflows",
  "/v2/userdata?path=workflows",
  "/v2/userdata",
  "/api/userdata?dir=workflows&recurse=true",
  "/api/userdata?dir=workflows",
  "/api/v2/userdata?path=workflows",
  "/api/v2/userdata",
] as const;

export type RemoteTemplate = {
  name: string;
  raw: unknown;
};

export type RemoteUserdataWorkflow = {
  name: string;
  file: string;
};

const RESERVED_KEYS = new Set(["templates", "items", "workflows", "data", "categories"]);

const asString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const pickTemplateName = (value: unknown): string | null => {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const candidates = [obj.name, obj.template_name, obj.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
};

const toTemplate = (value: unknown): RemoteTemplate | null => {
  if (typeof value === "string" && value.length > 0) {
    return { name: value, raw: { name: value } };
  }
  const name = pickTemplateName(value);
  if (!name) return null;
  return { name, raw: value };
};

const toTemplateFromCategoryItem = (
  category: Record<string, unknown>,
  value: unknown,
): RemoteTemplate | null => {
  if (typeof value === "string" && value.length > 0) {
    return {
      name: value,
      raw: {
        name: value,
        category: asString(category.title) ?? asString(category.moduleName),
        category_type: asString(category.type),
      },
    };
  }

  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const name = pickTemplateName(item);
  if (!name) return null;
  return {
    name,
    raw: {
      ...item,
      category: asString(category.title) ?? asString(category.moduleName),
      category_type: asString(category.type),
    },
  };
};

const pushTemplate = (templates: Map<string, RemoteTemplate>, template: RemoteTemplate | null) => {
  if (!template) return;
  if (!templates.has(template.name)) {
    templates.set(template.name, template);
  }
};

const collectFromArray = (templates: Map<string, RemoteTemplate>, value: unknown) => {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    pushTemplate(templates, toTemplate(item));
  }
};

export const extractRemoteTemplates = (payload: unknown): RemoteTemplate[] => {
  const templates = new Map<string, RemoteTemplate>();

  if (Array.isArray(payload)) {
    collectFromArray(templates, payload);
    for (const item of payload) {
      if (!item || typeof item !== "object") continue;
      const category = item as Record<string, unknown>;
      const categoryTemplates = category.templates;
      if (!Array.isArray(categoryTemplates)) continue;
      for (const templateItem of categoryTemplates) {
        pushTemplate(templates, toTemplateFromCategoryItem(category, templateItem));
      }
    }
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;

    collectFromArray(templates, obj.templates);
    collectFromArray(templates, obj.items);
    collectFromArray(templates, obj.workflows);
    collectFromArray(templates, obj.data);
    collectFromArray(templates, obj.categories);

    if (Array.isArray(obj.categories)) {
      for (const item of obj.categories) {
        if (!item || typeof item !== "object") continue;
        const category = item as Record<string, unknown>;
        const categoryTemplates = category.templates;
        if (!Array.isArray(categoryTemplates)) continue;
        for (const templateItem of categoryTemplates) {
          pushTemplate(templates, toTemplateFromCategoryItem(category, templateItem));
        }
      }
    }

    for (const [key, value] of Object.entries(obj)) {
      if (RESERVED_KEYS.has(key)) continue;
      if (!value || typeof value !== "object") continue;
      if (templates.has(key)) continue;
      templates.set(key, { name: key, raw: value });
    }

    pushTemplate(templates, toTemplate(obj));
  }

  return Array.from(templates.values()).sort((a, b) => a.name.localeCompare(b.name));
};

export const extractRemoteTemplateNames = (payload: unknown): string[] => {
  return extractRemoteTemplates(payload).map((template) => template.name);
};

export const extractRemoteUserdataFiles = (payload: unknown): string[] => {
  const files = new Set<string>();
  collectUserdataJsonPaths(payload, files);
  return Array.from(files).sort((a, b) => a.localeCompare(b));
};

export const toRemoteUserdataWorkflowName = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, "/");
  const leaf = normalized.split("/").pop() ?? normalized;
  return leaf.replace(/\.json$/i, "");
};

export const extractRemoteUserdataWorkflowNames = (payload: unknown): string[] => {
  const names = new Set<string>();
  for (const file of extractRemoteUserdataFiles(payload)) {
    const name = toRemoteUserdataWorkflowName(file);
    if (!name || name.startsWith(".")) continue;
    names.add(name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
};

export const extractRemoteUserdataWorkflows = (payload: unknown): RemoteUserdataWorkflow[] => {
  const workflows = new Map<string, RemoteUserdataWorkflow>();

  for (const file of extractRemoteUserdataFiles(payload)) {
    const name = toRemoteUserdataWorkflowName(file);
    if (!name || name.startsWith(".")) continue;
    const existing = workflows.get(name);
    if (!existing) {
      workflows.set(name, { name, file });
      continue;
    }
    if (scoreRemoteUserdataFilePath(file) > scoreRemoteUserdataFilePath(existing.file)) {
      workflows.set(name, { name, file });
    }
  }
  return Array.from(workflows.values()).sort((a, b) => a.name.localeCompare(b.name));
};

export const scoreRemoteUserdataFilePath = (filePath: string): number => {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  let score = 0;
  if (normalized.includes("/")) score += 50;
  if (normalized.startsWith("workflows/")) score += 100;
  if (normalized.includes("/workflows/")) score += 80;
  score += Math.min(normalized.length, 60);
  return score;
};

export const fetchRemoteTemplates = async (
  client: Pick<ComfyClient, "getJson">,
): Promise<{ templates: RemoteTemplate[]; endpoint: string; endpoints: string[] }> => {
  const attempts: Array<{ endpoint: string; message: string; status?: unknown }> = [];
  const successfulEndpoints: string[] = [];
  const merged = new Map<string, RemoteTemplate>();

  for (const endpoint of ALL_REMOTE_TEMPLATE_ENDPOINTS) {
    try {
      const payload = await client.getJson(endpoint, { retries: 1, retryDelayMs: 300 });
      const templates = extractRemoteTemplates(payload);
      successfulEndpoints.push(endpoint);
      for (const template of templates) {
        if (!merged.has(template.name)) {
          merged.set(template.name, template);
        }
      }
    } catch (err) {
      const details =
        err instanceof CliError ? (err.details as Record<string, unknown> | undefined) : undefined;
      attempts.push({
        endpoint,
        message: err instanceof Error ? err.message : String(err),
        status: details?.status,
      });
    }
  }

  if (successfulEndpoints.length > 0) {
    const templates = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
    return { templates, endpoint: successfulEndpoints.join(", "), endpoints: successfulEndpoints };
  }

  throw new CliError("REMOTE_TEMPLATE_FETCH_FAILED", t("list.remote_fetch_all_failed"), 3, {
    attempts,
  });
};

export const fetchRemoteTemplateNames = async (
  client: Pick<ComfyClient, "getJson">,
): Promise<{ names: string[]; endpoint: string }> => {
  const { templates, endpoint } = await fetchRemoteTemplates(client);
  return { names: templates.map((template) => template.name), endpoint };
};

export const fetchRemoteUserdataWorkflowNames = async (
  client: Pick<ComfyClient, "getJson">,
): Promise<{ names: string[]; endpoint: string; endpoints: string[] }> => {
  const result = await fetchRemoteUserdataWorkflows(client);
  return {
    names: result.workflows.map((item) => item.name),
    endpoint: result.endpoint,
    endpoints: result.endpoints,
  };
};

export const fetchRemoteUserdataWorkflows = async (
  client: Pick<ComfyClient, "getJson">,
): Promise<{ workflows: RemoteUserdataWorkflow[]; endpoint: string; endpoints: string[] }> => {
  const attempts: Array<{ endpoint: string; message: string; status?: unknown }> = [];
  const successfulEndpoints: string[] = [];
  const merged = new Map<string, RemoteUserdataWorkflow>();

  for (const endpoint of REMOTE_USERDATA_LIST_ENDPOINTS) {
    try {
      const payload = await client.getJson(endpoint, { retries: 1, retryDelayMs: 300 });
      const workflows = extractRemoteUserdataWorkflows(payload).map((workflow) => ({
        ...workflow,
        file: applyWorkflowsDirContext(workflow.file, endpoint),
      }));
      successfulEndpoints.push(endpoint);
      for (const workflow of workflows) {
        const existing = merged.get(workflow.name);
        if (
          !existing ||
          scoreRemoteUserdataFilePath(workflow.file) > scoreRemoteUserdataFilePath(existing.file)
        ) {
          merged.set(workflow.name, workflow);
        }
      }
    } catch (err) {
      const details =
        err instanceof CliError ? (err.details as Record<string, unknown> | undefined) : undefined;
      attempts.push({
        endpoint,
        message: err instanceof Error ? err.message : String(err),
        status: details?.status,
      });
    }
  }

  if (successfulEndpoints.length > 0) {
    return {
      workflows: Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name)),
      endpoint: successfulEndpoints.join(", "),
      endpoints: successfulEndpoints,
    };
  }

  throw new CliError(
    "REMOTE_USERDATA_FETCH_FAILED",
    t("list.remote_userdata_fetch_all_failed"),
    3,
    {
      attempts,
    },
  );
};

export const fetchRemoteTemplateByName = async (
  client: Pick<ComfyClient, "getJson">,
  name: string,
): Promise<{ template: RemoteTemplate | null; endpoint: string }> => {
  const { templates, endpoint } = await fetchRemoteTemplates(client);
  const template = templates.find((item) => item.name === name) ?? null;
  return { template, endpoint };
};
