import { describe, expect, it } from "vitest";
import { pruneOptionalInputs, skipWorkflowUploads } from "../src/workflow/optional-inputs.js";
import type { WorkflowObjectInfo } from "../src/workflow/normalize.js";

export const optionalGraph = {
  "1": { class_type: "LoadImage", inputs: { image: "default.png" } },
  "2": { class_type: "VAEEncode", inputs: { pixels: ["1", 0] } },
  "3": {
    class_type: "WanImageToVideo",
    inputs: { start_image: ["2", 0], length: 81, prompt: "A scene" },
  },
  "4": { class_type: "SaveVideo", inputs: { video: ["3", 0] } },
};
export const optionalInfo: WorkflowObjectInfo = {
  LoadImage: { input: { required: { image: ["STRING"] } } },
  VAEEncode: { input: { required: { pixels: ["IMAGE"] } } },
  WanImageToVideo: {
    input: {
      required: { length: ["INT", { min: 1, max: 241, step: 8 }], prompt: ["STRING"] },
      optional: { start_image: ["LATENT"] },
    },
  },
  SaveVideo: { output_node: true, input: { required: { video: ["VIDEO"] } } },
};
describe("optional workflow inputs", () => {
  it("removes a required VAE chain, disconnects optional start image and keeps the video output", () => {
    const before = structuredClone(optionalGraph);
    const result = pruneOptionalInputs(optionalGraph, ["1"], optionalInfo);
    expect(result.skippable).toBe(true);
    expect(Object.keys(result.workflow)).toEqual(["3", "4"]);
    expect(result.workflow["3"]).toEqual({
      class_type: "WanImageToVideo",
      inputs: { length: 81, prompt: "A scene" },
    });
    expect(optionalGraph).toEqual(before);
  });
  it("does not treat a required encode-to-save chain as optional", () => {
    const graph = {
      ...optionalGraph,
      "3": { class_type: "SaveVideo", inputs: { video: ["2", 0] } },
    };
    delete (graph as Record<string, unknown>)["4"];
    expect(pruneOptionalInputs(graph, ["1"], optionalInfo)).toMatchObject({
      skippable: false,
      reason: "no_surviving_output",
    });
  });
  it("supports several optional references and removes now-unused helper nodes", () => {
    const graph = {
      "1": { class_type: "LoadImage", inputs: { image: "a.png" } },
      "2": { class_type: "LoadImage", inputs: { image: "b.png" } },
      "3": { class_type: "ReferenceToVideo", inputs: { ref1: ["1", 0], ref2: ["2", 0] } },
      "4": optionalGraph["4"],
      "5": { class_type: "LoadImage", inputs: { image: "unused.png" } },
    };
    const info = {
      ...optionalInfo,
      ReferenceToVideo: { input: { optional: { ref1: ["IMAGE"], ref2: ["IMAGE"] } } },
    };
    expect(pruneOptionalInputs(graph, ["1", "2"], info).workflow).toEqual({
      "3": { class_type: "ReferenceToVideo", inputs: {} },
      "4": optionalGraph["4"],
    });
  });
  it("rejects a combined skip that removes every output although each individual skip is safe", () => {
    const graph = {
      "1": optionalGraph["1"],
      "2": optionalGraph["1"],
      "3": { class_type: "SaveVideo", inputs: { video: ["1", 0] } },
      "4": { class_type: "SaveVideo", inputs: { video: ["2", 0] } },
    };
    expect(pruneOptionalInputs(graph, ["1"], optionalInfo).skippable).toBe(true);
    expect(pruneOptionalInputs(graph, ["2"], optionalInfo).skippable).toBe(true);
    expect(pruneOptionalInputs(graph, ["1", "2"], optionalInfo).skippable).toBe(false);
  });
  it("never guesses without object_info, with unknown classes or unknown linked inputs", () => {
    expect(pruneOptionalInputs(optionalGraph, ["1"]).skippable).toBe(false);
    expect(pruneOptionalInputs(optionalGraph, ["1"], {}).skippable).toBe(false);
    expect(
      pruneOptionalInputs(optionalGraph, ["1"], { ...optionalInfo, VAEEncode: {} }),
    ).toMatchObject({ skippable: false, reason: "unknown_input_requirement" });
    expect(pruneOptionalInputs(optionalGraph, ["missing"], optionalInfo).skippable).toBe(false);
    expect(
      pruneOptionalInputs(optionalGraph, ["1"], {
        ...optionalInfo,
        SaveVideo: { input: optionalInfo.SaveVideo!.input },
      }).skippable,
    ).toBe(false);
  });
  it("reports unknown upload slots separately from unsafe skips", () => {
    const preset = {
      version: 1 as const,
      name: "demo",
      workflow: "graph.json",
      uploads: {
        image: {
          kind: "image" as const,
          cli_flag: "--image",
          target: { node_id: "1", input: "image" },
        },
      },
    };
    expect(() =>
      skipWorkflowUploads(optionalGraph, preset, ["unknown"], optionalInfo),
    ).toThrowError(expect.objectContaining({ code: "UNKNOWN_INPUT_SLOT" }));
    expect(() => skipWorkflowUploads(optionalGraph, preset, ["image"])).toThrowError(
      expect.objectContaining({ code: "INPUT_NOT_SKIPPABLE" }),
    );
  });
});
