import { t } from "../i18n/index.js";

export type Workflow = Record<string, unknown>;

export type ObjectInfoNode = {
  input?: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
    hidden?: Record<string, unknown>;
  };
  input_order?: {
    required?: string[];
    optional?: string[];
    hidden?: string[];
  };
};

export type WorkflowObjectInfo = Record<string, ObjectInfoNode>;

export type NormalizeWorkflowOptions = {
  objectInfo?: WorkflowObjectInfo | null;
};

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
  mode?: unknown;
  inputs?: unknown;
  widgets_values?: unknown;
  title?: unknown;
};

type UiLink = {
  id: number;
  originId: number;
  originSlot: number;
  targetId: number;
  targetSlot: number;
};

type SubgraphPort = {
  name?: unknown;
  type?: unknown;
};

type SubgraphDefinition = {
  id: string;
  inputs: SubgraphPort[];
  outputs: SubgraphPort[];
  nodes: UiWorkflowNode[];
  links: UiLink[];
};

type ResolvedInput = unknown;

type GraphContext = {
  nodes: UiWorkflowNode[];
  nodeMap: Map<number, UiWorkflowNode>;
  links: Map<number, UiLink>;
  prefix: string;
  boundaryValues?: ResolvedInput[];
};

const UI_NON_EXECUTION_NODE_TYPES = new Set(["MarkdownNote"]);
const WIDGET_INPUT_TYPES = new Set(["INT", "FLOAT", "NUMBER", "STRING", "BOOLEAN", "COMBO"]);
const DYNAMIC_COMBO_INPUT_TYPE = "COMFY_DYNAMICCOMBO_V3";

const isUiWorkflow = (value: unknown): value is Record<string, unknown> => {
  if (!isPlainObject(value)) return false;
  return Array.isArray(value.nodes) && Array.isArray(value.links);
};

const toUiWorkflowNode = (value: unknown): UiWorkflowNode | null => {
  if (!isPlainObject(value)) return null;
  return value as UiWorkflowNode;
};

const nodeId = (node: UiWorkflowNode): number | null => {
  return typeof node.id === "number" && Number.isInteger(node.id) ? node.id : null;
};

const nodeType = (node: UiWorkflowNode): string | null => {
  return typeof node.type === "string" && node.type.length > 0 ? node.type : null;
};

const nodeInputs = (node: UiWorkflowNode): UiWorkflowNodeInput[] => {
  return Array.isArray(node.inputs) ? (node.inputs as UiWorkflowNodeInput[]) : [];
};

const nodeWidgetValues = (node: UiWorkflowNode): unknown[] => {
  return Array.isArray(node.widgets_values) ? node.widgets_values : [];
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
  if (Array.isArray(inputType)) return typeof value === "string";
  if (typeof inputType !== "string") return true;
  if (inputType.includes(",")) {
    return inputType.split(",").some((type) => matchesWidgetValueType(type.trim(), value));
  }
  if (inputType === "INT") return typeof value === "number" && Number.isInteger(value);
  if (inputType === "FLOAT" || inputType === "NUMBER") return typeof value === "number";
  if (inputType === "BOOLEAN") return typeof value === "boolean";
  if (inputType === "STRING" || inputType === "COMBO") return typeof value === "string";
  return true;
};

const parseArrayUiLink = (item: unknown): UiLink | null => {
  if (!Array.isArray(item) || item.length < 5) return null;
  const [id, originId, originSlot, targetId, targetSlot] = item;
  if (
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    typeof originId !== "number" ||
    !Number.isInteger(originId) ||
    typeof originSlot !== "number" ||
    !Number.isInteger(originSlot) ||
    typeof targetId !== "number" ||
    !Number.isInteger(targetId) ||
    typeof targetSlot !== "number" ||
    !Number.isInteger(targetSlot)
  ) {
    return null;
  }
  return { id, originId, originSlot, targetId, targetSlot };
};

const parseObjectUiLink = (item: unknown): UiLink | null => {
  if (!isPlainObject(item)) return null;
  const { id, origin_id: originId, origin_slot: originSlot, target_id: targetId, target_slot: targetSlot } =
    item;
  if (
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    typeof originId !== "number" ||
    !Number.isInteger(originId) ||
    typeof originSlot !== "number" ||
    !Number.isInteger(originSlot) ||
    typeof targetId !== "number" ||
    !Number.isInteger(targetId) ||
    typeof targetSlot !== "number" ||
    !Number.isInteger(targetSlot)
  ) {
    return null;
  }
  return { id, originId, originSlot, targetId, targetSlot };
};

