import path from "node:path";
import { promises as fs } from "node:fs";
import http from "node:http";
import YAML from "yaml";
import { afterAll, describe, expect, it, vi } from "vitest";
import { startStudioServer } from "../src/studio/server.js";
import type { Preset } from "../src/preset/schema.js";
import type { JobRecord } from "../src/jobs/types.js";
import { writeJob } from "../src/jobs/store.js";
import { listRequests } from "../src/studio/store.js";
import type { RunLauncher } from "../src/studio/rerun.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";
import {
  optionalObjectInfo,
  optionalPreset,
  optionalWorkflow,
  writeOptionalFixture,
} from "./helpers/optional-workflow.js";
import type { CapabilityFetcher } from "../src/studio/capabilities.js";
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

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const setup = async (
  launcher: RunLauncher = async () => ({
    exitCode: 0,
    stdout: '{"ok":true,"jobs":[]}',
    stderr: "",
  }),
  fetchServerInput?: (serverName: string) => Promise<Buffer>,
  capabilityFetcher: CapabilityFetcher = async () => ({ SaveVideo: {} }),
) => {
  const tmp = await createTmpWorkdir();
  const preset: Preset = {
    version: 1,
    name: "h3_i2v",
    workflow: "h3.json",
    parameters: {
      "4_text": {
        type: "string",
        role: "prompt",
        required: true,
        target: { node_id: "4", input: "text" },
      },
      "104_length": {
        type: "int",
        aliases: ["length"],
        min: 1,
        max: 240,
        default: 120,
        target: { node_id: "104", input: "length" },
      },
      "91_fps": {
        type: "float",
        aliases: ["fps"],
        default: 24,
        target: { node_id: "91", input: "fps" },
      },
      "12_seed": { type: "int", role: "seed", target: { node_id: "12", input: "seed" } },
      "5_bool": { type: "bool", default: false, target: { node_id: "5", input: "enabled" } },
      "6_choice": {
        type: "string",
        choices: ["a", "b"],
        default: "a",
        target: { node_id: "6", input: "choice" },
      },
    },
    uploads: {
      image: {
        kind: "image",
        cli_flag: "--image",
        required: true,
        target: { node_id: "9", input: "image" },
      },
    },
  };
  await fs.writeFile(path.join(tmp.workdir, "presets", "h3_i2v.yaml"), YAML.stringify(preset));
  await fs.writeFile(
    path.join(tmp.workdir, "workflows", "h3.json"),
    JSON.stringify({ "1": { class_type: "SaveVideo", inputs: {} } }),
  );
  const job: JobRecord = {
    version: 2,
    job_id: "source-image",
    prompt_id: "source-image",
    client_id: "test",
    batch_id: "source-image",
    batch_index: 1,
    batch_count: 1,
    scope: "local",
    base_url: "http://127.0.0.1:8188",
    preset: "h3_i2v",
    source: "local",
    params: { "4_text": "original", "12_seed": 42 },
    uploads: { image: "original.png" },
    seed: 42,
    output_dir: tmp.workdir,
    submitted_at: "2026-10-09T00:00:00Z",
    status: "completed",
    outputs: [{ filename: "image.png", saved_to: "image.png", kind: "image" }],
  };
  await fs.writeFile(path.join(tmp.workdir, "image.png"), "PNG");
  job.upload_sources = { image: path.join(tmp.workdir, "image.png") };
  await writeJob(job, tmp.cwd, "local");
  const server = await startStudioServer({
    cwd: tmp.cwd,
    host: "127.0.0.1",
    port: 0,
    publicDir: path.resolve("studio/public"),
    lang: "ja",
    launcher,
    fetchServerInput,
    maxUploadBytes: 8,
    capabilityFetcher,
  });
  return { tmp, server, job };
};
const body = {
  preset: "h3_i2v",
  params: { "4_text": "--a cinematic scene", "104_length": 144 },
  inputs: { image: { job_id: "source-image", output_index: 0 } },
  count: 1,
  seed: "random",
};

