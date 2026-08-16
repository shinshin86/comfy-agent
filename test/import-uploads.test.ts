import { describe, expect, it } from "vitest";
import { buildImportPayload, buildPresetTemplate } from "../src/cli/import.js";
import type { Preset } from "../src/preset/schema.js";

describe("buildPresetTemplate upload inference", () => {
  it("turns LoadImage, LoadAudio, and LoadVideo inputs into required uploads", () => {
    const preset = buildPresetTemplate(
      "media_demo",
      "media_demo.json",
      {
        "1": { class_type: "LoadImage", inputs: { image: "example.png" } },
        "2": { class_type: "LoadAudio", inputs: { audio: "voice.wav" } },
        "3": { class_type: "VHS_LoadVideo", inputs: { video: "clip.mp4", force_rate: 0 } },
        "4": { class_type: "CLIPTextEncode", inputs: { text: "A cat", clip: ["5", 0] } },
      },
      null,
    );

    expect(preset.uploads).toEqual({
      image: {
        kind: "image",
        cli_flag: "--image",
        target: { node_id: "1", input: "image" },
        description: "Image file uploaded to the workflow input.",
        role: "input_image",
        required: true,
      },
      audio: {
        kind: "audio",
        cli_flag: "--audio",
        target: { node_id: "2", input: "audio" },
        description: "Audio file uploaded to the workflow input.",
        role: "input_audio",
        required: true,
      },
      video: {
        kind: "file",
        cli_flag: "--video",
        target: { node_id: "3", input: "video" },
        description: "Video file uploaded to the workflow input.",
        role: "input_video",
        required: true,
      },
    });
    expect(preset.parameters).not.toHaveProperty("1_image");
    expect(preset.parameters).not.toHaveProperty("2_audio");
    expect(preset.parameters).not.toHaveProperty("3_video");
    expect(preset.parameters).toHaveProperty("3_force_rate");
    expect(preset.parameters).toHaveProperty("4_text");
  });

  it("allocates stable numbered flags for multiple inputs of one media type", () => {
    const preset = buildPresetTemplate(
      "references",
      "references.json",
      {
        "10": { class_type: "LoadImage", inputs: { image: "first.png" } },
        "11": { class_type: "LoadImage", inputs: { image: "second.png" } },
      },
      null,
    );

    expect(preset.uploads).toMatchObject({
      image: { cli_flag: "--image", target: { node_id: "10" } },
      image_2: { cli_flag: "--image-2", target: { node_id: "11" } },
    });
  });

  it("recognizes direct prompt fields on custom generation nodes", () => {
    const preset = buildPresetTemplate(
      "sound_effect",
      "sound_effect.json",
      {
        "1": {
          class_type: "MossSoundEffectV2",
          inputs: {
            prompt: "Rain on a metal roof",
            negative_prompt: "speech",
            steps: 100,
          },
        },
      },
      null,
    );

    expect(preset.parameters).toMatchObject({
      "1_prompt": { role: "prompt" },
      "1_negative_prompt": { role: "negative_prompt" },
      "1_steps": { role: "steps", min: 1 },
    });
  });
});

describe("buildImportPayload", () => {
  it("lists parameters and uploads in preset --json shape", () => {
    const presetTemplate: Preset = {
      version: 1,
      name: "demo",
      workflow: "demo.json",
      parameters: {
        seed: {
          type: "int",
          required: false,
          default: 42,
          target: { node_id: "19", input: "seed" },
          description: "Random seed.",
          role: "seed",
          aliases: ["--random-seed"],
          min: 0,
          max: 100,
          choices: [42, 84],
          recommended: 42,
        },
      },
      uploads: {
        image: {
          kind: "image",
          cli_flag: "--image",
          target: { node_id: "1", input: "image" },
          description: "Input image.",
          role: "input_image",
          aliases: ["--input-image"],
          required: true,
        },
      },
    };

    const payload = buildImportPayload({
      name: "demo",
      scope: "local",
      baseUrl: "http://127.0.0.1:8188",
      workflowDest: "/project/.comfy-agent/workflows/demo.json",
      presetDest: "/project/.comfy-agent/presets/demo.yaml",
      objectInfoSource: "server",
      overwritten: false,
      hadSubgraphs: true,
      presetTemplate,
    });

    expect(payload).toEqual({
      ok: true,
      scope: "local",
      preset: "demo",
      preset_path: "/project/.comfy-agent/presets/demo.yaml",
      workflow_path: "/project/.comfy-agent/workflows/demo.json",
      base_url: "http://127.0.0.1:8188",
      object_info: "server",
      subgraphs_expanded: true,
      overwritten: false,
      parameters: [
        {
          name: "seed",
          type: "int",
          required: false,
          default: 42,
          target: { node_id: "19", input: "seed" },
          description: "Random seed.",
          role: "seed",
          aliases: ["--random-seed"],
          min: 0,
          max: 100,
          choices: [42, 84],
          recommended: 42,
        },
      ],
      uploads: [
        {
          name: "image",
          kind: "image",
          cli_flag: "--image",
          target: { node_id: "1", input: "image" },
          description: "Input image.",
          role: "input_image",
          aliases: ["--input-image"],
          required: true,
        },
      ],
    });
    expect(Object.keys(payload.parameters[0])).toEqual([
      "name",
      "type",
      "required",
      "default",
      "target",
      "description",
      "role",
      "aliases",
      "min",
      "max",
      "choices",
      "recommended",
    ]);
    expect(Object.keys(payload.uploads[0])).toEqual([
      "name",
      "kind",
      "cli_flag",
      "target",
      "description",
      "role",
      "aliases",
      "required",
    ]);
  });
});
