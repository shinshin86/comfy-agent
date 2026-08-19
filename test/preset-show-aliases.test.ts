import path from "node:path";
import { promises as fs } from "node:fs";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";
import type { Preset } from "../src/preset/schema.js";

describe("preset text aliases", () => {
  it("prints aliases on parameter lines", async () => {
    const workdir = await createTmpWorkdir();
    const preset: Preset = {
      version: 1,
      name: "demo",
      workflow: "demo.json",
      parameters: {
        "4_text": {
          type: "string",
          target: { node_id: "4", input: "text" },
          aliases: ["prompt", "positive"],
          default: "hello",
        },
      },
    };
    await fs.writeFile(
      path.join(workdir.workdir, "presets", "demo.yaml"),
      YAML.stringify(preset),
      "utf-8",
    );

    const result = await runCli(["preset", "demo", "--source", "local"], {
      cwd: workdir.cwd,
      env: {
        HOME: workdir.home,
        USERPROFILE: workdir.home,
        COMFY_AGENT_BASE_URL: "http://127.0.0.1:1",
        COMFY_AGENT_TEST_ENTRY: "tsx",
      },
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("aliases=--prompt,--positive");
  });

  it("warns when parameter aliases are shadowed by run flags", async () => {
    const workdir = await createTmpWorkdir();
    const preset: Preset = {
      version: 1,
      name: "shadowed",
      workflow: "shadowed.json",
      parameters: {
        sampler_seed: {
          type: "int",
          target: { node_id: "7", input: "seed" },
          aliases: ["seed", "lora", "prompt"],
          default: 42,
        },
      },
    };
    await fs.writeFile(
      path.join(workdir.workdir, "presets", "shadowed.yaml"),
      YAML.stringify(preset),
      "utf-8",
    );
    const env = {
      HOME: workdir.home,
      USERPROFILE: workdir.home,
      COMFY_AGENT_BASE_URL: "http://127.0.0.1:1",
      COMFY_AGENT_TEST_ENTRY: "tsx",
    };

    const textResult = await runCli(["preset", "shadowed", "--source", "local"], {
      cwd: workdir.cwd,
      env,
    });
    expect(textResult.code, textResult.stderr).toBe(0);
    expect(textResult.stdout).toContain('warning: alias "--seed" is shadowed by a run flag');
    expect(textResult.stdout).toContain('warning: alias "--lora" is shadowed by a run flag');
    expect(textResult.stdout).not.toContain('warning: alias "--prompt" is shadowed by a run flag');

    const jsonResult = await runCli(["preset", "shadowed", "--source", "local", "--json"], {
      cwd: workdir.cwd,
      env,
    });
    expect(jsonResult.code, jsonResult.stderr).toBe(0);
    expect(JSON.parse(jsonResult.stdout)).toMatchObject({
      warnings: [
        { code: "ALIAS_SHADOWED", param: "sampler_seed", alias: "seed" },
        { code: "ALIAS_SHADOWED", param: "sampler_seed", alias: "lora" },
      ],
    });
  });
});
