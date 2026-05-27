import { describe, expect, it } from "vitest";
import { PresetSchema } from "../src/preset/schema.js";

describe("PresetSchema", () => {
  it("valid preset", () => {
    const result = PresetSchema.safeParse({
      version: 1,
      name: "text2img_v1",
      workflow: "text2img_v1.json",
      description: "Basic text-to-image workflow.",
      task: "text_to_image",
      tags: ["fast", "starter"],
      parameters: {
        prompt: {
          type: "string",
          target: { node_id: 12, input: "text" },
          required: true,
          description: "Positive prompt describing the image.",
          role: "prompt",
          aliases: ["positive", "text"],
        },
        steps: {
          type: "int",
          target: { node_id: 3, input: "steps" },
          default: 20,
          role: "steps",
          min: 1,
          max: 50,
          recommended: 20,
        },
      },
      uploads: {
        init: {
          kind: "image",
          cli_flag: "--init-image",
          target: { node_id: 9, input: "image" },
          description: "Optional source image.",
          role: "init_image",
          aliases: ["source-image"],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown parameter roles", () => {
    const result = PresetSchema.safeParse({
      version: 1,
      name: "text2img_v1",
      workflow: "text2img_v1.json",
      parameters: {
        prompt: {
          type: "string",
          target: { node_id: 12, input: "text" },
          role: "unsupported_role",
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("invalid preset", () => {
    const result = PresetSchema.safeParse({
      name: "missing_version",
    });

    expect(result.success).toBe(false);
  });
});
