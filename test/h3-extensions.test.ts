import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPresetTemplate } from "../src/cli/import.js";
import { resolveDynamicArgs } from "../src/cli/run/args.js";
import { PresetSchema } from "../src/preset/schema.js";
import { applyParameters } from "../src/workflow/patch.js";
import { buildColabSuggestPayload, loadColabCatalogFile } from "../src/colab/catalog.js";
import { H3_EXTENSION_WORKFLOWS, selectH3Workflow } from "../src/colab/h3-routing.js";

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
const root = process.cwd();
const readGraph = async (name: string): Promise<Graph> => {
  const kit = name.includes("_vdn_") ? "minimax_h3_vdn" : "minimax_h3_extensions";
  return JSON.parse(
    await fs.readFile(path.join(root, "scripts/colab", kit, name + ".json"), "utf8"),
  );
};

describe("H3 intent isolation", () => {
  it.each([
    ["H3で動画を作って", "minimax_h3_t2v"],
    ["H3で画像を動かして", "minimax_h3_i2v"],
    ["H3で参照音声と画像を使って速く動画を作って", "minimax_h3_r2v"],
    ["H3でSNS風の動画", "minimax_h3_sns_t2v"],
    ["H3で画像からTikTok風の動画", "minimax_h3_sns_i2v"],
    ["H3でTikTokに投稿する動画", "minimax_h3_t2v"],
    ["H3でSNS風、LoRAは使わない", "minimax_h3_t2v"],
    ["H3で動画の続きを作って", "minimax_h3_motion_t2v"],
    ["H3で参照音声を使い動画の続きを作って", "minimax_h3_motion_r2v"],
    ["H3で最後の構図を指定", "minimax_h3_guide"],
    ["H3で音声の位置指定", "minimax_h3_guide_audio"],
    ["H3で途中の画像と音声を指定", "minimax_h3_guide_av"],
    ["H3で速く試作", "minimax_h3_fast_t2v"],
    ["H3 VDNを試す", "minimax_h3_vdn_t2v"],
    ["VDNを試して", "minimax_h3_vdn_t2v"],
    ["H3 without VDN", "minimax_h3_t2v"],
    ["minimax_h3_guide_audio", "minimax_h3_guide_audio"],
  ])("routes %s to %s", (goal, expected) => {
    expect(selectH3Workflow(goal)).toBe(expected);
  });

  it("does not suggest new extensions for generic goals or unspecified options", async () => {
    const catalog = await loadColabCatalogFile(path.join(root, "scripts/colab/catalog.yaml"));
    for (const goal of [undefined, "video", "H3", "H3 fast", "H3 high quality", "TikTok video"]) {
      const result = buildColabSuggestPayload(catalog, { goal, limit: 100 });
      expect(result.suggestions.some((s) => H3_EXTENSION_WORKFLOWS.has(s.workflow))).toBe(false);
    }
  });

  it("ranks requested features first without promoting their verification status", async () => {
    const catalog = await loadColabCatalogFile(path.join(root, "scripts/colab/catalog.yaml"));
    for (const goal of ["H3 SNS風", "H3 動画の続きを", "H3 VDN", "H3 最後の構図を指定"]) {
      const result = buildColabSuggestPayload(catalog, { goal });
      expect(result.suggestions[0]).toMatchObject({
        workflow: selectH3Workflow(goal),
        status: "starter",
      });
      expect(result.suggestions[0].gpu.verified).toBeUndefined();
    }
    const ordinary = buildColabSuggestPayload(catalog, { goal: "H3で動画を作って" });
    expect(ordinary.suggestions[0]).toMatchObject({
      workflow: "minimax_h3_t2v",
      status: "verified",
    });
  });
});

