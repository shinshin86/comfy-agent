import path from "node:path";
import { promises as fs } from "node:fs";
import YAML from "yaml";
import type { Preset } from "../../src/preset/schema.js";
export const optionalWorkflow = {
  "1": { class_type: "LoadImage", inputs: { image: "default.png" } },
  "2": { class_type: "VAEEncode", inputs: { pixels: ["1", 0] } },
  "3": {
    class_type: "WanImageToVideo",
    inputs: { start_image: ["2", 0], reference: ["5", 0], length: 81, prompt: "A scene" },
  },
  "4": { class_type: "SaveVideo", inputs: { video: ["3", 0] } },
  "5": { class_type: "LoadImage", inputs: { image: "reference.png" } },
};
export const optionalObjectInfo = {
  LoadImage: { input: { required: { image: ["STRING"] } } },
  VAEEncode: { input: { required: { pixels: ["IMAGE"] } } },
  WanImageToVideo: {
    input: {
      required: { length: ["INT", { min: 1, max: 241, step: 8 }], prompt: ["STRING"] },
      optional: { start_image: ["LATENT"], reference: ["IMAGE"] },
    },
  },
  SaveVideo: { output_node: true, input: { required: { video: ["VIDEO"] } } },
};
export const optionalPreset: Preset = {
  version: 1,
  name: "optional_i2v",
  workflow: "optional.json",
  task: "image_to_video",
  parameters: {
    prompt: {
      type: "string",
      role: "prompt",
      default: "A scene",
      target: { node_id: "3", input: "prompt" },
    },
    length: {
      type: "int",
      aliases: ["frames"],
      min: 1,
      max: 241,
      description: "Frame count must be 8n+1",
      default: 81,
      target: { node_id: "3", input: "length" },
    },
  },
  uploads: {
    image: {
      kind: "image",
      cli_flag: "--image",
      required: true,
      target: { node_id: "1", input: "image" },
    },
    reference: {
      kind: "image",
      cli_flag: "--reference",
      required: true,
      target: { node_id: "5", input: "image" },
    },
  },
};
export const writeOptionalFixture = async (workdir: string) => {
  await fs.writeFile(
    path.join(workdir, "presets", `${optionalPreset.name}.yaml`),
    YAML.stringify(optionalPreset),
  );
  await fs.writeFile(
    path.join(workdir, "workflows", optionalPreset.workflow),
    JSON.stringify(optionalWorkflow),
  );
};
