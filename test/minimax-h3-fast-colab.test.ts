import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildColabSuggestPayload, loadColabCatalogFile } from "../src/colab/catalog.js";

const kitDir = path.join(process.cwd(), "scripts", "colab", "minimax_h3_fast");

type ApiNode = { class_type: string; inputs: Record<string, unknown> };

describe("FastH3 Colab kit", () => {
  it("pins the experimental runtime, artifacts, CUDA build, and fail-closed VSA checks", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");

    expect(setup).toContain('COMFYUI_REVISION = "10febb01d7be73d1491cf5e5347b5ab8b6c2c09e"');
    expect(setup).toContain('COMFY_KITCHEN_REVISION = "dae00a13d458876570804523ae045a487fd92961"');
    expect(setup).toContain('FASTH3_MODEL_REVISION = "641f2a0a2df14cf24665277d8417930b57cc7710"');
    expect(setup).toContain(
      'SOL_NODE_SHA256 = "97c9d56fdc7c9a102e59bff9ac8d79503299514d061892088a03d99dcf415b0c"',
    );
    expect(setup).toContain("22898594920");
    expect(setup).toContain("7221ae65d78780354d51e5048d29728d9f1f8fb9baf50b1dd3df85f5101413d3");
    expect(setup).toContain('build_env["COMFY_CUDA_ARCHS"]');
    expect(setup).toContain('"--no-build-isolation"');
    expect(setup).toContain("FastH3 VSA native kernel self-test: OK");
    expect(setup).toContain("if len(gate_keys) != 50:");
    expect(setup).toContain("FastH3 VSA kernel failed; refusing dense fallback");
    expect(setup).toContain("FastH3 checkpoint gate weights were not loaded");
    expect(setup).not.toContain("UPDATE_COMFYUI");
  });

  it("provides a locked four-forward T2VA workflow with the VSA patch in both model paths", async () => {
    const workflow = JSON.parse(
      await fs.readFile(path.join(kitDir, "minimax_h3_fast_t2v.json"), "utf-8"),
    ) as Record<string, ApiNode>;

    expect(workflow["6"]).toMatchObject({
      class_type: "UNETLoader",
      inputs: {
        unet_name: "minimax_h3_fastvideo_vsa_datafree_1300step_4step_int8_convrot.safetensors",
      },
    });
    expect(workflow["80"]).toMatchObject({
      class_type: "SolAttnMiniMax",
      inputs: {
        model: ["6", 0],
        selection: "VSA (FastVideo)",
        "selection.vsa_keep_percent": 10,
        start_percent: 0,
        end_percent: 1,
        min_tokens: 0,
        sink_conditioning: "exact_kv_and_rows",
        verbose: true,
      },
    });
    expect(workflow["9"]).toMatchObject({
      class_type: "BasicScheduler",
      inputs: { model: ["80", 0], scheduler: "simple", steps: 4 },
    });
    expect(workflow["16"]).toMatchObject({
      class_type: "BasicGuider",
      inputs: { model: ["80", 0] },
    });
    expect(workflow["17"]).toMatchObject({
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    });
    expect(workflow["104"]).toMatchObject({
      class_type: "MiniMaxH3ImageToVideo",
      inputs: { width: 864, height: 480, length: 124 },
    });
    expect(String(workflow["104"].inputs.prompt)).toContain("integrated_multimodal_description:");
    expect(String(workflow["104"].inputs.prompt)).toContain("overall_soundscape:");
    expect(String(workflow["104"].inputs.prompt)).toContain("non_diegetic_music:");
    expect(workflow["91"]).toMatchObject({
      class_type: "CreateVideo",
      inputs: { images: ["10", 0], audio: ["23", 0], fps: 24 },
    });
    expect(workflow["92"]).toMatchObject({
      class_type: "SaveVideo",
      inputs: { video: ["91", 0] },
    });
  });

  it("documents the completed A100 E2E verification", async () => {
    const readme = await fs.readFile(path.join(kitDir, "README.md"), "utf-8");

    expect(readme).toContain("Verified E2E kit");
    expect(readme).toContain("NVIDIA A100-SXM4-40GB");
    expect(readme).toContain("T2VA only");
    expect(readme).toContain(
      "Do not run these steps until an A100 verification session has been approved",
    );
    expect(readme).toContain("- [x] `01_setup.py` completed");
    expect(readme).toContain("chunked qkv producer on 50 blocks");
  });

  it.each(["fasth3", "Fast H3"])("is discoverable by its public name: %s", async (goal) => {
    const catalog = await loadColabCatalogFile(
      path.join(process.cwd(), "scripts", "colab", "catalog.yaml"),
    );
    const payload = buildColabSuggestPayload(catalog, { goal });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "minimax_h3_fast",
      workflow: "minimax_h3_fast_t2v",
      status: "verified",
    });
    expect(payload.suggestions[0].reasons).toContain("name:exact");
  });
});
