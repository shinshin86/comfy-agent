import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ColabCatalogSchema,
  buildColabCatalogPayload,
  loadColabCatalogFile,
} from "../src/colab/catalog.js";

const repoRoot = process.cwd();
const catalogPath = path.join(repoRoot, "scripts", "colab", "catalog.yaml");

describe("ColabCatalogSchema", () => {
  it("accepts an agent-readable Colab kit catalog", () => {
    const result = ColabCatalogSchema.safeParse({
      version: 1,
      kits: [
        {
          name: "z_image",
          path: "z_image/",
          status: "verified",
          tasks: ["text_to_image"],
          outputs: ["image"],
          gpu: { minimum: "T4", recommended: "T4" },
          summary: "Fast image generation starter kit.",
          setup_file: "01_setup.py",
          workflows: [
            {
              name: "z_image_turbo",
              file: "z_image_turbo.json",
              task: "text_to_image",
              speed: "fast",
              quality: "standard",
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects absolute or parent-traversing paths so catalog output stays portable", () => {
    const result = ColabCatalogSchema.safeParse({
      version: 1,
      kits: [
        {
          name: "invalid",
          path: "/absolute/path",
          status: "starter",
          tasks: ["text_to_image"],
          outputs: ["image"],
          gpu: { recommended: "T4" },
          summary: "Should reject non-portable paths.",
          workflows: [{ name: "bad", file: "../outside.json", task: "text_to_image" }],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("loadColabCatalogFile", () => {
  it("loads the repository Colab catalog and covers all starter kit directories", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);

    expect(catalog.version).toBe(1);
    expect(catalog.kits.map((kit) => kit.name)).toEqual([
      "anima",
      "flux1",
      "flux2",
      "hidream_i1",
      "hunyuan_video",
      "ltx23",
      "ooo_anima",
      "qwen_image",
      "qwen_image_edit",
      "sdxl",
      "sdxl_turbo",
      "sulphur2",
      "wan21",
      "wan22",
      "z_anime",
      "z_image",
    ]);
  });

  it("builds a public payload without absolute filesystem or environment details", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabCatalogPayload(catalog);
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({ ok: true, catalog: { version: 1 } });
    expect(serialized).not.toContain(repoRoot);
    expect(serialized).not.toContain(["OPENAI", "API", "KEY"].join("_"));
    expect(serialized).not.toContain(["COMFY", "AGENT", "BASE", "URL"].join("_"));
  });
});
