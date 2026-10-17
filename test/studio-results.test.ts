import path from "node:path";
import http from "node:http";
import { promises as fs } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { startStudioServer } from "../src/studio/server.js";
import { listDeletedFeedback } from "../src/studio/results.js";
import { readJob, writeJob } from "../src/jobs/store.js";
import type { JobRecord } from "../src/jobs/types.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";
import { runCli } from "./helpers/run-cli.js";
const { globalFixture } = await vi.hoisted(async () => {
  const fs = await import("node:fs/promises"),
    os = await import("node:os"),
    path = await import("node:path");
  return { globalFixture: await fs.mkdtemp(path.join(os.tmpdir(), "studio-suggest-global-")) };
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

const setup = async (count = 2) => {
  const tmp = await createTmpWorkdir();
  const output = path.join(tmp.workdir, "outputs", "fixture");
  await fs.mkdir(output, { recursive: true });
  const record: JobRecord = {
    version: 2,
    job_id: "local-result",
    prompt_id: "local-result",
    client_id: "test",
    batch_id: "local-result",
    batch_index: 1,
    batch_count: 1,
    scope: "local",
    source: "local",
    preset: "example",
    base_url: "http://127.0.0.1:9",
    params: {
      steps: 8,
      cfg: 4,
      enabled: true,
      image: "data:image/png;base64,ABCD",
      nested: { media: "data" },
    },
    seed: 1,
    uploads: {},
    output_dir: output,
    submitted_at: "2026-10-17T00:00:00Z",
    status: "completed",
    prompt_final: "A cat",
    outputs: Array.from({ length: count }, (_, i) => ({
      filename: `${i}.png`,
      saved_to: `${i}.png`,
      kind: "image",
    })),
  };
  for (const item of record.outputs) await fs.writeFile(path.join(output, item.saved_to), "PNG");
  await writeJob(record, tmp.cwd, "local");
  const server = await startStudioServer({
    cwd: tmp.cwd,
    host: "127.0.0.1",
    port: 0,
    publicDir: path.resolve("studio/public"),
    lang: "ja",
    capabilityFetcher: async () => ({}),
  });
  return {
    ...tmp,
    output,
    record,
    server,
    url: `${server.url}api/jobs/${record.job_id}/outputs/0/delete`,
  };
};
const post = (
  url: string,
  body: unknown = { saved_to: "0.png" },
  headers: Record<string, string> = {},
) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const exists = (filename: string) =>
  fs.stat(filename).then(
    () => true,
    () => false,
  );
describe("Studio result deletion", () => {
  it("removes one file, retains other outputs and records media-free feedback for agents", async () => {
    const f = await setup();
    try {
      const response = await post(f.url, { saved_to: "0.png", reason: "  Too dark  " });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        removed_indices: [0],
        job_removed: false,
        feedback_saved: true,
      });
      expect(await exists(path.join(f.output, "0.png"))).toBe(false);
      expect(await exists(path.join(f.output, "1.png"))).toBe(true);
      expect(
        (await readJob(f.record.job_id, f.cwd, "local")).record.outputs.map((o) => o.saved_to),
      ).toEqual(["1.png"]);
      expect(await listDeletedFeedback(f.cwd)).toEqual([
        expect.objectContaining({
          kind: "deleted",
          preset: "example",
          prompt: "A cat",
          params: { steps: 8, cfg: 4, enabled: true },
          reason: "Too dark",
        }),
      ]);
      const cli = await runCli(["studio", "feedback", "--json"], f);
      expect(cli.code, cli.stderr).toBe(0);
      expect(JSON.parse(cli.stdout).feedback[0].reason).toBe("Too dark");
    } finally {
      await f.server.close();
    }
  });
  it("deletes the record with its last output and writes nothing when no reason is given", async () => {
    const f = await setup(1);
    try {
      expect((await post(f.url)).status).toBe(200);
      expect(await exists(path.join(f.output, "0.png"))).toBe(false);
      expect(await exists(path.join(f.workdir, "jobs", `${f.record.job_id}.json`))).toBe(false);
      expect(await exists(path.join(f.workdir, "studio", "feedback.jsonl"))).toBe(false);
      expect(await listDeletedFeedback(f.cwd)).toEqual([]);
    } finally {
      await f.server.close();
    }
  });
  it("can remove a stale record whose selected media file is already missing", async () => {
    const f = await setup(1);
    try {
      await fs.unlink(path.join(f.output, "0.png"));
      expect((await post(f.url)).status).toBe(200);
      expect(await exists(path.join(f.workdir, "jobs", `${f.record.job_id}.json`))).toBe(false);
    } finally {
      await f.server.close();
    }
  });
  it("rejects changed output identity, invalid inputs and traversal without changing files", async () => {
    const f = await setup();
    try {
      for (const body of [
        { saved_to: "wrong.png" },
        { saved_to: "../0.png" },
        { saved_to: "0.png", reason: "x".repeat(4001) },
        { saved_to: "0.png", extra: true },
      ])
        expect((await post(f.url, body)).status).toBeGreaterThanOrEqual(400);
      expect((await post(`${f.server.url}api/jobs/..%2Foutside/outputs/0/delete`)).status).toBe(
        400,
      );
      expect(
        (await post(`${f.server.url}api/jobs/${f.record.job_id}/outputs/9/delete`)).status,
      ).toBe(409);
      expect(await exists(path.join(f.output, "0.png"))).toBe(true);
      expect(await listDeletedFeedback(f.cwd)).toEqual([]);
    } finally {
      await f.server.close();
    }
  });
  it("refuses files outside outputs and symlinked output files or directories", async () => {
    const f = await setup();
    try {
      const outside = path.join(f.home, "0.png");
      await fs.writeFile(outside, "KEEP");
      await writeJob({ ...f.record, output_dir: f.home }, f.cwd, "local");
      expect((await post(f.url)).status).toBe(403);
      const link = path.join(f.workdir, "outputs", "linked");
      await fs.symlink(f.home, link);
      await writeJob({ ...f.record, output_dir: link }, f.cwd, "local");
      expect((await post(f.url)).status).toBe(403);
      await writeJob(f.record, f.cwd, "local");
      await fs.unlink(path.join(f.output, "0.png"));
      await fs.symlink(outside, path.join(f.output, "0.png"));
      expect((await post(f.url)).status).toBe(403);
      expect(await fs.readFile(outside, "utf8")).toBe("KEEP");
      expect(await listDeletedFeedback(f.cwd)).toEqual([]);
    } finally {
      await f.server.close();
    }
  });
  it("refuses global-only jobs, locally stored global-scope records and linked records", async () => {
    const f = await setup();
    try {
      await writeJob({ ...f.record, job_id: "global-result", scope: "global" }, f.cwd, "global");
      expect((await post(f.url.replace(f.record.job_id, "global-result"))).status).toBe(404);
      await writeJob({ ...f.record, scope: "global" }, f.cwd, "local");
      expect((await post(f.url)).status).toBe(403);
      const recordPath = path.join(f.workdir, "jobs", `${f.record.job_id}.json`),
        external = path.join(f.home, "job.json");
      await fs.writeFile(external, JSON.stringify(f.record));
      await fs.unlink(recordPath);
      await fs.symlink(external, recordPath);
      expect((await post(f.url)).status).toBe(403);
      expect(await exists(path.join(f.output, "0.png"))).toBe(true);
      expect(await fs.readFile(external, "utf8")).toBe(JSON.stringify(f.record));
    } finally {
      await f.server.close();
    }
  });
  it("refuses symlinked local output roots and feedback files", async () => {
    const f = await setup();
    try {
      const feedbackPath = path.join(f.workdir, "studio", "feedback.jsonl"),
        outside = path.join(f.home, "feedback.jsonl");
      await fs.writeFile(outside, "KEEP");
      await fs.symlink(outside, feedbackPath);
      expect((await post(f.url, { saved_to: "0.png", reason: "No" })).status).toBe(403);
      expect(await fs.readFile(outside, "utf8")).toBe("KEEP");
      const outputs = path.join(f.workdir, "outputs");
      await fs.rename(outputs, path.join(f.workdir, "saved-outputs"));
      await fs.symlink(path.join(f.workdir, "saved-outputs"), outputs);
      expect((await post(f.url)).status).toBe(403);
    } finally {
      await f.server.close();
    }
  });
  it("enforces loopback Host, Origin and JSON guards", async () => {
    const f = await setup();
    try {
      expect((await post(f.url, undefined, { Origin: "https://external.invalid" })).status).toBe(
        403,
      );
      expect(
        (
          await fetch(f.url, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: "{}",
          })
        ).status,
      ).toBe(415);
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          f.url,
          {
            method: "POST",
            headers: { Host: "external.invalid", "Content-Type": "application/json" },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on("error", reject);
        req.end(JSON.stringify({ saved_to: "0.png" }));
      });
      expect(status).toBe(403);
      expect(await exists(path.join(f.output, "0.png"))).toBe(true);
    } finally {
      await f.server.close();
    }
  });
  it("does not delete another output when duplicate confirmation requests arrive", async () => {
    const f = await setup();
    try {
      const responses = await Promise.all([
        post(f.url, { saved_to: "0.png", reason: "No" }),
        post(f.url, { saved_to: "0.png", reason: "No" }),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await exists(path.join(f.output, "1.png"))).toBe(true);
      expect(await listDeletedFeedback(f.cwd)).toHaveLength(1);
    } finally {
      await f.server.close();
    }
  });
  it("restores the file, record and feedback if the final unlink fails", async () => {
    const f = await setup();
    const unlink = fs.unlink.bind(fs);
    const canonicalOutput = await fs.realpath(f.output);
    const spy = vi
      .spyOn(fs, "unlink")
      .mockImplementation((filename) =>
        String(filename).startsWith(canonicalOutput) && String(filename).includes(".studio-delete-")
          ? Promise.reject(Object.assign(new Error("locked"), { code: "EACCES" }))
          : unlink(filename),
      );
    try {
      expect((await post(f.url, { saved_to: "0.png", reason: "No" })).status).toBe(500);
      expect(await exists(path.join(f.output, "0.png"))).toBe(true);
      expect((await readJob(f.record.job_id, f.cwd, "local")).record.outputs).toHaveLength(2);
      expect(await listDeletedFeedback(f.cwd)).toEqual([]);
    } finally {
      spy.mockRestore();
      await f.server.close();
    }
  });
  it("refuses in-progress jobs and preserves legacy rejection metadata", async () => {
    const f = await setup();
    try {
      await writeJob({ ...f.record, status: "running" }, f.cwd, "local");
      expect((await post(f.url)).status).toBe(409);
      await writeJob(
        { ...f.record, tags: ["reject"], reject_reason: "Legacy reason" },
        f.cwd,
        "local",
      );
      const state = await (await fetch(`${f.server.url}api/state`)).json();
      expect(state.jobs[0]).toMatchObject({ tags: ["reject"], reject_reason: "Legacy reason" });
      expect((await post(f.url)).status).toBe(200);
      expect((await readJob(f.record.job_id, f.cwd, "local")).record.reject_reason).toBe(
        "Legacy reason",
      );
    } finally {
      await f.server.close();
    }
  });
});
