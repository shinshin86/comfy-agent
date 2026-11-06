import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseScene } from "../src/scene/schema.js";
import { expandPlaceholders, resolveScene } from "../src/scene/resolve.js";
import { canonicalJson, changeReasons, fingerprint } from "../src/scene/fingerprint.js";
import { buildPlan } from "../src/scene/plan.js";
import { pickScene, runScene } from "../src/scene/run.js";
import { readState } from "../src/scene/state.js";
import { createCharacter } from "../src/characters/store.js";
import { detectTools, ffprobeJson } from "../src/verify/ffmpeg.js";
import { sceneFixture, minimalScene } from "./helpers/scene.js";

describe("scene validation", () => {
  it("merges defaults and bypasses generation defaults for file stages", () => {
    const defaults = {
      keyframe: { preset: "picture", prompt: "frame", seed: 10, params: { width: 32, height: 16 } },
    };
    const scene = parseScene({ ...minimalScene(), defaults });
    expect(scene.shots[0].keyframe).toEqual({ file: "frame.png" });
    expect(scene.edit).toMatchObject({ fps_look: 12, grain: 7, duck: { ratio: 5 } });
    expect(
      parseScene({
        ...minimalScene(),
        defaults,
        shots: [{ ...minimalScene().shots[0], keyframe: { params: { width: 64 } } }],
      }).shots[0].keyframe.params,
    ).toEqual({ width: 64, height: 16 });
  });
  it("reports precise paths for duplicate IDs, conflicting fields and missing seeds", () => {
    for (const [shots, field] of [
      [[...minimalScene().shots, ...minimalScene().shots], "shots[1].id"],
      [
        [{ ...minimalScene().shots[0], video: { file: "clip.mp4", prompt: "no" } }],
        "shots[0].video.prompt",
      ],
      [[{ ...minimalScene().shots[0], keyframe: { preset: "picture" } }], "shots[0].keyframe.seed"],
    ])
      expect(() => parseScene({ ...minimalScene(), shots })).toThrow(
        expect.objectContaining({
          code: "SCENE_INVALID",
          details: expect.objectContaining({ path: field }),
        }),
      );
  });
  it("expands variables once and preserves escaped literal braces", () => {
    expect(expandPlaceholders("{{literal}} {style}", { style: "{unchanged}" }, "prompt")).toBe(
      "{literal} {unchanged}",
    );
    expect(() => expandPlaceholders("{missing}", {}, "shots[2].video.prompt")).toThrow(
      expect.objectContaining({
        details: { path: "shots[2].video.prompt", reason: expect.any(String) },
      }),
    );
  });
  it("checks preset names, parameter values, uploads and placeholder locations", async () => {
    const f = await sceneFixture();
    for (const [keyframe, field] of [
      [{ prompt: "{appearance}" }, "shots[0].keyframe.prompt"],
      [{ prompt: "{keyframe}" }, "shots[0].keyframe.prompt"],
      [{ prompt: "frame", params: { missing: 1 } }, "shots[0].keyframe.params.missing"],
      [{ prompt: "frame", params: { width: 0 } }, "shots[0].keyframe.params.width"],
      [{ prompt: "frame", inputs: { missing: "frame.png" } }, "shots[0].keyframe.inputs.missing"],
    ])
      await expect(
        f.save({ ...f.doc, shots: [{ ...f.doc.shots[0], keyframe }] }),
      ).rejects.toMatchObject({ code: "SCENE_INVALID", details: { path: field } });
    await expect(f.save({ ...f.doc, vars: { ref: "frame.png" } })).rejects.toMatchObject({
      details: { path: "vars.ref" },
    });
    expect(
      (
        await f.save({
          ...f.doc,
          shots: [{ ...f.doc.shots[0], keyframe: { prompt: "", params: { width: "64" } } }],
        })
      ).stages[0].params,
    ).toMatchObject({ "1_text": "", "3_width": 64 });
  });
  it("resolves names and chooses form references before shared references", async () => {
    const f = await sceneFixture();
    const character = await createCharacter(
      {
        name: "hero",
        appearance: "blue coat",
        forms: [{ id: "uniform", appearance: "red coat", refs: ["refs/uniform.png"] }],
        references: [{ file: "refs/shared.png", role: "reference_image" }],
      },
      { cwd: f.cwd },
    );
    await fs.copyFile(path.join(f.dir, "frame.png"), path.join(character.path, "refs/uniform.png"));
    const resolved = await f.save({
      ...f.doc,
      character: "hero",
      form: "uniform",
      shots: [
        {
          ...f.doc.shots[0],
          keyframe: { preset: "movie", prompt: "{appearance}", inputs: { image: "{ref}" } },
        },
      ],
    });
    expect(resolved.stages[0].prompt).toBe("red coat");
    expect(resolved.stages[0].inputs.source).toMatchObject({
      file: path.join(character.path, "refs/uniform.png"),
    });
    const named = path.join(f.cwd, ".comfy-agent/scenes/demo");
    await fs.mkdir(named, { recursive: true });
    await fs.copyFile(resolved.file, path.join(named, "scene.yaml"));
    expect((await resolveScene("demo", { cwd: f.cwd })).dir).toBe(named);
  });
});

