import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPresetTemplate } from "../src/cli/import.js";
import { loadColabCatalogFile } from "../src/colab/catalog.js";

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
const root = process.cwd();
const kitDir = path.join(root, "scripts/colab/minimax_h3_character_swap");
const loadGraph = async (): Promise<Graph> =>
  JSON.parse(await fs.readFile(path.join(kitDir, "minimax_h3_character_swap.json"), "utf8"));

describe("MiniMax H3 Character Swap Colab kit", () => {
  it("pins the Ref2VA weights and published adapter without a Turbo LoRA", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf8");
    expect(setup).toContain('COMFYUI_REVISION = "e01fb4c56b7a88149d469b99cbbfe3223d715054"');
    expect(setup).toContain('MODEL_REVISION = "4cc1d817b6184899b41293954329f576cb5ae86b"');
    expect(setup).toContain('LORA_REVISION = "5823b1d659a9d76889ef24b8b23941102bb000d3"');
    expect(setup).toContain("155110320");
    expect(setup).toContain("4b2a3f420ae804c0aa3422761ff84dbd1bf52eef6900ffab6d2e66df63cb4e79");
    expect(setup).not.toContain("DOWNLOAD_REF2V_TURBO_LORA");

    const catalog = await loadColabCatalogFile(path.join(root, "scripts/colab/catalog.yaml"));
    const kit = catalog.kits.find((item) => item.name === "minimax_h3_character_swap");
    expect(kit).toMatchObject({
      status: "verified",
      tasks: ["video_to_video"],
      gpu: { minimum: "A100" },
      composable: false,
    });
    expect(kit?.assets?.map((asset) => asset.file)).toContain(
      "h3_character_swap_pro4500_1000.safetensors",
    );
  });

  it("passes the source frames and character image to H3 with LoRA on both model paths", async () => {
    const graph = await loadGraph();
    for (const [id, node] of Object.entries(graph)) {
      for (const value of Object.values(node.inputs)) {
        if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string") {
          expect(graph[value[0]], `${id}: dangling node ${value[0]}`).toBeDefined();
        }
      }
    }

    expect(graph["120"]).toMatchObject({
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["6", 0],
        lora_name: "h3_character_swap_pro4500_1000.safetensors",
        strength_model: 1,
      },
    });
    expect(graph["9"].inputs.model).toEqual(["120", 0]);
    expect(graph["16"].inputs.model).toEqual(["120", 0]);
    expect(graph["115"]).toMatchObject({ class_type: "LoadVideo", inputs: { file: "source.mp4" } });
    expect(graph["116"]).toMatchObject({
      class_type: "GetVideoComponents",
      inputs: { video: ["115", 0] },
    });
    expect(graph["104"].inputs).toMatchObject({
      "ref_images.ref_image_0": ["114", 0],
      "ref_videos.ref_video_0": ["116", 0],
      length: 124,
    });
    expect(graph["104"].inputs).not.toHaveProperty("ref_audios.ref_audio_0");
    expect(graph["91"].inputs).toMatchObject({ audio: ["23", 0], fps: 24 });
  });

  it("imports the workflow with both required media uploads", async () => {
    const graph = await loadGraph();
    const preset = buildPresetTemplate(
      "minimax_h3_character_swap",
      "minimax_h3_character_swap.json",
      graph,
      null,
    );
    expect(preset.uploads).toMatchObject({
      image: { cli_flag: "--image", target: { node_id: "114", input: "image" } },
      video: { cli_flag: "--video", target: { node_id: "115", input: "file" } },
    });
    expect(Object.keys(preset.uploads ?? {})).toHaveLength(2);
    expect(preset.parameters).toHaveProperty("104_prompt");
    expect(preset.parameters).toHaveProperty("104_length");
  });
});
