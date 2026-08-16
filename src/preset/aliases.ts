import { KNOWN_RUN_FLAGS } from "../cli/run/flags.js";
import { isLiteralValue, type Workflow } from "../workflow/normalize.js";
import type { ParameterDef, ParameterRole } from "./schema.js";

export const ALIAS_VOCABULARY = [
  "prompt",
  "negative",
  "steps",
  "cfg",
  "guidance",
  "width",
  "height",
  "length",
  "fps",
  "seconds",
  "lyrics",
  "denoise",
] as const;

export type AliasName = (typeof ALIAS_VOCABULARY)[number];

export type NodeInputRef = { node_id: string; input: string };

export type AliasAssignment = {
  alias: AliasName;
  target: NodeInputRef;
  role: ParameterRole;
  via: "graph" | "primitive_title" | "input_name" | "class_input";
};

export type InferAliasesOptions = {
  reservedFlags?: Iterable<string>;
};

export type ParameterTemplate = ParameterDef;

type WorkflowNode = {
  class_type?: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
};

type Source = {
  ref: NodeInputRef;
  via: AliasAssignment["via"];
};

const TEXT_INPUTS = ["text", "prompt", "positive_prompt", "caption", "tags"] as const;

const asNode = (value: unknown): WorkflowNode | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const node = value as Record<string, unknown>;
  if (!node.inputs || typeof node.inputs !== "object" || Array.isArray(node.inputs)) return null;
  const meta =
    node._meta && typeof node._meta === "object" && !Array.isArray(node._meta)
      ? (node._meta as { title?: string })
      : undefined;
  return {
    class_type: typeof node.class_type === "string" ? node.class_type : undefined,
    inputs: node.inputs as Record<string, unknown>,
    _meta: meta,
  };
};

const nodesOf = (workflow: Workflow) =>
  Object.entries(workflow).flatMap(([nodeId, value]) => {
    const node = asNode(value);
    return node ? [{ nodeId, node }] : [];
  });

const linkOf = (value: unknown): { nodeId: string; slot: number } | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  if (
    (typeof value[0] !== "string" && typeof value[0] !== "number") ||
    !Number.isFinite(value[1])
  ) {
    return null;
  }
  return { nodeId: String(value[0]), slot: Number(value[1]) };
};

const sameTarget = (
  left: { node_id: string | number; input: string },
  right: { node_id: string | number; input: string },
) => String(left.node_id) === String(right.node_id) && left.input === right.input;

const isSamplerClass = (classType?: string) =>
  Boolean(classType && /sampler/i.test(classType) && classType.toLowerCase() !== "ksamplerselect");

const isGuiderClass = (classType?: string) => Boolean(classType && /guider$/i.test(classType));

const isDisabledSampler = (node: WorkflowNode) =>
  isSamplerClass(node.class_type) &&
  typeof node.inputs.add_noise === "string" &&
  node.inputs.add_noise.toLowerCase() === "disable";

export const resolveLiteralSource = (
  workflow: Workflow,
  ref: NodeInputRef,
): NodeInputRef | null => {
  const visit = (
    current: NodeInputRef,
    depth: number,
    visited: Set<string>,
  ): NodeInputRef | null => {
    if (depth > 4) return null;
    const visitKey = `${current.node_id}:${current.input}`;
    if (visited.has(visitKey)) return null;
    const nextVisited = new Set(visited).add(visitKey);
    const node = asNode(workflow[current.node_id]);
    if (!node || !(current.input in node.inputs)) return null;
    const value = node.inputs[current.input];
    if (isLiteralValue(value)) return current;

    const link = linkOf(value);
    if (!link) return null;
    const source = asNode(workflow[link.nodeId]);
    if (!source) return null;

    const sourceClass = source.class_type?.toLowerCase() ?? "";
    const candidates = sourceClass.startsWith("primitive")
      ? ["value", current.input, ...TEXT_INPUTS]
      : [current.input, ...TEXT_INPUTS, "value"];
    for (const input of [...new Set(candidates)]) {
      if (!(input in source.inputs)) continue;
      const resolved = visit({ node_id: link.nodeId, input }, depth + 1, nextVisited);
      if (resolved) return resolved;
    }
    return null;
  };

  return visit(ref, 0, new Set());
};

