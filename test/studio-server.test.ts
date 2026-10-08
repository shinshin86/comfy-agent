import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
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

  it("refuses jobs whose inputs were uploads", async () => {
    const { tmp, job, server } = await setup(async () => ({
      exitCode: 0,
      stdout: "{}",
      stderr: "",
    }));
    try {
      await fs.writeFile(path.join(tmp.workdir, "presets", "example.yaml"), PRESET_YAML);
      await writeJob({ ...job, uploads: { image: "input/foo.png" } }, tmp.cwd, "local");
      const form = (await (await fetch(`${server.url}api/jobs/${job.job_id}/rerun`)).json()) as {
        form: { supported: boolean; reason: string };
      };
      expect(form.form).toEqual({ supported: false, reason: "uploads" });
      expect((await post(`${server.url}api/jobs/${job.job_id}/rerun`, {})).status).toBe(400);
    } finally {
      await server.close();
    }
  });
});
