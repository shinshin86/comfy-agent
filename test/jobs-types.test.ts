import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  JobOutputSchema,
  JobRecordSchema,
  OutputRecordSchema,
  RunManifestSchema,
  type JobRecord,
  type RunManifest,
} from "../src/jobs/types.js";

const output = {
  filename: "image.png",
  subfolder: "generated",
  type: "output",
  kind: "image",
  saved_to: "image_seed_1.png",
};

const jobRecord: JobRecord = {
  version: 1,
  job_id: "12345678-abcd",
  prompt_id: "12345678-abcd",
  client_id: "client-1",
  batch_id: "12345678-abcd",
  batch_index: 1,
  batch_count: 1,
  scope: "local",
  base_url: "http://127.0.0.1:8188",
  preset: "example",
  source: "local",
  params: { prompt: "hello", seed: 42 },
  uploads: { image: "uploaded.png" },
  seed: 42,
  output_dir: path.resolve("tmp", "outputs"),
  submitted_at: "2026-08-16T00:00:00.000Z",
  started_at: "2026-08-16T00:00:01.000Z",
  completed_at: "2026-08-16T00:00:02.000Z",
  status: "completed",
  outputs: [output],
  duration_ms: 2000,
};

describe("job record schemas", () => {
  it("round-trips a v1 job record", () => {
    const parsed = JobRecordSchema.parse(JSON.parse(JSON.stringify(jobRecord)) as unknown);
    expect(parsed).toEqual(jobRecord);
    expect(JobOutputSchema).toBe(OutputRecordSchema);
  });

  it("round-trips a v2 job record with every optional field", () => {
    const v2Record: JobRecord = {
      ...jobRecord,
      version: 2,
      prompt_input: "portrait",
      prompt_final: "character trigger, portrait",
      prompt_source: "alias",
      negative_final: "blurry",
      character: { name: "example", scope: "global", form: "default" },
      tags: ["portrait", "reject"],
      notes: [{ at: "2026-08-16T00:00:03.000Z", text: "Keep the lighting soft." }],
      reject_reason: "identity drift",
      verify: {
        at: "2026-08-16T00:00:04.000Z",
        files: 1,
        kind: "image",
        width: 1024,
        height: 1024,
        duration_s: 1.5,
        frame_count: 24,
        checks_failed: 0,
        sheet: "contact-sheet.png",
      },
      favorite: true,
    };

    expect(JobRecordSchema.parse(JSON.parse(JSON.stringify(v2Record)) as unknown)).toEqual(
      v2Record,
    );
  });

  it("round-trips a run manifest", () => {
    const manifest: RunManifest = {
      schema: 1,
      comfy_agent_version: "0.0.2",
      created_at: "2026-08-16T00:00:00.000Z",
      preset: "example",
      source: "local",
      base_url: "http://127.0.0.1:8188",
      scope: "local",
      params: { prompt: "hello" },
      uploads: {},
      character: { name: "example", scope: "local", form: "default" },
      runs: [
        {
          index: 1,
          job_id: jobRecord.job_id,
          prompt_id: jobRecord.prompt_id,
          status: "completed",
          seed: 42,
          duration_ms: 2000,
          outputs: [output],
        },
      ],
    };

    const parsed = RunManifestSchema.parse(JSON.parse(JSON.stringify(manifest)) as unknown);
    expect(parsed).toEqual(manifest);
    expect(parsed.character).toEqual({ name: "example", scope: "local", form: "default" });
  });

  it("rejects absolute and nested saved_to paths", () => {
    expect(OutputRecordSchema.safeParse({ ...output, saved_to: "/tmp/image.png" }).success).toBe(
      false,
    );
    expect(
      OutputRecordSchema.safeParse({ ...output, saved_to: "C:\\tmp\\image.png" }).success,
    ).toBe(false);
    expect(OutputRecordSchema.safeParse({ ...output, saved_to: "nested/image.png" }).success).toBe(
      false,
    );
  });
});
