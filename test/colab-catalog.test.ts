import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runColabSuggest } from "../src/cli/colab.js";
import {
  ColabCatalogSchema,
  buildColabCatalogPayload,
  buildColabSuggestPayload,
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

describe("buildColabSuggestPayload", () => {
  it("suggests fast image kits from a natural-language goal", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      goal: "fast image generation on a T4",
      limit: 3,
    });

    expect(payload.ok).toBe(true);
    expect(payload.suggestions[0]).toMatchObject({
      kit: "z_image",
      workflow: "z_image_turbo",
      task: "text_to_image",
    });
  });

  it("honors explicit task/output/gpu filters", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      task: "text_to_video",
      output: "video",
      gpu: "A100",
    });

    expect(payload.suggestions.length).toBeGreaterThan(0);
    expect(payload.suggestions.every((item) => item.task === "text_to_video")).toBe(true);
    expect(payload.suggestions.every((item) => item.outputs.includes("video"))).toBe(true);
    expect(payload.suggestions.map((item) => item.kit)).toContain("wan22");
  });

  it("keeps suggestions free of local paths", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, { goal: "anime image" });
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain(repoRoot);
    expect(serialized).not.toContain("/absolute/");
  });
});

describe("runColabSuggest", () => {
  it("rejects invalid CLI filters", async () => {
    await expect(runColabSuggest("image", { task: "typo" as never, json: true })).rejects.toThrow(
      "task must be",
    );
    await expect(
      runColabSuggest("image", { output: "movie" as never, json: true }),
    ).rejects.toThrow("output must be");
    await expect(runColabSuggest("image", { limit: "0", json: true })).rejects.toThrow(
      "limit must be",
    );
  });
});

describe("loadColabCatalogFile", () => {
  it("reports a repository-only catalog clearly when the catalog file is missing", async () => {
    await expect(loadColabCatalogFile(path.join(repoRoot, "missing", "catalog.yaml"))).rejects
      .toMatchObject({
        code: "COLAB_CATALOG_UNAVAILABLE",
      });
  });

  it("covers every starter kit directory in the repository", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    expect(catalog.version).toBe(1);

    // Derive the expected kit set from the filesystem so a newly added kit
    // directory that is forgotten in catalog.yaml fails the test instead of
    // silently going missing from `colab catalog` / `colab suggest`.
    // A kit directory is any subdirectory of scripts/colab/ holding 01_setup.py.
    const colabDir = path.join(repoRoot, "scripts", "colab");
    const entries = await fs.readdir(colabDir, { withFileTypes: true });
    const kitDirs = (
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const hasSetup = await fs
              .access(path.join(colabDir, entry.name, "01_setup.py"))
              .then(() => true)
              .catch(() => false);
            return hasSetup ? entry.name : null;
          }),
      )
    )
      .filter((name): name is string => name !== null)
      .sort();

    expect(kitDirs.length).toBeGreaterThan(0);
    // loadColabCatalogFile returns kits sorted by name, matching the sorted dirs.
    expect(catalog.kits.map((kit) => kit.name)).toEqual(kitDirs);
  });

  it("references workflow files that exist on disk", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const colabDir = path.join(repoRoot, "scripts", "colab");

    for (const kit of catalog.kits) {
      for (const workflow of kit.workflows) {
        const workflowPath = path.join(colabDir, kit.path, workflow.file);
        const exists = await fs
          .access(workflowPath)
          .then(() => true)
          .catch(() => false);
        expect(exists, `${kit.name}/${workflow.file} should exist`).toBe(true);
      }
    }
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
