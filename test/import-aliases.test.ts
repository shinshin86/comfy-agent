import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { buildImportPayload, buildPresetTemplate } from "../src/cli/import.js";
import { inferAliases } from "../src/preset/aliases.js";
import type { Preset } from "../src/preset/schema.js";
import type { Workflow } from "../src/workflow/normalize.js";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const colabDir = path.join(process.cwd(), "scripts", "colab");

const loadWorkflow = async (relativePath: string): Promise<Workflow> =>
  JSON.parse(await fs.readFile(path.join(colabDir, relativePath), "utf-8")) as Workflow;

const buildFixturePreset = async (relativePath: string, existingPreset?: Preset | null) => {
  const workflow = await loadWorkflow(relativePath);
  return buildPresetTemplate("fixture", path.basename(relativePath), workflow, null, {
    existingPreset,
  });
};

const aliasYaml = (preset: Preset) => {
  const aliases = Object.fromEntries(
    Object.entries(preset.parameters ?? {}).flatMap(([name, parameter]) =>
      (parameter.aliases ?? []).map((alias) => [alias, name]),
    ),
  );
  return YAML.stringify(aliases).trim();
};

describe("buildPresetTemplate aliases", () => {
  it("generates aliases and corrects the negative role", async () => {
    const preset = await buildFixturePreset("z_image/z_image_turbo.json");

    expect(preset.parameters?.["4_text"]?.aliases).toEqual(["prompt"]);
    expect(preset.parameters?.["5_text"]).toMatchObject({
      aliases: ["negative"],
      role: "negative_prompt",
      description: "Negative prompt (what to avoid).",
    });
    expect(Object.keys(preset.parameters!["4_text"]!)).toEqual([
      "type",
      "target",
      "description",
      "role",
      "aliases",
      "default",
      "required",
    ]);
    expect(preset.parameters?.["7_seed"]?.aliases).toBeUndefined();
  });

  it("keeps manual aliases first only when the target is unchanged", async () => {
    const generated = await buildFixturePreset("z_image/z_image_turbo.json");
    const existing: Preset = {
      ...generated,
      parameters: {
        ...generated.parameters,
        "4_text": {
          ...generated.parameters!["4_text"]!,
          aliases: ["positive", "prompt"],
        },
      },
    };

    const retained = await buildFixturePreset("z_image/z_image_turbo.json", existing);
    expect(retained.parameters?.["4_text"]?.aliases).toEqual(["positive", "prompt"]);

    existing.parameters!["4_text"]!.target = { node_id: "99", input: "text" };
    const changed = await buildFixturePreset("z_image/z_image_turbo.json", existing);
    expect(changed.parameters?.["4_text"]?.aliases).toEqual(["prompt"]);
  });

  it("gives a manual alias precedence over an automatic alias on another parameter", async () => {
    const generated = await buildFixturePreset("z_image/z_image_turbo.json");
    const existing: Preset = {
      ...generated,
      parameters: {
        ...generated.parameters,
        "5_text": {
          ...generated.parameters!["5_text"]!,
          aliases: ["prompt"],
        },
      },
    };

    const preset = await buildFixturePreset("z_image/z_image_turbo.json", existing);
    expect(preset.parameters?.["4_text"]?.aliases).toBeUndefined();
    expect(preset.parameters?.["5_text"]?.aliases).toEqual(["prompt", "negative"]);
  });

  it("does not turn upload flags or seed into parameter aliases", async () => {
    const preset = await buildFixturePreset("qwen_image_edit/qwen_image_edit.json");
    const aliases = Object.values(preset.parameters ?? {}).flatMap(
      (parameter) => parameter.aliases ?? [],
    );

    expect(preset.uploads?.image?.cli_flag).toBe("--image");
    expect(aliases).not.toContain("image");
    expect(aliases).not.toContain("seed");
  });

  it("imports MiniMax H3 R2V with image/audio uploads and stable controls", async () => {
    const preset = await buildFixturePreset("minimax_h3/minimax_h3_r2v.json");

    expect(preset.uploads).toMatchObject({
      image: { cli_flag: "--image", target: { node_id: "114", input: "image" } },
      audio: { cli_flag: "--audio", target: { node_id: "115", input: "audio" } },
    });
    expect(preset.parameters?.["104_prompt"]?.aliases).toEqual(["prompt"]);
    expect(preset.parameters?.["104_width"]?.aliases).toEqual(["width"]);
    expect(preset.parameters?.["104_height"]?.aliases).toEqual(["height"]);
    expect(preset.parameters?.["104_length"]?.aliases).toEqual(["length"]);
    expect(preset.parameters?.["15_noise_seed"]?.role).toBe("seed");
  });

  it("adds inferred alias provenance to the import JSON payload", async () => {
    const workflow = await loadWorkflow("z_image/z_image_turbo.json");
    const presetTemplate = buildPresetTemplate("fixture", "z_image_turbo.json", workflow, null);
    const aliasAssignments = inferAliases(workflow, {
      reservedFlags: Object.keys(presetTemplate.parameters ?? {}),
    });
    const payload = buildImportPayload({
      name: "fixture",
      scope: "local",
      baseUrl: "http://127.0.0.1:8188",
      workflowDest: "/project/.comfy-agent/workflows/fixture.json",
      presetDest: "/project/.comfy-agent/presets/fixture.yaml",
      objectInfoSource: "cache",
      overwritten: false,
      hadSubgraphs: false,
      presetTemplate,
      aliasAssignments,
    });

    expect(payload.aliases[0]).toEqual({
      alias: "prompt",
      param: "4_text",
      node_id: "4",
      input: "text",
      via: "graph",
    });
  });

  it("retains handwritten aliases during --force re-import", async () => {
    const workdir = await createTmpWorkdir();
    const env = {
      HOME: workdir.home,
      USERPROFILE: workdir.home,
      COMFY_AGENT_BASE_URL: "http://127.0.0.1:1",
      COMFY_AGENT_TEST_ENTRY: "tsx",
    };
    const workflowPath = path.join(colabDir, "z_image", "z_image_turbo.json");
    expect((await runCli(["init"], { cwd: workdir.cwd, env })).code).toBe(0);
    expect(
      (await runCli(["import", workflowPath, "--name", "demo"], { cwd: workdir.cwd, env })).code,
    ).toBe(0);

    const presetPath = path.join(workdir.workdir, "presets", "demo.yaml");
    const preset = YAML.parse(await fs.readFile(presetPath, "utf-8")) as Preset;
    preset.parameters!["4_text"]!.aliases = ["positive", "prompt"];
    await fs.writeFile(presetPath, YAML.stringify(preset), "utf-8");

    const result = await runCli(["import", workflowPath, "--name", "demo", "--force"], {
      cwd: workdir.cwd,
      env,
    });
    const reimported = YAML.parse(await fs.readFile(presetPath, "utf-8")) as Preset;

    expect(result.code, result.stderr).toBe(0);
    expect(reimported.parameters?.["4_text"]?.aliases).toEqual(["positive", "prompt"]);
  });
});

