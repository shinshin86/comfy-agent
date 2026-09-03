import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadColabCatalogFile } from "../src/colab/catalog.js";
import { buildPresetTemplate } from "../src/cli/import.js";
import {
  normalizeWorkflow,
  workflowHasSubgraphs,
  type Workflow,
  type WorkflowObjectInfo,
} from "../src/workflow/normalize.js";

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

describe("Colab kit alias coverage", () => {
  it("meets the alias coverage thresholds for importable workflows", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const aliasesByKit = new Map<string, Set<string>>();
    const importFailures: string[] = [];

    expect(catalog.kits).toHaveLength(39);
    for (const kit of catalog.kits) {
      const kitAliases = aliasesByKit.get(kit.name) ?? new Set<string>();
      aliasesByKit.set(kit.name, kitAliases);
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
        const preset = buildPresetTemplate(
          workflowEntry.name,
          workflowEntry.file,
          workflow,
          objectInfo,
        );
        for (const parameter of Object.values(preset.parameters ?? {})) {
          for (const alias of parameter.aliases ?? []) kitAliases.add(alias);
        }
      }
    }

    const count = (alias: string) =>
      [...aliasesByKit.values()].filter((aliases) => aliases.has(alias)).length;
    const summary = {
      prompt: count("prompt"),
      negative: count("negative"),
      steps: count("steps"),
      cfg: count("cfg"),
      width: count("width"),
      height: count("height"),
    };
    const withoutPrompt = catalog.kits
      .filter((kit) => !aliasesByKit.get(kit.name)?.has("prompt"))
      .map((kit) => kit.name);

    expect(importFailures).toEqual([]);
    expect(summary).toEqual({
      prompt: 37,
      negative: 25,
      steps: 36,
      cfg: 33,
      width: 31,
      height: 31,
    });
    expect(withoutPrompt).toEqual(["birefnet", "seedvr2"]);
    expect(summary.prompt).toBeGreaterThanOrEqual(34);
    expect(summary.steps).toBeGreaterThanOrEqual(30);
    expect(summary.cfg).toBeGreaterThanOrEqual(30);
    expect(summary.width).toBeGreaterThanOrEqual(25);
    expect(summary.height).toBeGreaterThanOrEqual(25);
    expect([...aliasesByKit.values()].some((aliases) => aliases.has("seed"))).toBe(false);
  });
});
