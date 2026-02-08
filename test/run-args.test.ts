import { describe, expect, it } from "vitest";
import { CliError } from "../src/io/errors.js";
import { parseNumeric, resolveDynamicArgs, resolveSeedValues } from "../src/cli/run/args.js";
import type { Preset } from "../src/preset/schema.js";

const presetBase: Preset = {
  version: 1,
  name: "demo",
  workflow: "demo.json",
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
    use_cache: {
      type: "bool",
      target: { node_id: "3", input: "enabled" },
    },
    config: {
      type: "json",
      target: { node_id: "4", input: "config" },
    },
    seed: {
      type: "int",
      target: { node_id: "5", input: "seed" },
    },
  },
  uploads: {
    init: {
      kind: "image",
      cli_flag: "--init-image",
      target: { node_id: "6", input: "image" },
    },
  },
};

describe("parseNumeric", () => {
  it("parses valid numbers", () => {
    expect(parseNumeric("10", "n", true)).toBe(10);
    expect(parseNumeric("10.5", "ratio", false)).toBe(10.5);
  });

  it("throws on invalid number/integer", () => {
    expect(() => parseNumeric("abc", "n", true)).toThrow(CliError);
    expect(() => parseNumeric("10.5", "n", true)).toThrow(CliError);
  });
});

describe("resolveDynamicArgs", () => {
  it("parses inline values including '=' in value", () => {
    const { params } = resolveDynamicArgs(
      ["--prompt=a=b=c", "--steps=30", '--config={"a":1}'],
      presetBase,
    );
    expect(params.prompt).toBe("a=b=c");
    expect(params.steps).toBe(30);
    expect(params.config).toEqual({ a: 1 });
  });

  it("handles bool flag without explicit value", () => {
    const { params } = resolveDynamicArgs(["--prompt", "cat", "--use_cache"], presetBase);
    expect(params.use_cache).toBe(true);
  });

  it("fills default values", () => {
    const { params } = resolveDynamicArgs(["--prompt", "cat"], presetBase);
    expect(params.steps).toBe(20);
  });

  it("parses uploads and keeps them separated from params", () => {
    const { params, uploads } = resolveDynamicArgs(
      ["--prompt", "cat", "--init-image", "./in.png"],
      presetBase,
    );
    expect(params.prompt).toBe("cat");
    expect(uploads).toEqual({ init: "./in.png" });
  });

  it("throws on unknown param", () => {
    expect(() => resolveDynamicArgs(["--prompt", "cat", "--unknown", "x"], presetBase)).toThrow(
      CliError,
    );
  });

  it("throws when required param is missing", () => {
    expect(() => resolveDynamicArgs([], presetBase)).toThrow(CliError);
  });

  it("throws when non-bool flag is passed without value", () => {
    expect(() => resolveDynamicArgs(["--prompt"], presetBase)).toThrow(CliError);
  });

  it("throws when upload flag is passed without path", () => {
    expect(() => resolveDynamicArgs(["--prompt", "cat", "--init-image"], presetBase)).toThrow(
      CliError,
    );
  });
});

describe("resolveSeedValues", () => {
  it("returns null seeds when seed options are omitted", () => {
    const seeds = resolveSeedValues(presetBase, {}, {}, 3);
    expect(seeds).toEqual([null, null, null]);
  });

  it("returns incremental seeds", () => {
    const seeds = resolveSeedValues(presetBase, {}, { seed: "10", seedStep: "2" }, 3);
    expect(seeds).toEqual([10, 12, 14]);
  });

  it("returns random seeds when seed=random", () => {
    const seeds = resolveSeedValues(presetBase, {}, { seed: "random" }, 4);
    expect(seeds).toHaveLength(4);
    for (const seed of seeds) {
      expect(typeof seed).toBe("number");
      expect(Number.isInteger(seed)).toBe(true);
    }
  });

  it("throws when preset has no seed target", () => {
    const noSeedPreset: Preset = {
      ...presetBase,
      parameters: {
        prompt: presetBase.parameters!.prompt,
      },
    };
    expect(() => resolveSeedValues(noSeedPreset, {}, { seed: "1" }, 1)).toThrow(CliError);
  });

  it("throws when seed-step is provided without seed", () => {
    expect(() => resolveSeedValues(presetBase, {}, { seedStep: "1" }, 1)).toThrow(CliError);
  });
});
