import { describe, expect, it } from "vitest";
import { applyParameters, applyUploads } from "../src/workflow/patch.js";
import type { Preset } from "../src/preset/schema.js";

const preset: Preset = {
  version: 1,
  name: "test",
  workflow: "test.json",
  parameters: {
    prompt: {
      type: "string",
      target: { node_id: "1", input: "text" },
      required: true,
    },
    steps: {
      type: "int",
      target: { node_id: "2", input: "steps" },
      default: 20,
    },
  },
  uploads: {
    image: {
      kind: "image",
      cli_flag: "--image",
      target: { node_id: "3", input: "image" },
    },
    audio: {
      kind: "audio",
      cli_flag: "--audio",
      target: { node_id: "4", input: "audio" },
    },
  },
};

describe("applyParameters", () => {
  it("apply values to workflow", () => {
    const workflow = {
      "1": { inputs: { text: "old" }, class_type: "CLIPTextEncode" },
      "2": { inputs: { steps: 10 }, class_type: "KSampler" },
    };

    const patched = applyParameters(workflow, preset, { prompt: "new", steps: 30 });
    const patchedRecord = patched as Record<string, { inputs?: Record<string, unknown> }>;
    expect(patchedRecord["1"]?.inputs?.text).toBe("new");
    expect(patchedRecord["2"]?.inputs?.steps).toBe(30);
  });
});

describe("applyUploads", () => {
  it("applies image and audio upload references to workflow inputs", () => {
    const workflow = {
      "3": { inputs: { image: "old.png" }, class_type: "LoadImage" },
      "4": { inputs: { audio: "old.mp3" }, class_type: "LoadAudio" },
    };

    const patched = applyUploads(workflow, preset, {
      image: "new.png",
      audio: "voice.mp3",
    });
    const patchedRecord = patched as Record<string, { inputs?: Record<string, unknown> }>;
    expect(patchedRecord["3"]?.inputs?.image).toBe("new.png");
    expect(patchedRecord["4"]?.inputs?.audio).toBe("voice.mp3");
  });
});
