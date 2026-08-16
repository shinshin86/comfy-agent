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
});
