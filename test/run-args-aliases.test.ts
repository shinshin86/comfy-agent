import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPresetTemplate } from "../src/cli/import.js";
import { resolveDynamicArgs } from "../src/cli/run/args.js";
import type { Preset } from "../src/preset/schema.js";
import type { Workflow } from "../src/workflow/normalize.js";

const aliasPreset: Preset = {
  version: 1,
  name: "demo",
  workflow: "demo.json",
  parameters: {
    "4_text": {
      type: "string",
      target: { node_id: "4", input: "text" },
      aliases: ["prompt"],
    },
  },
};

describe("resolveDynamicArgs aliases", () => {
  it("maps --prompt to the canonical generated parameter", () => {
    expect(resolveDynamicArgs(["--prompt", "hello"], aliasPreset).params).toEqual({
      "4_text": "hello",
    });
  });

  it("continues to accept the canonical node input flag", () => {
    expect(resolveDynamicArgs(["--4_text", "hello"], aliasPreset).params).toEqual({
      "4_text": "hello",
    });
  });

  it("uses the later value when alias and canonical flags are both present", () => {
    expect(
      resolveDynamicArgs(["--prompt", "first", "--4_text", "second"], aliasPreset).params,
    ).toEqual({ "4_text": "second" });
    expect(
      resolveDynamicArgs(["--4_text", "first", "--prompt", "second"], aliasPreset).params,
    ).toEqual({ "4_text": "second" });
  });

  it("keeps canonical parameter names ahead of an alias collision", () => {
    const preset: Preset = {
      ...aliasPreset,
      parameters: {
        ...aliasPreset.parameters,
        prompt: {
          type: "string",
          target: { node_id: "9", input: "prompt" },
        },
      },
    };
    expect(resolveDynamicArgs(["--prompt", "hello"], preset).params).toEqual({
      prompt: "hello",
    });
  });

  it("leaves --seed to the dedicated run option path", () => {
    const preset: Preset = {
      version: 1,
      name: "seeded",
      workflow: "seeded.json",
      parameters: {
        "7_seed": {
          type: "int",
          target: { node_id: "7", input: "seed" },
          role: "seed",
        },
      },
    };
    expect(resolveDynamicArgs(["--seed", "42"], preset).params).toEqual({});
  });

  it("never generates seed aliases", async () => {
    const workflowPath = path.join(
      process.cwd(),
      "scripts",
      "colab",
      "z_image",
      "z_image_turbo.json",
    );
    const workflow = JSON.parse(await fs.readFile(workflowPath, "utf-8")) as Workflow;
    const preset = buildPresetTemplate("z_image", "z_image_turbo.json", workflow, null);
    const aliases = Object.values(preset.parameters ?? {}).flatMap(
      (parameter) => parameter.aliases ?? [],
    );
    expect(aliases).not.toContain("seed");
  });
});