const toLinkMap = (links: UiLink[]): Map<number, UiLink> => {
  return new Map(links.map((link) => [link.id, link]));
};

const toUiLinkMap = (links: unknown[]): Map<number, [number, number]> => {
  const map = new Map<number, [number, number]>();
  for (const item of links) {
    const link = parseArrayUiLink(item);
    if (!link) continue;
    map.set(link.id, [link.originId, link.originSlot]);
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
    const id = nodeId(node);
    const type = nodeType(node);
    if (id === null || !type) continue;
    if (UI_NON_EXECUTION_NODE_TYPES.has(type)) continue;

    const inputsArray = nodeInputs(node);
    const widgetsValues = nodeWidgetValues(node);
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
          if (!matchesWidgetValueType(input.type, candidateValue)) continue;
          normalizedInputs[inputName] = candidateValue;
          break;
        }
      }
    }

    const apiNode: Record<string, unknown> = {
      class_type: type,
      inputs: normalizedInputs,
    };

    if (typeof node.title === "string" && node.title.length > 0) {
      apiNode._meta = { title: node.title };
    }

    workflow[String(id)] = apiNode;
  }

  return isApiWorkflow(workflow) ? workflow : null;
};

const extractSubgraphDefinitions = (raw: Record<string, unknown>): Map<string, SubgraphDefinition> => {
  const definitions = isPlainObject(raw.definitions) ? raw.definitions : null;
  const subgraphs = definitions && Array.isArray(definitions.subgraphs) ? definitions.subgraphs : [];
  const result = new Map<string, SubgraphDefinition>();

  for (const rawDefinition of subgraphs) {
    if (!isPlainObject(rawDefinition) || typeof rawDefinition.id !== "string") continue;
    if (!Array.isArray(rawDefinition.nodes) || !Array.isArray(rawDefinition.links)) continue;
    const nodes = rawDefinition.nodes
      .map(toUiWorkflowNode)
      .filter((node): node is UiWorkflowNode => node !== null);
    const links = rawDefinition.links
      .map(parseObjectUiLink)
      .filter((link): link is UiLink => link !== null);
    result.set(rawDefinition.id, {
      id: rawDefinition.id,
      inputs: Array.isArray(rawDefinition.inputs)
        ? (rawDefinition.inputs.filter(isPlainObject) as SubgraphPort[])
        : [],
      outputs: Array.isArray(rawDefinition.outputs)
        ? (rawDefinition.outputs.filter(isPlainObject) as SubgraphPort[])
        : [],
      nodes,
      links,
    });
  }

  return result;
};

export const workflowHasSubgraphs = (raw: unknown): boolean => {
  if (!isPlainObject(raw) || !isUiWorkflow(raw)) return false;
  const definitions = extractSubgraphDefinitions(raw);
  if (definitions.size === 0) return false;
  return (raw.nodes as unknown[]).some((rawNode) => {
    const node = toUiWorkflowNode(rawNode);
    const type = node ? nodeType(node) : null;
    return type !== null && definitions.has(type);
  });
};

const inputSpec = (nodeInfo: ObjectInfoNode, name: string): unknown => {
  return nodeInfo.input?.required?.[name] ?? nodeInfo.input?.optional?.[name];
};

const orderedInputNames = (nodeInfo: ObjectInfoNode): string[] => {
  const required = nodeInfo.input_order?.required ?? Object.keys(nodeInfo.input?.required ?? {});
  const optional = nodeInfo.input_order?.optional ?? Object.keys(nodeInfo.input?.optional ?? {});
  return [...required, ...optional];
};

const isWidgetSpec = (spec: unknown): boolean => {
  if (!Array.isArray(spec) || spec.length === 0) return false;
  const type = spec[0];
  const options = isPlainObject(spec[1]) ? spec[1] : null;
  if (options?.forceInput === true) return false;
  if (Array.isArray(type)) return true;
  return (
    typeof type === "string" &&
    type.split(",").some((part) => WIDGET_INPUT_TYPES.has(part.trim().toUpperCase()))
  );
};

const widgetTypeForSpec = (spec: unknown): unknown => {
  return Array.isArray(spec) && spec.length > 0 ? spec[0] : undefined;
};

const isDynamicComboSpec = (spec: unknown): boolean => {
  if (!Array.isArray(spec) || spec.length < 2) return false;
  return typeof spec[0] === "string" && spec[0].toUpperCase() === DYNAMIC_COMBO_INPUT_TYPE;
};

