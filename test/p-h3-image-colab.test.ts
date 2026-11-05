import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPresetTemplate } from "../src/cli/import.js";
import { applySeedValue, resolveSeedTargets } from "../src/cli/run/args.js";
import { buildColabSuggestPayload, loadColabCatalogFile } from "../src/colab/catalog.js";
import { PresetSchema } from "../src/preset/schema.js";
import { normalizeWorkflow } from "../src/workflow/normalize.js";
import { applyParameters } from "../src/workflow/patch.js";

const kitDir = path.join(process.cwd(), "scripts/colab/p_h3_image");

const load = async (name: string) => {
  const graph = normalizeWorkflow(
    JSON.parse(await fs.readFile(path.join(kitDir, `${name}.json`), "utf8")),
  );
  const preset = PresetSchema.parse(buildPresetTemplate(name, `${name}.json`, graph, null));
  return { graph, preset };
};

describe("P-H3-Image Colab kit", () => {
  it("routes the model name to the A100 kit", async () => {
    const catalog = await loadColabCatalogFile("scripts/colab/catalog.yaml");
    const result = buildColabSuggestPayload(catalog, { goal: "P-H3-Image", gpu: "A100" });
    expect(result.suggestions[0]).toMatchObject({
      kit: "p_h3_image",
      composable: false,
      gpu: { minimum: "A100", recommended: "A100" },
    });
  });

  it.each(["p_h3_image_t2i", "p_h3_image_edit", "p_h3_image_edit_2ref"])(
    "%s patches the request and seed, and uses only assets the setup downloads",
    async (name) => {
      const { graph, preset } = await load(name);
      const aliases = Object.fromEntries(
        Object.entries(preset.parameters ?? {}).flatMap(([key, parameter]) =>
          (parameter.aliases ?? []).map((alias) => [alias, key]),
        ),
      );
      expect(aliases.prompt).toBe("16_value");
      const values = applySeedValue(
        { [aliases.prompt]: "a request" },
        resolveSeedTargets(preset),
        12345,
      );
      const patched = applyParameters(graph, preset, values) as Record<
        string,
        { inputs: Record<string, unknown> }
      >;
      expect(patched["16"].inputs.value).toBe("a request");
      expect(patched["9"].inputs.noise_seed).toBe(12345);
      expect(patched["19"].inputs.on_true).toEqual(["18", 0]);
      expect(patched["26"].inputs.prompt).toEqual(["19", 0]);

      const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf8");
      for (const [id, input] of [
        ["22", "unet_name"],
        ["24", "clip_name"],
        ["13", "clip_name"],
        ["25", "vae_name"],
      ] as const) {
        expect(setup).toContain(`/${String(patched[id].inputs[input])}`);
      }
      for (const value of Object.values(graph)) {
        for (const input of Object.values((value as { inputs: Record<string, unknown> }).inputs)) {
          if (Array.isArray(input)) expect(graph[String(input[0])]).toBeDefined();
        }
      }
    },
  );

  it("declares a Picture block for every edit input and exposes the uploads", async () => {
    const blocks = (fString: unknown) => String(fString).match(/<\|image_pad\|>/g)?.length;
    const single = await load("p_h3_image_edit");
    expect(blocks((single.graph["17"] as { inputs: { f_string: string } }).inputs.f_string)).toBe(
      1,
    );
    const double = await load("p_h3_image_edit_2ref");
    expect(blocks((double.graph["17"] as { inputs: { f_string: string } }).inputs.f_string)).toBe(
      2,
    );
    expect(Object.keys(double.preset.uploads ?? {}).sort()).toEqual(["image", "image_2"]);
  });
});
