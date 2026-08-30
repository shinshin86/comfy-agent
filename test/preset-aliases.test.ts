import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALIAS_VOCABULARY,
  findConditioningSources,
  inferAliases,
  resolveLiteralSource,
} from "../src/preset/aliases.js";
import type { Workflow } from "../src/workflow/normalize.js";

const colabDir = path.join(process.cwd(), "scripts", "colab");

const loadWorkflow = async (relativePath: string): Promise<Workflow> =>
  JSON.parse(await fs.readFile(path.join(colabDir, relativePath), "utf-8")) as Workflow;

const aliasTargets = (workflow: Workflow) =>
  Object.fromEntries(
    inferAliases(workflow).map((assignment) => [
      assignment.alias,
      `${assignment.target.node_id}_${assignment.target.input}`,
    ]),
  );

describe("inferAliases with kit workflows", () => {
  it("detects the positive and negative branches for z_image", async () => {
    const workflow = await loadWorkflow("z_image/z_image_turbo.json");
    expect(findConditioningSources(workflow)).toEqual({
      positive: { node_id: "4", input: "text" },
      negative: { node_id: "5", input: "text" },
    });
    expect(aliasTargets(workflow)).toEqual({
      prompt: "4_text",
      negative: "5_text",
      steps: "7_steps",
      cfg: "7_cfg",
      width: "6_width",
      height: "6_height",
      denoise: "7_denoise",
    });
  });

  it("uses only the active first stage of a two-stage Wan sampler", async () => {
    const targets = aliasTargets(await loadWorkflow("wan22/wan22_t2v_14b.json"));
    expect(targets).toMatchObject({
      prompt: "6_text",
      negative: "7_text",
      steps: "57_steps",
      cfg: "57_cfg",
      width: "61_width",
      height: "61_height",
      length: "61_length",
      fps: "28_fps",
    });
    expect(Object.values(targets)).not.toContain("58_steps");
    expect(Object.values(targets)).not.toContain("58_cfg");
    expect(ALIAS_VOCABULARY).not.toContain("seed");
  });

  it("keeps cfg and Flux guidance as separate aliases", async () => {
    expect(aliasTargets(await loadWorkflow("flux1/flux1_dev.json"))).toMatchObject({
      cfg: "6_cfg",
      guidance: "3_guidance",
    });
  });

  it("follows BasicGuider and prefers latent dimensions for Flux 2", async () => {
    expect(aliasTargets(await loadWorkflow("flux2/flux2_dev.json"))).toEqual({
      prompt: "6_text",
      steps: "48_steps",
      guidance: "26_guidance",
      width: "47_width",
      height: "47_height",
    });
  });

  it("suppresses a negative branch that resolves to the positive source", async () => {
    const targets = aliasTargets(await loadWorkflow("ideogram4/ideogram4_t2i.json"));
    expect(targets).toMatchObject({
      prompt: "24_text",
      steps: "17_steps",
      cfg: "155_cfg",
      width: "11_width",
      height: "11_height",
    });
    expect(targets).not.toHaveProperty("negative");
  });

  it("follows conditioning intermediates and Primitive values", async () => {
    expect(
      aliasTargets(await loadWorkflow("10eros/video_10eros_t2v_distilled_api.json")),
    ).toMatchObject({
      prompt: "29_value",
      negative: "41_text",
      steps: "47_steps",
      cfg: "8_cfg",
      width: "40_value",
      height: "25_value",
      length: "27_value",
    });
  });

  it("detects audio-specific aliases without inventing a negative", async () => {
    const targets = aliasTargets(await loadWorkflow("ace_step_1_5/ace_step_1_5_t2a.json"));
    expect(targets).toMatchObject({
      prompt: "2_tags",
      steps: "6_steps",
      cfg: "6_cfg",
      seconds: "4_seconds",
      lyrics: "2_lyrics",
    });
    expect(targets).not.toHaveProperty("negative");
  });

  it("supports MiniMax, MOSS, and Qwen conditioning shapes", async () => {
    expect(aliasTargets(await loadWorkflow("minimax_h3/minimax_h3_t2v.json"))).toMatchObject({
      prompt: "104_prompt",
      length: "104_length",
    });
    expect(aliasTargets(await loadWorkflow("minimax_h3/minimax_h3_r2v.json"))).toMatchObject({
      prompt: "104_prompt",
      width: "104_width",
      height: "104_height",
      length: "104_length",
      fps: "91_fps",
    });
    expect(
      aliasTargets(await loadWorkflow("moss_soundeffect_v2/moss_soundeffect_v2_t2a.json")),
    ).toMatchObject({
      prompt: "1_prompt",
      negative: "1_negative_prompt",
      steps: "1_steps",
      cfg: "1_cfg_scale",
      seconds: "1_seconds",
    });
    expect(aliasTargets(await loadWorkflow("qwen_image_edit/qwen_image_edit.json"))).toMatchObject({
      prompt: "6_prompt",
      negative: "7_prompt",
    });
  });

  it("does not infer prompt aliases for workflows without prompt text", async () => {
    const seedvr = aliasTargets(await loadWorkflow("seedvr2/seedvr2_3b_upscale.json"));
    expect(seedvr).toEqual({ steps: "8_steps", cfg: "8_cfg", denoise: "8_denoise" });
    expect(aliasTargets(await loadWorkflow("birefnet/birefnet_remove_background.json"))).toEqual(
      {},
    );
  });
});

describe("inferAliases safeguards", () => {
  const synthetic: Workflow = {
    "1": {
      class_type: "PrimitiveStringMultiline",
      inputs: { value: "hello" },
      _meta: { title: "Prompt" },
    },
    "2": {
      class_type: "PrimitiveStringMultiline",
      inputs: { value: "avoid" },
      _meta: { title: "Negative Prompt" },
    },
    "3": { class_type: "PrimitiveInt", inputs: { value: 20 }, _meta: { title: "Steps" } },
    "4": { class_type: "UnrelatedNode", inputs: { length: 99 } },
  };

  it("uses Primitive titles but ignores unrelated length inputs", () => {
    expect(aliasTargets(synthetic)).toEqual({
      prompt: "1_value",
      negative: "2_value",
      steps: "3_value",
    });
  });

  it("drops aliases listed as reserved", () => {
    expect(
      inferAliases(synthetic, { reservedFlags: ["prompt"] }).map((item) => item.alias),
    ).toEqual(["negative", "steps"]);
  });

  it("stops literal source traversal after four links", () => {
    const workflow: Workflow = {
      "1": { class_type: "Relay", inputs: { text: ["2", 0] } },
      "2": { class_type: "Relay", inputs: { text: ["3", 0] } },
      "3": { class_type: "Relay", inputs: { text: ["4", 0] } },
      "4": { class_type: "Relay", inputs: { text: ["5", 0] } },
      "5": { class_type: "Relay", inputs: { text: ["6", 0] } },
      "6": { class_type: "PrimitiveString", inputs: { value: "too deep" } },
    };
    expect(resolveLiteralSource(workflow, { node_id: "1", input: "text" })).toBeNull();
  });
});
