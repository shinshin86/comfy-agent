import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, vi } from "vitest";
import YAML from "yaml";
import { resolveScene } from "../../src/scene/resolve.js";
import { buildPlan } from "../../src/scene/plan.js";
import { runScene } from "../../src/scene/run.js";
import { outputRecord, readState, writeState } from "../../src/scene/state.js";
import type { RunLauncher } from "../../src/studio/rerun.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
export const minimalScene = () => ({
  version: 1,
  name: "demo",
  shots: [{ id: "front", keyframe: { file: "frame.png" }, video: { file: "clip.mp4" } }],
});

export const sceneFixture = async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "comfy-scene-"));
  roots.push(cwd);
  const dir = path.join(cwd, "scene space");
  await fs.mkdir(dir);
  for (const subdir of ["presets", "workflows"])
    await fs.mkdir(path.join(cwd, ".comfy-agent", subdir), { recursive: true });
  const preset = (name: string, image: boolean) => ({
    version: 1,
    name,
    workflow: "sample.json",
    parameters: {
      "1_text": {
        type: "string",
        target: { node_id: "1", input: "text" },
        aliases: ["prompt"],
        required: true,
      },
      "2_seed": { type: "int", target: { node_id: "2", input: "seed" }, role: "seed", default: 5 },
      "3_width": {
        type: "int",
        target: { node_id: "3", input: "width" },
        aliases: ["width"],
        min: 1,
        default: 32,
        required: true,
      },
    },
    ...(image
      ? {
          uploads: {
            source: {
              kind: "image",
              cli_flag: "--source_image",
              aliases: ["image"],
              target: { node_id: "4", input: "image" },
              required: true,
            },
          },
        }
      : {}),
  });
  await fs.writeFile(path.join(cwd, ".comfy-agent/workflows/sample.json"), "{}");
  await fs.writeFile(
    path.join(cwd, ".comfy-agent/presets/picture.yaml"),
    YAML.stringify(preset("picture", false)),
  );
  await fs.writeFile(
    path.join(cwd, ".comfy-agent/presets/movie.yaml"),
    YAML.stringify(preset("movie", true)),
  );
  await fs.copyFile(
    new URL("../fixtures/verify/1x1.png", import.meta.url),
    path.join(dir, "frame.png"),
  );
  await fs.writeFile(path.join(dir, "clip.mp4"), "test clip");
  const doc = {
    version: 1,
    name: "demo",
    defaults: {
      keyframe: { preset: "picture", seed: 10 },
      video: { preset: "movie", seed: 20, inputs: { image: "{keyframe}" } },
    },
    shots: ["front", "side"].map((id) => ({
      id,
      keyframe: { prompt: "a frame" },
      video: { prompt: "a moving frame" },
      cut: { start: 0, duration: 1 },
    })),
  };
  const save = async (value: unknown = doc) => {
    await fs.writeFile(path.join(dir, "scene.yaml"), YAML.stringify(value));
    return resolveScene(dir, { cwd });
  };
  let serial = 0;
  const launcher = vi.fn<RunLauncher>(async (args) => {
    const count = Number(args[args.indexOf("--n") + 1]) || 1;
    const outputDir = path.join(cwd, `generation-${++serial}`);
    await fs.mkdir(outputDir);
    const runs = [];
    for (let i = 0; i < count; i++) {
      const extension = args[1] === "picture" ? "png" : "mp4";
      const target = path.join(outputDir, `${i}.${extension}`);
      await fs.copyFile(path.join(dir, extension === "png" ? "frame.png" : "clip.mp4"), target);
      runs.push({ outputs: [{ saved_to: target, kind: extension === "png" ? "image" : "video" }] });
    }
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        ok: true,
        output_dir: outputDir,
        runs,
        jobs: [{ job_id: `job-${serial}` }],
      }),
      stderr: "",
    };
  });
  const settle = async () => {
    const resolved = await save();
    await runScene(resolved, { only: "keyframe" }, launcher);
    await runScene(resolved, { only: "video" }, launcher);
    const state = await readState(dir);
    const edit = (await buildPlan(resolved, state)).stages.at(-1)!;
    const final = path.join(dir, "final.mp4");
    await fs.copyFile(path.join(dir, "clip.mp4"), final);
    state.stages.edit = {
      fingerprint: edit.fingerprint,
      inputs: edit.inputs,
      outputs: [await outputRecord(dir, final)],
      duration_ms: 100,
      completed_at: new Date().toISOString(),
      revision: randomUUID(),
      job_ids: [],
    };
    await writeState(dir, state);
    return resolved;
  };
  return { cwd, dir, doc, save, launcher, settle };
};
