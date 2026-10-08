import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { readJob, writeJob } from "../src/jobs/store.js";
import type { JobRecord } from "../src/jobs/types.js";
import type { RunLauncher } from "../src/studio/rerun.js";
import { startStudioServer } from "../src/studio/server.js";
import { listRequests, savePlan } from "../src/studio/store.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const publicDir = path.resolve("studio/public");

const makeJob = (cwd: string): JobRecord => ({
  version: 1,
  job_id: "abcd1234-studio-job",
  prompt_id: "abcd1234-studio-job",
  client_id: "studio-client",
  batch_id: "abcd1234-studio-job",
  batch_index: 1,
  batch_count: 1,
  scope: "local",
  base_url: "http://127.0.0.1:8188",
  preset: "example",
  source: "local",
  params: { steps: 8 },
  uploads: {},
  seed: 42,
  output_dir: path.join(cwd, ".comfy-agent", "outputs", "example", "ts"),
  submitted_at: "2026-10-07T00:00:00.000Z",
  status: "completed",
  outputs: [{ filename: "image.png", saved_to: "image.png" }],
  prompt_final: "a cat",
});

const PRESET_YAML = `version: 1
name: example
workflow: example.json
parameters:
  4_text:
    type: string
    role: prompt
    target: { node_id: "4", input: text }
  5_value:
    type: int
    role: width
    target: { node_id: "5", input: value }
  12_noise_seed:
    type: int
    role: seed
    target: { node_id: "12", input: noise_seed }
  1_unet_name:
    type: json
    target: { node_id: "1", input: unet_name }
`;