describe("studio generation", () => {
  it("passes skip to the CLI, preserves recorded skip in re-creation and validates frame steps", async () => {
    const launcher = vi
      .fn<RunLauncher>()
      .mockResolvedValue({ exitCode: 0, stdout: '{"ok":true,"jobs":[]}', stderr: "" });
    const { server, tmp, job } = await setup(launcher, undefined, async () => optionalObjectInfo);
    await writeOptionalFixture(tmp.workdir);
    await fs.writeFile(
      path.join(tmp.workdir, "presets", `${optionalPreset.name}.yaml`),
      YAML.stringify({
        ...optionalPreset,
        uploads: {
          ...optionalPreset.uploads,
          unused_image: {
            kind: "image",
            required: true,
            cli_flag: "--unused-image",
            target: { node_id: "6", input: "image" },
          },
        },
        parameters: {
          ...optionalPreset.parameters,
          source_image: {
            type: "string",
            required: true,
            target: { node_id: "1", input: "image" },
          },
        },
      }),
    );
    await fs.writeFile(
      path.join(tmp.workdir, "workflows", optionalPreset.workflow),
      JSON.stringify({
        ...optionalWorkflow,
        "6": { class_type: "LoadImage", inputs: { image: "unused.png" } },
      }),
    );
    const skipped = {
      ...job,
      job_id: "skipped-job",
      preset: optionalPreset.name,
      params: { prompt: "A scene", length: 81 },
      uploads: {},
      skipped_inputs: ["image", "reference"],
    };
    await writeJob(skipped, tmp.cwd, "local");
    try {
      const body = {
        capability: "text_to_video",
        preset: optionalPreset.name,
        prompt: "A scene",
        params: { length: 81 },
        inputs: {},
      };
      expect((await post(`${server.url}api/generate`, body)).status).toBe(200);
      await vi.waitFor(() => expect(launcher).toHaveBeenCalledTimes(1));
      expect(launcher.mock.calls[0]![0]).toEqual(
        expect.arrayContaining(["--skip-input", "image", "reference"]),
      );
      const form = await (await fetch(`${server.url}api/jobs/skipped-job/rerun`)).json();
      expect(form.form.skip).toEqual(["image", "reference"]);
      expect(
        (
          await post(`${server.url}api/generate`, {
            preset: optionalPreset.name,
            source_job_id: "skipped-job",
            params: {},
          })
        ).status,
      ).toBe(200);
      await vi.waitFor(() => expect(launcher).toHaveBeenCalledTimes(2));
      expect(launcher.mock.calls[1]![0]).toEqual(
        expect.arrayContaining(["--skip-input", "image", "reference"]),
      );
      expect((await post(`${server.url}api/jobs/skipped-job/rerun`, {})).status).toBe(200);
      await vi.waitFor(() => expect(launcher).toHaveBeenCalledTimes(3));
      expect(launcher.mock.calls[2]![0]).toContain("--skip-input");
      expect((await post(`${server.url}api/generate`, { ...body, duration_s: 4 })).status).toBe(
        400,
      );
      expect(
        (await post(`${server.url}api/generate`, { ...body, duration_s: 97 / 24 })).status,
      ).toBe(200);
      await vi.waitFor(() => expect(launcher).toHaveBeenCalledTimes(4));
      expect(launcher.mock.calls[3]![0]).toContain("--length=97");
      for (const patch of [
        { skip: ["unknown"] },
        { skip: ["image"], inputs: { image: { job_id: job.job_id, output_index: 0 } } },
        { skip: "image" },
      ])
        expect((await post(`${server.url}api/generate`, { ...body, ...patch })).status).toBe(400);
    } finally {
      await server.close();
    }
  });
  it("skips empty optional slots in input modes, but uses explicitly supplied references", async () => {
    const launcher = vi
      .fn<RunLauncher>()
      .mockResolvedValue({ exitCode: 0, stdout: '{"ok":true,"jobs":[]}', stderr: "" });
    const { server, tmp, job } = await setup(launcher, undefined, async () => optionalObjectInfo);
    await writeOptionalFixture(tmp.workdir);
    const body = {
      capability: "image_to_video",
      preset: optionalPreset.name,
      prompt: "A scene",
      params: { length: 81 },
      inputs: {},
      skip: [],
    };
    try {
      expect((await post(`${server.url}api/generate`, body)).status).toBe(200);
      await vi.waitFor(() => expect(launcher).toHaveBeenCalledTimes(1));
      expect(launcher.mock.calls[0]![0]).toEqual(
        expect.arrayContaining(["--skip-input", "image", "reference"]),
      );
      expect(
        (
          await post(`${server.url}api/generate`, {
            ...body,
            inputs: { image: { job_id: job.job_id, output_index: 0 } },
          })
        ).status,
      ).toBe(200);
      await vi.waitFor(() => expect(launcher).toHaveBeenCalledTimes(2));
      const args = launcher.mock.calls[1]![0];
      expect(args).toContain("reference");
      expect(args).not.toContain("image");
      expect(args.some((arg) => arg.startsWith("--image="))).toBe(true);
      // Text-only variants always omit their main input, including with skip: [].
      expect(
        (
          await post(`${server.url}api/generate`, {
            ...body,
            capability: "text_to_video",
            inputs: { image: { job_id: job.job_id, output_index: 0 } },
          })
        ).status,
      ).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("does not omit an empty required slot when only a different slot is optional", async () => {
    const requiredInfo = {
      ...optionalObjectInfo,
      WanImageToVideo: {
        input: {
          required: { length: ["INT"], prompt: ["STRING"], start_image: ["LATENT"] },
          optional: { reference: ["IMAGE"] },
        },
      },
    };
    const launcher = vi.fn<RunLauncher>();
    const { server, tmp } = await setup(launcher, undefined, async () => requiredInfo);
    await writeOptionalFixture(tmp.workdir);
    try {
      const response = await post(`${server.url}api/generate`, {
        capability: "image_to_video",
        preset: optionalPreset.name,
        prompt: "A scene",
        params: { length: 81 },
        inputs: {},
        skip: [],
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error.message).toContain("required: image");
      expect(launcher).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it("maps catalog prompt and seconds to preset controls and rejects a mismatched capability", async () => {
    const launcher = vi
      .fn<RunLauncher>()
      .mockResolvedValue({ exitCode: 0, stdout: '{"ok":true,"jobs":[]}', stderr: "" });
    const { server } = await setup(launcher);
    try {
      const catalog = await (await fetch(`${server.url}api/catalog`)).json();
      expect(catalog.capabilities.map((c: { id: string }) => c.id)).toEqual(["image_to_video"]);
      const res = await post(`${server.url}api/generate`, {
        ...body,
        capability: "image_to_video",
        prompt: "A moving scene",
        duration_s: 6,
      });
      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(launcher).toHaveBeenCalledTimes(1));
      expect(launcher.mock.calls[0]![0]).toContain("--104_length=144");
      expect(launcher.mock.calls[0]![0]).toContain("--4_text=A moving scene");
      const wrong = await post(`${server.url}api/generate`, {
        ...body,
        capability: "text_to_image",
        prompt: "Wrong mode",
      });
      expect(wrong.status).toBe(400);
      const tooLong = await post(`${server.url}api/generate`, {
        ...body,
        capability: "image_to_video",
        duration_s: 30,
      });
      expect(tooLong.status).toBe(400);
      const unsupported = await post(`${server.url}api/generate`, {
        ...body,
        capability: "image_to_video",
        aspect: "16:9",
      });
      expect(unsupported.status).toBe(400);
    } finally {
      await server.close();
    }
  });
  it("runs new generations with typed edits and compatible gallery inputs", async () => {
    const launcher = vi.fn<RunLauncher>().mockResolvedValue({
      exitCode: 0,
      stdout: '{"ok":true,"jobs":[{"job_id":"new-result"}]}',
      stderr: "",
    });
    const { server, tmp } = await setup(launcher);
    try {
      expect((await post(`${server.url}api/generate`, { ...body, count: 2 })).status).toBe(200);
      await vi.waitFor(() => expect(launcher).toHaveBeenCalledOnce());
      const args = launcher.mock.calls[0]![0];
      expect(args.slice(0, 5)).toEqual(["run", "h3_i2v", "--json", "--source", "local"]);
      expect(args).toContain("--4_text=--a cinematic scene");
      expect(args).toContain("--104_length=144");
      expect(args).toContain(`--image=${path.join(tmp.workdir, "image.png")}`);
      expect(args).toContain("--seed");
      expect(args).toContain("random");
      await vi.waitFor(async () =>
        expect(await (await fetch(`${server.url}api/state`)).json()).toMatchObject({
          runs: [{ status: "completed", job_ids: ["new-result"] }],
        }),
      );
    } finally {
      await server.close();
    }
  });
  it.each([
    { params: { alien: "bad" } },
    { params: { "4_text": 1 } },
    { params: { "4_text": "x", "104_length": 1.5 } },
    { params: { "4_text": "x", "104_length": 241 } },
    { params: { "4_text": "x", "5_bool": "false" } },
    { params: { "4_text": "x", "6_choice": "c" } },
    { params: { "4_text": "x", "12_seed": 99 } },
    { params: {} },
    { count: 5 },
    { count: 2, seed: 42 },
    { inputs: {} },
    { inputs: { alien: { job_id: "source-image", output_index: 0 } } },
    { inputs: { image: { path: "/path/to/arbitrary.png" } } },
  ])("rejects invalid generation request %j", async (patch) => {
    const launcher = vi.fn<RunLauncher>();
    const { server } = await setup(launcher);
    try {
      expect((await post(`${server.url}api/generate`, { ...body, ...patch })).status).toBe(400);
      expect(launcher).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
  it("restores original job inputs in the shared create endpoint and uses a fixed seed", async () => {
    const launcher = vi
      .fn<RunLauncher>()
      .mockResolvedValue({ exitCode: 0, stdout: '{"ok":true,"jobs":[]}', stderr: "" });
    const { server, tmp } = await setup(launcher);
    try {
      expect(
        (
          await post(`${server.url}api/generate`, {
            preset: "h3_i2v",
            source_job_id: "source-image",
            params: { "4_text": "edited" },
            seed: 42,
          })
        ).status,
      ).toBe(200);
      await vi.waitFor(() => expect(launcher).toHaveBeenCalled());
      expect(launcher.mock.calls[0]![0]).toContain(
        `--image=${path.join(tmp.workdir, "image.png")}`,
      );
      expect(launcher.mock.calls[0]![0]).toContain("42");
      expect(launcher.mock.calls[0]![0]).not.toContain("--12_seed=42");
    } finally {
      await server.close();
    }
  });
  it.each(["local", "server"])(
    "keeps an original %s input when switching preset and slot name",
    async (source) => {
      const launcher = vi
        .fn<RunLauncher>()
        .mockResolvedValue({ exitCode: 0, stdout: '{"ok":true,"jobs":[]}', stderr: "" });
      const download = vi.fn().mockResolvedValue(Buffer.from("downloaded image"));
      const { server, tmp, job } = await setup(launcher, download);
      try {
        const preset = YAML.parse(
          await fs.readFile(path.join(tmp.workdir, "presets", "h3_i2v.yaml"), "utf8"),
        ) as Preset;
        await fs.writeFile(
          path.join(tmp.workdir, "presets", "h3_other.yaml"),
          YAML.stringify({
            ...preset,
            name: "h3_other",
            uploads: { start: { ...preset.uploads!.image, cli_flag: "--start-image" } },
          }),
        );
        if (source === "server") await writeJob({ ...job, upload_sources: {} }, tmp.cwd, "local");
        expect(
          (
            await post(`${server.url}api/generate`, {
              ...body,
              preset: "h3_other",
              inputs: { start: { input_job_id: job.job_id, input_slot: "image" } },
            })
          ).status,
        ).toBe(200);
        await vi.waitFor(() => expect(launcher).toHaveBeenCalledOnce());
        const input = launcher.mock.calls[0]![0].find((arg) => arg.startsWith("--start-image="));
        expect(input).toBeDefined();
        expect(await fs.readFile(input!.slice("--start-image=".length), "utf8")).toBe(
          source === "local" ? "PNG" : "downloaded image",
        );
        expect(download).toHaveBeenCalledTimes(source === "server" ? 1 : 0);
        if (source === "server") expect(download).toHaveBeenCalledWith("original.png");
        const context = await post(`${server.url}api/requests`, {
          text: "Use the retained input",
          context: { inputs: { start: { input_job_id: job.job_id, input_slot: "image" } } },
          send: false,
        });
        expect(context.status).toBe(200);
        expect((await context.json()).prompt).toContain(
          source === "local" ? "image.png" : "original.png",
        );
      } finally {
        await server.close();
      }
    },
  );
  it("rejects unrecorded original slots and incompatible original kinds before launching", async () => {
    const launcher = vi.fn<RunLauncher>();
    const download = vi.fn();
    const { server, tmp } = await setup(launcher, download);
    try {
      expect(
        (
          await post(`${server.url}api/generate`, {
            ...body,
            inputs: { image: { input_job_id: "source-image", input_slot: "unknown" } },
          })
        ).status,
      ).toBe(400);
      const preset = YAML.parse(
        await fs.readFile(path.join(tmp.workdir, "presets", "h3_i2v.yaml"), "utf8"),
      ) as Preset;
      await fs.writeFile(
        path.join(tmp.workdir, "presets", "audio_input.yaml"),
        YAML.stringify({
          ...preset,
          name: "audio_input",
          uploads: { image: { ...preset.uploads!.image, kind: "audio" } },
        }),
      );
      expect(
        (
          await post(`${server.url}api/generate`, {
            ...body,
            preset: "audio_input",
            inputs: { image: { input_job_id: "source-image", input_slot: "image" } },
          })
        ).status,
      ).toBe(400);
      expect(download).not.toHaveBeenCalled();
      expect(launcher).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
  it("shares the concurrency cap between generation and re-runs", async () => {
    const releases: Array<() => void> = [];
    const { server } = await setup(async () => {
      await new Promise<void>((resolve) => releases.push(resolve));
      return { exitCode: 0, stdout: '{"ok":true,"jobs":[]}', stderr: "" };
    });
    try {
      expect((await post(`${server.url}api/generate`, body)).status).toBe(200);
      expect((await post(`${server.url}api/jobs/source-image/rerun`, {})).status).toBe(200);
      expect((await post(`${server.url}api/generate`, body)).status).toBe(429);
      await vi.waitFor(() => expect(releases).toHaveLength(2));
    } finally {
      releases.forEach((release) => release());
      await server.close();
    }
  });
});

describe("studio uploads and request context", () => {
  it("streams whitelisted files, previews by ID, rejects size/type/origin and validates input kind", async () => {
    const launcher = vi
      .fn<RunLauncher>()
      .mockResolvedValue({ exitCode: 0, stdout: '{"ok":true,"jobs":[]}', stderr: "" });
    const { server, tmp } = await setup(launcher);
    const upload = (type: string, content: string, headers = {}) =>
      fetch(`${server.url}api/uploads`, {
        method: "POST",
        headers: { "Content-Type": type, ...headers },
        body: content,
      });
    try {
      expect((await upload("text/plain", "abc")).status).toBe(415);
      expect((await upload("image/svg+xml", "abc")).status).toBe(415);
      expect((await upload("image/png", "123456789")).status).toBe(413);
      expect((await upload("image/png", "")).status).toBe(400);
      expect((await upload("image/png", "abc", { Origin: "https://evil.example" })).status).toBe(
        403,
      );
      const file = (await (await upload("image/png", "PNGDATA")).json()) as {
        upload_id: string;
        url: string;
      };
      expect(await (await fetch(new URL(file.url, server.url))).text()).toBe("PNGDATA");
      expect((await fetch(`${server.url}api/media/upload/..%2Fconfig.yaml`)).status).toBe(404);
      expect(
        (
          await post(`${server.url}api/generate`, {
            ...body,
            inputs: { image: { upload_id: file.upload_id } },
          })
        ).status,
      ).toBe(200);
      await vi.waitFor(() => expect(launcher).toHaveBeenCalled());
      const audio = (await (await upload("audio/wav", "WAV")).json()) as { upload_id: string };
      expect(
        (
          await post(`${server.url}api/generate`, {
            ...body,
            inputs: { image: { upload_id: audio.upload_id } },
          })
        ).status,
      ).toBe(400);
      const context = {
        task: "image_to_video",
        preset: body.preset,
        params: body.params,
        count: 3,
        seed: "random",
        inputs: { image: { upload_id: file.upload_id } },
      };
      const preview = (await (
        await post(`${server.url}api/requests`, { text: "make a clip", context })
      ).json()) as { prompt: string };
      expect(preview.prompt).toContain("image_to_video");
      expect(preview.prompt).toContain(body.preset);
      expect(preview.prompt).toContain(file.upload_id);
      expect(preview.prompt).toContain('"count": 3');
      expect(preview.prompt).toContain('"seed": "random"');
      expect(preview.prompt).toContain(path.join(tmp.workdir, "studio", "uploads"));
      expect(await listRequests(tmp.cwd)).toEqual([]);
      await post(`${server.url}api/requests`, { text: "make a clip", context, send: true });
      expect((await listRequests(tmp.cwd))[0]!.context).toEqual(context);
    } finally {
      await server.close();
    }
  });
  it("rejects oversized chunked uploads with a JSON response and removes partial files", async () => {
    const { server, tmp } = await setup();
    try {
      const reply = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = http.request(
          new URL("api/uploads", server.url),
          {
            method: "POST",
            headers: { "Content-Type": "image/png", "Transfer-Encoding": "chunked" },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => {
              body += String(chunk);
            });
            res.on("end", () => resolve({ status: res.statusCode!, body }));
          },
        );
        req.on("error", reject);
        req.write("1234");
        req.end("56789");
      });
      expect(reply.status).toBe(413);
      expect(JSON.parse(reply.body)).toMatchObject({ error: { code: "BODY_TOO_LARGE" } });
      expect(await fs.readdir(path.join(tmp.workdir, "studio", "uploads"))).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it("does not delay state while capabilities are fetching", async () => {
    const tmp = await createTmpWorkdir();
    let release!: () => void;
    const gate = new Promise<unknown>((resolve) => {
      release = () => resolve({});
    });
    const server = await startStudioServer({
      cwd: tmp.cwd,
      host: "127.0.0.1",
      port: 0,
      publicDir: path.resolve("studio/public"),
      lang: null,
      capabilityFetcher: async () => gate,
    });
    const pending = fetch(`${server.url}api/capabilities`);
    try {
      const state = await fetch(`${server.url}api/state`, { signal: AbortSignal.timeout(2000) });
      expect(state.status).toBe(200);
    } finally {
      release();
      await pending;
      await server.close();
    }
  });
  it("rejects cross-origin generation and DNS rebinding on capabilities", async () => {
    const { server } = await setup();
    try {
      expect(
        (
          await fetch(`${server.url}api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
            body: JSON.stringify(body),
          })
        ).status,
      ).toBe(403);
      const status = await new Promise((resolve) =>
        http.get(
          {
            host: "127.0.0.1",
            port: new URL(server.url).port,
            path: "/api/capabilities",
            headers: { Host: "evil.example" },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        ),
      );
      expect(status).toBe(403);
    } finally {
      await server.close();
    }
  });
});
