import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPresetTemplate } from "../src/cli/import.js";
import { applySeedValue, resolveSeedTargets } from "../src/cli/run/args.js";
import { buildColabSuggestPayload, loadColabCatalogFile } from "../src/colab/catalog.js";
import { PresetSchema } from "../src/preset/schema.js";
import { normalizeWorkflow } from "../src/workflow/normalize.js";
import { applyParameters } from "../src/workflow/patch.js";

const kitDir = path.join(process.cwd(), "scripts/colab/minimax_h3_image");

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

const load = async (name: string) => {
  const graph = normalizeWorkflow(
    JSON.parse(await fs.readFile(path.join(kitDir, `${name}.json`), "utf8")),
  ) as Graph;
  const preset = PresetSchema.parse(buildPresetTemplate(name, `${name}.json`, graph, null));
  return { graph, preset };
};

const workflows = [
  ["minimax_h3_image_t2i", 0],
  ["minimax_h3_image_edit", 1],
  ["minimax_h3_image_edit_2ref", 2],
  ["minimax_h3_image_edit_3ref", 3],
] as const;

describe("MiniMax-H3-Image Colab kit", () => {
  it("routes an image request naming the model to the A100 kit", async () => {
    const catalog = await loadColabCatalogFile("scripts/colab/catalog.yaml");
    const result = buildColabSuggestPayload(catalog, {
      goal: "MiniMax H3 Image で画像を生成",
      gpu: "A100",
    });
    expect(result.suggestions[0]).toMatchObject({
      kit: "minimax_h3_image",
      composable: false,
      gpu: { minimum: "A100", recommended: "A100" },
    });
  });

  it("does not treat the image model name as an H3 video request", async () => {
    const catalog = await loadColabCatalogFile("scripts/colab/catalog.yaml");
    const result = buildColabSuggestPayload(catalog, { goal: "MiniMax-H3-Image", gpu: "A100" });
    const reasons = result.suggestions.flatMap((suggestion) => suggestion.reasons ?? []);
    expect(reasons.some((reason) => reason.startsWith("intent:h3:"))).toBe(false);
    expect(result.suggestions.map((suggestion) => suggestion.kit)).toContain("minimax_h3_image");
  });

  it.each(workflows)(
    "%s patches the request and seed, and uses only assets the setup downloads",
    async (name) => {
      const { graph, preset } = await load(name);
      const aliases = Object.fromEntries(
        Object.entries(preset.parameters ?? {}).flatMap(([key, parameter]) =>
          (parameter.aliases ?? []).map((alias) => [alias, key]),
        ),
      );
      expect(aliases.prompt).toBe("24_value");
      const values = applySeedValue(
        { [aliases.prompt]: "a request" },
        resolveSeedTargets(preset),
        12345,
      );
      const patched = applyParameters(graph, preset, values) as Graph;
      expect(patched["24"].inputs.value).toBe("a request");
      expect(patched["7"].inputs.seed).toBe(12345);
      expect(patched["7"].inputs).toMatchObject({ steps: 6, cfg: 1 });
      expect(patched["5"].inputs.prompt).toEqual(["24", 0]);

      const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf8");
      for (const [id, input] of [
        ["1", "unet_name"],
        ["2", "clip_name"],
        ["3", "vae_name"],
      ] as const) {
        expect(setup).toContain(`/${String(patched[id].inputs[input])}`);
      }
      for (const value of Object.values(graph)) {
        for (const input of Object.values(value.inputs)) {
          if (Array.isArray(input)) expect(graph[String(input[0])]).toBeDefined();
        }
      }
    },
  );

  it.each(workflows)("%s wires every upload into conditioning", async (name, n) => {
    const { graph, preset } = await load(name);
    const expectedUploads = ["image", "image_2", "image_3"].slice(0, n);
    expect(Object.keys(preset.uploads ?? {}).sort()).toEqual(expectedUploads);
    const conditioning = graph["5"].inputs;
    for (let i = 1; i <= n; i += 1) {
      const scaled = [String(55 + i), 0];
      expect(graph[String(55 + i)].inputs.image).toEqual([String(44 + i), 0]);
      expect(conditioning[`images.image_${i}`]).toEqual(scaled);
    }
    expect(Object.keys(conditioning).filter((key) => key.startsWith("images."))).toHaveLength(n);
    expect(
      Object.values(graph).some((node) =>
        ["TextGenerate", "TextGenerateV2"].includes(node.class_type),
      ),
    ).toBe(false);
    if (n > 0) expect(conditioning.width).toEqual(["50", 0]);
  });
});
