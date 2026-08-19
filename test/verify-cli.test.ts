import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runVerify } from "../src/cli/verify.js";
import { CliError } from "../src/io/errors.js";
import { readJob, writeJob } from "../src/jobs/store.js";
import type { JobRecord, RunManifest } from "../src/jobs/types.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const pngChunk = (type: string, data: Buffer) => {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "ascii");
  data.copy(chunk, 8);
  return chunk;
};

const png = (width: number, height: number) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const wav = (sampleRate = 8000, samples = 8000) => {
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
};

const manifest = (status: RunManifest["runs"][number]["status"] = "completed"): RunManifest => ({
  schema: 1,
  comfy_agent_version: "0.0.2",
  created_at: "2026-08-16T00:00:00.000Z",
  preset: "verify-test",
  source: "local",
  base_url: "http://127.0.0.1:8188",
  scope: "local",
  params: {},
  uploads: {},
  runs: [
    {
      index: 1,
      job_id: "job-1",
      prompt_id: "prompt-1",
      status,
      seed: null,
      outputs: [
        { filename: "first.png", kind: "image", saved_to: "first.png" },
        { filename: "second.png", kind: "image", saved_to: "second.png" },
        { filename: "tone.wav", kind: "audio", saved_to: "tone.wav" },
      ],
    },
  ],
});

const createRunDir = async (status: RunManifest["runs"][number]["status"] = "completed") => {
  const tmp = await createTmpWorkdir();
  const runDir = path.join(tmp.workdir, "outputs", "verify-test", "run");
  await fs.mkdir(runDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(runDir, "first.png"), png(32, 24)),
    fs.writeFile(path.join(runDir, "second.png"), png(64, 48)),
    fs.writeFile(path.join(runDir, "tone.wav"), wav()),
    fs.writeFile(path.join(runDir, "run.json"), `${JSON.stringify(manifest(status))}\n`, "utf-8"),
  ]);
  return { tmp, runDir };
};

