import { describe, expect, it } from "vitest";
import { applyParameters } from "../src/workflow/patch.js";
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