describe("scene incremental runner", () => {
  it("serializes writes and releases the lock after a failed stage", async () => {
    const f = await sceneFixture();
    const resolved = await f.save();
    let release!: () => void;
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = runScene(resolved, { only: "keyframe", shot: ["front"] }, async () => {
      started();
      await gate;
      throw new Error("test failure");
    });
    await running;
    await expect(runScene(resolved, {}, f.launcher)).rejects.toMatchObject({ code: "SCENE_BUSY" });
    release();
    await first;
    await expect(fs.stat(path.join(f.dir, ".scene/write.lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(
      (await runScene(resolved, { only: "keyframe", shot: ["front"] }, f.launcher)).stages[0]
        .status,
    ).toBe("fresh");
  });
  it("resizes the chosen keyframe before launch and invalidates video on size changes", async (context) => {
    const tools = await detectTools();
    if (!tools.ffmpeg.available || !tools.ffprobe.available) {
      context.skip();
      return;
    }
    const f = await sceneFixture();
    Object.assign(f.doc.defaults.video, { input_size: [32, 24] });
    const resolved = await f.save();
    await runScene(resolved, { only: "keyframe" }, f.launcher);
    await runScene(resolved, { only: "video", shot: ["front"] }, f.launcher);
    const upload = f.launcher.mock.calls
      .at(-1)![0]
      .find((arg) => arg.startsWith("--source_image="))!
      .slice("--source_image=".length);
    expect(await ffprobeJson(upload)).toMatchObject({ width: 32, height: 24 });
    Object.assign(f.doc.defaults.video, { input_size: [64, 48] });
    const plan = await buildPlan(await f.save());
    expect(plan.stages[0].status).toBe("fresh");
    expect(plan.stages[1]).toMatchObject({
      status: "stale",
      reasons: expect.arrayContaining(["video.inputs.source.input_size"]),
    });
  });
  it("canonicalizes key order and names changed fields", () => {
    expect(canonicalJson({ b: 1, a: { d: 3, c: 2 } })).toBe(
      canonicalJson({ a: { c: 2, d: 3 }, b: 1 }),
    );
    expect(fingerprint({ b: 1, a: 2 })).toBe(fingerprint({ a: 2, b: 1 }));
    expect(changeReasons({ video: { prompt: "a" } }, { video: { prompt: "b" } })).toEqual([
      "video.prompt",
    ]);
  });
  it("does nothing on a second run and only invalidates edit after a cut change", async () => {
    const f = await sceneFixture();
    await f.settle();
    f.launcher.mockClear();
    const before = await fs.readFile(path.join(f.dir, ".scene/state.json"), "utf-8");
    expect(
      (await runScene(await f.save(), {}, f.launcher)).stages.every(
        (stage) => stage.status === "fresh" && stage.action === "skipped",
      ),
    ).toBe(true);
    expect(f.launcher).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(f.dir, ".scene/state.json"), "utf-8")).toBe(before);
    f.doc.shots[0].cut.duration = 0.5;
    const plan = await buildPlan(await f.save());
    expect(plan.stages.filter((stage) => stage.status !== "fresh").map(({ id }) => id)).toEqual([
      "edit",
    ]);
    expect(plan.stages.at(-1)?.reasons).toContain("edit.cut");
  });
  it("invalidates only the changed video and edit after a prompt edit", async () => {
    const f = await sceneFixture();
    await f.settle();
    f.doc.shots[0].video.prompt = "another motion";
    const plan = await buildPlan(await f.save());
    expect(plan.stages.filter((stage) => stage.status !== "fresh").map(({ id }) => id)).toEqual([
      "front/video",
      "edit",
    ]);
    expect(plan.stages[1].reasons).toEqual(["video.prompt"]);
    f.launcher.mockClear();
    expect((await runScene(await f.save(), { only: "video" }, f.launcher)).stages[1].action).toBe(
      "generated",
    );
    expect(f.launcher).toHaveBeenCalledTimes(1);
  });
  it("invalidates generated keyframes and videos after a character form change", async () => {
    const f = await sceneFixture();
    await createCharacter(
      { name: "hero", appearance: "blue", forms: [{ id: "uniform", appearance: "red" }] },
      { cwd: f.cwd },
    );
    Object.assign(f.doc, { character: "hero" });
    f.doc.shots.forEach((shot) => {
      shot.keyframe.prompt = "{appearance}";
    });
    await f.settle();
    expect(
      (await buildPlan(await f.save({ ...f.doc, form: "uniform" }))).stages
        .slice(0, 4)
        .map(({ status }) => status),
    ).toEqual(["stale", "stale", "stale", "stale"]);
  });
  it("ignores timeouts and detects workflow changes and missing outputs", async () => {
    const f = await sceneFixture();
    await f.settle();
    expect(
      (
        await buildPlan(
          await f.save({
            ...f.doc,
            defaults: {
              ...f.doc.defaults,
              video: { ...f.doc.defaults.video, timeout_seconds: 99 },
            },
          }),
        )
      ).stages.every((stage) => stage.status === "fresh"),
    ).toBe(true);
    const state = await readState(f.dir);
    await fs.rm(path.join(f.dir, state.stages["front/video"].outputs[0].path));
    expect((await buildPlan(await f.save())).stages[1].status).toBe("missing");
    await fs.writeFile(path.join(f.cwd, ".comfy-agent/workflows/sample.json"), '{"changed":true}');
    expect((await buildPlan(await f.save())).stages[0].reasons).toContain(
      "keyframe.workflow_sha256",
    );
  });
  it("prints exact argv and pending templates without launching or writing state", async () => {
    const f = await sceneFixture();
    f.doc.shots[0].keyframe.prompt = "--literal= 日本語";
    const result = await runScene(await f.save(), { dryRun: true }, f.launcher);
    expect(f.launcher).not.toHaveBeenCalled();
    expect(result.stages[0].argv).toContain("--1_text=--literal= 日本語");
    expect(result.stages[0].argv?.some((arg) => arg.startsWith("--3_width="))).toBe(false);
    expect(result.stages[0].argv?.some((arg) => arg.startsWith("--2_seed="))).toBe(false);
    expect(result.stages[1]).toMatchObject({
      status: "blocked",
      waiting_for: ["front/keyframe"],
      argv_template: expect.arrayContaining(["--source_image=<pending:front/keyframe>"]),
    });
    await expect(fs.stat(path.join(f.dir, ".scene"))).rejects.toMatchObject({ code: "ENOENT" });
    await runScene(await f.save(), { only: "keyframe" }, f.launcher);
    expect(f.launcher.mock.calls[0][0]).toEqual(result.stages[0].argv);
  });
  it("records failures, continues other shots, retries and supports fail-fast", async () => {
    const f = await sceneFixture();
    f.launcher.mockResolvedValueOnce({
      exitCode: 3,
      stdout: JSON.stringify({
        ok: false,
        error: { code: "SERVER_UNREACHABLE", message: "offline" },
      }),
      stderr: "",
    });
    const result = await runScene(await f.save(), { only: "keyframe" }, f.launcher);
    expect(result.ok).toBe(false);
    expect(result.stages[0]).toMatchObject({
      status: "failed",
      error: { code: "SERVER_UNREACHABLE" },
    });
    expect(result.stages[2].status).toBe("fresh");
    const retry = await runScene(await f.save(), { only: "keyframe" }, f.launcher);
    expect(retry.stages[0].status).toBe("fresh");
    expect(retry.stages[2].action).toBe("skipped");
    f.launcher.mockClear();
    f.launcher.mockRejectedValueOnce(new Error("offline"));
    const stopped = await runScene(
      await f.save(),
      { force: ["front/keyframe", "side/keyframe"], failFast: true },
      f.launcher,
    );
    expect(f.launcher).toHaveBeenCalledTimes(1);
    expect(stopped.stages[2].action).toBe("skipped");
  });
  it("invalidates downstream stages after forced regeneration of identical bytes", async () => {
    const f = await sceneFixture();
    await f.settle();
    const result = await runScene(
      await f.save(),
      { only: "keyframe", force: ["front/keyframe"] },
      f.launcher,
    );
    expect(result.stages[1].status).toBe("stale");
    expect(result.stages[1].reasons).toContain("upstream:front/keyframe");
    expect(result.stages[3].status).toBe("fresh");
    await expect(
      runScene(await f.save(), { force: ["unknown"] }, f.launcher),
    ).rejects.toMatchObject({ code: "SCENE_INVALID" });
  });
  it("waits for candidate picks and invalidates video and edit on repick", async (context) => {
    if (!(await detectTools()).ffmpeg.available) {
      context.skip();
      return;
    }
    const f = await sceneFixture();
    Object.assign(f.doc.defaults.keyframe, { candidates: 2 });
    const resolved = await f.save();
    const result = await runScene(resolved, { only: "keyframe" }, f.launcher);
    expect(result.stages[0].status).toBe("needs_pick");
    expect(result.stages[1].status).toBe("blocked");
    expect(f.launcher.mock.calls[0][0]).toEqual(
      expect.arrayContaining(["--n", "2", "--seed-step", "1"]),
    );
    expect(result.next_action).toContain("scene pick");
    f.launcher.mockClear();
    await runScene(
      resolved,
      { only: "keyframe", force: ["side/keyframe"], failFast: true },
      f.launcher,
    );
    expect(f.launcher).not.toHaveBeenCalled();
    await pickScene(resolved, "front", 1);
    await pickScene(resolved, "side", 1);
    await runScene(resolved, { only: "video" }, f.launcher);
    const plan = await pickScene(resolved, "front", 2);
    expect(plan.stages[1].status).toBe("stale");
    expect(plan.stages[3].status).toBe("fresh");
    expect(plan.stages.at(-1)?.waiting_for).toContain("front/video");
    await expect(pickScene(resolved, "front", 3)).rejects.toMatchObject({ code: "SCENE_INVALID" });
    await runScene(resolved, { only: "keyframe", force: ["front/keyframe"] }, f.launcher);
    expect((await readState(f.dir)).stages["front/keyframe"].pick).toBeUndefined();
  });
});