const findConditioningSourcesDetailed = (
  workflow: Workflow,
): {
  positive?: Source;
  negative?: Source;
} => {
  const follow = (value: unknown, depth: number, visited: Set<string>): NodeInputRef | null => {
    if (depth > 8) return null;
    const link = linkOf(value);
    if (!link || visited.has(link.nodeId)) return null;
    const node = asNode(workflow[link.nodeId]);
    if (!node) return null;
    const nextVisited = new Set(visited).add(link.nodeId);

    for (const input of TEXT_INPUTS) {
      if (!(input in node.inputs)) continue;
      const resolved = resolveLiteralSource(workflow, { node_id: link.nodeId, input });
      if (resolved) return resolved;
    }

    if ("positive" in node.inputs && "negative" in node.inputs) {
      return follow(
        link.slot === 1 ? node.inputs.negative : node.inputs.positive,
        depth + 1,
        nextVisited,
      );
    }
    if ("conditioning" in node.inputs) {
      return follow(node.inputs.conditioning, depth + 1, nextVisited);
    }
    return null;
  };

  let positive: Source | undefined;
  let negative: Source | undefined;
  let suppressNegativeFallback = false;

  for (const { nodeId, node } of nodesOf(workflow)) {
    if (!isSamplerClass(node.class_type) && !isGuiderClass(node.class_type)) continue;
    if (!positive) {
      const positiveValue = node.inputs.positive ?? node.inputs.conditioning;
      const ref = follow(positiveValue, 0, new Set([nodeId]));
      if (ref) positive = { ref, via: "graph" };
    }
    if (!negative && "negative" in node.inputs) {
      const ref = follow(node.inputs.negative, 0, new Set([nodeId]));
      if (ref) negative = { ref, via: "graph" };
    }
    if (positive && negative) break;
  }

  if (positive && negative && positive.ref.node_id === negative.ref.node_id) {
    negative = undefined;
    suppressNegativeFallback = true;
  }

  if (!positive || (!negative && !suppressNegativeFallback)) {
    for (const { nodeId, node } of nodesOf(workflow)) {
      if (!positive && typeof node.inputs.prompt === "string") {
        positive = { ref: { node_id: nodeId, input: "prompt" }, via: "input_name" };
      }
      if (
        !negative &&
        !suppressNegativeFallback &&
        typeof node.inputs.negative_prompt === "string"
      ) {
        negative = {
          ref: { node_id: nodeId, input: "negative_prompt" },
          via: "input_name",
        };
      }
    }
  }

  if (!positive || (!negative && !suppressNegativeFallback)) {
    for (const { nodeId, node } of nodesOf(workflow)) {
      if (!node.class_type?.toLowerCase().includes("cliptextencode")) continue;
      if (typeof node.inputs.text !== "string") continue;
      const isNegative = /negative/i.test(node._meta?.title ?? "");
      if (isNegative && !negative && !suppressNegativeFallback) {
        negative = { ref: { node_id: nodeId, input: "text" }, via: "class_input" };
      } else if (!isNegative && !positive) {
        positive = { ref: { node_id: nodeId, input: "text" }, via: "class_input" };
      }
    }
  }

  return { positive, negative };
};

export const findConditioningSources = (
  workflow: Workflow,
): { positive?: NodeInputRef; negative?: NodeInputRef } => {
  const sources = findConditioningSourcesDetailed(workflow);
  return { positive: sources.positive?.ref, negative: sources.negative?.ref };
};

const aliasRole = (alias: AliasName): ParameterRole => {
  if (alias === "negative") return "negative_prompt";
  if (alias === "cfg" || alias === "guidance") return "guidance";
  if (["length", "fps", "seconds", "lyrics"].includes(alias)) return "custom";
  return alias as ParameterRole;
};

