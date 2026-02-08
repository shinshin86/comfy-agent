import path from "node:path";
import { promises as fs } from "node:fs";
import YAML from "yaml";
import { ComfyClient } from "../api/client.js";
import { CliError } from "../io/errors.js";
import { getSubdirPath, getWorkdirPath } from "../io/workdir.js";
import { log, print } from "../io/output.js";
import { t } from "../i18n/index.js";
import { detectParamType, isLiteralValue, normalizeWorkflow } from "../workflow/normalize.js";
import { resolveComfyBaseUrl } from "../utils/base-url.js";

export type ImportOptions = {
  name: string;
  force?: boolean;
  baseUrl?: string;
  global?: boolean;
};

const sanitizeName = (name: string) => {
  if (!name || name.trim().length === 0) {
    throw new CliError("INVALID_NAME", t("import.name_required"), 2);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new CliError("INVALID_NAME", t("import.name_invalid"), 2, { name });
  }
  return name.trim();
};

const ensureWorkdir = async (scope: "local" | "global") => {
  try {
    const stat = await fs.stat(getWorkdirPath(process.cwd(), scope));
    if (!stat.isDirectory()) {
      throw new CliError("WORKDIR_NOT_FOUND", t("import.workdir_missing"), 2);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("WORKDIR_NOT_FOUND", t("import.workdir_missing"), 2);
    }
    throw err;
  }
};

const loadWorkflowFile = async (filePath: string) => {
  const raw = await fs.readFile(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CliError("INVALID_WORKFLOW", t("import.invalid_workflow_json"), 2, {
      file: filePath,
      cause: String(err),
    });
  }
  try {
    return normalizeWorkflow(parsed);
  } catch (err) {
    throw new CliError("INVALID_WORKFLOW", (err as Error).message, 2, { file: filePath });
  }
};

const resolveBaseUrl = (options: ImportOptions) => resolveComfyBaseUrl(options);

type ObjectInfoNode = {
  input?: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
  };
};
type ObjectInfo = Record<string, ObjectInfoNode>;

const getObjectInfoType = (
  objectInfo: ObjectInfo | null,
  classType: string | undefined,
  inputName: string,
) => {
  if (!objectInfo || !classType) return undefined;
  const info = objectInfo[classType];
  if (!info || typeof info !== "object") return undefined;
  const input = info.input;
  if (!input || typeof input !== "object") return undefined;
  const required = input.required;
  const optional = input.optional;
  const entry = required?.[inputName] ?? optional?.[inputName];
  if (!entry) return undefined;
  if (Array.isArray(entry)) {
    return entry[0];
  }
  return entry;
};

const mapObjectInfoType = (value: unknown): "string" | "int" | "float" | "bool" | "json" => {
  if (typeof value !== "string") return "json";
  const upper = value.toUpperCase();
  if (upper.includes("INT")) return "int";
  if (upper.includes("FLOAT") || upper.includes("NUMBER")) return "float";
  if (upper.includes("BOOL")) return "bool";
  if (upper.includes("STRING") || upper.includes("TEXT") || upper.includes("COMBO"))
    return "string";
  return "json";
};

const loadObjectInfoCache = async (
  cachePath: string,
): Promise<Partial<Record<string, ObjectInfo>>> => {
  try {
    const raw = await fs.readFile(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Record<string, ObjectInfo>>;
    return parsed ?? {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    return {};
  }
};

const saveObjectInfoCache = async (
  cachePath: string,
  cache: Partial<Record<string, ObjectInfo>>,
) => {
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
};

const fetchObjectInfo = async (baseUrl: string) => {
  try {
    const client = new ComfyClient(baseUrl);
    return (await client.objectInfo()) as ObjectInfo;
  } catch (err) {
    log(t("import.object_info_failed"));
    return null;
  }
};

const buildPresetTemplate = (
  name: string,
  workflowFile: string,
  workflow: Record<string, unknown>,
  objectInfo: ObjectInfo | null,
) => {
  const parameters: Record<string, unknown> = {};

  for (const [nodeId, nodeValue] of Object.entries(workflow)) {
    if (!nodeValue || typeof nodeValue !== "object") continue;
    const node = nodeValue as Record<string, unknown>;
    const inputs = node.inputs as Record<string, unknown> | undefined;
    const classType = node.class_type as string | undefined;
    if (!inputs) continue;

    for (const [inputName, inputValue] of Object.entries(inputs)) {
      if (!isLiteralValue(inputValue)) continue;
      const paramName = `${nodeId}_${inputName}`;
      if (parameters[paramName]) continue;
      const objectType = getObjectInfoType(objectInfo, classType, inputName);
      const inferredType = objectType ? mapObjectInfoType(objectType) : detectParamType(inputValue);
      parameters[paramName] = {
        type: inferredType,
        target: {
          node_id: nodeId,
          input: inputName,
        },
        default: inputValue,
        required: false,
      };
    }
  }

  return {
    version: 1,
    name,
    workflow: workflowFile,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
  };
};

const writeFileSafe = async (filePath: string, content: string, force?: boolean) => {
  try {
    await fs.stat(filePath);
    if (!force) {
      throw new CliError("FILE_EXISTS", t("import.file_exists", { path: filePath }), 2, {
        path: filePath,
      });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      if (err instanceof CliError) throw err;
    }
  }

  await fs.writeFile(filePath, content, "utf-8");
};

export const runImport = async (workflowPath: string, options: ImportOptions) => {
  const scope = options.global ? "global" : "local";
  await ensureWorkdir(scope);
  const name = sanitizeName(options.name);
  const workflow = await loadWorkflowFile(workflowPath);
  const baseUrl = resolveBaseUrl(options);

  const workflowsDir = getSubdirPath("workflows", process.cwd(), scope);
  const presetsDir = getSubdirPath("presets", process.cwd(), scope);
  const cacheDir = getSubdirPath("cache", process.cwd(), scope);
  const cachePath = path.join(cacheDir, "object_info.json");

  const workflowFileName = `${name}.json`;
  const presetFileName = `${name}.yaml`;

  const workflowDest = path.join(workflowsDir, workflowFileName);
  const presetDest = path.join(presetsDir, presetFileName);

  await writeFileSafe(workflowDest, `${JSON.stringify(workflow, null, 2)}\n`, options.force);

  await fs.mkdir(cacheDir, { recursive: true });
  const cache = await loadObjectInfoCache(cachePath);
  let objectInfo = cache[baseUrl] ?? null;
  if (!objectInfo) {
    objectInfo = await fetchObjectInfo(baseUrl);
    if (objectInfo) {
      cache[baseUrl] = objectInfo;
      await saveObjectInfoCache(cachePath, cache);
    }
  }

  const presetTemplate = buildPresetTemplate(name, workflowFileName, workflow, objectInfo);
  const presetYaml = YAML.stringify(presetTemplate);
  await writeFileSafe(presetDest, presetYaml, options.force);

  print(t("import.workflow_saved", { path: workflowDest }));
  print(t("import.preset_created", { path: presetDest }));
};