const dynamicComboOptions = (spec: unknown): Record<string, unknown>[] => {
  if (!isDynamicComboSpec(spec)) return [];
  const dynamicSpec = spec as unknown[];
  const options = isPlainObject(dynamicSpec[1]) ? dynamicSpec[1].options : undefined;
  return Array.isArray(options) ? options.filter(isPlainObject) : [];
};

const dynamicComboInputNames = (option: Record<string, unknown>): string[] => {
  const inputs = isPlainObject(option.inputs) ? option.inputs : {};
  const required = isPlainObject(inputs.required) ? Object.keys(inputs.required) : [];
  const optional = isPlainObject(inputs.optional) ? Object.keys(inputs.optional) : [];
  return [...required, ...optional];
};

const dynamicComboInputSpec = (option: Record<string, unknown>, name: string): unknown => {
  const inputs = isPlainObject(option.inputs) ? option.inputs : {};
  const required = isPlainObject(inputs.required) ? inputs.required : {};
  const optional = isPlainObject(inputs.optional) ? inputs.optional : {};
  return required[name] ?? optional[name];
};

const mapWidgetValues = (
  node: UiWorkflowNode,
  nodeInfo: ObjectInfoNode,
): Record<string, unknown> => {
  const values = nodeWidgetValues(node);
  const result: Record<string, unknown> = {};
  let valueIndex = 0;

  const takeNextValue = (expectedType: unknown): { found: boolean; value?: unknown } => {
    while (valueIndex < values.length) {
      const candidate = values[valueIndex];
      valueIndex += 1;
      if (!matchesWidgetValueType(expectedType, candidate)) continue;
      return { found: true, value: candidate };
    }
    return { found: false };
  };

  for (const name of orderedInputNames(nodeInfo)) {
    const spec = inputSpec(nodeInfo, name);
    if (isDynamicComboSpec(spec)) {
      const options = dynamicComboOptions(spec);
      const optionKeys = new Set(
        options.map((option) => option.key).filter((key): key is string => typeof key === "string"),
      );
      let selectedKey: string | undefined;
      while (valueIndex < values.length) {
        const candidate = values[valueIndex];
        valueIndex += 1;
        if (typeof candidate !== "string" || !optionKeys.has(candidate)) continue;
        selectedKey = candidate;
        break;
      }
      if (selectedKey === undefined) continue;
      result[name] = selectedKey;

      const selected = options.find((option) => option.key === selectedKey);
      if (!selected) continue;
      for (const nestedName of dynamicComboInputNames(selected)) {
        const nestedSpec = dynamicComboInputSpec(selected, nestedName);
        if (!isWidgetSpec(nestedSpec)) continue;
        const nestedValue = takeNextValue(widgetTypeForSpec(nestedSpec));
        if (nestedValue.found) result[`${name}.${nestedName}`] = nestedValue.value;
      }
      continue;
    }

    if (!isWidgetSpec(spec)) continue;
    const nextValue = takeNextValue(widgetTypeForSpec(spec));
    if (nextValue.found) result[name] = nextValue.value;
  }

  return result;
};

const mapSubgraphWidgetValues = (
  node: UiWorkflowNode,
  definition: SubgraphDefinition,
  widgetPortIndexes: Set<number>,
): Map<number, unknown> => {
  const values = nodeWidgetValues(node);
  const result = new Map<number, unknown>();
  let valueIndex = 0;

  definition.inputs.forEach((input, inputIndex) => {
    if (!widgetPortIndexes.has(inputIndex)) return;
    while (valueIndex < values.length) {
      const candidate = values[valueIndex];
      valueIndex += 1;
      if (!matchesWidgetValueType(input.type, candidate)) continue;
      result.set(inputIndex, candidate);
      break;
    }
  });

  return result;
};

const executionId = (context: GraphContext, id: number) => {
  return context.prefix ? `${context.prefix}:${id}` : String(id);
};

const makeGraphContext = (
  nodes: UiWorkflowNode[],
  links: UiLink[],
  prefix = "",
  boundaryValues?: ResolvedInput[],
): GraphContext => {
  const nodeMap = new Map<number, UiWorkflowNode>();
  for (const node of nodes) {
    const id = nodeId(node);
    if (id !== null) nodeMap.set(id, node);
  }
  return { nodes, nodeMap, links: toLinkMap(links), prefix, boundaryValues };
};

const isDisabledNode = (node: UiWorkflowNode) => node.mode === 2 || node.mode === 4;

const assertExecutableMode = (node: UiWorkflowNode, type: string) => {
  const mode = node.mode ?? 0;
  if (mode !== 0 && mode !== 2 && mode !== 4) {
    throw new Error(t("workflow.subgraph_mode_unsupported", { type, mode: String(mode) }));
  }
};

