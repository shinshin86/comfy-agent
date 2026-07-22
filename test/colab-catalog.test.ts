import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runColabSuggest } from "../src/cli/colab.js";
import {
  ColabCatalogSchema,
  buildColabCatalogPayload,
  buildColabSuggestPayload,
  loadColabCatalogFile,
} from "../src/colab/catalog.js";

const repoRoot = process.cwd();
const catalogPath = path.join(repoRoot, "scripts", "colab", "catalog.yaml");

const buildMusicCatalog = (aceMinimum: "T4" | "L4" = "T4") =>
  ColabCatalogSchema.parse({
    version: 1,
    kits: [
      {
        name: "ace_step_1_5",
        path: "ace_step_1_5/",
        status: "starter",
        tasks: ["text_to_audio"],
        outputs: ["audio"],
        gpu: { minimum: aceMinimum, recommended: "L4" },
        summary: "Full-song music generation with lyrics and vocals.",
        workflows: [
          {
            name: "ace_step_1_5_t2a",
            file: "ace_step_1_5_t2a.json",
            task: "text_to_audio",
            output: "audio",
            capabilities: { audio_kinds: ["music"], lyrics: true, vocals: true },
            speed: "medium",
            quality: "high",
          },
        ],
      },
      {
        name: "stable_audio3_small_music",
        path: "stable_audio3_small_music/",
        status: "starter",
        tasks: ["text_to_audio"],
        outputs: ["audio"],
        gpu: { minimum: "T4", recommended: "T4" },
        summary: "Lightweight instrumental background music generation.",
        tags: ["music", "instrumental", "bgm"],
        workflows: [
          {
            name: "stable_audio3_small_music_t2a",
            file: "stable_audio3_small_music_t2a.json",
            task: "text_to_audio",
            output: "audio",
            capabilities: { audio_kinds: ["music"], lyrics: false, vocals: false },
            speed: "fast",
            quality: "high",
          },
        ],
      },
      {
        name: "stable_audio3",
        path: "stable_audio3/",
        status: "verified",
        tasks: ["text_to_audio"],
        outputs: ["audio"],
        gpu: { minimum: "L4", recommended: "A100" },
        summary: "Music and sound-effect generation.",
        workflows: [
          {
            name: "stable_audio3_medium_t2a",
            file: "stable_audio3_medium_t2a.json",
            task: "text_to_audio",
            output: "audio",
            capabilities: {
              audio_kinds: ["music", "sound_effect"],
              lyrics: false,
              vocals: false,
            },
            speed: "slow",
            quality: "high",
          },
        ],
      },
      {
        name: "moss_soundeffect_v2",
        path: "moss_soundeffect_v2/",
        status: "verified",
        tasks: ["text_to_audio"],
        outputs: ["audio"],
        gpu: { minimum: "A100", recommended: "A100" },
        summary: "Text-to-sound effects.",
        tags: ["sound_effect", "sfx"],
        workflows: [
          {
            name: "moss_soundeffect_v2_t2a",
            file: "moss_soundeffect_v2_t2a.json",
            task: "text_to_audio",
            output: "audio",
            capabilities: { audio_kinds: ["sound_effect"], lyrics: false, vocals: false },
            speed: "slow",
            quality: "high",
          },
        ],
      },
      {
        name: "video_music",
        path: "video_music/",
        status: "verified",
        tasks: ["text_to_video"],
        outputs: ["video"],
        gpu: { minimum: "T4", recommended: "L4" },
        summary: "Music-video generation.",
        workflows: [
          {
            name: "video_music_t2v",
            file: "video_music_t2v.json",
            task: "text_to_video",
            output: "video",
            speed: "medium",
            quality: "high",
          },
        ],
      },
      {
        name: "fast_image",
        path: "fast_image/",
        status: "verified",
        tasks: ["text_to_image"],
        outputs: ["image"],
        gpu: { minimum: "T4", recommended: "T4" },
        summary: "Fast image generation.",
        workflows: [
          {
            name: "fast_image_t2i",
            file: "fast_image_t2i.json",
            task: "text_to_image",
            output: "image",
            speed: "fast",
            quality: "high",
          },
        ],
      },
    ],
  });

