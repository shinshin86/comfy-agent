import path from "node:path";
import { promises as fs } from "node:fs";
import YAML from "yaml";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  capabilityInputs,
  inferCapability,
  StudioCapabilities,
  STUDIO_OBJECT_INFO_TIMEOUT_MS,
  STUDIO_SYSTEM_STATS_TIMEOUT_MS,
  formatStudioGpuLabel,
  isStudioSnapshotStale,
  STUDIO_SNAPSHOT_STALE_MS,
} from "../src/studio/capabilities.js";
import type { Preset } from "../src/preset/schema.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

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
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await fs.rm(globalFixture, { recursive: true, force: true });
});

const preset = (name: string, kinds: Array<"image" | "audio" | "mask" | "file"> = []): Preset => ({
  version: 1,
  name,
  workflow: `${name}.json`,
  uploads: Object.fromEntries(
    kinds.map((kind, i) => [
      `input${i}`,
      { kind, cli_flag: `--input${i}`, target: { node_id: String(i + 1), input: "file" } },
    ]),
  ),
});
const workflow = (class_type: string) => ({ "1": { class_type, inputs: {} } });
describe("studio capability inference", () => {
  it.each([
    ["cuda:0 NVIDIA A100-SXM4-40GB : cudaMallocAsync", "A100-SXM4-40GB"],
    ["cuda:0 NVIDIA L4 : cudaMallocAsync", "L4"],
    ["NVIDIA GeForce RTX 4090", "GeForce RTX 4090"],
    ["cuda:0 Tesla T4 : native", "Tesla T4"],
    ["mps", "mps"],
    ["cpu", "cpu"],
  ])("formats GPU label %s", (raw, label) => {
    expect(formatStudioGpuLabel(raw)).toBe(label);
  });
  it("treats only successful snapshots older than ten minutes as stale", () => {
    vi.useFakeTimers();
    const checkedAt = new Date().toISOString();
    expect(isStudioSnapshotStale(checkedAt)).toBe(false);
    vi.advanceTimersByTime(STUDIO_SNAPSHOT_STALE_MS);
    expect(isStudioSnapshotStale(checkedAt)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(isStudioSnapshotStale(checkedAt)).toBe(true);
    expect(isStudioSnapshotStale(undefined)).toBe(false);
    expect(isStudioSnapshotStale("invalid")).toBe(false);
  });
  it.each([
    ["flux_t2i", "SaveImage", [], "text_to_image", "image"],
    ["qwen_edit", "SaveImage", ["image"], "image_edit", "image"],
    ["minimax_h3_t2v", "SaveVideo", [], "text_to_video", "video"],
    ["minimax_h3_i2v", "VHS_VideoCombine", ["image"], "image_to_video", "video"],
    ["minimax_h3_r2v", "SaveVideo", ["image", "audio"], "reference_to_video", "video"],
    ["minimax_h3_flf2v", "CreateVideo", ["image", "image"], "image_to_video", "video"],
    ["music_t2a", "SaveAudioMP3", [], "audio", "audio"],
    ["misleading_i2v", "SaveImage", [], "text_to_image", "image"],
    ["legacy_i2v", "SaveAnimatedWEBP", [], "image_to_video", "video"],
  ] as const)("infers %s from workflow and upload slots", (name, node, kinds, task, output) => {
    expect(inferCapability(preset(name, [...kinds]), workflow(node))).toEqual({
      task,
      output,
      task_source: "inferred",
    });
  });
  it("honors explicit task and reference roles", () => {
    expect(
      inferCapability({ ...preset("explicit"), task: "image_edit" }, workflow("SaveImage"))
        .task_source,
    ).toBe("preset");
    expect(
      inferCapability({ ...preset("audio"), task: "audio_to_audio" }, workflow("SaveAudio")).task,
    ).toBe("audio");
    const p = preset("reference", ["image"]);
    p.uploads!.input0!.role = "reference_image";
    expect(inferCapability(p, workflow("SaveVideo")).task).toBe("reference_to_video");
  });
  it("distinguishes first/last frame aliases and names, with numbered fallbacks", () => {
    const p = preset("ltx_flf2v", ["image", "image"]);
    p.uploads!.input0!.aliases = ["--first-frame"];
    p.uploads!.input1!.aliases = ["end_image"];
    expect(capabilityInputs(p).map((slot) => slot.label)).toEqual(["first_frame", "last_frame"]);
    p.uploads = { start_image: p.uploads!.input0!, last_frame: p.uploads!.input1! };
    for (const def of Object.values(p.uploads)) delete def.aliases;
    expect(capabilityInputs(p).map((slot) => slot.label)).toEqual(["first_frame", "last_frame"]);
    expect(capabilityInputs(preset("ltx_flf2v", ["image", "image"]))).toMatchObject([
      { name: "input0", label: "numbered_image", label_index: 1 },
      { name: "input1", label: "numbered_image", label_index: 2 },
    ]);
    expect(inferCapability(preset("flf2v_legacy"), workflow("SaveVideo")).task).toBe(
      "image_to_video",
    );
  });
});

describe("studio capability availability", () => {
  it("waits for a 22-second object_info response beyond the old five-second limit", async () => {
    const tmp = await createTmpWorkdir();
    vi.useFakeTimers();
    let infoSignal: AbortSignal | undefined;
    const fetcher = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith("system_stats"))
        return Promise.resolve(Response.json({ devices: [{ name: "L4" }] }));
      infoSignal = options?.signal ?? undefined;
      return new Promise<Response>((resolve, reject) => {
        setTimeout(() => resolve(Response.json({ SaveImage: {} })), 22_000);
        infoSignal?.addEventListener("abort", () => reject(infoSignal?.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const capabilities = new StudioCapabilities(tmp.cwd);
    let settled = false;
    const pending = capabilities.read([]).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(5_001);
    expect(settled).toBe(false);
    expect(infoSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(16_999);
    const result = await pending;
    expect(result.server).toMatchObject({
      reachable: true,
      fingerprint: expect.any(String),
      cached: false,
    });
    expect(result.server.error).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("times out object_info, reports why, and retries the very next read", async () => {
    const tmp = await createTmpWorkdir();
    vi.useFakeTimers();
    let fail = true;
    let infoSignal: AbortSignal | undefined;
    const fetcher = vi.fn((url: string, options?: { signal: AbortSignal }) => {
      if (url.endsWith("system_stats")) return Promise.resolve({});
      infoSignal = options?.signal;
      return fail ? new Promise<unknown>(() => {}) : Promise.resolve({ SaveImage: {} });
    });
    const capabilities = new StudioCapabilities(tmp.cwd, fetcher);
    const pending = capabilities.read([]);
    await vi.advanceTimersByTimeAsync(STUDIO_OBJECT_INFO_TIMEOUT_MS);
    const failed = await pending;
    expect(failed.server.error).toEqual({ code: "timeout", status: undefined });
    expect(failed.server.cached).toBe(false);
    expect(infoSignal?.aborted).toBe(true);
    fail = false;
    const recovered = await capabilities.read([]);
    expect(recovered.server.fingerprint).toEqual(expect.any(String));
    expect(recovered.server.error).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("keeps system_stats short without discarding successful object_info", async () => {
    const tmp = await createTmpWorkdir();
    vi.useFakeTimers();
    let statsSignal: AbortSignal | undefined;
    const capabilities = new StudioCapabilities(tmp.cwd, (url, options) => {
      if (url.endsWith("object_info")) return Promise.resolve({ SaveImage: {} });
      statsSignal = options?.signal;
      return new Promise(() => {});
    });
    const pending = capabilities.read([]);
    await vi.advanceTimersByTimeAsync(STUDIO_SYSTEM_STATS_TIMEOUT_MS);
    const result = await pending;
    expect(statsSignal?.aborted).toBe(true);
    expect(result.server.fingerprint).toEqual(expect.any(String));
    expect(result.server.error).toBeUndefined();
  });
  it("does not cache HTTP failures and distinguishes them from timeouts", async () => {
    const tmp = await createTmpWorkdir();
    let fail = true;
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("system_stats")
        ? Response.json({})
        : fail
          ? Response.json({}, { status: 503 })
          : Response.json({ SaveImage: {} }),
    );
    vi.stubGlobal("fetch", fetcher);
    const capabilities = new StudioCapabilities(tmp.cwd);
    const failed = await capabilities.read([]);
    expect(failed.server.error).toEqual({ code: "http", status: 503 });
    fail = false;
    const recovered = await capabilities.read([]);
    expect(recovered.server.fingerprint).toEqual(expect.any(String));
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect((await capabilities.read([])).server.cached).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("shares in-flight probes even for refresh and after sixty seconds", async () => {
    const tmp = await createTmpWorkdir();
    vi.useFakeTimers();
    let resolveInfo!: (info: unknown) => void;
    const fetcher = vi.fn((url: string) =>
      url.endsWith("system_stats")
        ? Promise.resolve({})
        : new Promise((resolve) => {
            resolveInfo = resolve;
          }),
    );
    const capabilities = new StudioCapabilities(tmp.cwd, fetcher);
    const first = capabilities.read([]);
    await vi.advanceTimersByTimeAsync(60_001);
    const concurrent = capabilities.read([], true);
    const snapshot = capabilities.serverSnapshot(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    resolveInfo({ SaveImage: {} });
    const [a, b, shared] = await Promise.all([first, concurrent, snapshot]);
    expect(a.server.fingerprint).toBe(b.server.fingerprint);
    expect(shared.fingerprint).toBe(a.server.fingerprint);
    expect(b.server.cached).toBe(false);
    await vi.advanceTimersByTimeAsync(59_999);
    expect((await capabilities.read([])).server.cached).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([null, [], "invalid"])("does not cache malformed object_info: %j", async (info) => {
    const tmp = await createTmpWorkdir();
    const fetcher = vi.fn(async (url: string) => (url.endsWith("object_info") ? info : {}));
    const capabilities = new StudioCapabilities(tmp.cwd, fetcher);
    expect((await capabilities.read([])).server.error).toMatchObject({ code: "invalid_response" });
    await capabilities.read([]);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("checks nodes and models once per TTL, refreshes, and local presets shadow global", async () => {
    const tmp = await createTmpWorkdir();
    const local = preset("shared");
    await fs.writeFile(path.join(tmp.workdir, "presets", "shared.yaml"), YAML.stringify(local));
    await fs.writeFile(
      path.join(tmp.workdir, "workflows", "shared.json"),
      JSON.stringify(workflow("SaveImage")),
    );
    const model = preset("model");
    await fs.writeFile(path.join(tmp.workdir, "presets", "model.yaml"), YAML.stringify(model));
    await fs.writeFile(
      path.join(tmp.workdir, "workflows", "model.json"),
      JSON.stringify({ "1": { class_type: "Loader", inputs: { model: "wanted.safetensors" } } }),
    );
    const globalDir = path.join(globalFixture, "presets");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.writeFile(
      path.join(globalDir, "shared.yaml"),
      YAML.stringify(preset("shared", ["audio"])),
    );
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/object_info")
        ? { Loader: { input: { required: { model: [["other.safetensors"]] } } } }
        : {
            devices: [{ name: "L4", vram_total: 22 * 1024 ** 3 }],
            system: { comfyui_version: "0.3.0" },
          },
    );
    const capabilities = new StudioCapabilities(tmp.cwd, fetcher);
    const [a, b] = await Promise.all([capabilities.read([]), capabilities.read([])]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(a.server).toMatchObject({ reachable: true, system: { gpu: "L4" } });
    expect(a.presets.find((p) => p.name === "shared")).toMatchObject({
      scope: "local",
      availability: "missing_nodes",
      missing: { nodes: ["SaveImage"] },
      inputs: [],
    });
    expect(b.presets.find((p) => p.name === "model")).toMatchObject({
      availability: "missing_models",
      missing: { models: ["wanted.safetensors"] },
    });
    await capabilities.read([], true);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("returns unknown while offline and tolerates malformed local presets", async () => {
    const tmp = await createTmpWorkdir();
    await fs.writeFile(path.join(tmp.workdir, "presets", "broken.yaml"), "bad: preset");
    const caps = await new StudioCapabilities(tmp.cwd, async () => {
      throw new Error("offline");
    }).read([]);
    expect(caps.server.reachable).toBe(false);
    expect(caps.presets).toMatchObject([
      { name: "broken", availability: "unknown", invalid: true },
    ]);
  });
  it("marks video usable when image nodes are absent and system stats fail", async () => {
    const tmp = await createTmpWorkdir();
    for (const [name, node] of [
      ["image_t2i", "SaveImage"],
      ["h3_t2v", "SaveVideo"],
    ]) {
      await fs.writeFile(
        path.join(tmp.workdir, "presets", `${name}.yaml`),
        YAML.stringify(preset(name!)),
      );
      await fs.writeFile(
        path.join(tmp.workdir, "workflows", `${name}.json`),
        JSON.stringify(workflow(node!)),
      );
    }
    const caps = await new StudioCapabilities(tmp.cwd, async (url) => {
      if (url.endsWith("system_stats")) throw new Error();
      return { SaveVideo: {} };
    }).read([]);
    expect(caps.server.reachable).toBe(true);
    expect(caps.presets.find((p) => p.name === "h3_t2v")!.availability).toBe("ok");
    expect(caps.presets.find((p) => p.name === "image_t2i")!.availability).toBe("missing_nodes");
  });
});
