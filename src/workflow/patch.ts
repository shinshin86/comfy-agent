import { CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";
import type { Preset } from "../preset/schema.js";
import type { Workflow } from "./normalize.js";

const cloneWorkflow = (workflow: Workflow): Workflow => {
  return structuredClone(workflow);
};

const toNodeId = (value: string | number) => String(value);

const ensureNode = (workflow: Workflow, nodeId: string) => {
  const node = workflow[nodeId];
  if (!node || typeof node !== "object") {
    throw new CliError("NODE_NOT_FOUND", t("workflow.node_not_found", { nodeId }), 2, {
      node_id: nodeId,
    });
  }
  return node as Record<string, unknown>;
};

const ensureInputs = (node: Record<string, unknown>, nodeId: string) => {
  const inputs = node.inputs;
  if (!inputs || typeof inputs !== "object") {
    throw new CliError("INPUTS_NOT_FOUND", t("workflow.inputs_not_found", { nodeId }), 2, {
      node_id: nodeId,
    });
  }
  return inputs as Record<string, unknown>;
};

export const applyParameters = (
  workflow: Workflow,
  preset: Preset,
  values: Record<string, unknown>,
) => {
  const patched = cloneWorkflow(workflow);
  const parameters = preset.parameters ?? {};

  for (const [name, def] of Object.entries(parameters)) {
    if (!(name in values)) continue;
    const nodeId = toNodeId(def.target.node_id);
    const node = ensureNode(patched, nodeId);
    const inputs = ensureInputs(node, nodeId);
    inputs[def.target.input] = values[name];
  }

  return patched;
};

export const applyUploads = (
  workflow: Workflow,
  preset: Preset,
  values: Record<string, string>,
) => {
  const patched = cloneWorkflow(workflow);
  const uploads = preset.uploads ?? {};

  for (const [name, def] of Object.entries(uploads)) {
    if (!(name in values)) continue;
    const nodeId = toNodeId(def.target.node_id);
    const node = ensureNode(patched, nodeId);
    const inputs = ensureInputs(node, nodeId);
    inputs[def.target.input] = values[name];
  }

  return patched;
};
