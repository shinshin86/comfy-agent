import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildPresetTemplate } from "../src/cli/import.js";
import { runColabKit } from "../src/cli/colab.js";
import { PresetSchema } from "../src/preset/schema.js";
import { buildColabSuggestPayload, loadColabCatalogFile } from "../src/colab/catalog.js";
import { selectH3Workflow } from "../src/colab/h3-routing.js";

const kitDir = path.join(process.cwd(), "scripts/colab/minimax_h3_turbo");
type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

describe("H3 Turbo opt-in kit", () => {
  it.each([
    ["H3 Turbo", "minimax_h3_turbo_t2v"],
    ["H3 ターボ 画像から動画", "minimax_h3_turbo_i2v"],
    ["H3 Turbo 参照音声", "minimax_h3_r2v"],
    ["H3 without LoRA Turbo", "minimax_h3_t2v"],
    ["H3 without Turbo", "minimax_h3_t2v"],
    ["H3 fast", "minimax_h3_fast_t2v"],
    ["H3", "minimax_h3_t2v"],
  ])("preserves intent: %s", (goal, expected) => expect(selectH3Workflow(goal)).toBe(expected));

  it("only suggests Turbo on opt-in and accepts G4 without claiming verification", async () => {
    const catalog = await loadColabCatalogFile("scripts/colab/catalog.yaml");
    const selected = buildColabSuggestPayload(catalog, { goal: "H3 Turbo", gpu: "G4" });
    expect(selected.suggestions[0]).toMatchObject({
      workflow: "minimax_h3_turbo_t2v",
      status: "starter",
    });
    for (const goal of [undefined, "video", "H3", "H3 fast"]) {
      expect(
        buildColabSuggestPayload(catalog, { goal, limit: 100 }).suggestions.some((s) =>
          s.workflow.includes("h3_turbo"),
        ),
      ).toBe(false);
    }
  });

  it("returns the dedicated launcher instead of silently omitting Sage", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const payload = await runColabKit("minimax_h3_turbo", { json: true });
      expect(payload.paths.launcher).toBe(path.join(kitDir, "02_start_comfyui.py"));
      await expect(fs.stat(payload.paths.launcher)).resolves.toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  it.each(["t2v", "i2v"])("imports %s with the complete Turbo AV path", async (mode) => {
    const name = `minimax_h3_turbo_${mode}`;
    const graph: Graph = JSON.parse(await fs.readFile(path.join(kitDir, `${name}.json`), "utf8"));
    for (const node of Object.values(graph))
      for (const input of Object.values(node.inputs)) {
        if (Array.isArray(input)) expect(graph[input[0]]).toBeDefined();
      }
    expect(graph["120"].inputs).toMatchObject({ model: ["6", 0], strength_model: 1 });
    expect(graph["121"].inputs).toEqual({ model: ["120", 0], shift_video: 6, shift_audio: 3 });
    expect(graph["9"].inputs).toMatchObject({ model: ["121", 0], steps: 4, scheduler: "simple" });
    expect(graph["16"].inputs.model).toEqual(["121", 0]);
    expect(graph["17"].inputs.sampler_name).toBe("euler");
    expect(graph["104"].inputs).toMatchObject({ width: 1344, height: 768, length: 124 });
    expect(graph["91"].inputs).toMatchObject({ images: ["10", 0], audio: ["23", 0], fps: 24 });
    const preset = PresetSchema.parse(buildPresetTemplate(name, `${name}.json`, graph, null));
    expect(Object.values(preset.uploads ?? {}).map((u) => u.cli_flag)).toEqual(
      mode === "i2v" ? ["--image"] : [],
    );
  });

  it("parses both standalone Colab cells without executing GPU or network work", () => {
    execFileSync("python3", [
      "-c",
      "import ast, pathlib, sys; [ast.parse(p.read_text()) for p in pathlib.Path(sys.argv[1]).glob('*.py')]",
      kitDir,
    ]);
  });
});