export const inferAliases = (
  workflow: Workflow,
  options: InferAliasesOptions = {},
): AliasAssignment[] => {
  const reserved = new Set(KNOWN_RUN_FLAGS);
  for (const flag of options.reservedFlags ?? []) reserved.add(flag.replace(/^--/, ""));

  const assignments: AliasAssignment[] = [];
  const usedTargets: NodeInputRef[] = [];
  const hasAlias = (alias: AliasName) => assignments.some((item) => item.alias === alias);
  const targetUsed = (target: NodeInputRef) => usedTargets.some((item) => sameTarget(item, target));
  const assign = (
    alias: AliasName,
    target: NodeInputRef | null | undefined,
    via: AliasAssignment["via"],
  ) => {
    if (!target || reserved.has(alias) || hasAlias(alias) || targetUsed(target)) return false;
    assignments.push({ alias, target, role: aliasRole(alias), via });
    usedTargets.push(target);
    return true;
  };

  const conditioning = findConditioningSourcesDetailed(workflow);
  assign("prompt", conditioning.positive?.ref, conditioning.positive?.via ?? "graph");
  assign("negative", conditioning.negative?.ref, conditioning.negative?.via ?? "graph");

  const nodes = nodesOf(workflow);
  const resolveCandidate = (nodeId: string, input: string) =>
    resolveLiteralSource(workflow, { node_id: nodeId, input });
  const assignFirst = (
    alias: AliasName,
    candidates: Array<{ nodeId: string; input: string; via: AliasAssignment["via"] }>,
  ) => {
    for (const candidate of candidates) {
      if (assign(alias, resolveCandidate(candidate.nodeId, candidate.input), candidate.via)) return;
    }
  };

  const activeNodes = nodes.filter(({ node }) => !isDisabledSampler(node));
  assignFirst("steps", [
    ...activeNodes
      .filter(({ node }) =>
        Boolean(
          (isSamplerClass(node.class_type) || /scheduler/i.test(node.class_type ?? "")) &&
          "steps" in node.inputs,
        ),
      )
      .map(({ nodeId }) => ({ nodeId, input: "steps", via: "class_input" as const })),
    ...activeNodes
      .filter(({ node }) => "steps" in node.inputs)
      .map(({ nodeId }) => ({ nodeId, input: "steps", via: "input_name" as const })),
  ]);

  assignFirst("cfg", [
    ...activeNodes
      .filter(({ node }) =>
        Boolean(
          (isSamplerClass(node.class_type) || isGuiderClass(node.class_type)) &&
          "cfg" in node.inputs,
        ),
      )
      .map(({ nodeId }) => ({ nodeId, input: "cfg", via: "class_input" as const })),
    ...activeNodes
      .filter(({ node }) => "cfg" in node.inputs)
      .map(({ nodeId }) => ({ nodeId, input: "cfg", via: "input_name" as const })),
    ...activeNodes
      .filter(({ node }) => "cfg_scale" in node.inputs)
      .map(({ nodeId }) => ({ nodeId, input: "cfg_scale", via: "input_name" as const })),
  ]);

  assignFirst(
    "guidance",
    nodes
      .filter(
        ({ node }) =>
          node.class_type?.toLowerCase() === "fluxguidance" && "guidance" in node.inputs,
      )
      .map(({ nodeId }) => ({ nodeId, input: "guidance", via: "class_input" as const })),
  );

  if (!reserved.has("width") && !reserved.has("height")) {
    const dimensionNodes = nodes
      .filter(({ node }) => "width" in node.inputs && "height" in node.inputs)
      .map((entry, index) => ({
        ...entry,
        index,
        priority: /latent|tovideo/i.test(entry.node.class_type ?? "") ? 0 : 1,
      }))
      .sort((left, right) => left.priority - right.priority || left.index - right.index);
    for (const { nodeId } of dimensionNodes) {
      const width = resolveCandidate(nodeId, "width");
      const height = resolveCandidate(nodeId, "height");
      if (!width || !height || sameTarget(width, height) || targetUsed(width) || targetUsed(height))
        continue;
      if (assign("width", width, "class_input") && assign("height", height, "class_input")) break;
    }
  }

  assignFirst(
    "length",
    nodes
      .filter(({ node }) => /latent|video/i.test(node.class_type ?? "") && "length" in node.inputs)
      .map(({ nodeId }) => ({ nodeId, input: "length", via: "class_input" as const })),
  );
  assignFirst("fps", [
    ...nodes
      .filter(({ node }) => "fps" in node.inputs)
      .map(({ nodeId }) => ({ nodeId, input: "fps", via: "input_name" as const })),
    ...nodes
      .filter(({ node }) => "frame_rate" in node.inputs)
      .map(({ nodeId }) => ({ nodeId, input: "frame_rate", via: "input_name" as const })),
  ]);
  assignFirst(
    "seconds",
    nodes
      .filter(({ node }) => "seconds" in node.inputs)
      .map(({ nodeId }) => ({ nodeId, input: "seconds", via: "input_name" as const })),
  );
  assignFirst(
    "lyrics",
    nodes
      .filter(({ node }) => "lyrics" in node.inputs)
      .map(({ nodeId }) => ({ nodeId, input: "lyrics", via: "input_name" as const })),
  );
  assignFirst(
    "denoise",
    nodes
      .filter(({ node }) => isSamplerClass(node.class_type) && "denoise" in node.inputs)
      .map(({ nodeId }) => ({ nodeId, input: "denoise", via: "class_input" as const })),
  );

  const titleAliases = new Map<string, AliasName>([
    ["prompt", "prompt"],
    ["negative", "negative"],
    ["negative prompt", "negative"],
    ["width", "width"],
    ["height", "height"],
    ["length", "length"],
    ["frames", "length"],
    ["frame rate", "fps"],
    ["fps", "fps"],
    ["steps", "steps"],
  ]);
  for (const { nodeId, node } of nodes) {
    if (!node.class_type?.toLowerCase().startsWith("primitive")) continue;
    const alias = titleAliases.get(node._meta?.title?.trim().toLowerCase() ?? "");
    if (!alias || hasAlias(alias) || !("value" in node.inputs)) continue;
    assign(alias, resolveCandidate(nodeId, "value"), "primitive_title");
  }

  return assignments.sort(
    (left, right) => ALIAS_VOCABULARY.indexOf(left.alias) - ALIAS_VOCABULARY.indexOf(right.alias),
  );
};