const assertDisabledNodesUnreferenced = (context: GraphContext) => {
  for (const node of context.nodes) {
    const id = nodeId(node);
    const type = nodeType(node);
    if (
      id === null ||
      !type ||
      UI_NON_EXECUTION_NODE_TYPES.has(type) ||
      !isDisabledNode(node)
    ) {
      continue;
    }

    const reference = [...context.links.values()].find((link) => {
      if (link.originId !== id) return false;
      if (link.targetId === -20) return true;
      const consumer = context.nodeMap.get(link.targetId);
      const consumerType = consumer ? nodeType(consumer) : null;
      return Boolean(
        consumer &&
          consumerType &&
          !UI_NON_EXECUTION_NODE_TYPES.has(consumerType) &&
          !isDisabledNode(consumer),
      );
    });
    if (!reference) continue;

    const consumerNode = context.nodeMap.get(reference.targetId);
    const consumer =
      reference.targetId === -20
        ? "subgraph output"
        : (consumerNode && nodeType(consumerNode)) ?? String(reference.targetId);
    throw new Error(t("workflow.disabled_node_referenced", { type, consumer }));
  }
};

const convertSubgraphWorkflowToApi = (
  raw: Record<string, unknown>,
  objectInfo: WorkflowObjectInfo,
): Workflow => {
  const definitions = extractSubgraphDefinitions(raw);
  const rootNodes = (raw.nodes as unknown[])
    .map(toUiWorkflowNode)
    .filter((node): node is UiWorkflowNode => node !== null);
  const rootLinks = (raw.links as unknown[])
    .map(parseArrayUiLink)
    .filter((link): link is UiLink => link !== null);
  const workflow: Workflow = {};
  const resolvingOutputs = new Set<string>();
  const resolvingPortKinds = new Set<string>();

  const isBoundaryWidgetPort = (
    definition: SubgraphDefinition,
    inputIndex: number,
  ): boolean => {
    const cycleKey = `${definition.id}:${inputIndex}`;
    if (resolvingPortKinds.has(cycleKey)) {
      throw new Error(t("workflow.subgraph_cycle", { id: cycleKey }));
    }
    resolvingPortKinds.add(cycleKey);
    try {
      const boundaryLinks = definition.links.filter(
        (link) => link.originId === -10 && link.originSlot === inputIndex,
      );
      if (boundaryLinks.length === 0) return false;

      const classifications = boundaryLinks.map((link) => {
        const targetNode = definition.nodes.find((node) => nodeId(node) === link.targetId);
        const type = targetNode ? nodeType(targetNode) : null;
        if (!targetNode || !type) throw new Error(t("workflow.subgraph_invalid"));
        const targetInput = nodeInputs(targetNode)[link.targetSlot];
        const targetInputName = targetInput ? toInputName(targetInput) : null;
        if (!targetInputName) throw new Error(t("workflow.subgraph_invalid"));

        const nestedDefinition = definitions.get(type);
        if (nestedDefinition) {
          const nestedInputIndex = nestedDefinition.inputs.findIndex(
            (input) => input.name === targetInputName,
          );
          if (nestedInputIndex < 0) throw new Error(t("workflow.subgraph_invalid"));
          return isBoundaryWidgetPort(nestedDefinition, nestedInputIndex);
        }

        const info = objectInfo[type];
        if (!info) throw new Error(t("workflow.subgraph_node_info_missing", { type }));
        return isWidgetSpec(inputSpec(info, targetInputName));
      });

      if (classifications.some((value) => value !== classifications[0])) {
        throw new Error(t("workflow.subgraph_invalid"));
      }
      return classifications[0] ?? false;
    } finally {
      resolvingPortKinds.delete(cycleKey);
    }
  };

  const resolveOrigin = (
    context: GraphContext,
    originId: number,
    originSlot: number,
  ): ResolvedInput | undefined => {
    if (originId === -10) return context.boundaryValues?.[originSlot];
    const originNode = context.nodeMap.get(originId);
    if (!originNode) return undefined;
    const type = nodeType(originNode);
    if (!type) return undefined;
    const definition = definitions.get(type);
    if (!definition) return [executionId(context, originId), originSlot];

    const cycleKey = `${executionId(context, originId)}:${originSlot}`;
    if (resolvingOutputs.has(cycleKey)) {
      throw new Error(t("workflow.subgraph_cycle", { id: cycleKey }));
    }
    resolvingOutputs.add(cycleKey);
    try {
      const subgraphContext = createSubgraphContext(context, originNode, definition);
      const outputLink = definition.links.find(
        (link) => link.targetId === -20 && link.targetSlot === originSlot,
      );
      if (!outputLink) return undefined;
      return resolveOrigin(subgraphContext, outputLink.originId, outputLink.originSlot);
    } finally {
      resolvingOutputs.delete(cycleKey);
    }
  };

  const resolveNodeInput = (
    context: GraphContext,
    input: UiWorkflowNodeInput,
  ): ResolvedInput | undefined => {
    const linkId = toLinkId(input);
    if (linkId === null) return undefined;
    const link = context.links.get(linkId);
    if (!link) return undefined;
    return resolveOrigin(context, link.originId, link.originSlot);
  };

  const resolveBoundaryValues = (
    parentContext: GraphContext,
    containerNode: UiWorkflowNode,
    definition: SubgraphDefinition,
  ): ResolvedInput[] => {
    const containerInputs = nodeInputs(containerNode);
    const containerInputByName = new Map<string, UiWorkflowNodeInput>();
    for (const input of containerInputs) {
      const name = toInputName(input);
      if (name) containerInputByName.set(name, input);
    }
    const widgetPortIndexes = new Set<number>();
    definition.inputs.forEach((_, index) => {
      if (isBoundaryWidgetPort(definition, index)) widgetPortIndexes.add(index);
    });
    const widgetValues = mapSubgraphWidgetValues(containerNode, definition, widgetPortIndexes);

    return definition.inputs.map((port, index) => {
      const input = typeof port.name === "string" ? containerInputByName.get(port.name) : undefined;
      const linked = input ? resolveNodeInput(parentContext, input) : undefined;
      return linked !== undefined ? linked : widgetValues.get(index);
    });
  };

  function createSubgraphContext(
    parentContext: GraphContext,
    containerNode: UiWorkflowNode,
    definition: SubgraphDefinition,
  ): GraphContext {
    const id = nodeId(containerNode);
    if (id === null) throw new Error(t("workflow.subgraph_invalid"));
    const boundaryValues = resolveBoundaryValues(parentContext, containerNode, definition);
    return makeGraphContext(definition.nodes, definition.links, executionId(parentContext, id), boundaryValues);
  }

  const flattenGraph = (context: GraphContext) => {
    for (const node of context.nodes) {
      const type = nodeType(node);
      if (!type || UI_NON_EXECUTION_NODE_TYPES.has(type)) continue;
      assertExecutableMode(node, type);
    }
    assertDisabledNodesUnreferenced(context);

    for (const node of context.nodes) {
      const id = nodeId(node);
      const type = nodeType(node);
      if (id === null || !type || UI_NON_EXECUTION_NODE_TYPES.has(type)) continue;
      if (isDisabledNode(node)) continue;

      const definition = definitions.get(type);
      if (definition) {
        flattenGraph(createSubgraphContext(context, node, definition));
        continue;
      }

      const info = objectInfo[type];
      if (!info) {
        throw new Error(t("workflow.subgraph_node_info_missing", { type }));
      }

      const normalizedInputs = mapWidgetValues(node, info);
      for (const input of nodeInputs(node)) {
        const name = toInputName(input);
        if (!name) continue;
        const resolved = resolveNodeInput(context, input);
        if (resolved !== undefined) normalizedInputs[name] = resolved;
      }

      const apiNode: Record<string, unknown> = {
        class_type: type,
        inputs: normalizedInputs,
      };
      if (typeof node.title === "string" && node.title.length > 0) {
        apiNode._meta = { title: node.title };
      }
      workflow[executionId(context, id)] = apiNode;
    }
  };

  flattenGraph(makeGraphContext(rootNodes, rootLinks));
  if (!isApiWorkflow(workflow)) throw new Error(t("workflow.subgraph_invalid"));
  return workflow;
};

export const normalizeWorkflow = (raw: unknown, options: NormalizeWorkflowOptions = {}): Workflow => {
  if (isApiWorkflow(raw)) return raw;

  if (isPlainObject(raw)) {
    if (isUiWorkflow(raw)) {
      if (workflowHasSubgraphs(raw)) {
        if (!options.objectInfo) throw new Error(t("workflow.subgraph_object_info_required"));
        return convertSubgraphWorkflowToApi(raw, options.objectInfo);
      }
      const converted = convertUiWorkflowToApiWorkflow(raw);
      if (converted) return converted;
    }

    const candidate = raw.prompt ?? raw.workflow;
    if (isApiWorkflow(candidate)) return candidate;
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
