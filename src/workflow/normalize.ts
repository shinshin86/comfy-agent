import { t } from "../i18n/index.js";

export type Workflow = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const isApiNode = (value: unknown): value is Record<string, unknown> => {
  if (!isPlainObject(value)) return false;
  return "inputs" in value && "class_type" in value;
};

const isApiWorkflow = (value: unknown): value is Workflow => {
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  if (entries.length === 0) return false;
  return entries.every(([key, node]) => typeof key === "string" && isApiNode(node));
};

type UiWorkflowNodeInput = {
  name?: unknown;
  type?: unknown;
  link?: unknown;
  widget?: unknown;
};

type UiWorkflowNode = {
  id?: unknown;
  type?: unknown;
  inputs?: unknown;
  widgets_values?: unknown;
  title?: unknown;
};

const UI_NON_EXECUTION_NODE_TYPES = new Set(["MarkdownNote"]);

const isUiWorkflow = (value: unknown): value is Record<string, unknown> => {
  if (!isPlainObject(value)) return false;
  return Array.isArray(value.nodes) && Array.isArray(value.links);
};

const toUiWorkflowNode = (value: unknown): UiWorkflowNode | null => {
  if (!isPlainObject(value)) return null;
  return value as UiWorkflowNode;
};

const toInputName = (input: UiWorkflowNodeInput): string | null => {
  return typeof input.name === "string" && input.name.length > 0 ? input.name : null;
};

const toLinkId = (input: UiWorkflowNodeInput): number | null => {
  if (typeof input.link === "number" && Number.isInteger(input.link)) return input.link;
  return null;
};

const isWidgetInput = (input: UiWorkflowNodeInput): boolean => {
  return isPlainObject(input.widget);
};

const matchesWidgetValueType = (inputType: unknown, value: unknown): boolean => {
  if (typeof inputType !== "string") return true;
  if (inputType === "INT") return typeof value === "number" && Number.isInteger(value);
  if (inputType === "FLOAT") return typeof value === "number";
  if (inputType === "BOOLEAN") return typeof value === "boolean";
  if (inputType === "STRING" || inputType === "COMBO") return typeof value === "string";
  return true;
};

const toUiLinkMap = (links: unknown[]): Map<number, [number, number]> => {
  const map = new Map<number, [number, number]>();
  for (const item of links) {
    if (!Array.isArray(item) || item.length < 4) continue;
    const linkId = item[0];
    const fromNodeId = item[1];
    const fromOutputSlot = item[2];
    if (
      typeof linkId !== "number" ||
      !Number.isInteger(linkId) ||
      typeof fromNodeId !== "number" ||
      !Number.isInteger(fromNodeId) ||
      typeof fromOutputSlot !== "number" ||
      !Number.isInteger(fromOutputSlot)
    ) {
      continue;
    }
    map.set(linkId, [fromNodeId, fromOutputSlot]);
  }
  return map;
};

const convertUiWorkflowToApiWorkflow = (
  rawUiWorkflow: Record<string, unknown>,
): Workflow | null => {
  const nodesRaw = rawUiWorkflow.nodes;
  const linksRaw = rawUiWorkflow.links;
  if (!Array.isArray(nodesRaw) || !Array.isArray(linksRaw)) return null;

  const linkMap = toUiLinkMap(linksRaw);
  const workflow: Workflow = {};

  for (const rawNode of nodesRaw) {
    const node = toUiWorkflowNode(rawNode);
    if (!node) continue;
    if (typeof node.id !== "number" || !Number.isInteger(node.id)) continue;
    if (typeof node.type !== "string" || node.type.length === 0) continue;
    if (UI_NON_EXECUTION_NODE_TYPES.has(node.type)) continue;

    const inputsArray = Array.isArray(node.inputs) ? (node.inputs as UiWorkflowNodeInput[]) : [];
    const widgetsValues = Array.isArray(node.widgets_values) ? node.widgets_values : [];
    let widgetIndex = 0;
    const normalizedInputs: Record<string, unknown> = {};

    for (const input of inputsArray) {
      const inputName = toInputName(input);
      if (!inputName) continue;

      const linkId = toLinkId(input);
      if (linkId !== null) {
        const from = linkMap.get(linkId);
        if (from) {
          normalizedInputs[inputName] = [String(from[0]), from[1]];
          continue;
        }
      }

      if (isWidgetInput(input) && widgetIndex < widgetsValues.length) {
        while (widgetIndex < widgetsValues.length) {
          const candidateValue = widgetsValues[widgetIndex];
          widgetIndex += 1;
          if (!matchesWidgetValueType(input.type, candidateValue)) {
            continue;
          }
          normalizedInputs[inputName] = candidateValue;
          break;
        }
      }
    }

    const apiNode: Record<string, unknown> = {
      class_type: node.type,
      inputs: normalizedInputs,
    };

    if (typeof node.title === "string" && node.title.length > 0) {
      apiNode._meta = { title: node.title };
    }

    workflow[String(node.id)] = apiNode;
  }

  return isApiWorkflow(workflow) ? workflow : null;
};

export const normalizeWorkflow = (raw: unknown): Workflow => {
  if (isApiWorkflow(raw)) {
    return raw;
  }

  if (isPlainObject(raw)) {
    if (isUiWorkflow(raw)) {
      const converted = convertUiWorkflowToApiWorkflow(raw);
      if (converted) return converted;
    }

    const candidate = raw.prompt ?? raw.workflow;
    if (isApiWorkflow(candidate)) {
      return candidate;
    }
  }

  throw new Error(t("workflow.normalize_failed"));
};

export const isLiteralValue = (value: unknown) => {
  if (Array.isArray(value)) return false;
  if (value === null) return true;
  const type = typeof value;
  return type === "string" || type === "number" || type === "boolean" || type === "object";
};

export const detectParamType = (value: unknown): "string" | "int" | "float" | "bool" | "json" => {
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  return "json";
};
