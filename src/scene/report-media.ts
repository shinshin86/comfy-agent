import path from "node:path";
import { promises as fs } from "node:fs";
import { contactSheet, runTool } from "../verify/ffmpeg.js";

export const boundarySheet = async (
  file: string,
  boundaries: number[],
  fps: number,
  frameCount: number,
  dir: string,
  ffmpeg: string,
) => {
  await fs.mkdir(dir, { recursive: true });
  const numbers = [
    ...new Set([
      0,
      ...boundaries.flatMap((time) => {
        const frame = Math.round(time * fps);
        return [frame - 1, frame];
      }),
      frameCount - 1,
    ]),
  ]
    .filter((frame) => frame >= 0 && frame < frameCount)
    .sort((a, b) => a - b);
  const output = path.join(dir, "boundary_%04d.png");
  await runTool(ffmpeg, [
    "-v",
    "error",
    "-nostdin",
    "-i",
    file,
    "-vf",
    `select='${numbers.map((frame) => `eq(n\\,${frame})`).join("+")}'`,
    "-fps_mode",
    "vfr",
    "-y",
    output,
  ]);
  const images = numbers.map((_, index) =>
    path.join(dir, `boundary_${String(index + 1).padStart(4, "0")}.png`),
  );
  const sheet = path.join(dir, "boundaries.png");
  await contactSheet(images, sheet, {
    ffmpegPath: ffmpeg,
    thumbSize: 240,
    cols: Math.min(6, images.length),
  });
  return { sheet, frames: numbers.map((frame) => ({ frame, time_s: frame / fps })) };
};

export const uniqueFrames = async (file: string, ffmpeg: string) => {
  const hashes = async (filter?: string) => {
    const { stdout } = await runTool(ffmpeg, [
      "-v",
      "error",
      "-nostdin",
      "-i",
      file,
      "-map",
      "0:v:0",
      "-an",
      ...(filter ? ["-vf", filter, "-fps_mode", "vfr"] : []),
      "-f",
      "framehash",
      "-",
    ]);
    return stdout
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.startsWith("#"))
      .map((line) => line.split(",").at(-1)!.trim());
  };
  const all = await hashes();
  const retained = await hashes("scale=160:-2,format=gray,mpdecimate");
  return {
    method: "mpdecimate_160px" as const,
    frames: all.length,
    unique_frames: retained.length,
    ratio: all.length ? retained.length / all.length : null,
    exact_unique_frames: new Set(all).size,
    exact_ratio: all.length ? new Set(all).size / all.length : null,
  };
};