const setup = async (launcher?: RunLauncher) => {
  const tmp = await createTmpWorkdir();
  const job = makeJob(tmp.cwd);
  await writeJob(job, tmp.cwd, "local");
  await fs.mkdir(job.output_dir, { recursive: true });
  await fs.writeFile(path.join(job.output_dir, "image.png"), "PNGDATA");
  const server = await startStudioServer({
    cwd: tmp.cwd,
    host: "127.0.0.1",
    port: 0,
    publicDir,
    lang: "ja",
    launcher,
  });
  return { tmp, job, server };
};

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("studio server", () => {
  it("serves state with outputs, plans and the page itself", async () => {
    const { tmp, server } = await setup();
    try {
      await savePlan(tmp.cwd, {
        id: "plan-1",
        title: "Cat",
        steps: [{ title: "Key image", method: "t2i", job_ids: ["abcd1234"] }],
      });
      const state = (await (await fetch(`${server.url}api/state`)).json()) as {
        jobs: Array<{ outputs: Array<{ kind: string; url: string }> }>;
        plans: Array<{ id: string; steps: Array<{ status: string }> }>;
        lang: string;
      };
      expect(state.lang).toBe("ja");
      expect(state.jobs[0]!.outputs[0]!.kind).toBe("image");
      expect(state.plans[0]!.id).toBe("plan-1");
      expect(state.plans[0]!.steps[0]!.status).toBe("pending");

      const media = await fetch(
        `${server.url.replace(/\/$/, "")}${state.jobs[0]!.outputs[0]!.url}`,
      );
      expect(media.headers.get("content-type")).toBe("image/png");
      expect(await media.text()).toBe("PNGDATA");

      const ranged = await fetch(`${server.url}api/media/job/abcd1234-studio-job/0`, {
        headers: { Range: "bytes=0-2" },
      });
      expect(ranged.status).toBe(206);
      expect(await ranged.text()).toBe("PNG");

      const page = await fetch(server.url);
      expect(await page.text()).toContain("comfy-agent Studio");
    } finally {
      await server.close();
    }
  });

  it("records feedback on the job record", async () => {
    const { tmp, job, server } = await setup();
    try {
      const url = `${server.url}api/jobs/${job.job_id}/feedback`;
      expect((await post(url, { favorite: true })).status).toBe(200);
      expect((await post(url, { reject: "too bright" })).status).toBe(200);
      expect((await post(url, { note: "keep the mood" })).status).toBe(200);
      let record = (await readJob(job.job_id, tmp.cwd, "local")).record;
      expect(record.favorite).toBe(true);
      expect(record.tags).toContain("reject");
      expect(record.reject_reason).toBe("too bright");
      expect(record.notes?.map(({ text }) => text)).toEqual(["keep the mood"]);

      expect((await post(url, { reject: null })).status).toBe(200);
      record = (await readJob(job.job_id, tmp.cwd, "local")).record;
      expect(record.tags).not.toContain("reject");
      expect(record.reject_reason).toBeUndefined();

      expect((await post(url, { reject: "  " })).status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("builds agent prompts and only stores requests that are sent", async () => {
    const { tmp, job, server } = await setup();
    try {
      const body = {
        text: "make it cinematic",
        selected: [{ job_id: job.job_id, output_index: 0 }],
        lang: "en",
      };
      const preview = (await (await post(`${server.url}api/requests`, body)).json()) as {
        prompt: string;
      };
      expect(preview.prompt).toContain("make it cinematic");
      expect(preview.prompt).toContain(path.join(job.output_dir, "image.png"));
      expect(await listRequests(tmp.cwd)).toEqual([]);

      const sent = (await (
        await post(`${server.url}api/requests`, { ...body, send: true })
      ).json()) as { request: { id: string } };
      const stored = await listRequests(tmp.cwd);
      expect(stored.map(({ id }) => id)).toEqual([sent.request.id]);

      const unknown = await post(`${server.url}api/requests`, {
        text: "x",
        selected: [{ job_id: job.job_id, output_index: 5 }],
      });
      expect(unknown.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("rejects foreign hosts, cross-origin writes and non-JSON bodies", async () => {
    const { job, server } = await setup();
    try {
      const port = new URL(server.url).port;
      const url = `${server.url}api/jobs/${job.job_id}/feedback`;
      const foreignOrigin = await post(url, { favorite: true }, { Origin: "https://evil.example" });
      expect(foreignOrigin.status).toBe(403);

      const form = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ favorite: true }),
      });
      expect(form.status).toBe(415);

      const http = await import("node:http");
      const status = await new Promise<number>((resolve, reject) => {
        http
          .get(
            { host: "127.0.0.1", port, path: "/api/state", headers: { Host: "evil.example" } },
            (res) => {
              res.resume();
              resolve(res.statusCode ?? 0);
            },
          )
          .on("error", reject);
      });
      expect(status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it("does not serve files outside the job outputs", async () => {
    const { server } = await setup();
    try {
      for (const target of [
        "api/media/job/..%2F..%2Fetc/0",
        "api/media/job/abcd1234-studio-job/9",
        "..%2Fpackage.json",
      ]) {
        expect((await fetch(`${server.url}${target}`)).status).toBe(404);
      }
    } finally {
      await server.close();
    }
  });

  it("returns 400 for malformed URL escapes on media and job routes", async () => {
    const { job, server } = await setup();
    try {
      for (const target of [
        "api/media/job/%ZZ/0",
        "api/media/input/%ZZ/image",
        `api/media/input/${job.job_id}/%E0%A4%A`,
        "api/media/character/local/%ZZ/ref/0",
        "api/jobs/%ZZ/rerun",
      ]) {
        const response = await fetch(`${server.url}${target}`);
        expect(response.status, target).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "INVALID_PARAM" } });
      }
      expect((await post(`${server.url}api/jobs/%ZZ/feedback`, { favorite: true })).status).toBe(
        400,
      );
    } finally {
      await server.close();
    }
  });
});

describe("studio video jobs", () => {
  it("treats mp4 outputs as video and exposes length/fps for re-runs", async () => {
    const tmp = await createTmpWorkdir();
    const job: JobRecord = {
      ...makeJob(tmp.cwd),
      job_id: "video-kind-job",
      params: { "4_text": "a lantern", "104_length": 124, "91_fps": 24 },
      // ComfyUI reports video files under "images", so the record says image.
      outputs: [{ filename: "clip.mp4", kind: "image", saved_to: "clip.mp4" }],
    };
    await writeJob(job, tmp.cwd, "local");
    await fs.writeFile(
      path.join(tmp.workdir, "presets", "example.yaml"),
      `${PRESET_YAML}  104_length:
    type: int
    role: custom
    aliases: [length]
    target: { node_id: "104", input: length }
  91_fps:
    type: float
    role: custom
    aliases: [fps]
    target: { node_id: "91", input: fps }
`,
    );
    const server = await startStudioServer({
      cwd: tmp.cwd,
      host: "127.0.0.1",
      port: 0,
      publicDir,
      lang: "ja",
    });
    try {
      const state = (await (await fetch(`${server.url}api/state`)).json()) as {
        jobs: Array<{ job_id: string; outputs: Array<{ kind: string }> }>;
      };
      const video = state.jobs.find(({ job_id: id }) => id === job.job_id)!;
      expect(video.outputs[0]!.kind).toBe("video");

      const form = (await (await fetch(`${server.url}api/jobs/${job.job_id}/rerun`)).json()) as {
        form: { fields: Array<{ name: string; label: string; value: unknown }> };
      };
      expect(form.form.fields.map(({ name, label }) => `${name}:${label}`)).toEqual([
        "4_text:prompt",
        "5_value:width",
        "104_length:length",
        "91_fps:fps",
      ]);
    } finally {
      await server.close();
    }
  });
});

describe("studio plans", () => {
  it("keeps created_at across updates and rejects invalid ids", async () => {
    const tmp = await createTmpWorkdir();
    const first = await savePlan(
      tmp.cwd,
      { id: "p", title: "T", steps: [{ title: "s" }] },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    const second = await savePlan(
      tmp.cwd,
      { id: "p", title: "T2", status: "done", steps: [{ title: "s", status: "done" }] },
      new Date("2026-10-02T00:00:00.000Z"),
    );
    expect(second.created_at).toBe(first.created_at);
    expect(second.updated_at).toBe("2026-10-02T00:00:00.000Z");
    await expect(
      savePlan(tmp.cwd, { id: "../x", title: "T", steps: [{ title: "s" }] }),
    ).rejects.toThrow();
  });
});

describe("studio re-run", () => {
  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 50; i += 1) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("timed out");
  };

  it("replays the job through comfy-agent run with the user's edits and a new seed", async () => {
    const calls: string[][] = [];
    const launcher: RunLauncher = async (args) => {
      calls.push(args);
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          jobs: [{ job_id: "new-job-1" }, { job_id: "new-job-2" }],
        }),
        stderr: "",
      };
    };
    const { tmp, job, server } = await setup(launcher);
    try {
      await fs.writeFile(path.join(tmp.workdir, "presets", "example.yaml"), PRESET_YAML);
      await writeJob(
        {
          ...job,
          params: {
            "4_text": "a cat",
            "5_value": 1024,
            "12_noise_seed": 42,
            "1_unet_name": "m.safetensors",
          },
        },
        tmp.cwd,
        "local",
      );
      const formRes = (await (await fetch(`${server.url}api/jobs/${job.job_id}/rerun`)).json()) as {
        form: {
          supported: boolean;
          fields: Array<{ name: string; value: unknown }>;
          has_seed: boolean;
        };
      };
      expect(formRes.form.supported).toBe(true);
      expect(formRes.form.has_seed).toBe(true);
      expect(formRes.form.fields.map(({ name }) => name)).toEqual(["4_text", "5_value"]);

      const started = await post(`${server.url}api/jobs/${job.job_id}/rerun`, {
        overrides: { "4_text": "--a darker cat" },
        seed: "new",
        count: 2,
      });
      expect(started.status).toBe(200);
      await waitFor(async () => {
        const state = (await (await fetch(`${server.url}api/state`)).json()) as {
          runs: Array<{ status: string; job_ids: string[] }>;
        };
        return state.runs[0]?.status === "completed" && state.runs[0].job_ids.length === 2;
      });

      const args = calls[0]!;
      expect(args.slice(0, 2)).toEqual(["run", "example"]);
      expect(args).toContain("--json");
      expect(args).toContain("--4_text=--a darker cat");
      expect(args).toContain("--5_value=1024");
      expect(args).toContain('--1_unet_name="m.safetensors"');
      expect(args.join(" ")).toContain("--n 2");
      expect(args.join(" ")).toContain("--seed random");
      expect(args.some((arg) => arg.startsWith("--12_noise_seed"))).toBe(false);

      const editingLocked = await post(`${server.url}api/jobs/${job.job_id}/rerun`, {
        overrides: { "1_unet_name": "other" },
      });
      expect(editingLocked.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("keeps the original seed when asked and reports run failures", async () => {
    const launcher: RunLauncher = async () => ({
      exitCode: 2,
      stdout: JSON.stringify({ ok: false, error: { code: "SERVER_UNREACHABLE", message: "down" } }),
      stderr: "",
    });
    const { tmp, job, server } = await setup(launcher);
    try {
      await fs.writeFile(path.join(tmp.workdir, "presets", "example.yaml"), PRESET_YAML);
      await writeJob(
        { ...job, params: { "4_text": "a cat", "12_noise_seed": 42 } },
        tmp.cwd,
        "local",
      );
      await post(`${server.url}api/jobs/${job.job_id}/rerun`, { seed: "same", count: 1 });
      await waitFor(async () => {
        const state = (await (await fetch(`${server.url}api/state`)).json()) as {
          runs: Array<{ status: string; error?: { code: string } }>;
        };
        return (
          state.runs[0]?.status === "failed" && state.runs[0].error?.code === "SERVER_UNREACHABLE"
        );
      });
    } finally {
      await server.close();
    }
  });

  const I2V_PRESET = `${PRESET_YAML}uploads:
  image:
    kind: image
    cli_flag: --image
    target: { node_id: "9", input: image }
`;

  const setupI2v = async (fetchServerInput?: (name: string) => Promise<Buffer>) => {
    const calls: string[][] = [];
    const launcher: RunLauncher = async (args) => {
      calls.push(args);
      return {
        exitCode: 0,
        stdout: JSON.stringify({ ok: true, jobs: [{ job_id: "n1" }] }),
        stderr: "",
      };
    };
    const tmp = await createTmpWorkdir();
    const base = makeJob(tmp.cwd);
    await fs.mkdir(base.output_dir, { recursive: true });
    await fs.writeFile(path.join(base.output_dir, "image.png"), "PNGDATA");
    await fs.writeFile(path.join(base.output_dir, "v.mp4"), "VIDEODATA");
    await fs.writeFile(path.join(tmp.workdir, "presets", "example.yaml"), I2V_PRESET);
    const original = path.join(tmp.root, "original.png");
    await fs.writeFile(original, "ORIGINAL");
    const video: JobRecord = {
      ...base,
      job_id: "video-job-1234",
      params: { "4_text": "walk", "12_noise_seed": 1 },
      uploads: { image: "original.png" },
      upload_sources: { image: original },
      outputs: [{ filename: "v.mp4", saved_to: "v.mp4" }],
    };
    await writeJob(base, tmp.cwd, "local");
    await writeJob(video, tmp.cwd, "local");
    const server = await startStudioServer({
      cwd: tmp.cwd,
      host: "127.0.0.1",
      port: 0,
      publicDir,
      lang: "ja",
      launcher,
      fetchServerInput,
    });
    const lastRun = async () =>
      (
        (await (await fetch(`${server.url}api/state`)).json()) as {
          runs: Array<{ status: string; error?: { message: string } }>;
        }
      ).runs[0];
    return { tmp, base, video, original, server, calls, lastRun };
  };

  it("replays image inputs from the recorded local original", async () => {
    const { video, original, server, calls, lastRun } = await setupI2v();
    try {
      const form = (await (await fetch(`${server.url}api/jobs/${video.job_id}/rerun`)).json()) as {
        form: { supported: boolean; inputs: Array<{ name: string; source: string; url: string }> };
      };
      expect(form.form.supported).toBe(true);
      expect(form.form.inputs[0]).toMatchObject({ name: "image", source: "local" });
      const preview = await fetch(`${server.url.replace(/\/$/, "")}${form.form.inputs[0]!.url}`);
      expect(await preview.text()).toBe("ORIGINAL");

      await post(`${server.url}api/jobs/${video.job_id}/rerun`, { seed: "new" });
      await waitFor(async () => (await lastRun())?.status === "completed");
      expect(calls[0]).toContain(`--image=${original}`);
    } finally {
      await server.close();
    }
  });

  it("swaps an input for a gallery output and rejects mismatched kinds", async () => {
    const { base, video, server, calls, lastRun } = await setupI2v();
    try {
      await post(`${server.url}api/jobs/${video.job_id}/rerun`, {
        inputs: { image: { job_id: base.job_id, output_index: 0 } },
      });
      await waitFor(async () => (await lastRun())?.status === "completed");
      expect(calls[0]).toContain(`--image=${path.join(base.output_dir, "image.png")}`);

      // A video output cannot feed an image slot.
      await post(`${server.url}api/jobs/${video.job_id}/rerun`, {
        inputs: { image: { job_id: video.job_id, output_index: 0 } },
      });
      await waitFor(async () => (await lastRun())?.status === "failed");
      expect((await lastRun())?.error?.message).toContain("needs a image file");

      const unknown = await post(`${server.url}api/jobs/${video.job_id}/rerun`, {
        inputs: { mask: { job_id: base.job_id, output_index: 0 } },
      });
      expect(unknown.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("rejects removed and inherited upload names before starting a run", async () => {
    const { tmp, base, video, server, calls } = await setupI2v();
    try {
      await writeJob(
        { ...video, uploads: { ...video.uploads, retired: "old.png" } },
        tmp.cwd,
        "local",
      );
      const form = (await (await fetch(`${server.url}api/jobs/${video.job_id}/rerun`)).json()) as {
        form: { inputs: Array<{ name: string }> };
      };
      expect(form.form.inputs.map(({ name }) => name)).toEqual(["image"]);
      for (const name of ["retired", "toString", "constructor", "__proto__"]) {
        const response = await post(`${server.url}api/jobs/${video.job_id}/rerun`, {
          inputs: Object.fromEntries([[name, { job_id: base.job_id, output_index: 0 }]]),
        });
        expect(response.status, name).toBe(400);
        expect(await response.json()).toMatchObject({
          error: { message: `Unknown input: ${name}` },
        });
      }
      expect(calls).toEqual([]);
      const state = (await (await fetch(`${server.url}api/state`)).json()) as { runs: unknown[] };
      expect(state.runs).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it("only previews recorded sources and returns 404 for missing or non-file inputs", async () => {
    const { tmp, video, original, server } = await setupI2v();
    const url = `${server.url}api/media/input/${video.job_id}/image`;
    try {
      for (const name of ["other", "constructor", "toString", "..%2F..%2Fpackage.json"]) {
        expect((await fetch(`${server.url}api/media/input/${video.job_id}/${name}`)).status).toBe(404);
      }
      const ranged = await fetch(url, { headers: { Range: "bytes=0-2" } });
      expect(ranged.status).toBe(206);
      expect(await ranged.text()).toBe("ORI");
      expect((await fetch(url, { headers: { Range: "bytes=99-" } })).status).toBe(416);
      await fs.rm(original);
      const missing = await fetch(url);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({ error: { code: "FILE_NOT_FOUND" } });

      await fs.mkdir(original);
      expect((await fetch(url)).status).toBe(404);
      await fs.rmdir(original);
      const target = path.join(tmp.root, "source.png");
      await fs.writeFile(target, "LINKED-ORIGINAL");
      await fs.symlink(target, original);
      // Explicitly recorded symlink sources work just as they do in `run`.
      expect(await (await fetch(url)).text()).toBe("LINKED-ORIGINAL");
      await fs.rm(target);
      expect((await fetch(url)).status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("fails a missing gallery replacement without invoking the CLI", async () => {
    const { base, video, server, calls, lastRun } = await setupI2v();
    try {
      await fs.rm(path.join(base.output_dir, "image.png"));
      await post(`${server.url}api/jobs/${video.job_id}/rerun`, {
        inputs: { image: { job_id: base.job_id, output_index: 0 } },
      });
      await waitFor(async () => (await lastRun())?.status === "failed");
      expect((await lastRun())?.error?.message).toContain("Output not found for input image");
      expect(calls).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it("streams the opened original even if its path is replaced with a symlink", async () => {
    const { tmp, video, original, server } = await setupI2v();
    const other = path.join(tmp.root, "other.png");
    await fs.writeFile(other, "OTHER-FILE");
    const open = fs.open;
    const spy = vi.spyOn(fs, "open").mockImplementation(async (filePath, flags, mode) => {
      const file = await open(filePath, flags, mode);
      if (filePath === original) {
        await fs.rm(original);
        await fs.symlink(other, original);
      }
      return file;
    });
    try {
      const response = await fetch(`${server.url}api/media/input/${video.job_id}/image`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ORIGINAL");
    } finally {
      spy.mockRestore();
      await server.close();
    }
  });

  it("keeps concurrent server downloads in separate cache files", async () => {
    let fetched = 0;
    let release!: () => void;
    const bothFetching = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { tmp, video, original, server, calls, lastRun } = await setupI2v(async () => {
      const index = ++fetched;
      if (fetched === 2) release();
      await bothFetching;
      return Buffer.from(`DOWNLOAD-${index}`);
    });
    try {
      await fs.rm(original);
      const responses = await Promise.all([
        post(`${server.url}api/jobs/${video.job_id}/rerun`, {}),
        post(`${server.url}api/jobs/${video.job_id}/rerun`, {}),
      ]);
      expect(responses.map(({ status }) => status)).toEqual([200, 200]);
      await waitFor(async () => calls.length === 2 && (await lastRun())?.status === "completed");
      const cached = calls.map((args) => args.find((arg) => arg.startsWith("--image="))!.slice(8));
      expect(new Set(cached).size).toBe(2);
      for (const file of cached) {
        expect(path.dirname(file)).toBe(path.join(tmp.workdir, "cache", "studio-inputs"));
      }
      const contents = await Promise.all(cached.map((file) => fs.readFile(file, "utf-8")));
      expect(contents.sort()).toEqual(["DOWNLOAD-1", "DOWNLOAD-2"]);
    } finally {
      await server.close();
    }
  });

  it.each(["../../..\\odd:slot", "constructor"])(
    "sanitizes cache paths and only reads explicit overrides (%s)",
    async (slot) => {
      const names: string[] = [];
      const { tmp, video, server, calls, lastRun } = await setupI2v(async (name) => {
        names.push(name);
        return Buffer.from("SAFE-CACHE");
      });
      const serverName = "sub/..\\..\\odd:<name>?*.png";
      try {
        await fs.writeFile(
          path.join(tmp.workdir, "presets", "example.yaml"),
          I2V_PRESET.replace("uploads:\n  image:\n", `uploads:\n  ${JSON.stringify(slot)}:\n`),
        );
        await writeJob(
          { ...video, uploads: { [slot]: serverName }, upload_sources: undefined },
          tmp.cwd,
          "local",
        );
        await post(`${server.url}api/jobs/${video.job_id}/rerun`, {});
        await waitFor(async () => (await lastRun())?.status === "completed");
        expect(names).toEqual([serverName]);
        const cached = calls[0]!.find((arg) => arg.startsWith("--image="))!.slice(8);
        expect(path.dirname(cached)).toBe(path.join(tmp.workdir, "cache", "studio-inputs"));
        expect(path.basename(cached)).toMatch(/^[A-Za-z0-9._-]+\.png$/);
        expect(path.win32.basename(cached.replaceAll(path.sep, "\\"))).toBe(path.basename(cached));
        expect(await fs.readFile(cached, "utf-8")).toBe("SAFE-CACHE");
      } finally {
        await server.close();
      }
    },
  );

  it("fetches the ComfyUI copy when the local original is gone", async () => {
    const fetched: string[] = [];
    const { tmp, video, original, server, calls, lastRun } = await setupI2v(async (name) => {
      fetched.push(name);
      return Buffer.from("FROM-SERVER");
    });
    try {
      await fs.rm(original);
      const form = (await (await fetch(`${server.url}api/jobs/${video.job_id}/rerun`)).json()) as {
        form: { inputs: Array<{ source: string }> };
      };
      expect(form.form.inputs[0]!.source).toBe("server");

      await post(`${server.url}api/jobs/${video.job_id}/rerun`, {});
      await waitFor(async () => (await lastRun())?.status === "completed");
      expect(fetched).toEqual(["original.png"]);
      const cached = calls[0]!.find((arg) => arg.startsWith("--image="))!.slice("--image=".length);
      expect(cached.startsWith(path.join(tmp.workdir, "cache", "studio-inputs"))).toBe(true);
      expect(await fs.readFile(cached, "utf-8")).toBe("FROM-SERVER");
    } finally {
      await server.close();
    }
  });
});
