import { describe, expect, it } from "vitest";
import {
  assertPreflightPasses,
  buildPreflightReport,
  classifyServerError,
} from "../src/workflow/preflight.js";
import { CliError } from "../src/io/errors.js";

const objectInfo = {
  CheckpointLoaderSimple: {
    input: {
      required: {
        ckpt_name: [["z_image_turbo_bf16.safetensors", "sdxl_base_1.0.safetensors"]],
      },
    },
  },
  VAELoader: {
    input: {
      required: {
        vae_name: [["ae.safetensors"]],
      },
    },
  },
  KSampler: {
    input: {
      required: {
        seed: ["INT", { default: 0 }],
        sampler_name: [["euler", "dpmpp_2m"]],
      },
    },
  },
};

describe("buildPreflightReport", () => {
  it("passes when nodes and models exist on the server", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "z_image_turbo_bf16.safetensors" },
      },
      "2": { class_type: "KSampler", inputs: { seed: 5, sampler_name: "euler", model: ["1", 0] } },
    };
    const report = buildPreflightReport(workflow, objectInfo);
    expect(report.checked).toBe(true);
    expect(report.missing_nodes).toEqual([]);
    expect(report.missing_models).toEqual([]);
  });

  it("reports a node class the server does not have", () => {
    const workflow = {
      "1": { class_type: "TotallyCustomNode", inputs: {} },
    };
    const report = buildPreflightReport(workflow, objectInfo);
    expect(report.missing_nodes).toEqual([{ node_id: "1", class_type: "TotallyCustomNode" }]);
  });

  it("reports a model file missing from the server with available list", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "ace_step_1.5_turbo_aio.safetensors" },
      },
    };
    const report = buildPreflightReport(workflow, objectInfo);
    expect(report.missing_models).toHaveLength(1);
    expect(report.missing_models[0]).toMatchObject({
      node_id: "1",
      class_type: "CheckpointLoaderSimple",
      input: "ckpt_name",
      value: "ace_step_1.5_turbo_aio.safetensors",
    });
    expect(report.missing_models[0]!.available).toContain("z_image_turbo_bf16.safetensors");
  });

  it("ignores non-file combo mismatches like sampler names", () => {
    const workflow = {
      "1": { class_type: "KSampler", inputs: { sampler_name: "not_a_real_sampler" } },
    };
    const report = buildPreflightReport(workflow, objectInfo);
    expect(report.missing_models).toEqual([]);
  });

  it("ignores link inputs (arrays) and non-combo inputs", () => {
    const workflow = {
      "1": {
        class_type: "KSampler",
        inputs: { model: ["2", 0], seed: 42 },
      },
    };
    const report = buildPreflightReport(workflow, objectInfo);
    expect(report.missing_nodes).toEqual([]);
    expect(report.missing_models).toEqual([]);
  });

  it("caps the available list at 50 entries and flags truncation", () => {
    const many = Array.from({ length: 80 }, (_, i) => `model_${i}.safetensors`);
    const info = {
      CheckpointLoaderSimple: { input: { required: { ckpt_name: [many] } } },
    };
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "nope.safetensors" } },
    };
    const report = buildPreflightReport(workflow, info);
    expect(report.missing_models[0]!.available).toHaveLength(50);
    expect(report.missing_models[0]!.available_truncated).toBe(true);
  });
});

describe("classifyServerError", () => {
  it("classifies network failures as unreachable", () => {
    const err = new CliError("API_ERROR", "net", 3, { cause: "fetch failed", kind: "network" });
    expect(classifyServerError(err)).toBe("unreachable");
  });

  it("classifies a dead Cloudflare tunnel (HTTP 530) as unreachable", () => {
    const err = new CliError("API_ERROR", "get failed", 3, { status: 530, kind: "http" });
    expect(classifyServerError(err)).toBe("unreachable");
  });

  it("classifies 5xx as unreachable", () => {
    const err = new CliError("API_ERROR", "get failed", 3, { status: 502, kind: "http" });
    expect(classifyServerError(err)).toBe("unreachable");
  });

  it("classifies 404/405 as endpoint_missing (old ComfyUI without /object_info)", () => {
    expect(
      classifyServerError(new CliError("API_ERROR", "x", 3, { status: 404, kind: "http" })),
    ).toBe("endpoint_missing");
    expect(
      classifyServerError(new CliError("API_ERROR", "x", 3, { status: 405, kind: "http" })),
    ).toBe("endpoint_missing");
  });

  it("classifies a 200 with a non-JSON body as api_error, not unreachable", () => {
    const err = new CliError("API_ERROR", "bad body", 3, { status: 200, kind: "invalid_response" });
    expect(classifyServerError(err)).toBe("api_error");
  });

  it("treats legacy status-less CliErrors as unreachable", () => {
    const err = new CliError("API_ERROR", "net", 3, { cause: "boom" });
    expect(classifyServerError(err)).toBe("unreachable");
  });
});

describe("assertPreflightPasses", () => {
  it("throws MISSING_NODE_ON_SERVER with both lists in details", () => {
    const report = {
      checked: true,
      missing_nodes: [{ node_id: "1", class_type: "X" }],
      missing_models: [
        {
          node_id: "2",
          class_type: "CheckpointLoaderSimple",
          input: "ckpt_name",
          value: "a.safetensors",
          available: [],
        },
      ],
    };
    try {
      assertPreflightPasses(report, "http://server.example");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      const cliErr = err as CliError;
      expect(cliErr.code).toBe("MISSING_NODE_ON_SERVER");
      expect(cliErr.exitCode).toBe(3);
      expect(cliErr.details).toMatchObject({
        server: "http://server.example",
        missing_nodes: report.missing_nodes,
        missing_models: report.missing_models,
      });
    }
  });

  it("throws MISSING_MODEL_ON_SERVER when only models are missing", () => {
    const report = {
      checked: true,
      missing_nodes: [],
      missing_models: [
        {
          node_id: "2",
          class_type: "CheckpointLoaderSimple",
          input: "ckpt_name",
          value: "a.safetensors",
          available: ["b.safetensors"],
        },
      ],
    };
    expect(() => assertPreflightPasses(report, "http://s")).toThrowError(
      expect.objectContaining({ code: "MISSING_MODEL_ON_SERVER" }),
    );
  });

  it("does nothing when the report is clean or unchecked", () => {
    expect(() =>
      assertPreflightPasses({ checked: true, missing_nodes: [], missing_models: [] }, "http://s"),
    ).not.toThrow();
    expect(() =>
      assertPreflightPasses({ checked: false, missing_nodes: [], missing_models: [] }, "http://s"),
    ).not.toThrow();
  });
});
