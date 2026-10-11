import path from "node:path";
import { promises as fs } from "node:fs";
import YAML from "yaml";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { StudioCatalog } from "../src/studio/catalog.js";
import { serverFingerprint } from "../src/studio/capabilities.js";
import {
  generateAutoProfile,
  readWorkflowProfile,
  saveAgentProfile,
  validateProfileMapping,
  hash,
  inferModelLabel,
  humanizePresetName,
  cleanModelFilename,
} from "../src/studio/profiles.js";
import { startStudioServer } from "../src/studio/server.js";
import { writeJob } from "../src/jobs/store.js";
import type { Preset } from "../src/preset/schema.js";
import type { JobRecord } from "../src/jobs/types.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";
import { runCli } from "./helpers/run-cli.js";
import {
  optionalObjectInfo,
  optionalPreset,
  writeOptionalFixture,
} from "./helpers/optional-workflow.js";
// Global-scope fixtures must never write into the real user's workdir.
const { globalFixture } = await vi.hoisted(async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  return { globalFixture: await fs.mkdtemp(path.join(os.tmpdir(), "studio-global-test-")) };
});
vi.mock("../src/io/workdir.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/io/workdir.js")>();
  const root = (cwd: string, scope: "local" | "global") =>
    scope === "global" ? globalFixture : original.getWorkdirPath(cwd, scope);
  return {
    ...original,
    GLOBAL_WORK_DIR: globalFixture,
    getWorkdirPath: root,
    getSubdirPath: (subdir: string, cwd: string, scope: "local" | "global") =>
      path.join(root(cwd, scope), subdir),
    getJobsDirPath: (cwd: string, scope: "local" | "global") => path.join(root(cwd, scope), "jobs"),
    getCharactersDirPath: (cwd: string, scope: "local" | "global") =>
      path.join(root(cwd, scope), "characters"),
  };
});
afterAll(() => fs.rm(globalFixture, { recursive: true, force: true }));
afterEach(() => fs.rm(globalFixture, { recursive: true, force: true }));

