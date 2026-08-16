import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runVerify } from "../src/cli/verify.js";
import {
  FFMPEG_INSTALL_HINT,
  contactSheet,
  detectTools,
  extractFrames,
  ffprobeJson,
  runTool,
  waveform,
} from "../src/verify/ffmpeg.js";
import { probeFile } from "../src/verify/probe.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const tools = await detectTools();

describe.skipIf(!tools.ffmpeg.available || !tools.ffprobe.available)(
  "verify ffmpeg integration",
  () => {
    const createMedia = async () => {
      const tmp = await createTmpWorkdir();
      const video = path.join(tmp.cwd, "test.mp4");
      const audio = path.join(tmp.cwd, "tone.wav");
      await runTool(tools.ffmpeg.path!, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=1:size=64x48:rate=10",
        "-pix_fmt",
        "yuv420p",
        "-y",
        video,
      ]);
      await runTool(tools.ffmpeg.path!, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-y",
        audio,
      ]);
      return { tmp, video, audio };
    };

    it("probes media and extracts first/even/last video frames", async () => {
      const { tmp, video } = await createMedia();
      const metadata = await ffprobeJson(video, tools.ffprobe.path!);
      expect(metadata).toMatchObject({ width: 64, height: 48, frame_count: 10 });
      expect(metadata.duration_s).toBeCloseTo(1, 1);

      const frameDir = path.join(tmp.cwd, "frames");
      const frames = await extractFrames(
        video,
        frameDir,
        3,
        {
          frameCount: metadata.frame_count,
          duration: metadata.duration_s,
          fps: metadata.fps,
        },
        tools.ffmpeg.path!,
      );
      expect(frames.map(({ frame_n: frameN }) => frameN)).toEqual([0, 5, 9]);
      for (const frame of frames) {
        await expect(probeFile(frame.path)).resolves.toMatchObject({ width: 64, height: 48 });
      }
    });

    it("creates a tiled contact sheet and an audio waveform", async () => {
      const { tmp, video, audio } = await createMedia();
      const metadata = await ffprobeJson(video, tools.ffprobe.path!);
      const frames = await extractFrames(
        video,
        path.join(tmp.cwd, "frames"),
        3,
        {
          frameCount: metadata.frame_count,
          duration: metadata.duration_s,
          fps: metadata.fps,
        },
        tools.ffmpeg.path!,
      );
      const sheet = path.join(tmp.cwd, "sheet.png");
      await contactSheet(
        frames.map(({ path: framePath }) => framePath),
        sheet,
        { ffmpegPath: tools.ffmpeg.path!, cols: 3 },
      );
      await expect(probeFile(sheet)).resolves.toMatchObject({ width: 208, height: 56 });

      const wave = path.join(tmp.cwd, "wave.png");
      await waveform(audio, wave, tools.ffmpeg.path!);
      await expect(probeFile(wave)).resolves.toMatchObject({ width: 1280, height: 240 });
    });

    it("uses every extracted frame in a single-video global sheet", async () => {
      const { tmp, video } = await createMedia();
      const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      try {
        const report = await runVerify(video, {
          json: true,
          frames: "3",
          out: path.join(tmp.cwd, "verify"),
        });
        expect(report.files[0].artifacts.frames).toHaveLength(3);
        expect(typeof report.sheet).toBe("string");
        await expect(probeFile(report.sheet as string)).resolves.toMatchObject({
          width: 652,
          height: 652,
        });
      } finally {
        write.mockRestore();
      }
    });

    it("does not copy ffprobe's nominal frame rate onto still images", async () => {
      const { tmp, video } = await createMedia();
      const frames = await extractFrames(
        video,
        path.join(tmp.cwd, "single-frame"),
        1,
        { frameCount: 10, duration: 1, fps: 10 },
        tools.ffmpeg.path!,
      );
      const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      try {
        const report = await runVerify(frames[0].path, {
          json: true,
          out: path.join(tmp.cwd, "image-verify"),
        });
        expect(report.files[0]).toMatchObject({ kind: "image", fps: null, frame_count: null });
      } finally {
        write.mockRestore();
      }
    });
  },
);

describe("verify tool detection", () => {
  it("reports a configured missing executable and exposes the install hint", async () => {
    const missing = path.join(process.cwd(), "missing-ffmpeg-binary");
    const detected = await detectTools({
      env: { ...process.env, COMFY_AGENT_FFMPEG: missing },
      refresh: true,
    });
    expect(detected.ffmpeg).toEqual({ available: false, path: null, version: null });
    expect(FFMPEG_INSTALL_HINT).toContain("brew install ffmpeg");
  });

  it.skipIf(process.platform === "win32")("times out a stalled configured executable", async () => {
    const tmp = await createTmpWorkdir();
    const stalled = path.join(tmp.cwd, "stalled-ffmpeg");
    await fs.writeFile(stalled, "#!/bin/sh\nsleep 2\n", "utf-8");
    await fs.chmod(stalled, 0o755);
    const detected = await detectTools({
      env: { ...process.env, COMFY_AGENT_FFMPEG: stalled },
      timeoutMs: 50,
      refresh: true,
    });
    expect(detected.ffmpeg.available).toBe(false);
  });
});
