import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import { createCharacter } from "../src/characters/store.js";
import { detectTools, ffprobeJson, runTool } from "../src/verify/ffmpeg.js";
import { resolveScene } from "../src/scene/resolve.js";
import { runScene } from "../src/scene/run.js";
import { readState } from "../src/scene/state.js";
import { runSourceCli as runCli, sceneFixture, minimalScene } from "./helpers/scene.js";

const fileScene = async () => {
  const f = await sceneFixture();
  const tools = await detectTools();
  await runTool(tools.ffmpeg.path!, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x96:rate=24:duration=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-y",
    path.join(f.dir, "clip.mp4"),
  ]);
  await runTool(tools.ffmpeg.path!, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:size=160x96:rate=24:duration=1",
    "-c:v",
    "libx264",
    "-y",
    path.join(f.dir, "silent.mp4"),
  ]);
  await runTool(tools.ffmpeg.path!, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:duration=0.75",
    "-y",
    path.join(f.dir, "bgm.wav"),
  ]);
  const doc = {
    ...minimalScene(),
    shots: [
      {
        id: "front",
        keyframe: { file: "frame.png" },
        video: { file: "clip.mp4" },
        cut: { start: 0.125, duration: 0.5 },
      },
      {
        id: "side",
        keyframe: { file: "frame.png" },
        video: { file: "silent.mp4" },
        cut: { start: 0.25, duration: 0.5 },
      },
    ],
    bgm: { file: "bgm.wav", start: 0.1 },
    edit: { grain: 0 },
  };
  return { ...f, doc };
};

describe("scene edit and CLI", () => {
  it("validates the character before writing and uses character placeholders", async () => {
    const f = await sceneFixture();
    const missing = await runCli(
      ["scene", "init", "with-character", "--character", "absent", "--json"],
      { cwd: f.cwd },
    );
    expect(missing.code).toBe(2);
    expect(JSON.parse(missing.stdout).error.code).toBe("CHARACTER_NOT_FOUND");
    await expect(fs.stat(path.join(f.cwd, ".comfy-agent/scenes"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await createCharacter({ name: "hero", appearance: "blue coat" }, { cwd: f.cwd });
    const created = await runCli(
      ["scene", "init", "with-character", "--character", "hero", "--json"],
      { cwd: f.cwd },
    );
    expect(created.code, created.stdout).toBe(0);
    const raw = await fs.readFile(JSON.parse(created.stdout).path, "utf-8");
    const doc = YAML.parse(raw);
    expect(doc.defaults.keyframe.inputs.image).toBe("{ref}");
    expect(doc.shots[0].keyframe.prompt).toContain("{appearance}");
    expect(raw).not.toContain("assets/reference.png");
  });
  it("runs file-only scenes through the CLI, does nothing twice, and edits only changed cuts", async (context) => {
    const tools = await detectTools();
    if (!tools.ffmpeg.available || !tools.ffprobe.available) {
      context.skip();
      return;
    }
    const f = await fileScene();
    await f.save(f.doc);
    const run = () =>
      runCli(["scene", "run", f.dir, "--json", "--base-url=http://127.0.0.1:1"], { cwd: f.cwd });
    const first = await run();
    expect(first.code, first.stdout + first.stderr).toBe(0);
    const result = JSON.parse(first.stdout);
    expect(result.stages.map((stage: { action: string }) => stage.action)).toEqual([
      "copied",
      "copied",
      "copied",
      "copied",
      "copied",
      "edited",
    ]);
    const metadata = await ffprobeJson(result.final);
    expect(metadata).toMatchObject({ width: 160, height: 96, frame_count: 24, channels: 2 });
    expect(metadata.duration_s).toBeCloseTo(1, 1);
    expect(result.stages.at(-1).outputs[0].metadata).toMatchObject({
      width: 160,
      height: 96,
      frame_count: 24,
    });
    const before = await readState(f.dir);
    expect(
      JSON.parse((await run()).stdout).stages.every(
        (stage: { status: string; action: string }) =>
          stage.status === "fresh" && stage.action === "skipped",
      ),
    ).toBe(true);
    expect(await readState(f.dir)).toEqual(before);
    f.doc.shots[0].cut.duration = 0.25;
    await f.save(f.doc);
    const changed = JSON.parse((await run()).stdout);
    expect(
      changed.stages
        .filter((stage: { action: string }) => stage.action !== "skipped")
        .map((stage: { id: string }) => stage.id),
    ).toEqual(["edit"]);
    expect((await ffprobeJson(changed.final)).duration_s).toBeCloseTo(0.75, 1);
  });
  it("edits voice-only scenes and identifies the shot when a cut is out of range", async (context) => {
    const tools = await detectTools();
    if (!tools.ffmpeg.available || !tools.ffprobe.available) {
      context.skip();
      return;
    }
    const f = await fileScene();
    const doc = { ...f.doc, bgm: undefined };
    const launcher = vi.fn(async () => {
      throw new Error("Generation must not run");
    });
    const result = await runScene(
      await f.save({ ...doc, edit: { fps_look: null, grain: 0, fade_out: 0 } }),
      {},
      launcher,
    );
    expect(result.ok).toBe(true);
    expect(launcher).not.toHaveBeenCalled();
    expect((await ffprobeJson(result.final!)).frame_count).toBe(24);
    doc.shots[1].cut.duration = 2;
    const invalid = await runScene(await f.save(doc), {}, launcher);
    expect(invalid.ok).toBe(false);
    expect(invalid.stages.at(-1)?.error).toMatchObject({
      code: "SCENE_INVALID",
      details: { path: "shots[1].cut" },
    });
  });
  it("scaffolds without overwriting, reports structured errors and supports JSON plans", async () => {
    const f = await sceneFixture();
    const init = await runCli(
      ["scene", "init", "new-scene", "--shots", "1", "--json", "--lang", "ja"],
      { cwd: f.cwd },
    );
    expect(init.code, init.stdout).toBe(0);
    expect(await fs.readFile(JSON.parse(init.stdout).path, "utf-8")).toContain("seed: 100");
    const conflict = await runCli(["scene", "init", "new-scene", "--json"], { cwd: f.cwd });
    expect(JSON.parse(conflict.stdout).error.code).toBe("SCENE_EXISTS");
    await f.save();
    const plan = await runCli(["scene", "plan", f.dir, "--json"], { cwd: f.cwd });
    expect(plan.code, plan.stdout).toBe(0);
    expect(JSON.parse(plan.stdout)).toMatchObject({
      ok: true,
      scene: "demo",
      next_action: expect.stringContaining("scene run"),
    });
    const dry = await runCli(["scene", "run", f.dir, "--dry-run", "--json"], { cwd: f.cwd });
    expect(dry.code, dry.stdout).toBe(0);
    expect(JSON.parse(dry.stdout).stages[0].argv).toContain("--1_text=a frame");
    expect(JSON.parse(dry.stdout).stages[1].argv_template).toContain(
      "--source_image=<pending:front/keyframe>",
    );
    await expect(resolveScene("absent", { cwd: f.cwd })).rejects.toMatchObject({
      code: "SCENE_NOT_FOUND",
    });
  });
});
