import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JobRecord } from "../src/jobs/types.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const makeJob = (
  cwd: string,
  jobId: string,
  overrides: Partial<JobRecord> = {},
): JobRecord => ({
  version: 2,
  job_id: jobId,
  prompt_id: jobId,
  client_id: `client-${jobId}`,
  batch_id: jobId,
  batch_index: 1,
  batch_count: 1,
  scope: "local",
  base_url: "http://127.0.0.1:8188",
  preset: "portrait",
  source: "local",
  params: {},
  uploads: {},
  seed: null,
  output_dir: path.join(cwd, "outputs", jobId),
  submitted_at: new Date().toISOString(),
  status: "completed",
  outputs: [],
  ...overrides,
});

describe("history query", () => {
  it("filters, searches, sorts, limits, and protects prompts across scopes", async () => {
    const tmp = await createTmpWorkdir();
    const [{ queryHistory }, { writeJob }] = await Promise.all([
      import("../src/jobs/query.js"),
      import("../src/jobs/store.js"),
    ]);
    const now = Date.now();
    const longPrompt = `soft portrait ${"x".repeat(80)}`;
    const localRecent = makeJob(tmp.cwd, "local-recent", {
      submitted_at: new Date(now - 30 * 60 * 1000).toISOString(),
      prompt_final: longPrompt,
      character: { name: "hero", scope: "local" },
      tags: ["portrait", "approved"],
      notes: [{ at: new Date(now).toISOString(), text: "Keep the SOFT LIGHT" }],
      favorite: true,
      outputs: [{ filename: "portrait.png", kind: "image", saved_to: "portrait.png" }],
    });
    const globalRecent = makeJob(tmp.cwd, "global-recent", {
      scope: "global",
      preset: "movie",
      submitted_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      prompt_final: `cinematic ${"y".repeat(80)}`,
      character: { name: "hero", scope: "global" },
      tags: ["cinematic"],
      outputs: [{ filename: "clip.mp4", kind: "video", saved_to: "clip.mp4" }],
    });
    const localOld = makeJob(tmp.cwd, "local-old", {
      submitted_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      status: "failed",
      negative_final: "bad hands",
      tags: ["reject"],
      reject_reason: "identity drift",
      outputs: [{ filename: "tone.wav", kind: "audio", saved_to: "tone.wav" }],
    });
    await writeJob(localRecent, tmp.cwd, "local");
    await writeJob(globalRecent, tmp.cwd, "global");
    await writeJob(localOld, tmp.cwd, "local");

    const all = await queryHistory({ cwd: tmp.cwd, scopes: ["local", "global"] });
    expect(all.map(({ job_id: jobId }) => jobId)).toEqual([
      localRecent.job_id,
      globalRecent.job_id,
      localOld.job_id,
    ]);
    expect(all[0]?.prompt_final).toHaveLength(60);
    expect(all[1]?.prompt_final).toHaveLength(60);
    const full = await queryHistory({
      cwd: tmp.cwd,
      scopes: ["local", "global"],
      fullPrompts: true,
    });
    expect(full[0]?.prompt_final).toBe(longPrompt);

    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local"], preset: "portrait" }),
    ).resolves.toHaveLength(2);
    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local", "global"], character: "hero" }),
    ).resolves.toHaveLength(2);
    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local", "global"], kind: "video" }),
    ).resolves.toMatchObject([{ job_id: globalRecent.job_id }]);
    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local"], status: "failed" }),
    ).resolves.toMatchObject([{ job_id: localOld.job_id }]);
    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local"], tag: "approved" }),
    ).resolves.toMatchObject([{ job_id: localRecent.job_id }]);
    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local"], search: "soft light" }),
    ).resolves.toMatchObject([{ job_id: localRecent.job_id }]);
    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local"], search: "BAD HANDS" }),
    ).resolves.toMatchObject([{ job_id: localOld.job_id }]);
    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local"], favorite: true }),
    ).resolves.toMatchObject([{ job_id: localRecent.job_id }]);
    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local"], rejected: true }),
    ).resolves.toMatchObject([{ job_id: localOld.job_id }]);
    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local", "global"], since: "24h" }),
    ).resolves.toHaveLength(2);
    await expect(
      queryHistory({
        cwd: tmp.cwd,
        scopes: ["local", "global"],
        since: new Date(now - 60 * 60 * 1000).toISOString(),
      }),
    ).resolves.toMatchObject([{ job_id: localRecent.job_id }]);
    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local", "global"], limit: 1 }),
    ).resolves.toMatchObject([{ job_id: localRecent.job_id }]);
    await expect(
      queryHistory({ cwd: tmp.cwd, scopes: ["local"], since: "not-a-date" }),
    ).rejects.toMatchObject({ code: "INVALID_PARAM", details: { since: "not-a-date" } });
  });
});
