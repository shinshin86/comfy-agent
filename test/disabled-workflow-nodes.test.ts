import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeWorkflow,
  type WorkflowObjectInfo,
} from "../src/workflow/normalize.js";

type JsonObject = Record<string, unknown>;

const asRecord = (value: unknown): JsonObject | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;

const inferFixtureObjectInfo = (raw: unknown): WorkflowObjectInfo => {
  const specs = new Map<string, { required: Record<string, unknown>; order: string[] }>();
  const visitNode = (value: unknown) => {
    const node = asRecord(value);
    if (!node || typeof node.type !== "string") return;
    const entry = specs.get(node.type) ?? { required: {}, order: [] };
    for (const value of Array.isArray(node.inputs) ? node.inputs : []) {
      const input = asRecord(value);
      if (!input || typeof input.name !== "string") continue;
      const inputType = typeof input.type === "string" ? input.type : "*";
      const widget = asRecord(input.widget);
      if (!(input.name in entry.required) || widget) {
        entry.required[input.name] = widget ? [inputType] : [inputType, { forceInput: true }];
      }
      if (!entry.order.includes(input.name)) entry.order.push(input.name);
    }
    specs.set(node.type, entry);
  };

  const root = asRecord(raw);
  for (const node of root && Array.isArray(root.nodes) ? root.nodes : []) visitNode(node);
  const definitions = asRecord(root?.definitions);
  for (const value of definitions && Array.isArray(definitions.subgraphs)
    ? definitions.subgraphs
    : []) {
    const subgraph = asRecord(value);
    for (const node of subgraph && Array.isArray(subgraph.nodes) ? subgraph.nodes : []) {
      visitNode(node);
    }
  }

  return Object.fromEntries(
    [...specs].map(([type, entry]) => [
      type,
      { input: { required: entry.required }, input_order: { required: entry.order } },
    ]),
  );
};

const syntheticWorkflow = (mode: number, referenced: boolean) => ({
  nodes: [{ id: 5, type: "test-subgraph", mode: 0, inputs: [], widgets_values: [] }],
  links: [],
  definitions: {
    subgraphs: [
      {
        id: "test-subgraph",
        inputs: [],
        outputs: [],
        nodes: [
          { id: 1, type: "DisabledSource", mode, inputs: [], widgets_values: [] },
          {
            id: 2,
            type: "Consumer",
            mode: 0,
            inputs: referenced ? [{ name: "source", type: "DATA", link: 100 }] : [],
            widgets_values: [],
          },
        ],
        links: referenced
          ? [{ id: 100, origin_id: 1, origin_slot: 0, target_id: 2, target_slot: 0 }]
          : [],
      },
    ],
  },
});

const syntheticObjectInfo: WorkflowObjectInfo = {
  DisabledSource: { input: { required: {} }, input_order: { required: [] } },
  Consumer: {
    input: { required: { source: ["DATA", { forceInput: true }] } },
    input_order: { required: ["source"] },
  },
};

describe("disabled UI workflow nodes", () => {
  it.each([2, 4])("drops an unreferenced node in mode %s", (mode) => {
    expect(
      normalizeWorkflow(syntheticWorkflow(mode, false), { objectInfo: syntheticObjectInfo }),
    ).toEqual({ "5:2": { class_type: "Consumer", inputs: {} } });
  });

  it("rejects a disabled node whose output is still referenced", () => {
    expect(() =>
      normalizeWorkflow(syntheticWorkflow(4, true), { objectInfo: syntheticObjectInfo }),
    ).toThrow("Disabled node DisabledSource is referenced by Consumer");
  });

  it("keeps mode 0 nodes unchanged", () => {
    expect(
      normalizeWorkflow(syntheticWorkflow(0, true), { objectInfo: syntheticObjectInfo }),
    ).toEqual({
      "5:1": { class_type: "DisabledSource", inputs: {} },
      "5:2": { class_type: "Consumer", inputs: { source: ["5:1", 0] } },
    });
  });

  it("imports the LTX image-and-audio workflow after dropping its unused RecordAudio node", async () => {
    const workflowPath = path.join(
      process.cwd(),
      "scripts",
      "colab",
      "ltx23",
      "video_ltx2_3_ia2v.json",
    );
    const raw = JSON.parse(await fs.readFile(workflowPath, "utf-8")) as unknown;
    const normalized = normalizeWorkflow(raw, { objectInfo: inferFixtureObjectInfo(raw) });

    expect(Object.values(normalized)).not.toContainEqual(
      expect.objectContaining({ class_type: "RecordAudio" }),
    );
    expect(Object.keys(normalized).length).toBeGreaterThan(0);
  });
});
