import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadColabCatalogFile } from "../src/colab/catalog.js";
import { buildPresetTemplate } from "../src/cli/import.js";
import { inferAliases } from "../src/preset/aliases.js";
import { PresetSchema } from "../src/preset/schema.js";
import { normalizeWorkflow } from "../src/workflow/normalize.js";

type ApiNode = { class_type: string; inputs: Record<string, unknown> };
type ApiWorkflow = Record<string, ApiNode>;

const colabDir = path.join(process.cwd(), "scripts", "colab");
const workflowPath = path.join(colabDir, "flux1", "flux1_dev_lora.json");
const catalogPath = path.join(colabDir, "catalog.yaml");

describe("Flux 1 character LoRA Colab workflow", () => {
  it("is an API workflow with one empty LoRA slot connected to KSampler", async () => {
    const raw = JSON.parse(await fs.readFile(workflowPath, "utf-8")) as ApiWorkflow;
    const workflow = normalizeWorkflow(raw);

    expect(workflow).toEqual(raw);
    for (const node of Object.values(raw)) {
      expect(node).toEqual(
        expect.objectContaining({
          class_type: expect.any(String),
          inputs: expect.any(Object),
        }),
      );
    }

    const loraNodes = Object.entries(raw).filter(
      ([, node]) => node.class_type === "LoraLoaderModelOnly",
    );
    expect(loraNodes).toHaveLength(1);
    const [loraNodeId, loraNode] = loraNodes[0]!;
    expect(loraNode.inputs).toEqual({
      lora_name: "",
      strength_model: 1,
      model: ["1", 0],
    });

    const samplers = Object.values(raw).filter((node) => node.class_type === "KSampler");
    expect(samplers).toHaveLength(1);
    expect(samplers[0]!.inputs.model).toEqual([loraNodeId, 0]);
  });

  it("imports LoRA roles and keeps prompt alias inference", async () => {
    const workflow = JSON.parse(await fs.readFile(workflowPath, "utf-8")) as ApiWorkflow;
    const preset = PresetSchema.parse(
      buildPresetTemplate("flux1_lora", "flux1_dev_lora.json", workflow, null),
    );
    const loraParameter = Object.values(preset.parameters ?? {}).find(
      (parameter) => parameter.role === "lora",
    );
    const strengthParameter = Object.values(preset.parameters ?? {}).find(
      (parameter) => parameter.role === "lora_strength",
    );

    expect(loraParameter).toMatchObject({ role: "lora", default: "" });
    expect(strengthParameter).toMatchObject({ role: "lora_strength", default: 1 });
    expect(inferAliases(workflow)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          alias: "prompt",
          target: { node_id: "2", input: "text" },
        }),
      ]),
    );
    expect(preset.parameters?.["2_text"]?.aliases).toContain("prompt");
  });

  it("is listed in the catalog with the LoRA capability", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const flux1 = catalog.kits.find((kit) => kit.name === "flux1");
    const workflow = flux1?.workflows.find((item) => item.name === "flux1_dev_lora");

    expect(flux1?.status).toBe("verified");
    expect(workflow).toMatchObject({
      file: "flux1_dev_lora.json",
      task: "text_to_image",
      capabilities: ["lora"],
      speed: "slow",
      quality: "high",
    });
  });
});