describe("ColabCatalogSchema", () => {
  it("accepts an agent-readable Colab kit catalog", () => {
    const result = ColabCatalogSchema.safeParse({
      version: 1,
      kits: [
        {
          name: "z_image",
          path: "z_image/",
          status: "verified",
          tasks: ["text_to_image"],
          outputs: ["image"],
          gpu: { minimum: "T4", recommended: "T4" },
          summary: "Fast image generation starter kit.",
          setup_file: "01_setup.py",
          workflows: [
            {
              name: "z_image_turbo",
              file: "z_image_turbo.json",
              task: "text_to_image",
              speed: "fast",
              quality: "standard",
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts audio workflows and background-removal tasks", () => {
    const result = ColabCatalogSchema.safeParse({
      version: 1,
      kits: [
        {
          name: "media_tools",
          path: "media_tools/",
          status: "starter",
          tasks: ["text_to_audio", "remove_background"],
          outputs: ["audio", "image"],
          gpu: { minimum: "T4", recommended: "T4" },
          summary: "Audio and image utility workflows.",
          setup_file: "01_setup.py",
          workflows: [
            {
              name: "music",
              file: "music.json",
              task: "text_to_audio",
            },
            {
              name: "cutout",
              file: "cutout.json",
              task: "remove_background",
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects absolute or parent-traversing paths so catalog output stays portable", () => {
    const result = ColabCatalogSchema.safeParse({
      version: 1,
      kits: [
        {
          name: "invalid",
          path: "/absolute/path",
          status: "starter",
          tasks: ["text_to_image"],
          outputs: ["image"],
          gpu: { recommended: "T4" },
          summary: "Should reject non-portable paths.",
          workflows: [{ name: "bad", file: "../outside.json", task: "text_to_image" }],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects audio capabilities on non-audio workflows", () => {
    const catalog = buildMusicCatalog();
    const imageKit = catalog.kits.find((kit) => kit.name === "fast_image");
    expect(imageKit).toBeDefined();

    const result = ColabCatalogSchema.safeParse({
      version: 1,
      kits: [
        {
          ...imageKit,
          workflows: [
            {
              ...imageKit!.workflows[0],
              capabilities: { audio_kinds: ["music"], lyrics: false, vocals: false },
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects workflow outputs that conflict with task or kit outputs", () => {
    const catalog = buildMusicCatalog();
    const aceKit = catalog.kits.find((kit) => kit.name === "ace_step_1_5");
    expect(aceKit).toBeDefined();

    const result = ColabCatalogSchema.safeParse({
      version: 1,
      kits: [
        {
          ...aceKit,
          workflows: [{ ...aceKit!.workflows[0], output: "image" }],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects lyrics or vocals support without a music-capable audio kind", () => {
    const catalog = buildMusicCatalog();
    const mossKit = catalog.kits.find((kit) => kit.name === "moss_soundeffect_v2");
    expect(mossKit).toBeDefined();

    const result = ColabCatalogSchema.safeParse({
      version: 1,
      kits: [
        {
          ...mossKit,
          workflows: [
            {
              ...mossKit!.workflows[0],
              capabilities: { audio_kinds: ["sound_effect"], lyrics: true, vocals: true },
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("buildColabSuggestPayload", () => {
  it("suggests fast image kits from a natural-language goal", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      goal: "fast image generation on a T4",
      limit: 3,
    });

    expect(payload.ok).toBe(true);
    expect(payload.suggestions[0]).toMatchObject({
      kit: "z_image",
      workflow: "z_image_turbo",
      task: "text_to_image",
    });
  });

  it("honors explicit task/output/gpu filters", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      task: "text_to_video",
      output: "video",
      gpu: "A100",
      // Raise above the default top-5 cap so every qualifying video/A100 kit
      // is returned; more than 5 now match (e.g. hunyuan_video, sulphur2,
      // 10eros, wan21, wan22), and this assertion checks filtering, not rank.
      limit: 20,
    });

    expect(payload.suggestions.length).toBeGreaterThan(0);
    expect(payload.suggestions.every((item) => item.task === "text_to_video")).toBe(true);
    expect(payload.suggestions.every((item) => item.outputs.includes("video"))).toBe(true);
    expect(payload.suggestions.map((item) => item.kit)).toContain("wan22");
  });

  it("suggests BiRefNet for explicit background removal goals", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      goal: "remove background from an image on a T4",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "birefnet",
      workflow: "birefnet_remove_background",
      task: "remove_background",
    });
  });

  it("suggests Stable Audio 3 for music generation goals", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      goal: "generate music and audio on an A100",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "stable_audio3",
      workflow: "stable_audio3_medium_t2a",
      task: "text_to_audio",
    });
  });

  it("filters incompatible media before reliability for lyrics and vocals", () => {
    const payload = buildColabSuggestPayload(buildMusicCatalog("T4"), {
      goal: "generate a full song with Japanese lyrics and vocals on a T4",
      limit: 10,
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "ace_step_1_5",
      workflow_output: "audio",
      capabilities: { lyrics: true, vocals: true },
    });
    expect(payload.suggestions.some((item) => item.workflow_output === "image")).toBe(false);
    expect(payload.alternatives).toEqual([]);
  });

  it("understands Japanese music, lyrics, and vocal intent", () => {
    const payload = buildColabSuggestPayload(buildMusicCatalog("T4"), {
      goal: "日本語の歌詞とボーカル入りの曲をT4で生成",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "ace_step_1_5",
      workflow_output: "audio",
    });
  });

  it("returns a higher-GPU music kit only as an alternative", () => {
    const payload = buildColabSuggestPayload(buildMusicCatalog("L4"), {
      goal: "generate a full song with Japanese lyrics and vocals on a T4",
    });

    expect(payload.suggestions).toEqual([]);
    expect(payload.alternatives[0]).toMatchObject({
      kit: "ace_step_1_5",
      workflow_output: "audio",
      unmet_requirements: ["requires_gpu:L4"],
    });
    expect(payload.alternatives.some((item) => item.workflow_output === "image")).toBe(false);
  });

  it("suggests the lightweight music kit for instrumental BGM on T4", () => {
    const payload = buildColabSuggestPayload(buildMusicCatalog(), {
      goal: "instrumental background music on a T4",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "stable_audio3_small_music",
      workflow_output: "audio",
    });
  });

  it("prefers sound-effect capabilities over music-only workflows", () => {
    const payload = buildColabSuggestPayload(buildMusicCatalog(), {
      goal: "generate a sound effect on an A100",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "moss_soundeffect_v2",
      capabilities: { audio_kinds: ["sound_effect"] },
    });
    expect(payload.suggestions.map((item) => item.kit)).not.toContain("stable_audio3_small_music");
  });

  it("requires every requested audio kind for compound music and sound-effect goals", () => {
    const payload = buildColabSuggestPayload(buildMusicCatalog(), {
      goal: "generate music and sound effects on a T4",
      limit: 10,
    });

    expect(payload.suggestions).toEqual([]);
    expect(payload.alternatives[0]).toMatchObject({
      kit: "stable_audio3",
      capabilities: { audio_kinds: ["music", "sound_effect"] },
      unmet_requirements: ["requires_gpu:L4"],
    });
    expect(payload.alternatives.map((item) => item.kit)).not.toEqual(
      expect.arrayContaining(["ace_step_1_5", "stable_audio3_small_music", "moss_soundeffect_v2"]),
    );
  });

  it("treats music video as a video output request", () => {
    const payload = buildColabSuggestPayload(buildMusicCatalog(), {
      goal: "make a music video on a T4",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "video_music",
      workflow_output: "video",
    });
    expect(payload.suggestions.every((item) => item.workflow_output === "video")).toBe(true);
  });

  it("returns both media categories for parallel music and video requests", () => {
    const payload = buildColabSuggestPayload(buildMusicCatalog(), {
      goal: "generate music and video on an A100",
      limit: 10,
    });
    const outputs = new Set(payload.suggestions.map((item) => item.workflow_output));

    expect(outputs).toEqual(new Set(["audio", "video"]));
    expect(payload.suggestions.every((item) => item.reasons.includes("compound_request"))).toBe(
      true,
    );
  });

  it("does not treat T4 as a request for fast workflows", () => {
    const payload = buildColabSuggestPayload(buildMusicCatalog(), {
      goal: "image generation on a T4",
      limit: 10,
    });

    expect(payload.suggestions[0]).toMatchObject({ kit: "fast_image" });
    expect(payload.suggestions[0].reasons).not.toContain("speed:fast");
  });

  it("compares GPU minimum requirements by capability tier", () => {
    const catalog = buildMusicCatalog();
    const onA100 = buildColabSuggestPayload(catalog, { output: "audio", gpu: "A100", limit: 10 });
    const onT4 = buildColabSuggestPayload(catalog, { output: "audio", gpu: "T4", limit: 10 });

    expect(onA100.suggestions.map((item) => item.kit)).toEqual(
      expect.arrayContaining([
        "ace_step_1_5",
        "stable_audio3_small_music",
        "stable_audio3",
        "moss_soundeffect_v2",
      ]),
    );
    expect(onT4.suggestions.map((item) => item.kit)).toEqual(
      expect.arrayContaining(["ace_step_1_5", "stable_audio3_small_music"]),
    );
    expect(onT4.suggestions.map((item) => item.kit)).not.toContain("stable_audio3");
  });

  it("exposes when a compatible GPU tier has not been E2E verified", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      goal: "Japanese song with lyrics and vocals on a T4",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "ace_step_1_5",
      gpu: { minimum: "T4", recommended: "L4", verified: ["A100"] },
    });
    expect(payload.suggestions[0].reasons).toContain("gpu_unverified:T4");
  });

  it("filters by workflow output instead of kit-wide outputs", () => {
    const catalog = ColabCatalogSchema.parse({
      version: 1,
      kits: [
        {
          name: "mixed_tools",
          path: "mixed_tools/",
          status: "verified",
          tasks: ["text_to_image", "text_to_audio"],
          outputs: ["image", "audio"],
          gpu: { minimum: "T4", recommended: "T4" },
          summary: "Mixed media workflows.",
          workflows: [
            { name: "image", file: "image.json", task: "text_to_image" },
            { name: "audio", file: "audio.json", task: "text_to_audio" },
          ],
        },
      ],
    });
    const payload = buildColabSuggestPayload(catalog, { output: "audio" });

    expect(payload.suggestions).toHaveLength(1);
    expect(payload.suggestions[0]).toMatchObject({
      workflow: "audio",
      workflow_output: "audio",
    });
  });

  it("normalizes separators and case for exact kit names", () => {
    const payload = buildColabSuggestPayload(buildMusicCatalog(), {
      goal: "MOSS SOUNDEFFECT V2",
    });

    expect(payload.suggestions[0]).toMatchObject({ kit: "moss_soundeffect_v2" });
    expect(payload.suggestions[0].reasons).toContain("name:exact");
  });

  it("suggests MOSS-SoundEffect v2.0 when requested by name", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      goal: "moss_soundeffect_v2",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "moss_soundeffect_v2",
      workflow: "moss_soundeffect_v2_t2a",
      task: "text_to_audio",
      status: "verified",
    });
  });

  it("suggests the LTX-2.3 audio-video kit when requested by name", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      goal: "ltx23_t2v",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "ltx23_t2v",
      workflow: "ltx23_t2v_audio",
      task: "text_to_video",
    });
  });

  it("suggests the Wan 2.2 speech-to-video kit when requested by name", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      goal: "wan22_s2v",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "wan22_s2v",
      workflow: "wan22_s2v",
      task: "image_to_video",
    });
  });

  it("suggests SeedVR2 for explicit image upscaling", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      goal: "seedvr2 image upscale and restoration",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "seedvr2",
      workflow: "seedvr2_3b_upscale",
      task: "upscale",
    });
  });

  it("suggests HiDream-O1 when requested by name", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, {
      goal: "hidream_o1",
    });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "hidream_o1",
      workflow: "hidream_o1_dev_t2i",
      task: "text_to_image",
    });
  });

  it("keeps suggestions free of local paths", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, { goal: "anime image" });
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain(repoRoot);
    expect(serialized).not.toContain("/absolute/");
  });

  it("prioritizes an exact kit name over generic verified matches", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabSuggestPayload(catalog, { goal: "boogu" });

    expect(payload.suggestions[0]).toMatchObject({
      kit: "boogu",
      workflow: "boogu_turbo_t2i",
    });
  });
});

describe("runColabSuggest", () => {
  it("rejects invalid CLI filters", async () => {
    await expect(runColabSuggest("image", { task: "typo" as never, json: true })).rejects.toThrow(
      "task must be",
    );
    await expect(
      runColabSuggest("image", { output: "movie" as never, json: true }),
    ).rejects.toThrow("output must be");
    await expect(runColabSuggest("image", { limit: "0", json: true })).rejects.toThrow(
      "limit must be",
    );
    await expect(runColabSuggest("image", { gpu: "H100", json: true })).rejects.toThrow(
      "gpu must be",
    );
  });
});

describe("loadColabCatalogFile", () => {
  it("reports a repository-only catalog clearly when the catalog file is missing", async () => {
    await expect(
      loadColabCatalogFile(path.join(repoRoot, "missing", "catalog.yaml")),
    ).rejects.toMatchObject({
      code: "COLAB_CATALOG_UNAVAILABLE",
    });
  });

  it("covers every starter kit directory in the repository", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    expect(catalog.version).toBe(1);

    // Derive the expected kit set from the filesystem so a newly added kit
    // directory that is forgotten in catalog.yaml fails the test instead of
    // silently going missing from `colab catalog` / `colab suggest`.
    // A kit directory is any subdirectory of scripts/colab/ holding 01_setup.py.
    const colabDir = path.join(repoRoot, "scripts", "colab");
    const entries = await fs.readdir(colabDir, { withFileTypes: true });
    const kitDirs = (
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const hasSetup = await fs
              .access(path.join(colabDir, entry.name, "01_setup.py"))
              .then(() => true)
              .catch(() => false);
            return hasSetup ? entry.name : null;
          }),
      )
    )
      .filter((name): name is string => name !== null)
      .sort();

    expect(kitDirs.length).toBeGreaterThan(0);
    // loadColabCatalogFile returns kits sorted by name, matching the sorted dirs.
    expect(catalog.kits.map((kit) => kit.name)).toEqual(kitDirs);
  });

  it("references workflow files that exist on disk", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const colabDir = path.join(repoRoot, "scripts", "colab");

    for (const kit of catalog.kits) {
      for (const workflow of kit.workflows) {
        const workflowPath = path.join(colabDir, kit.path, workflow.file);
        const exists = await fs
          .access(workflowPath)
          .then(() => true)
          .catch(() => false);
        expect(exists, `${kit.name}/${workflow.file} should exist`).toBe(true);
      }
    }
  });

  it("builds a public payload without absolute filesystem or environment details", async () => {
    const catalog = await loadColabCatalogFile(catalogPath);
    const payload = buildColabCatalogPayload(catalog);
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({ ok: true, catalog: { version: 1 } });
    expect(serialized).not.toContain(repoRoot);
    expect(serialized).not.toContain(["OPENAI", "API", "KEY"].join("_"));
    expect(serialized).not.toContain(["COMFY", "AGENT", "BASE", "URL"].join("_"));
  });
});
