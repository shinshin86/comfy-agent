import { CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";
import type { Preset } from "../preset/schema.js";
import type { Workflow, WorkflowObjectInfo } from "./normalize.js";

type Node = { class_type: string; inputs: Record<string, unknown> };
const linkSource = (value: unknown) =>
  Array.isArray(value) &&
  value.length === 2 &&
  (typeof value[0] === "string" || typeof value[0] === "number") &&
  Number.isInteger(value[1])
    ? String(value[0])
    : null;

/** Simulate disconnected uploads using the server's required/optional input definitions. */
export const pruneOptionalInputs = (
  workflow: Workflow,
  targetNodes: string[],
  objectInfo?: WorkflowObjectInfo | null,
) => {
  const fail = (reason: string) => ({
    skippable: false,
    reason,
    workflow,
    removed: [] as string[],
  });
  if (!objectInfo) return fail("object_info_unavailable");
  const nodes = structuredClone(workflow) as Record<string, Node>;
  for (const node of Object.values(nodes))
    if (!node?.class_type || !node.inputs || !objectInfo[node.class_type])
      return fail("unknown_node_class");
  if (targetNodes.some((id) => !Object.hasOwn(nodes, id))) return fail("unknown_target_node");
  const removed = new Set(targetNodes);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, node] of Object.entries(nodes)) {
      if (removed.has(id)) continue;
      const info = objectInfo[node.class_type]!;
      for (const [input, value] of Object.entries(node.inputs)) {
        const source = linkSource(value);
        if (!source || !removed.has(source)) continue;
        if (Object.hasOwn(info.input?.required ?? {}, input)) {
          removed.add(id);
          changed = true;
          break;
        }
        if (Object.hasOwn(info.input?.optional ?? {}, input)) delete node.inputs[input];
        else return fail("unknown_input_requirement");
      }
    }
  }
  const outputs = Object.entries(nodes).filter(([id, node]) => {
    const info = objectInfo[node.class_type]!;
    return !removed.has(id) && info.output_node === true;
  });
  if (!outputs.length) return fail("no_surviving_output");
  const used = new Set<string>();
  const visit = (id: string) => {
    if (used.has(id) || removed.has(id) || !nodes[id]) return;
    used.add(id);
    for (const value of Object.values(nodes[id]!.inputs)) {
      const source = linkSource(value);
      if (source) visit(source);
    }
  };
  outputs.forEach(([id]) => visit(id));
  for (const id of Object.keys(nodes))
    if (!used.has(id)) {
      removed.add(id);
      delete nodes[id];
    }
  return { skippable: true, reason: undefined, workflow: nodes as Workflow, removed: [...removed] };
};

/** Validate named upload slots and apply exactly the same simulation used by Studio. */
export const skipWorkflowUploads = (
  workflow: Workflow,
  preset: Preset,
  slots: string[],
  objectInfo?: WorkflowObjectInfo | null,
) => {
  for (const slot of slots)
    if (!Object.hasOwn(preset.uploads ?? {}, slot))
      throw new CliError("UNKNOWN_INPUT_SLOT", t("run.unknown_skip_input", { slot }), 2, { slot });
  const result = pruneOptionalInputs(
    workflow,
    slots.map((slot) => String(preset.uploads![slot]!.target.node_id)),
    objectInfo,
  );
  if (!result.skippable)
    throw new CliError(
      "INPUT_NOT_SKIPPABLE",
      t("run.input_not_skippable", { slots: slots.join(", ") }),
      2,
      { slots, reason: result.reason },
    );
  return result.workflow;
};

export const hasBakedInput = (workflow: Workflow, preset: Preset, slot: string) => {
  const target = preset.uploads?.[slot]?.target;
  const value =
    target && (workflow[String(target.node_id)] as Node | undefined)?.inputs?.[target.input];
  return typeof value === "string" && value.trim().length > 0;
};