const descriptionFor = (assignment: AliasAssignment, inputName: string) => {
  if (assignment.alias === "prompt") return "Text prompt passed to the workflow.";
  if (assignment.alias === "negative") return "Negative prompt (what to avoid).";
  if (assignment.alias === "steps") return "Number of sampling steps.";
  if (assignment.alias === "cfg" || assignment.alias === "guidance")
    return "Guidance scale controlling prompt adherence.";
  if (assignment.alias === "width") return "Output width in pixels.";
  if (assignment.alias === "height") return "Output height in pixels.";
  if (assignment.alias === "length") return "Number of video frames.";
  if (assignment.alias === "fps") return "Frames per second.";
  if (assignment.alias === "seconds") return "Audio length in seconds.";
  if (assignment.alias === "lyrics") return "Lyrics text.";
  if (assignment.alias === "denoise") return "Denoise amount.";
  return `Workflow input: ${inputName}.`;
};

export const applyAliasAssignments = (
  parameters: Record<string, ParameterTemplate>,
  assignments: AliasAssignment[],
  existing?: Record<
    string,
    { aliases?: string[]; target: { node_id: string | number; input: string } }
  > | null,
): Record<string, ParameterTemplate> => {
  const result = Object.fromEntries(
    Object.entries(parameters).map(([name, parameter]) => [
      name,
      parameter.aliases ? { ...parameter, aliases: [...parameter.aliases] } : { ...parameter },
    ]),
  ) as Record<string, ParameterTemplate>;

  const automaticOwners = new Map<string, string>(
    assignments.map((assignment) => [
      assignment.alias,
      `${assignment.target.node_id}_${assignment.target.input}`,
    ]),
  );
  const manualOwners = new Map<string, string>();
  for (const [name, parameter] of Object.entries(result)) {
    const previous = existing?.[name];
    if (!previous || !sameTarget(parameter.target, previous.target)) continue;
    const aliases = [
      ...new Set((previous.aliases ?? []).filter((alias) => automaticOwners.get(alias) !== name)),
    ];
    if (aliases.length > 0) parameter.aliases = aliases;
    for (const alias of aliases) {
      if (!manualOwners.has(alias)) manualOwners.set(alias, name);
    }
  }

  for (const assignment of assignments) {
    const name = `${assignment.target.node_id}_${assignment.target.input}`;
    const parameter = result[name];
    if (!parameter) continue;
    parameter.role = assignment.role;
    parameter.description = descriptionFor(assignment, assignment.target.input);

    const manualOwner = manualOwners.get(assignment.alias);
    if (manualOwner && manualOwner !== name) continue;
    parameter.aliases = [...new Set([...(parameter.aliases ?? []), assignment.alias])];
  }

  return Object.fromEntries(
    Object.entries(result).map(([name, parameter]) => [
      name,
      {
        type: parameter.type,
        target: parameter.target,
        ...(parameter.description !== undefined ? { description: parameter.description } : {}),
        ...(parameter.role !== undefined ? { role: parameter.role } : {}),
        ...(parameter.aliases && parameter.aliases.length > 0
          ? { aliases: parameter.aliases }
          : {}),
        ...(parameter.min !== undefined ? { min: parameter.min } : {}),
        ...(parameter.max !== undefined ? { max: parameter.max } : {}),
        ...(Object.hasOwn(parameter, "default") ? { default: parameter.default } : {}),
        ...(parameter.required !== undefined ? { required: parameter.required } : {}),
        ...(parameter.choices !== undefined ? { choices: parameter.choices } : {}),
        ...(parameter.recommended !== undefined ? { recommended: parameter.recommended } : {}),
      },
    ]),
  ) as Record<string, ParameterTemplate>;
};
