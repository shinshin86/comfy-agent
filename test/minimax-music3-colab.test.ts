import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const kitDir = path.join(process.cwd(), "scripts", "colab", "minimax_music3");

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

describe("MiniMax Music 3 Colab kit", () => {
  it("pins native ComfyUI support and every model asset by revision and checksum", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");

    expect(setup).toContain("UPDATE_COMFYUI = False");
    expect(setup).toContain('COMFYUI_REVISION = "7fe8a6138504f90ff7be82f3babf416da32876b1"');
    expect(setup).toContain('MODEL_REVISION = "6444666eb6edfb2c7fcab5f8b81da8b84b4b17b6"');
    expect(setup).toContain("d6b959633e69899f99f3a92d6741c0fe79f26958a30811e50e372ef978b24d5f");
    expect(setup).toContain("010b7416d2336a08c711bc22ee65849c9623069ddb7d89bec011a75699e52014");
    expect(setup).toContain("2a32155b769be01445fcc2a8663b910fc9e1751e18dc1c3ec528064512d9ef0c");
    expect(setup).toContain('CLOUDFLARED_VERSION = "2026.7.2"');
    expect(setup).toContain("88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a");
    expect(setup).not.toContain("releases/latest");
    expect(setup).not.toContain("check=False");
    expect(setup).not.toContain("custom_nodes");
  });

  it("uses native MiniMax Music 3 nodes and the official INT8 defaults", async () => {
    const workflow = JSON.parse(
      await fs.readFile(path.join(kitDir, "minimax_music3_t2a.json"), "utf-8"),
    ) as Workflow;

    expect(workflow["1"]).toMatchObject({
      class_type: "UNETLoader",
      inputs: { unet_name: "minimax_music3_dit_int8_convrot.safetensors" },
    });
    expect(workflow["2"]).toMatchObject({
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
        type: "minimax",
      },
    });
    expect(workflow["4"]).toMatchObject({
      class_type: "MiniMaxMusic3TextEncode",
      inputs: { seed: 7, max_duration: 30, cfg_scale: 1.7, top_k: 50 },
    });
    expect(workflow["6"]).toMatchObject({
      class_type: "EmptyMiniMaxMusic3LatentAudio",
      inputs: { seconds: ["4", 1], batch_size: 1 },
    });
    expect(workflow["7"]).toMatchObject({
      class_type: "KSampler",
      inputs: { steps: 30, cfg: 1.7, sampler_name: "euler", scheduler: "simple" },
    });
    expect(workflow["8"]).toMatchObject({
      class_type: "VAEDecodeAudioTiled",
      inputs: { tile_size: 1536, overlap: 64 },
    });
    expect(workflow["9"]).toMatchObject({
      class_type: "SaveAudioAdvanced",
      inputs: { audio: ["8", 0], format: "mp3", "format.quality": "V0" },
    });
  });
});
