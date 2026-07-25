import { ComfyClient } from "../api/client.js";
import { CliError, isCliError } from "../io/errors.js";
import { t } from "../i18n/index.js";
import type { Workflow } from "./normalize.js";

export type MissingNode = {
  node_id: string;
  class_type: string;
};

export type MissingModel = {
  node_id: string;
  class_type: string;
  input: string;
  value: string;
  available: string[];
  available_truncated?: boolean;
};

export type PreflightReport = {
  checked: boolean;
  missing_nodes: MissingNode[];
  missing_models: MissingModel[];
};

const AVAILABLE_LIST_CAP = 50;

const MODEL_FILE_EXTENSIONS = [
  ".safetensors",
  ".sft",
  ".ckpt",
  ".pt",
  ".pth",
  ".bin",
  ".gguf",
  ".onnx",
  ".vae",
];

const looksLikeModelFile = (value: string) => {
  const lower = value.toLowerCase();
  return MODEL_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

type ObjectInfoNode = {
  input?: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
  };
};

const comboChoices = (inputSpec: unknown): string[] | null => {
  // object_info encodes each input as [typeOrChoices, options?]. A combo
  // input's first element is the array of currently valid values — for
  // loader nodes this is the list of files present on the server.
  if (!Array.isArray(inputSpec) || inputSpec.length === 0) return null;
  const first = inputSpec[0];
  if (!Array.isArray(first)) return null;
  if (!first.every((item) => typeof item === "string")) return null;
  return first as string[];
};

const inputSpecFor = (nodeInfo: ObjectInfoNode, inputName: string): unknown => {
  return nodeInfo.input?.required?.[inputName] ?? nodeInfo.input?.optional?.[inputName];
};

/**
 * Compare a normalized API workflow against the server's /object_info.
 * Reports node classes the server lacks, and model-file inputs whose value
 * is not among the server's currently available files.
 */
export const buildPreflightReport = (
  workflow: Workflow,
  objectInfo: Record<string, unknown>,
): PreflightReport => {
  const missingNodes: MissingNode[] = [];
  const missingModels: MissingModel[] = [];

  for (const [nodeId, rawNode] of Object.entries(workflow)) {
    if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) continue;
    const node = rawNode as { class_type?: unknown; inputs?: unknown };
    if (typeof node.class_type !== "string") continue;

    const nodeInfo = objectInfo[node.class_type] as ObjectInfoNode | undefined;
    if (!nodeInfo) {
      missingNodes.push({ node_id: nodeId, class_type: node.class_type });
      continue;
    }

    if (!node.inputs || typeof node.inputs !== "object") continue;
    for (const [inputName, value] of Object.entries(node.inputs as Record<string, unknown>)) {
      if (typeof value !== "string") continue; // links are [nodeId, slot] arrays
      if (!looksLikeModelFile(value)) continue;
      const choices = comboChoices(inputSpecFor(nodeInfo, inputName));
      if (!choices) continue;
      if (choices.includes(value)) continue;
      const truncated = choices.length > AVAILABLE_LIST_CAP;
      missingModels.push({
        node_id: nodeId,
        class_type: node.class_type,
        input: inputName,
        value,
        available: truncated ? choices.slice(0, AVAILABLE_LIST_CAP) : choices,
        ...(truncated ? { available_truncated: true } : {}),
      });
    }
  }

  return { checked: true, missing_nodes: missingNodes, missing_models: missingModels };
};

export type ServerFailureKind = "unreachable" | "endpoint_missing" | "api_error";

/**
 * Classify a ComfyClient failure for the agent decision table.
 *
 * - network errors → unreachable
 * - 5xx and Cloudflare tunnel errors (e.g. 530 from a dead trycloudflare
 *   tunnel — the edge still answers HTTP) → unreachable
 * - 404/405 → endpoint_missing (route genuinely absent, e.g. old ComfyUI)
 * - anything else the server answered → api_error
 */
export const classifyServerError = (err: unknown): ServerFailureKind => {
  if (!isCliError(err)) return "api_error";
  const details = err.details ?? {};
  if (details.kind === "network") return "unreachable";
  const status = typeof details.status === "number" ? details.status : null;
  if (status === null) {
    // Older call sites without a kind marker: no status meant network-level.
    return details.kind === "invalid_response" ? "api_error" : "unreachable";
  }
  if (status === 404 || status === 405) return "endpoint_missing";
  if (status >= 500) return "unreachable";
  return "api_error";
};

export const toServerUnreachable = (err: unknown, server: string) => {
  const details = isCliError(err) ? (err.details ?? {}) : {};
  return new CliError("SERVER_UNREACHABLE", t("preflight.server_unreachable"), 3, {
    server,
    ...(typeof details.status === "number" ? { status: details.status } : {}),
    cause: isCliError(err) ? String(details.cause ?? err.message) : String(err),
  });
};

/**
 * Fetch /object_info and diff the workflow against it.
 *
 * - Unreachable server (network failure, 5xx, dead tunnel) → SERVER_UNREACHABLE.
 * - /object_info route absent (404/405, very old ComfyUI) → skip the check
 *   and return { checked: false } instead of blocking the run.
 * - Other answered-but-broken cases → rethrow the original API_ERROR.
 */
export const fetchPreflightReport = async (
  client: ComfyClient,
  workflow: Workflow,
): Promise<PreflightReport> => {
  let objectInfo: Record<string, unknown>;
  try {
    objectInfo = await client.objectInfo<Record<string, unknown>>();
  } catch (err) {
    const kind = classifyServerError(err);
    if (kind === "unreachable") {
      throw toServerUnreachable(err, client.baseUrl);
    }
    if (kind === "endpoint_missing") {
      return { checked: false, missing_nodes: [], missing_models: [] };
    }
    throw err;
  }
  if (!objectInfo || typeof objectInfo !== "object") {
    return { checked: false, missing_nodes: [], missing_models: [] };
  }
  return buildPreflightReport(workflow, objectInfo);
};

/** Throw the contract errors when the report has findings. */
export const assertPreflightPasses = (report: PreflightReport, server: string) => {
  if (!report.checked) return;
  if (report.missing_nodes.length > 0) {
    throw new CliError("MISSING_NODE_ON_SERVER", t("preflight.missing_nodes"), 3, {
      server,
      missing_nodes: report.missing_nodes,
      missing_models: report.missing_models,
    });
  }
  if (report.missing_models.length > 0) {
    throw new CliError("MISSING_MODEL_ON_SERVER", t("preflight.missing_models"), 3, {
      server,
      missing_nodes: report.missing_nodes,
      missing_models: report.missing_models,
    });
  }
};
