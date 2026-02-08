import { describe, expect, it } from "vitest";
import { PresetSchema } from "../src/preset/schema.js";

describe("PresetSchema", () => {
  it("valid preset", () => {
    const result = PresetSchema.safeParse({
      version: 1,
      name: "text2img_v1",
      workflow: "text2img_v1.json",
      parameters: {
        prompt: {
          type: "string",
          target: { node_id: 12, input: "text" },
          required: true,
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("invalid preset", () => {
    const result = PresetSchema.safeParse({
      name: "missing_version",
    });

    expect(result.success).toBe(false);
  });
});
