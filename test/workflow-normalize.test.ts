import { describe, expect, it } from "vitest";
import { normalizeWorkflow } from "../src/workflow/normalize.js";

describe("normalizeWorkflow", () => {
  it("converts ComfyUI UI workflow format (nodes/links) to API prompt format", () => {
    const uiWorkflow = {
      nodes: [
        {
          id: 11,
          type: "MarkdownNote",
          inputs: [],
          widgets_values: ["memo"],
        },
        {
          id: 4,
          type: "CheckpointLoaderSimple",
          inputs: [
            {
              name: "ckpt_name",
              type: "COMBO",
              link: null,
              widget: { name: "ckpt_name" },
            },
          ],
          widgets_values: ["v1-5-pruned-emaonly-fp16.safetensors"],
        },
        {
          id: 3,
          type: "KSampler",
          inputs: [
            { name: "model", type: "MODEL", link: 1 },
            { name: "seed", type: "INT", link: null, widget: { name: "seed" } },
            { name: "steps", type: "INT", link: null, widget: { name: "steps" } },
          ],
          widgets_values: [12345, "randomize", 20],
        },
      ],
      links: [[1, 4, 0, 3, 0, "MODEL"]],
    };

    const normalized = normalizeWorkflow(uiWorkflow);
    expect(normalized).toEqual({
      "3": {
        class_type: "KSampler",
        inputs: {
          model: ["4", 0],
          seed: 12345,
          steps: 20,
        },
      },
      "4": {
        class_type: "CheckpointLoaderSimple",
        inputs: {
          ckpt_name: "v1-5-pruned-emaonly-fp16.safetensors",
        },
      },
    });
  });
});