describe("generated alias YAML", () => {
  it("matches z_image", async () => {
    expect(aliasYaml(await buildFixturePreset("z_image/z_image_turbo.json")))
      .toMatchInlineSnapshot(`
        "prompt: 4_text
        negative: 5_text
        width: 6_width
        height: 6_height
        steps: 7_steps
        cfg: 7_cfg
        denoise: 7_denoise"
      `);
  });

  it("matches Wan TI2V", async () => {
    expect(aliasYaml(await buildFixturePreset("wan22/wan22_ti2v_5b.json"))).toMatchInlineSnapshot(`
        "steps: 3_steps
        cfg: 3_cfg
        denoise: 3_denoise
        prompt: 6_text
        negative: 7_text
        fps: 28_fps
        width: 55_width
        height: 55_height
        length: 55_length"
      `);
  });

  it("matches ACE-Step", async () => {
    expect(aliasYaml(await buildFixturePreset("ace_step_1_5/ace_step_1_5_t2a.json")))
      .toMatchInlineSnapshot(`
        "prompt: 2_tags
        lyrics: 2_lyrics
        seconds: 4_seconds
        steps: 6_steps
        cfg: 6_cfg
        denoise: 6_denoise"
      `);
  });

  it("matches Flux 1", async () => {
    expect(aliasYaml(await buildFixturePreset("flux1/flux1_dev.json"))).toMatchInlineSnapshot(`
        "prompt: 2_text
        guidance: 3_guidance
        negative: 4_text
        width: 5_width
        height: 5_height
        steps: 6_steps
        cfg: 6_cfg
        denoise: 6_denoise"
      `);
  });

  it("matches MiniMax H3", async () => {
    expect(aliasYaml(await buildFixturePreset("minimax_h3/minimax_h3_t2v.json")))
      .toMatchInlineSnapshot(`
        "steps: 9_steps
        fps: 91_fps
        prompt: 104_prompt
        width: 104_width
        height: 104_height
        length: 104_length"
      `);
  });

  it("matches MiniMax H3 R2V", async () => {
    expect(aliasYaml(await buildFixturePreset("minimax_h3/minimax_h3_r2v.json")))
      .toMatchInlineSnapshot(`
        "steps: 9_steps
        fps: 91_fps
        prompt: 104_prompt
        width: 104_width
        height: 104_height
        length: 104_length"
      `);
  });
});