const definition = (
  name: string,
  kinds: Array<"image" | "audio" | "mask" | "file"> = [],
  video = true,
): Preset => ({
  version: 1,
  name,
  workflow: `${name}.json`,
  parameters: {
    text: {
      type: "string",
      role: "prompt",
      target: { node_id: "1", input: "text" },
      default: "A scene",
    },
    negative: {
      type: "string",
      role: "negative_prompt",
      target: { node_id: "1", input: "negative" },
      default: "",
    },
    ...(video
      ? {
          length: {
            type: "int" as const,
            aliases: ["frames"],
            min: 24,
            max: 240,
            default: 120,
            target: { node_id: "1", input: "length" },
          },
          fps: { type: "float" as const, default: 24, target: { node_id: "1", input: "fps" } },
        }
      : {
          width: {
            type: "int" as const,
            role: "width" as const,
            default: 1024,
            target: { node_id: "1", input: "width" },
          },
          height: {
            type: "int" as const,
            role: "height" as const,
            default: 1024,
            target: { node_id: "1", input: "height" },
          },
        }),
    seed: { type: "int", role: "seed", target: { node_id: "1", input: "seed" } },
    steps: { type: "int", role: "steps", default: 20, target: { node_id: "1", input: "steps" } },
  },
  uploads: Object.fromEntries(
    kinds.map((kind, i) => [
      `input_${i}`,
      {
        kind,
        cli_flag: `--input-${i}`,
        required: true,
        target: { node_id: String(3 + i), input: "file" },
      },
    ]),
  ),
});
const graph = (class_type: string, extra: string = "H3Generate") => ({
  "1": { class_type: extra, inputs: {} },
  "2": { class_type, inputs: {} },
});
const writePreset = async (
  tmp: Awaited<ReturnType<typeof createTmpWorkdir>>,
  preset: Preset,
  workflow: unknown,
) => {
  await fs.writeFile(
    path.join(tmp.workdir, "presets", `${preset.name}.yaml`),
    YAML.stringify(preset),
  );
  await fs.writeFile(
    path.join(tmp.workdir, "workflows", preset.workflow),
    JSON.stringify(workflow),
  );
};
const fixture = async () => {
  const tmp = await createTmpWorkdir();
  for (const [name, kinds, video] of [
    ["minimax_h3_t2v", [], true],
    ["minimax_h3_i2v", ["image"], true],
    ["minimax_h3_r2v", ["image", "audio"], true],
    ["qwen21_t2i", [], false],
    ["qwen21_edit", ["image"], false],
  ] as const)
    await writePreset(
      tmp,
      definition(name, [...kinds], video),
      graph(video ? "SaveVideo" : "SaveImage", video ? "H3Generate" : "QwenGenerate"),
    );
  return tmp;
};
const h3 = { H3Generate: {}, SaveVideo: {} };
const qwen = { QwenGenerate: {}, SaveImage: {} };
describe("Studio catalog", () => {
  it("summarizes hidden modes and excludes modes with any runnable option", async () => {
    const tmp = await fixture();
    await writePreset(
      tmp,
      definition("minimax_h3_missing_t2v"),
      graph("SaveVideo", "MissingSampler"),
    );
    const catalog = await new StudioCatalog(tmp.cwd, async () => h3).read([]);
    expect(catalog.unavailable.map((entry) => entry.capability)).toEqual([
      "text_to_image",
      "image_edit",
    ]);
    expect(catalog.unavailable[0]).toMatchObject({
      label: { ja: "画像を作る", en: "Create an image" },
      reasons: [
        { code: "missing_nodes", message: { ja: "必要なノードがありません: QwenGenerate など" } },
      ],
    });
    expect(catalog.not_runnable.some((entry) => entry.preset === "minimax_h3_missing_t2v")).toBe(
      true,
    );
    expect(catalog.unavailable.some((entry) => entry.capability === "text_to_video")).toBe(false);
    const server = await startStudioServer({
      cwd: tmp.cwd,
      port: 0,
      host: "127.0.0.1",
      capabilityFetcher: async () => h3,
    });
    try {
      const response = await (await fetch(`${server.url}api/catalog`)).json();
      expect(response.unavailable).toEqual(catalog.unavailable);
    } finally {
      await server.close();
    }
  });
  it("aggregates model and input-setting reasons without guessing offline", async () => {
    const tmp = await createTmpWorkdir();
    await writePreset(tmp, definition("qwen_image_edit", [], false), graph("SaveImage", "Loader"));
    for (const name of ["qwen21_edit", "qwen21_other_edit"])
      await writePreset(tmp, definition(name, ["image"], false), {
        "1": { class_type: "Loader", inputs: { model: "wanted.safetensors" } },
        "2": { class_type: "SaveImage", inputs: {} },
        "3": { class_type: "LoadImage", inputs: { file: "default.png" } },
      });
    const info = {
      Loader: { input: { required: { model: [["other.safetensors"]] } } },
      SaveImage: {},
      LoadImage: {},
    };
    const catalog = await new StudioCatalog(tmp.cwd, async () => info).read([]);
    expect(catalog.capabilities).toEqual([]);
    expect(catalog.unavailable).toHaveLength(1);
    expect(catalog.unavailable[0]!.reasons).toMatchObject([
      { code: "missing_models", message: { ja: "必要なモデルがありません: wanted.safetensors" } },
      { code: "configuration", message: { ja: expect.stringContaining("画像を受け取る設定") } },
    ]);
    const offline = await new StudioCatalog(tmp.cwd, async () => {
      throw new Error("offline");
    }).read([]);
    expect(offline.unavailable).toEqual([]);
  });
  it("uses object_info for optional inputs, adds one inputless variant and exposes frame rules", async () => {
    const tmp = await createTmpWorkdir();
    await writeOptionalFixture(tmp.workdir);
    const catalog = new StudioCatalog(tmp.cwd, async () => optionalObjectInfo);
    const response = await catalog.read([]);
    expect(response.capabilities.map((cap) => cap.id)).toEqual(["text_to_video", "image_to_video"]);
    const inputless = response.capabilities[0]!.engines[0]!;
    expect(inputless).toMatchObject({
      inputless: true,
      default_skip: ["image", "reference"],
      controls: { frames: { step: 8, step_offset: 1 } },
    });
    expect(
      response.capabilities[1]!.engines[0]!.inputs.every(
        (input) => input.optional && input.required && input.default_available,
      ),
    ).toBe(true);
    for (const cap of response.capabilities)
      expect(new Set(cap.engines.map((engine) => engine.preset)).size).toBe(cap.engines.length);
    expect(
      Object.keys(await catalog.validateSkip(optionalPreset, "local", ["image", "reference"])),
    ).toEqual(["3", "4"]);
  });
  it("does not infer graph optionality from required:false or from unavailable object_info", async () => {
    const tmp = await createTmpWorkdir();
    await writeOptionalFixture(tmp.workdir);
    const preset = {
      ...optionalPreset,
      uploads: Object.fromEntries(
        Object.entries(optionalPreset.uploads!).map(([key, input]) => [
          key,
          { ...input, required: false },
        ]),
      ),
    };
    await fs.writeFile(
      path.join(tmp.workdir, "presets", "optional_i2v.yaml"),
      YAML.stringify(preset),
    );
    const info = {
      ...optionalObjectInfo,
      WanImageToVideo: { input: { required: { start_image: ["LATENT"], reference: ["IMAGE"] } } },
    };
    const response = await new StudioCatalog(tmp.cwd, async () => info).read([]);
    expect(response.capabilities.map((cap) => cap.id)).toEqual(["image_to_video"]);
    expect(response.capabilities[0]!.engines[0]!.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ optional: false, required: false, default_available: true }),
      ]),
    );
    const offline = new StudioCatalog(tmp.cwd, async () => {
      throw new Error("offline");
    });
    expect((await offline.read([])).capabilities).toEqual([]);
    await expect(offline.validateSkip(preset, "local", ["image"])).rejects.toMatchObject({
      code: "INPUT_NOT_SKIPPABLE",
    });
  });
  it("merges engines with different role signatures into one mode and excludes missing main inputs", async () => {
    const tmp = await createTmpWorkdir();
    for (const [name, kinds, video] of [
      ["qwen_edit", ["image"], false],
      ["qwen_edit_2ref", ["image", "image"], false],
      ["qwen_image_edit", [], false],
      ["anima_i2i", [], false],
      ["10eros_max_h3_i2v", [], true],
      ["minimax_h3_r2v", ["image", "audio"], true],
      ["minimax_h3_r2v_2ref", ["image", "image"], true],
    ] as const)
      await writePreset(
        tmp,
        definition(name, [...kinds], video),
        graph(video ? "SaveVideo" : "SaveImage"),
      );
    const result = await new StudioCatalog(tmp.cwd, async () => ({ ...h3, SaveImage: {} })).read(
      [],
    );
    expect(result.capabilities.map((cap) => cap.id)).toEqual(["image_edit", "reference_to_video"]);
    for (const cap of result.capabilities) expect(cap.engines).toHaveLength(2);
    expect(result.capabilities[0]!.engines.map((engine) => engine.inputs.length).sort()).toEqual([
      1, 2,
    ]);
    expect(result.not_runnable.map((entry) => entry.preset)).toEqual([
      "10eros_max_h3_i2v",
      "anima_i2i",
      "qwen_image_edit",
    ]);
    for (const entry of result.not_runnable)
      expect(entry.reason?.ja).toBe(
        "画像を受け取る設定がないため使えません（取り込み直しが必要です）",
      );
  });
  it.each([
    "image_edit",
    "image_to_video",
    "reference_to_video",
    "video_to_video",
    "upscale",
    "remove_background",
  ] as const)("does not offer %s without a matching main upload", async (task) => {
    const tmp = await createTmpWorkdir();
    const preset = {
      ...definition("needs_input", ["audio"], task.includes("video")),
      task: task === "image_edit" ? "image_to_image" : task,
    };
    await writePreset(tmp, preset, graph(task.includes("video") ? "SaveVideo" : "SaveImage"));
    const result = await new StudioCatalog(tmp.cwd, async () => ({ ...h3, SaveImage: {} })).read(
      [],
    );
    expect(result.capabilities).toEqual([]);
    expect(result.not_runnable[0]!.reason?.en).toContain("Import this workflow again");
  });
  it("does not offer first/last frame video with only one frame configured", async () => {
    const tmp = await createTmpWorkdir();
    await writePreset(tmp, definition("ltx25_flf2v", ["image"]), graph("SaveVideo"));
    expect((await new StudioCatalog(tmp.cwd, async () => h3).read([])).capabilities).toEqual([]);
  });
  it("distinguishes cleaned titles that coincide for duplicate imports", async () => {
    const tmp = await createTmpWorkdir();
    for (const name of ["minimax_h3_i2v", "minimax_h3_i2v_skilltest"])
      await writePreset(tmp, definition(name, ["image"]), graph("SaveVideo"));
    const engines = (await new StudioCatalog(tmp.cwd, async () => h3).read([])).capabilities[0]!
      .engines;
    expect(new Set(engines.map((engine) => engine.title.ja)).size).toBe(2);
    expect(engines.map((engine) => engine.title.en)).toEqual([
      "Minimax H3 Image to Video (Option 1)",
      "Minimax H3 Image to Video (Option 2)",
    ]);
  });
  it("builds a job's model profile on demand even when its engine is unavailable", async () => {
    const tmp = await createTmpWorkdir();
    const preset = definition("anima_i2i", [], false);
    await writePreset(tmp, preset, {
      ...graph("SaveImage"),
      "10": { class_type: "UNETLoader", inputs: { unet_name: "anima-preview3-base.safetensors" } },
    });
    await writeJob(
      {
        version: 2,
        job_id: "anima-result",
        prompt_id: "anima-result",
        client_id: "test",
        batch_id: "anima-result",
        batch_index: 1,
        batch_count: 1,
        scope: "local",
        base_url: "http://127.0.0.1:1",
        preset: preset.name,
        source: "local",
        params: {},
        uploads: {},
        seed: 42,
        output_dir: path.join(tmp.workdir, "outputs"),
        submitted_at: "2026-10-10T00:00:00Z",
        status: "completed",
        outputs: [{ filename: "image.png", saved_to: "image.png" }],
      },
      tmp.cwd,
      "local",
    );
    const server = await startStudioServer({
      cwd: tmp.cwd,
      host: "127.0.0.1",
      port: 0,
      publicDir: path.resolve("studio/public"),
      capabilityFetcher: async () => {
        throw new Error("offline");
      },
    });
    try {
      const state = await (await fetch(`${server.url}api/state`)).json();
      expect(state.jobs[0].model_label).toBe("Anima");
      expect(
        JSON.parse(
          await fs.readFile(
            path.join(tmp.workdir, "studio", "profiles", `${preset.name}.json`),
            "utf8",
          ),
        ).model_label,
      ).toBe("Anima");
    } finally {
      await server.close();
    }
  });
  it.each([
    ["h3", h3, ["text_to_video", "image_to_video", "reference_to_video"], 2],
    ["qwen", qwen, ["text_to_image", "image_edit"], 3],
    [
      "both",
      { ...h3, ...qwen },
      ["text_to_image", "image_edit", "text_to_video", "image_to_video", "reference_to_video"],
      0,
    ],
  ] as const)("only offers runnable capabilities on %s", async (_name, info, ids, missing) => {
    const tmp = await fixture();
    const catalog = await new StudioCatalog(tmp.cwd, async (url) =>
      url.endsWith("object_info")
        ? info
        : {
            devices: [{ name: "L4", vram_total: 22 * 1024 ** 3 }],
            system: { comfyui_version: "test" },
          },
    ).read([]);
    expect(catalog.capabilities.map((c) => c.id)).toEqual(ids);
    expect(catalog.not_runnable).toHaveLength(missing);
    expect(catalog.server).toMatchObject({
      state: "online",
      gpu: "L4",
      fingerprint: expect.any(String),
    });
    expect(catalog.unverified).toBe(false);
    for (const capability of catalog.capabilities)
      expect(capability.engines.filter((e) => e.default)).toHaveLength(1);
  });
  it("returns no guessed choices offline, including when only system stats respond", async () => {
    const tmp = await fixture();
    for (const stats of [false, true]) {
      const result = await new StudioCatalog(tmp.cwd, async (url) => {
        if (stats && url.endsWith("system_stats")) return { system: {} };
        throw new Error("offline");
      }).read([]);
      expect(result).toMatchObject({ capabilities: [], unverified: true });
      expect(result.server.state).toBe(stats ? "checking" : "offline");
    }
  });
  it("regenerates the catalog after fingerprint changes and honors the probe TTL", async () => {
    const tmp = await fixture();
    let info: Record<string, unknown> = h3;
    const fetcher = vi.fn(async (url: string) => (url.endsWith("object_info") ? info : {}));
    const catalog = new StudioCatalog(tmp.cwd, fetcher);
    const first = await catalog.read([]);
    expect(first.unverified).toBe(false);
    info = qwen;
    const cached = await catalog.read([]);
    expect(cached.server.fingerprint).toBe(first.server.fingerprint);
    expect(cached.unverified).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const second = await catalog.read([], true);
    expect(second.unverified).toBe(false);
    expect(second.server.fingerprint).not.toBe(first.server.fingerprint);
    expect(second.capabilities.map((c) => c.id)).toEqual(["text_to_image", "image_edit"]);
    expect(fetcher).toHaveBeenCalledTimes(4);
    const a = { Loader: { input: { required: { model_name: [["a.safetensors", "b.gguf"]] } } } };
    expect(serverFingerprint(a)).toBe(
      serverFingerprint({
        Loader: { input: { required: { model_name: [["b.gguf", "a.safetensors"]] } } },
      }),
    );
    expect(serverFingerprint(a)).not.toBe(
      serverFingerprint({ Loader: { input: { required: { model_name: [["c.safetensors"]] } } } }),
    );
  });
  it("selects the last-used engine, then confirmed recommendation, then normal speed", async () => {
    const tmp = await createTmpWorkdir();
    for (const name of ["minimax_h3_t2v", "minimax_h3_fast_t2v", "minimax_h3_turbo_t2v"])
      await writePreset(tmp, definition(name), graph("SaveVideo"));
    const catalog = new StudioCatalog(tmp.cwd, async () => h3);
    let result = await catalog.read([]);
    expect(result.capabilities[0]!.engines.find((e) => e.default)!.preset).toBe("minimax_h3_t2v");
    const p = definition("minimax_h3_fast_t2v");
    const auto = await readWorkflowProfile(tmp.cwd, p, "local");
    const { stale, ...profile } = auto;
    expect(stale).toBe(false);
    await saveAgentProfile(tmp.cwd, p, "local", {
      ...profile,
      recommended: true,
      title: { ja: "素早く動画にする", en: "Quick animation" },
    });
    result = await catalog.read([]);
    expect(result.capabilities[0]!.engines.find((e) => e.default)!.preset).toBe(p.name);
    result = await catalog.read([
      { preset: "minimax_h3_turbo_t2v", submitted_at: "2026-10-10T00:00:00Z" } as JobRecord,
    ]);
    expect(result.capabilities[0]!.engines.find((e) => e.default)!.preset).toBe(
      "minimax_h3_turbo_t2v",
    );
  });
});
describe("Studio profiles", () => {
  it.each([
    ["anima-base-v1.0.safetensors", "Anima"],
    ["krea2_turbo_fp8_scaled.safetensors", "Krea 2"],
    ["ideogram4_fp8_scaled.safetensors", "Ideogram 4"],
    ["hidream_i1_dev_fp8.safetensors", "HiDream I1"],
    ["hunyuan_video_t2v_720p_bf16.safetensors", "Hunyuan Video"],
    ["wan2.1_t2v_1.3B_fp16.safetensors", "Wan 2.1"],
    ["wan2.2_ti2v_5B_fp16.safetensors", "Wan 2.2"],
    ["sd3.5_large_fp8_scaled.safetensors", "SD 3.5"],
    ["stable_audio_3_small_music.safetensors", "Stable Audio 3"],
    ["minimax_music3_dit_int8_convrot.safetensors", "MiniMax Music 3"],
    ["ming_image_0.1_design_int8_convrot.safetensors", "Ming Image"],
    ["boogu_image_turbo_fp8_scaled.safetensors", "Boogu Image Turbo"],
    ["z-anime-base-fp8.safetensors", "Z-Image (Anime)"],
    ["qwen-image-2.1-Q4_K_M.gguf", "Qwen Image 2.1"],
    ["qwen_image_2512_fp8_e4m3fn.safetensors", "Qwen Image"],
    ["future_art_fp8_scaled.safetensors", "Future Art"],
  ])("prioritizes the main diffusion loader for %s", (filename, label) => {
    expect(
      inferModelLabel(
        definition("custom", [], false),
        {
          "1": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } },
          "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_image_2.1.safetensors" } },
          "3": { class_type: "UNETLoader", inputs: { unet_name: filename } },
        },
        "image",
      ),
    ).toBe(label);
  });
  it("prioritizes checkpoints and supports generic model loader inputs", () => {
    for (const [class_type, input] of [
      ["CheckpointLoaderSimple", "ckpt_name"],
      ["ImageOnlyCheckpointLoader", "ckpt_name"],
      ["CustomModelLoader", "model_name"],
      ["UnetLoaderGGUF", "unet_name"],
    ]) {
      expect(
        inferModelLabel(
          definition("custom"),
          {
            "1": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } },
            "2": { class_type, inputs: { [input!]: "anima-base-v1.0.safetensors" } },
          },
          "image",
        ),
      ).toBe("Anima");
    }
  });
  it("cleans fallback model filenames and humanizes titles without bookkeeping tokens", () => {
    expect(cleanModelFilename("boogu_image_turbo_fp8_scaled.safetensors")).toBe(
      "Boogu Image Turbo",
    );
    expect(cleanModelFilename("future-art-Q4_K_M-bf16-int8-convrot-e4m3fn.gguf")).toBe(
      "Future Art",
    );
    expect(humanizePresetName("anima_pencil_e2e_test_imported_20260808_skilltest")).toBe(
      "Anima Pencil",
    );
    const preset = definition("anima_pencil", [], false);
    expect(generateAutoProfile(preset, graph("SaveImage"), hash("workflow")).title).toEqual({
      ja: "Anima Pencil",
      en: "Anima Pencil",
    });
    expect(
      generateAutoProfile(
        { ...preset, description: "鉛筆で描く" },
        graph("SaveImage"),
        hash("workflow"),
      ).title?.ja,
    ).toBe("鉛筆で描く");
  });
  it.each(["moss_soundeffect_v2_t2a_e2e", "sfx_t2a", "sound_effect_t2a", "foley_t2a"])(
    "classifies %s as sound effects",
    (name) => {
      const profile = generateAutoProfile(
        definition(name, [], false),
        graph("SaveAudio", "MossSoundEffectV2"),
        hash("workflow"),
      );
      expect(profile.capability).toBe("sound_effect");
      expect(profile.model_label).toBe("MOSS SoundEffect v2");
    },
  );
  it("refreshes legacy auto inference without changing agent-confirmed display values", async () => {
    const tmp = await createTmpWorkdir(),
      preset = definition("anima", [], false);
    await writePreset(tmp, preset, {
      ...graph("SaveImage"),
      "10": { class_type: "UNETLoader", inputs: { unet_name: "anima-base-v1.0.safetensors" } },
    });
    const { stale, ...profile } = await readWorkflowProfile(tmp.cwd, preset, "local");
    expect(stale).toBe(false);
    const file = path.join(tmp.workdir, "studio", "profiles", `${preset.name}.json`);
    await fs.writeFile(
      file,
      JSON.stringify({ ...profile, auto_revision: 1, model_label: "Qwen Image 2.1" }),
    );
    expect((await readWorkflowProfile(tmp.cwd, preset, "local")).model_label).toBe("Anima");
    await fs.writeFile(
      file,
      JSON.stringify({ ...profile, source: "agent", auto_revision: 1, model_label: "My model" }),
    );
    expect((await readWorkflowProfile(tmp.cwd, preset, "local")).model_label).toBe("My model");
  });
  it.each([
    ["minimax_h3_t2v", [], "SaveVideo", "text_to_video"],
    ["ltx25_flf2v", ["image", "image"], "SaveVideo", "first_last_frame"],
    ["minimax_h3_r2v", ["image", "audio"], "SaveVideo", "reference_to_video"],
    ["qwen21_edit", ["image"], "SaveImage", "image_edit"],
    ["music_t2a", [], "SaveAudio", "music"],
    ["sfx_t2a", [], "SaveAudio", "sound_effect"],
    ["voice_tts", [], "SaveAudio", "speech"],
  ] as const)("profiles %s", (name, kinds, node, capability) => {
    const profile = generateAutoProfile(
      definition(name, [...kinds], node === "SaveVideo"),
      graph(node),
      hash("workflow"),
    );
    expect(profile.capability).toBe(capability);
    expect(profile.controls.prompt).toBe("text");
    expect(profile.controls.other).toContain("steps");
    expect(profile.controls.other).not.toContain("seed");
    if (capability === "first_last_frame")
      expect(profile.inputs.map((i) => i.role)).toEqual(["start_frame", "end_frame"]);
    if (capability === "reference_to_video")
      expect(profile.inputs.map((i) => i.role)).toEqual(["reference", "audio_reference"]);
    if (profile.inputs.length)
      expect(() =>
        validateProfileMapping(
          { ...profile, inputs: profile.inputs.map((input) => ({ ...input, kind: "file" })) },
          definition(name, [...kinds], node === "SaveVideo"),
        ),
      ).toThrow(/do not match/);
  });
  it("uses loader model filenames, confirms overrides, regenerates auto and flags agent stale", async () => {
    const tmp = await createTmpWorkdir(),
      preset = definition("custom", [], false);
    const workflow = {
      ...graph("SaveImage", "QwenGenerate"),
      "10": { class_type: "UNETLoader", inputs: { unet_name: "qwen_image_2.1.safetensors" } },
    };
    await writePreset(tmp, preset, workflow);
    const first = await readWorkflowProfile(tmp.cwd, preset, "local");
    expect(first.model_label).toBe("Qwen Image 2.1");
    const file = path.join(tmp.workdir, "studio", "profiles", "custom.json");
    expect(JSON.parse(await fs.readFile(file, "utf8")).source).toBe("auto");
    await fs.writeFile(
      path.join(tmp.workdir, "workflows", preset.workflow),
      JSON.stringify({ ...workflow, "11": { class_type: "Other", inputs: {} } }),
    );
    const regenerated = await readWorkflowProfile(tmp.cwd, preset, "local");
    expect(regenerated.workflow_hash).not.toBe(first.workflow_hash);
    const { stale, ...input } = regenerated;
    expect(stale).toBe(false);
    await saveAgentProfile(tmp.cwd, preset, "local", {
      ...input,
      title: { ja: "作品を描く", en: "Draw artwork" },
      model_label: "Confirmed model",
    });
    await fs.writeFile(
      path.join(tmp.workdir, "workflows", preset.workflow),
      JSON.stringify(workflow),
    );
    const staleProfile = await readWorkflowProfile(tmp.cwd, preset, "local");
    expect(staleProfile).toMatchObject({
      source: "agent",
      stale: true,
      model_label: "Confirmed model",
      title: { ja: "作品を描く" },
    });
    expect(JSON.parse(await fs.readFile(file, "utf8")).workflow_hash).toBe(
      regenerated.workflow_hash,
    );
    await expect(
      saveAgentProfile(tmp.cwd, preset, "local", {
        ...input,
        controls: { ...input.controls, prompt: "no-such-param" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_PROFILE" });
    await expect(
      saveAgentProfile(tmp.cwd, preset, "local", {
        ...input,
        controls: { ...input.controls, width: input.controls.prompt },
      }),
    ).rejects.toMatchObject({ code: "INVALID_PROFILE" });
    expect((await fs.readdir(path.dirname(file))).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });
  it("creates profiles during import and supports CLI read, confirm, list and guide", async () => {
    const tmp = await createTmpWorkdir();
    const source = path.join(tmp.cwd, "source.json");
    await fs.writeFile(source, JSON.stringify(graph("SaveImage", "SaveImage")));
    const imported = await runCli(
      ["import", source, "--name", "cli_image", "--base-url", "http://127.0.0.1:1", "--json"],
      { cwd: tmp.cwd },
    );
    expect(imported.code).toBe(0);
    const file = path.join(tmp.workdir, "studio", "profiles", "cli_image.json");
    const profile = JSON.parse(await fs.readFile(file, "utf8"));
    const read = await runCli(["studio", "profile", "cli_image", "--json"], { cwd: tmp.cwd });
    expect(JSON.parse(read.stdout).profile).toMatchObject({ source: "auto", stale: false });
    const confirmed = path.join(tmp.cwd, "confirmed.json");
    await fs.writeFile(
      confirmed,
      JSON.stringify({ ...profile, title: { ja: "イラストを描く", en: "Draw an illustration" } }),
    );
    const saved = await runCli(["studio", "profile", "cli_image", "--set", confirmed, "--json"], {
      cwd: tmp.cwd,
    });
    expect(saved.code).toBe(0);
    expect(JSON.parse(saved.stdout).profile.source).toBe("agent");
    const all = await runCli(["studio", "profile", "--all", "--json"], { cwd: tmp.cwd });
    expect(JSON.parse(all.stdout).profiles).toHaveLength(1);
    const guide = await runCli(["studio", "guide", "--lang", "ja"], { cwd: tmp.cwd });
    expect(guide.stdout).toContain("表示名・説明・機能・モデル名");
  });
});
