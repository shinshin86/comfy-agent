import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const colabDir = path.join(process.cwd(), "scripts", "colab");

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

const readWorkflow = async (kit: string, file: string) =>
  JSON.parse(await fs.readFile(path.join(colabDir, kit, file), "utf-8")) as Workflow;

describe("ACE-Step 1.5 Colab kit", () => {
  it("pins ComfyUI and the official AIO checkpoint by revision and checksum", async () => {
    const setup = await fs.readFile(path.join(colabDir, "ace_step_1_5", "01_setup.py"), "utf-8");

    expect(setup).toContain("UPDATE_COMFYUI = False");
    expect(setup).toContain('COMFYUI_REVISION = "7bf8bfcd078c7f4ae50ca5149c9ff7d8613e1fb1"');
    expect(setup).toContain('MODEL_REVISION = "54b2ef4d8af5582f54c7e6b84c22b679a194bc4b"');
    expect(setup).toContain("67b0f43aa5c51c840bd0228e6a935d8ff416ec87e5df2fc0637da17a561252bc");
    expect(setup).toContain('CLOUDFLARED_VERSION = "2026.7.2"');
    expect(setup).toContain("88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a");
    expect(setup).not.toContain("releases/latest");
    expect(setup).not.toContain("check=False");
    expect(setup).not.toContain("custom_nodes");
  });

  it("uses native ACE-Step 1.5 nodes and the non-deprecated audio saver", async () => {
    const workflow = await readWorkflow("ace_step_1_5", "ace_step_1_5_t2a.json");

    expect(workflow["1"]).toMatchObject({
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "ace_step_1.5_turbo_aio.safetensors" },
    });
    expect(workflow["2"]).toMatchObject({
      class_type: "TextEncodeAceStepAudio1.5",
      inputs: { language: "ja", duration: 30, generate_audio_codes: true },
    });
    expect(workflow["4"]).toMatchObject({
      class_type: "EmptyAceStep1.5LatentAudio",
      inputs: { seconds: 30, batch_size: 1 },
    });
    expect(workflow["6"]).toMatchObject({
      class_type: "KSampler",
      inputs: { steps: 8, cfg: 1, sampler_name: "euler", scheduler: "simple" },
    });
    expect(workflow["8"]).toMatchObject({
      class_type: "SaveAudioAdvanced",
      inputs: { audio: ["7", 0], format: "mp3", "format.quality": "V0" },
    });
    expect(Object.values(workflow).map((node) => node.class_type)).not.toContain("SaveAudioMP3");
  });
});

describe("Stable Audio 3 Small Music Colab kit", () => {
  it("pins both official model files by revision and checksum", async () => {
    const setup = await fs.readFile(
      path.join(colabDir, "stable_audio3_small_music", "01_setup.py"),
      "utf-8",
    );

    expect(setup).toContain("UPDATE_COMFYUI = False");
    expect(setup).toContain('MODEL_REVISION = "a02cbcdcd07426b0150557d0145bc894795823af"');
    expect(setup).toContain("da85866b11b01d0694d990785f6abbd79c8064df1b0e6f8aea52935e0ef84b64");
    expect(setup).toContain("1e1eba25be8872edb0d3c6335c6658fd6388e7b14b60da6e454e404cfcd8150e");
    expect(setup).toContain('CLOUDFLARED_VERSION = "2026.7.2"');
    expect(setup).toContain("88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a");
    expect(setup).not.toContain("releases/latest");
    expect(setup).not.toContain("check=False");
    expect(setup).not.toContain("custom_nodes");
  });

  it("uses the post-trained small music checkpoint with the official fast sampler settings", async () => {
    const workflow = await readWorkflow(
      "stable_audio3_small_music",
      "stable_audio3_small_music_t2a.json",
    );

    expect(workflow["1"]).toMatchObject({
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "stable_audio_3_small_music.safetensors" },
    });
    expect(workflow["2"]).toMatchObject({
      class_type: "CLIPLoader",
      inputs: { clip_name: "t5gemma_b_b_ul2.safetensors", type: "stable_audio" },
    });
    expect(workflow["5"]).toMatchObject({
      class_type: "EmptyLatentAudio",
      inputs: { seconds: 30, batch_size: 1 },
    });
    expect(workflow["6"]).toMatchObject({
      class_type: "KSampler",
      inputs: { steps: 8, cfg: 1, sampler_name: "lcm", scheduler: "simple" },
    });
    expect(workflow["8"]).toMatchObject({
      class_type: "SaveAudioAdvanced",
      inputs: { audio: ["7", 0], format: "mp3", "format.quality": "V0" },
    });
    expect(Object.values(workflow).map((node) => node.class_type)).not.toContain("SaveAudioMP3");
  });
});