const matchingJob = (cwd: string, outputDir: string): JobRecord => ({
  version: 1,
  job_id: "job-1",
  prompt_id: "prompt-1",
  client_id: "verify-client",
  batch_id: "verify-batch",
  batch_index: 1,
  batch_count: 1,
  scope: "local",
  base_url: "http://127.0.0.1:8188",
  preset: "verify-test",
  source: "local",
  params: {},
  uploads: {},
  seed: null,
  output_dir: outputDir,
  submitted_at: "2026-08-16T00:00:00.000Z",
  status: "completed",
  outputs: manifest().runs[0].outputs,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verify CLI core", () => {
  it("writes the verification summary to the matching job record", async () => {
    const { tmp, runDir } = await createRunDir();
    await writeJob(matchingJob(tmp.cwd, runDir), tmp.cwd, "local");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const report = await runVerify(runDir, { json: true, noFfmpeg: true });
    expect(report.summary.record_updated).toBe(true);
    await expect(readJob("job-1", tmp.cwd, "local")).resolves.toMatchObject({
      record: {
        version: 2,
        verify: {
          at: expect.any(String),
          files: 3,
          kind: "image",
          duration_s: 1,
          checks_failed: 0,
        },
      },
    });
  });

  it("warns without failing when the matching job record is absent", async () => {
    const { runDir } = await createRunDir();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const report = await runVerify(runDir, { json: true, noFfmpeg: true });
    expect(report).toMatchObject({
      ok: true,
      summary: { checks_failed: 0, record_updated: false },
    });
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VERIFY_RECORD_NOT_UPDATED",
          details: { job_id: "job-1", status: "not_found" },
        }),
      ]),
    );
  });

  it("returns the JSON report with manifest and pure-JS metadata", async () => {
    const { runDir } = await createRunDir();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const report = await runVerify(runDir, {
      json: true,
      noFfmpeg: true,
      expectCount: "3",
    });

    expect(report).toMatchObject({
      ok: true,
      target_type: "dir",
      manifest: { found: true, preset: "verify-test", expected_outputs: 3 },
      summary: { files: 3, checks_failed: 0, verified_visually: false },
    });
    expect(report.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "image", width: 32, height: 24 }),
        expect.objectContaining({ kind: "audio", duration_s: 1, sample_rate: 8000 }),
      ]),
    );
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ ok: true });
    await expect(fs.stat(path.join(runDir, "verify", "verify.json"))).resolves.toBeDefined();
  });

  it("throws exit 3 with the full persisted report when expectations fail", async () => {
    const { runDir } = await createRunDir();
    let caught: unknown;
    try {
      await runVerify(runDir, { json: true, noFfmpeg: true, expectCount: "5" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect(caught).toMatchObject({
      code: "VERIFY_CHECKS_FAILED",
      exitCode: 3,
      details: {
        failed: ["expect_count"],
        report: { files: expect.any(Array), summary: { checks_failed: 1 } },
      },
    });
    const saved = JSON.parse(
      await fs.readFile(path.join(runDir, "verify", "verify.json"), "utf-8"),
    );
    expect(saved).toMatchObject({ ok: false, files: expect.any(Array) });
  });

  it("fails expect-kind when image and audio outputs are not videos", async () => {
    const { runDir } = await createRunDir();
    await expect(
      runVerify(runDir, { json: true, noFfmpeg: true, expectKind: "video" }),
    ).rejects.toMatchObject({
      code: "VERIFY_CHECKS_FAILED",
      exitCode: 3,
      details: { failed: ["expect_kind"] },
    });
  });

  it("rejects an unknown single-file format", async () => {
    const tmp = await createTmpWorkdir();
    const filePath = path.join(tmp.cwd, "unknown.bin");
    await fs.writeFile(filePath, "not media", "utf-8");
    await expect(runVerify(filePath, { json: true, noFfmpeg: true })).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
      exitCode: 2,
      details: { path: filePath, supported: expect.any(Array) },
    });
  });

  it("requires ffmpeg for an explicitly requested sheet", async () => {
    const { runDir } = await createRunDir();
    await expect(
      runVerify(runDir, {
        json: true,
        noFfmpeg: true,
        sheet: path.join(runDir, "custom.png"),
      }),
    ).rejects.toMatchObject({
      code: "MISSING_TOOL",
      exitCode: 2,
      details: { tool: "ffmpeg", env: "COMFY_AGENT_FFMPEG", hint: expect.any(String) },
    });
  });

  it("warns when the run manifest contains a submitted job", async () => {
    const { runDir } = await createRunDir("submitted");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const report = await runVerify(runDir, { json: true, noFfmpeg: true });
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RUN_INCOMPLETE",
          details: { job_id: "job-1", prompt_id: "prompt-1", status: "submitted" },
        }),
      ]),
    );
  });

  it("checks dimensions and duration bounds and can hash a file", async () => {
    const { runDir } = await createRunDir();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const image = await runVerify(path.join(runDir, "first.png"), {
      json: true,
      noFfmpeg: true,
      expectKind: "image",
      expectSize: "32x24",
      hash: true,
      out: path.join(runDir, "verify-image"),
    });
    expect(image).toMatchObject({
      ok: true,
      files: [{ sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }],
    });

    const audio = await runVerify(path.join(runDir, "tone.wav"), {
      json: true,
      noFfmpeg: true,
      minDuration: "0.5",
      maxDuration: "1.5",
      out: path.join(runDir, "verify-audio"),
    });
    expect(audio).toMatchObject({ ok: true, files: [{ duration_s: 1 }] });

    await expect(
      runVerify(path.join(runDir, "tone.wav"), {
        json: true,
        noFfmpeg: true,
        minDuration: "2",
        out: path.join(runDir, "verify-audio-fail"),
      }),
    ).rejects.toMatchObject({
      code: "VERIFY_CHECKS_FAILED",
      exitCode: 3,
      details: { failed: ["min_duration"] },
    });
  });
});