describe("H3 extension graphs", () => {
  it("connects all node references and preserves native AV output and base pins", async () => {
    for (const name of H3_EXTENSION_WORKFLOWS) {
      const graph = await readGraph(name);
      for (const node of Object.values(graph)) {
        for (const value of Object.values(node.inputs)) {
          if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string") {
            expect(graph[value[0]], `${name}: dangling node ${value[0]}`).toBeDefined();
          }
        }
      }
      expect(graph["104"].inputs).toMatchObject({ width: 864, height: 480, length: 124 });
      expect(graph["91"].inputs).toHaveProperty("audio");
      expect(graph["91"].inputs.fps).toBe(24);
      expect(graph["92"].class_type).toBe("SaveVideo");
      expect(graph["6"].inputs.unet_name).toBe(
        name.endsWith("r2v")
          ? "minimax_h3_ref2va_pruned_int8_convrot.safetensors"
          : "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
      );
    }
  });

  it("applies style/VDN to both scheduler and guider, leaving base graphs untouched", async () => {
    for (const name of ["minimax_h3_sns_t2v", "minimax_h3_sns_i2v", "minimax_h3_vdn_t2v"]) {
      const graph = await readGraph(name);
      expect(graph["9"].inputs.model).toEqual(["120", 0]);
      expect(graph["16"].inputs.model).toEqual(["120", 0]);
      expect(graph["120"].inputs.model).toEqual(["6", 0]);
    }
    const vdn = await readGraph("minimax_h3_vdn_t2v");
    expect(vdn["9"].inputs.steps).toBe(8);
    expect(vdn["120"].inputs).toMatchObject({
      apply_turbo_adapter: true,
      lora_mode: "merge",
      branch_weights: "stream",
    });
  });

  it("saves untrimmed AV latent and trims decoded video AND audio", async () => {
    for (const name of ["minimax_h3_motion_t2v", "minimax_h3_motion_r2v"]) {
      const graph = await readGraph(name);
      expect(graph["120"].inputs.clip_index).toBe(0);
      expect(graph["122"].inputs).toMatchObject({ latent: ["14", 0], clip_index: 1 });
      expect(graph["121"].inputs.context_latent).toEqual(["120", 0]);
      expect(graph["16"].inputs.conditioning).toEqual(["121", 0]);
      expect(graph["123"].inputs).toMatchObject({
        images: ["10", 0],
        audio: ["23", 0],
        trim_frames: ["121", 1],
        match_tail: true,
      });
      expect(graph["91"].inputs).toMatchObject({ images: ["123", 0], audio: ["123", 1] });
    }
  });

  it("imports CLI controls without inventing latent uploads or shadowing reference flags", async () => {
    for (const name of H3_EXTENSION_WORKFLOWS) {
      const graph = await readGraph(name);
      const preset = PresetSchema.parse(buildPresetTemplate(name, name + ".json", graph, null));
      const uploads = Object.values(preset.uploads ?? {})
        .map((u) => u.cli_flag)
        .sort();
      const expected =
        name.endsWith("r2v") || name.endsWith("guide_av")
          ? ["--audio", "--image"]
          : name.endsWith("guide_audio")
            ? ["--audio"]
            : name.endsWith("i2v") || name.endsWith("_guide")
              ? ["--image"]
              : [];
      expect(uploads, name).toEqual(expected);
      if (!name.includes("motion")) continue;
      const args = resolveDynamicArgs(
        [
          "--104_prompt",
          "next scene",
          "--104_width",
          "864",
          "--104_height",
          "480",
          "--104_length",
          "124",
          "--15_noise_seed",
          "43",
          "--120_latent_path",
          "h3_context/test",
          "--120_clip_index",
          "1",
          "--122_filename_prefix",
          "h3_context/test/clip",
          "--122_clip_index",
          "2",
          "--121_context_length",
          "22",
          "--121_audio_context_length",
          "24",
        ],
        preset,
      );
      const patched = applyParameters(graph, preset, args.params) as Graph;
      expect(patched["120"].inputs.clip_index).toBe(1);
      expect(patched["122"].inputs.clip_index).toBe(2);
      expect(patched["121"].inputs.context_length).toBe("22");
      expect(patched["104"].inputs.prompt).toBe("next scene");
      expect(patched["16"].inputs.conditioning).toEqual(["121", 0]);
    }
  });

  it("runs offline Python chain state/recovery tests", () => {
    execFileSync("python3", ["test/h3-chain.test.py"], { cwd: root, stdio: "pipe" });
  });
});
