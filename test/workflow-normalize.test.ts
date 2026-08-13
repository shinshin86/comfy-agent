import { describe, expect, it } from "vitest";
import {
  normalizeWorkflow,
  workflowHasSubgraphs,
  type WorkflowObjectInfo,
} from "../src/workflow/normalize.js";

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

  it("expands subgraphs and resolves widget and linked boundary inputs", () => {
    const subgraphId = "4c314f31-ecda-4b08-ae98-faaba1bf613f";
    const uiWorkflow = {
      nodes: [
        { id: 1, type: "PrimitiveInt", inputs: [], widgets_values: [640] },
        {
          id: 5,
          type: subgraphId,
          inputs: [
            { name: "width", type: "INT", link: 10, widget: { name: "width" } },
          ],
          widgets_values: ["hello from the container", 512],
        },
        {
          id: 9,
          type: "SaveThing",
          inputs: [{ name: "value", type: "DATA", link: 11 }],
          widgets_values: ["result/output"],
        },
      ],
      links: [
        [10, 1, 0, 5, 1, "INT"],
        [11, 5, 0, 9, 0, "DATA"],
      ],
      definitions: {
        subgraphs: [
          {
            id: subgraphId,
            inputs: [
              { name: "prompt", type: "STRING" },
              { name: "width", type: "INT" },
            ],
            outputs: [{ name: "DATA", type: "DATA" }],
            nodes: [
              {
                id: 2,
                type: "InnerGenerator",
                inputs: [
                  { name: "prompt", type: "STRING", link: 100, widget: { name: "prompt" } },
                  { name: "width", type: "INT", link: 101, widget: { name: "width" } },
                ],
                widgets_values: ["inner fallback", 256],
              },
              {
                id: 3,
                type: "InnerPost",
                inputs: [{ name: "source", type: "DATA", link: 102 }],
                widgets_values: ["high"],
              },
            ],
            links: [
              { id: 100, origin_id: -10, origin_slot: 0, target_id: 2, target_slot: 0 },
              { id: 101, origin_id: -10, origin_slot: 1, target_id: 2, target_slot: 1 },
              { id: 102, origin_id: 2, origin_slot: 0, target_id: 3, target_slot: 0 },
              { id: 103, origin_id: 3, origin_slot: 0, target_id: -20, target_slot: 0 },
            ],
          },
        ],
      },
    };
    const objectInfo: WorkflowObjectInfo = {
      PrimitiveInt: {
        input: { required: { value: ["INT", { default: 0 }] } },
        input_order: { required: ["value"] },
      },
      InnerGenerator: {
        input: {
          required: {
            prompt: ["STRING", { multiline: true }],
            width: ["INT", { default: 256 }],
          },
        },
        input_order: { required: ["prompt", "width"] },
      },
      InnerPost: {
        input: {
          required: {
            source: ["DATA", {}],
            quality: [["draft", "high"]],
          },
        },
        input_order: { required: ["source", "quality"] },
      },
      SaveThing: {
        input: {
          required: {
            value: ["DATA", {}],
            filename: ["STRING", { default: "output" }],
          },
        },
        input_order: { required: ["value", "filename"] },
      },
    };

    expect(workflowHasSubgraphs(uiWorkflow)).toBe(true);
    expect(normalizeWorkflow(uiWorkflow, { objectInfo })).toEqual({
      "1": { class_type: "PrimitiveInt", inputs: { value: 640 } },
      "5:2": {
        class_type: "InnerGenerator",
        inputs: {
          prompt: "hello from the container",
          width: ["1", 0],
        },
      },
      "5:3": {
        class_type: "InnerPost",
        inputs: {
          source: ["5:2", 0],
          quality: "high",
        },
      },
      "9": {
        class_type: "SaveThing",
        inputs: {
          value: ["5:3", 0],
          filename: "result/output",
        },
      },
    });
  });

  it("expands dynamic combo widgets into flattened API inputs", () => {
    const uiWorkflow = {
      nodes: [{ id: 5, type: "subgraph-id", inputs: [], widgets_values: [] }],
      links: [],
      definitions: {
        subgraphs: [
          {
            id: "subgraph-id",
            inputs: [],
            outputs: [],
            links: [],
            nodes: [
              {
                id: 2,
                type: "TextGenerate",
                inputs: [
                  { name: "clip", type: "CLIP", link: null },
                  { name: "prompt", type: "STRING", link: null, widget: { name: "prompt" } },
                  { name: "max_length", type: "INT", link: null, widget: { name: "max_length" } },
                  {
                    name: "sampling_mode",
                    type: "COMFY_DYNAMICCOMBO_V3",
                    link: null,
                    widget: { name: "sampling_mode" },
                  },
                  { name: "thinking", type: "BOOLEAN", link: null, widget: { name: "thinking" } },
                ],
                widgets_values: [
                  "expand this",
                  600,
                  "on",
                  0.7,
                  64,
                  0.95,
                  0.05,
                  1.15,
                  42,
                  0,
                  false,
                ],
              },
              {
                id: 4,
                type: "TextGenerate",
                inputs: [
                  { name: "clip", type: "CLIP", link: null },
                  { name: "prompt", type: "STRING", link: null, widget: { name: "prompt" } },
                  { name: "max_length", type: "INT", link: null, widget: { name: "max_length" } },
                  {
                    name: "sampling_mode",
                    type: "COMFY_DYNAMICCOMBO_V3",
                    link: null,
                    widget: { name: "sampling_mode" },
                  },
                  { name: "thinking", type: "BOOLEAN", link: null, widget: { name: "thinking" } },
                ],
                widgets_values: ["do not sample", 256, "off", true],
              },
              {
                id: 3,
                type: "EmptyLatentAudio",
                inputs: [
                  {
                    name: "frames_number",
                    type: "INT",
                    link: null,
                    widget: { name: "frames_number" },
                  },
                  {
                    name: "frame_rate",
                    type: "FLOAT,INT",
                    link: null,
                    widget: { name: "frame_rate" },
                  },
                ],
                widgets_values: [97, 25, 1],
              },
            ],
          },
        ],
      },
    };
    const objectInfo: WorkflowObjectInfo = {
      TextGenerate: {
        input: {
          required: {
            clip: ["CLIP", { forceInput: true }],
            prompt: ["STRING", { multiline: true }],
            max_length: ["INT", { default: 256 }],
            sampling_mode: [
              "COMFY_DYNAMICCOMBO_V3",
              {
                options: [
                  {
                    key: "on",
                    inputs: {
                      required: {
                        temperature: ["FLOAT", { default: 0.7 }],
                        top_k: ["INT", { default: 64 }],
                        top_p: ["FLOAT", { default: 0.95 }],
                        min_p: ["FLOAT", { default: 0.05 }],
                        repetition_penalty: ["FLOAT", { default: 1.05 }],
                        seed: ["INT", { default: 0 }],
                      },
                      optional: {
                        presence_penalty: ["FLOAT", { default: 0 }],
                      },
                    },
                  },
                  { key: "off", inputs: { required: {} } },
                ],
              },
            ],
          },
          optional: {
            thinking: ["BOOLEAN", { default: false }],
          },
        },
        input_order: {
          required: ["clip", "prompt", "max_length", "sampling_mode"],
          optional: ["thinking"],
        },
      },
      EmptyLatentAudio: {
        input: {
          required: {
            frames_number: ["INT", { default: 97 }],
            frame_rate: ["FLOAT,INT", { default: 25 }],
            batch_size: ["INT", { default: 1 }],
          },
        },
        input_order: {
          required: ["frames_number", "frame_rate", "batch_size"],
        },
      },
    };

    expect(normalizeWorkflow(uiWorkflow, { objectInfo })).toEqual({
      "5:2": {
        class_type: "TextGenerate",
        inputs: {
          prompt: "expand this",
          max_length: 600,
          sampling_mode: "on",
          "sampling_mode.temperature": 0.7,
          "sampling_mode.top_k": 64,
          "sampling_mode.top_p": 0.95,
          "sampling_mode.min_p": 0.05,
          "sampling_mode.repetition_penalty": 1.15,
          "sampling_mode.seed": 42,
          "sampling_mode.presence_penalty": 0,
          thinking: false,
        },
      },
      "5:4": {
        class_type: "TextGenerate",
        inputs: {
          prompt: "do not sample",
          max_length: 256,
          sampling_mode: "off",
          thinking: true,
        },
      },
      "5:3": {
        class_type: "EmptyLatentAudio",
        inputs: {
          frames_number: 97,
          frame_rate: 25,
          batch_size: 1,
        },
      },
    });
  });

  it("requires object_info instead of silently importing a subgraph container", () => {
    const uiWorkflow = {
      nodes: [{ id: 5, type: "subgraph-id", inputs: [], widgets_values: [] }],
      links: [],
      definitions: {
        subgraphs: [{ id: "subgraph-id", inputs: [], outputs: [], nodes: [], links: [] }],
      },
    };

    expect(() => normalizeWorkflow(uiWorkflow)).toThrow(/object_info/);
  });

  it("does not consume widget values for primitive forceInput boundary sockets", () => {
    const uiWorkflow = {
      nodes: [
        {
          id: 5,
          type: "subgraph-id",
          inputs: [{ name: "count", type: "INT", link: null }],
          widgets_values: ["prompt after socket"],
        },
      ],
      links: [],
      definitions: {
        subgraphs: [
          {
            id: "subgraph-id",
            inputs: [
              { name: "count", type: "INT" },
              { name: "prompt", type: "STRING" },
            ],
            outputs: [],
            nodes: [
              {
                id: 2,
                type: "ForceInputConsumer",
                inputs: [{ name: "count", type: "INT", link: 100 }],
                widgets_values: [],
              },
              {
                id: 3,
                type: "TextConsumer",
                inputs: [
                  { name: "prompt", type: "STRING", link: 101, widget: { name: "prompt" } },
                ],
                widgets_values: ["fallback"],
              },
            ],
            links: [
              { id: 100, origin_id: -10, origin_slot: 0, target_id: 2, target_slot: 0 },
              { id: 101, origin_id: -10, origin_slot: 1, target_id: 3, target_slot: 0 },
            ],
          },
        ],
      },
    };
    const objectInfo: WorkflowObjectInfo = {
      ForceInputConsumer: {
        input: { required: { count: ["INT", { forceInput: true }] } },
        input_order: { required: ["count"] },
      },
      TextConsumer: {
        input: { required: { prompt: ["STRING", {}] } },
        input_order: { required: ["prompt"] },
      },
    };

    expect(normalizeWorkflow(uiWorkflow, { objectInfo })).toEqual({
      "5:2": { class_type: "ForceInputConsumer", inputs: {} },
      "5:3": { class_type: "TextConsumer", inputs: { prompt: "prompt after socket" } },
    });
  });

  it("reports a stale object_info schema with the missing node class", () => {
    const uiWorkflow = {
      nodes: [{ id: 5, type: "subgraph-id", inputs: [], widgets_values: [] }],
      links: [],
      definitions: {
        subgraphs: [
          {
            id: "subgraph-id",
            inputs: [],
            outputs: [],
            nodes: [{ id: 2, type: "NewNode", inputs: [], widgets_values: [] }],
            links: [],
          },
        ],
      },
    };

    expect(() => normalizeWorkflow(uiWorkflow, { objectInfo: {} })).toThrow(/NewNode/);
  });
});
