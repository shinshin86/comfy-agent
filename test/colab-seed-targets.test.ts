import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadColabCatalogFile } from "../src/colab/catalog.js";
import { buildPresetTemplate } from "../src/cli/import.js";
import { applySeedValue, resolveSeedTargets } from "../src/cli/run/args.js";
import { PresetSchema } from "../src/preset/schema.js";
import {
  normalizeWorkflow,
  workflowHasSubgraphs,
  type Workflow,
  type WorkflowObjectInfo,
} from "../src/workflow/normalize.js";
import { applyParameters } from "../src/workflow/patch.js";

type JsonObject = Record<string, unknown>;

const colabDir = path.join(process.cwd(), "scripts", "colab");
const catalogPath = path.join(colabDir, "catalog.yaml");

const asRecord = (value: unknown): JsonObject | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;

const inferFixtureObjectInfo = (raw: unknown): WorkflowObjectInfo => {
  const inputSpecs = new Map<string, { required: Record<string, unknown>; order: string[] }>();
  const visitNode = (value: unknown) => {
    const node = asRecord(value);
    if (!node || typeof node.type !== "string") return;
    const entry = inputSpecs.get(node.type) ?? { required: {}, order: [] };
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
    inputSpecs.set(node.type, entry);
  };

  const root = asRecord(raw);
  for (const node of root && Array.isArray(root.nodes) ? root.nodes : []) visitNode(node);
  const definitions = asRecord(root?.definitions);
  const subgraphs =
    definitions && Array.isArray(definitions.subgraphs) ? definitions.subgraphs : [];
  for (const value of subgraphs) {
    const subgraph = asRecord(value);
    for (const node of subgraph && Array.isArray(subgraph.nodes) ? subgraph.nodes : []) {
      visitNode(node);
    }
  }

  return Object.fromEntries(
    [...inputSpecs].map(([type, entry]) => [
      type,
      {
        input: { required: entry.required },
        input_order: { required: entry.order },
      },
    ]),
  );
};

describe("Colab kit seed targets", () => {
  it("applies --seed to imported presets for at least 34 of 37 kits", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const supportedKits = new Set<string>();
    const importFailures: string[] = [];

    expect(catalog.kits).toHaveLength(37);
    for (const kit of catalog.kits) {
      for (const workflowEntry of kit.workflows) {
        const relativePath = path.posix.join(kit.path, workflowEntry.file);
        const workflowPath = path.join(colabDir, kit.path, workflowEntry.file);
        const raw = JSON.parse(await fs.readFile(workflowPath, "utf-8")) as unknown;
        const objectInfo = workflowHasSubgraphs(raw) ? inferFixtureObjectInfo(raw) : null;
        let workflow: Workflow;
        try {
          workflow = normalizeWorkflow(raw, { objectInfo });
        } catch {
          importFailures.push(relativePath);
          continue;
        }
        const preset = PresetSchema.parse(
          buildPresetTemplate(workflowEntry.name, workflowEntry.file, workflow, objectInfo),
        );
        const roleSeedParams = Object.entries(preset.parameters ?? {})
          .filter(([, def]) => def.role === "seed")
          .map(([param]) => param);
        const targets = resolveSeedTargets(preset);

        expect(targets.map((target) => target.param)).toEqual(roleSeedParams);
        if (targets.length === 0) continue;
        supportedKits.add(kit.name);

        const patched = applyParameters(workflow, preset, applySeedValue({}, targets, 42));
        for (const target of targets) {
          const definition = preset.parameters![target.param]!;
          const node = patched[String(definition.target.node_id)] as JsonObject;
          const inputs = node.inputs as JsonObject;
          expect(inputs[definition.target.input]).toBe(42);
        }
      }
    }

    expect(importFailures).toEqual([]);
    expect(supportedKits.size).toBeGreaterThanOrEqual(34);
    expect(supportedKits.size).toBe(36);

    const kitsWithoutSeed = catalog.kits
      .filter((kit) => !supportedKits.has(kit.name))
      .map((kit) => kit.name);
    // BiRefNet performs deterministic background removal and has no sampling seed input.
    expect(kitsWithoutSeed).toEqual(["birefnet"]);
  });
});
