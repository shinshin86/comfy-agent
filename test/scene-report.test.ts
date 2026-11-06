import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectTools, ffprobeJson, runTool } from "../src/verify/ffmpeg.js";
import { detectSpeech, speechCutChecks } from "../src/scene/audio.js";
import {
  characterSimilarity,
  expectedDialogue,
  normalizeDialogue,
  transcribe,
  transcribeArgv,
} from "../src/scene/transcribe.js";
import { reportScene } from "../src/scene/report.js";
import { renderReportHtml } from "../src/scene/report-html.js";
import { buildPlan } from "../src/scene/plan.js";
import { runScene } from "../src/scene/run.js";
import { readState } from "../src/scene/state.js";
import { createCharacter } from "../src/characters/store.js";
import { runSourceCli as runCli, sceneFixture } from "./helpers/scene.js";

const tools = await detectTools();
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const nodeCommand = (script: string) => `${quote(process.execPath)} -e ${quote(script)} {audio}`;

describe("scene transcription", () => {
  it("extracts tagged dialogue and normalizes punctuation, whitespace and elongations", () => {
    expect(
      expectedDialogue("action <d>[Japanese] やばいっ！ </d> sound <d>[English] Run! </d>"),
    ).toBe("やばいっ！\nRun!");
    expect(normalizeDialogue("はーいっ！ 〜ＡＢＣ〜")).toBe("はいabc");
    expect(characterSimilarity("はーいっ！", "はい")).toBe(1);
    expect(characterSimilarity("あいうえお", "あいうかき")).toBeCloseTo(0.6);
    expect(characterSimilarity("行こう", "全く違う文章")).toBeLessThan(0.6);
  });
  it.each([
    ["待ってぇーっ！", "待ってー!"],
    ["怒られるぅーっ！", "怒られる"],
  ])("normalizes small-vowel elongations in %s", (expected, actual) => {
    expect(characterSimilarity(expected, actual)).toBe(1);
  });
  it("parses quotes and substitutes paths as literal argv without a shell", () => {
    const file = "a directory/quote'$(touch nope).wav";
    expect(transcribeArgv('tool --file={audio} "two words" \'literal | text\' ""', file)).toEqual([
      "tool",
      `--file=${file}`,
      "two words",
      "literal | text",
      "",
    ]);
    expect(() => transcribeArgv("tool {audio} | cat", file)).toThrow(/Shell operators/);
    expect(() => transcribeArgv("tool '{audio}", file)).toThrow(/Unclosed quote/);
  });
  it("captures fixed transcripts and handles errors, timeouts and output limits", async () => {
    const f = await sceneFixture();
    const text = await transcribe(
      nodeCommand('console.log(" はい！ ")'),
      "cut.wav",
      "はーいっ",
      f.dir,
    );
    expect(text).toEqual({ status: "completed", text: "はい！", similarity: 1 });
    expect(await transcribe(nodeCommand("process.exit(7)"), "cut.wav", "", f.dir)).toEqual({
      status: "failed",
      reason: "command_failed",
    });
    expect(
      await transcribe(nodeCommand("setTimeout(() => {}, 10000)"), "cut.wav", "", f.dir, 80),
    ).toEqual({ status: "failed", reason: "timeout" });
    expect(
      await transcribe(
        nodeCommand('process.stdout.write("x".repeat(2 * 1024 * 1024))'),
        "cut.wav",
        "",
        f.dir,
      ),
    ).toEqual({ status: "failed", reason: "output_limit" });
  });
});

describe.skipIf(!tools.ffmpeg.available || !tools.ffprobe.available)("scene report media", () => {
  const media = async () => {
    const f = await sceneFixture();
    const audio = path.join(f.dir, "bursts.wav");
    await runTool(tools.ffmpeg.path!, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=if(between(t\\,1\\,2)+between(t\\,3\\,3.5)\\,0.25*sin(2*PI*1000*t)\\,0):s=16000:d=5",
      "-y",
      audio,
    ]);
    await runTool(tools.ffmpeg.path!, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=160x96:rate=24:duration=5",
      "-i",
      audio,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-y",
      path.join(f.dir, "clip.mp4"),
    ]);
    return { ...f, audio };
  };
  it("detects known bursts within one window, reports cut warnings, and handles silence", async () => {
    const f = await media();
    const analysis = await detectSpeech(f.audio, 5, tools.ffmpeg.path!);
    expect(analysis.windows).toHaveLength(20);
    expect(analysis.intervals).toHaveLength(2);
    for (const [actual, expected] of analysis.intervals.map((interval, index) => [
      interval,
      [
        { start: 1, end: 2 },
        { start: 3, end: 3.5 },
      ][index],
    ])) {
      expect(Math.abs(actual.start - expected.start)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(actual.end - expected.end)).toBeLessThanOrEqual(0.25);
    }
    expect(await detectSpeech(f.audio, 5, tools.ffmpeg.path!)).toEqual(analysis);
    const checks = speechCutChecks(analysis, { start: 1.25, end: 1.75 });
    expect(checks.warnings).toEqual(
      expect.arrayContaining(["speech_cut_at_end", "cut_outside_speech"]),
    );
    expect(Math.abs(checks.suggested_cut_start! - 0.75)).toBeLessThanOrEqual(0.25);
    const silent = path.join(f.dir, "silence.wav");
    await runTool(tools.ffmpeg.path!, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=16000:cl=mono",
      "-t",
      "1",
      "-y",
      silent,
    ]);
    const silence = await detectSpeech(silent, 1, tools.ffmpeg.path!);
    expect(silence.intervals).toEqual([]);
    expect(speechCutChecks(silence, { start: 0, end: 1 })).toMatchObject({
      warnings: ["no_speech"],
      suggested_cut_start: null,
    });
  });
  it("writes a complete report, compares transcripts, and leaves generation state unchanged", async () => {
    const f = await media();
    const character = await createCharacter(
      {
        name: "hero",
        appearance: "blue coat",
        references: [{ file: "refs/front.png", role: "reference_image" }],
      },
      { cwd: f.cwd },
    );
    await fs.copyFile(path.join(f.dir, "frame.png"), path.join(character.path, "refs/front.png"));
    const doc = {
      ...f.doc,
      character: "hero",
      checks: { transcribe_cmd: nodeCommand('console.log("はい！")') },
      edit: { grain: 0, fade_out: 0 },
      shots: f.doc.shots.map((shot) => ({
        ...shot,
        video: { prompt: '<d>[Japanese] はーいっ！</d> <script>alert("x")</script>' },
        cut: { start: 0.75, duration: 1.5 },
      })),
    };
    const resolved = await f.save(doc);
    const run = await runScene(resolved, {}, f.launcher);
    expect(run.ok, JSON.stringify(run)).toBe(true);
    const before = await readState(f.dir);
    const report = await reportScene(resolved);
    expect(report.shots[0].video.transcript).toMatchObject({
      status: "completed",
      text: "はい！",
      similarity: 1,
    });
    expect(report.shots[0].video.expected_dialogue).toBe("はーいっ！");
    expect(report.shots[0].keyframe.reference).toBe("front/reference.png");
    expect(report.shots[0].keyframe.candidates[0].size_ok).toBe(false);
    expect(
      report.shots[0].warnings.some((warning) => warning.code === "keyframe_size_mismatch"),
    ).toBe(true);
    expect(report.final).toMatchObject({
      status: "fresh",
      expected_duration_s: 3,
      metadata: { duration_s: 3, frame_count: 72 },
    });
    expect(report.final?.boundary_frames.map((frame) => frame.frame)).toEqual([0, 35, 36, 71]);
    expect(
      report.final?.speech_timeline.some(
        (interval) => interval.shot === "side" && interval.start >= 1.5,
      ),
    ).toBe(true);
    expect(report.final?.unique_frames?.ratio).toBeGreaterThan(0.3);
    expect(report.final?.unique_frames?.ratio).toBeLessThanOrEqual(0.65);
    expect(report.final?.loudness.max_db).not.toBeNull();
    expect(await readState(f.dir)).toEqual(before);
    const plan = await buildPlan(resolved);
    expect(plan.report).toBe(path.join(f.dir, "out/report/report.html"));
    expect((await runScene(resolved, {}, f.launcher)).report).toBe(plan.report);
    const wav = await ffprobeJson(path.join(f.dir, "out/report/front/cut.wav"));
    expect(wav).toMatchObject({ sample_rate: 16000, channels: 1, duration_s: 1.5 });
    const changedChecks = await f.save({
      ...doc,
      checks: { transcribe_cmd: nodeCommand('console.log("別の言葉")') },
    });
    expect((await buildPlan(changedChecks)).stages.every((stage) => stage.status === "fresh")).toBe(
      true,
    );
    const mismatched = await reportScene(changedChecks);
    expect(
      mismatched.shots[0].warnings.some((warning) => warning.code === "transcript_mismatch"),
    ).toBe(true);
    const override = await reportScene(changedChecks, { transcribeCmd: doc.checks.transcribe_cmd });
    expect(override.shots[0].video.transcript).toMatchObject({ similarity: 1 });
    const html = await fs.readFile(plan.report!, "utf-8");
    expect(html).not.toMatch(/<script|https?:\/\//i);
    expect(html).toContain('src="front/reference.png"');
    expect(JSON.stringify(report)).not.toContain(f.cwd);
    const dialogueOverride = await f.save({
      ...doc,
      shots: doc.shots.map((shot, index) => ({ ...shot, dialogue: index ? "" : "はい！" })),
    });
    const dialoguePlan = await buildPlan(dialogueOverride);
    expect(dialoguePlan.stages.map((stage) => stage.fingerprint)).toEqual(
      plan.stages.map((stage) => stage.fingerprint),
    );
    expect(dialoguePlan.stages.every((stage) => stage.status === "fresh")).toBe(true);
    const explicitDialogue = await reportScene(dialogueOverride);
    expect(explicitDialogue.shots[0].video).toMatchObject({
      expected_dialogue: "はい！",
      transcript: { similarity: 1 },
    });
    expect(explicitDialogue.shots[1].video).toMatchObject({
      expected_dialogue: "",
      transcript: { similarity: null },
    });
  });
  it("reports partial scenes, transcript failures, and escapes transcript text", async () => {
    const f = await media();
    const doc = {
      ...f.doc,
      shots: [{ ...f.doc.shots[0], video: { params: { prompt: "<d>[Japanese] hello</d>" } } }],
      checks: { transcribe_cmd: nodeCommand('console.log("<script>alert(1)</script> & quote")') },
    };
    const resolved = await f.save(doc);
    await runScene(resolved, { only: "keyframe" }, f.launcher);
    const partial = await reportScene(resolved);
    expect(partial.final).toBeNull();
    expect(partial.all_warnings).toEqual([
      ...partial.warnings.map((warning) => ({ scope: "scene", ...warning })),
      ...partial.shots.flatMap((shot) =>
        shot.warnings.map((warning) => ({ scope: `shot:${shot.id}`, ...warning })),
      ),
    ]);
    expect(partial.warning_count).toBe(partial.all_warnings.length);
    expect(partial.shots[0].video.transcript).toMatchObject({
      status: "skipped",
      reason: "clip_unavailable",
    });
    await runScene(resolved, { only: "video" }, f.launcher);
    const escaped = await reportScene(resolved);
    expect(escaped.shots[0].video.expected_dialogue).toBe("hello");
    const html = await fs.readFile(path.join(f.dir, "out/report/report.html"), "utf-8");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; quote");
    expect(html).not.toContain("<script>");
    const failed = await reportScene(resolved, { transcribeCmd: nodeCommand("process.exit(1)") });
    expect(failed.shots[0].video.transcript).toEqual({
      status: "failed",
      reason: "command_failed",
    });
    expect(
      failed.shots[0].warnings.some((warning) => warning.code === "transcription_failed"),
    ).toBe(true);
    const skipped = await reportScene(await f.save({ ...doc, checks: undefined }));
    expect(skipped.shots[0].video.transcript).toMatchObject({
      status: "skipped",
      reason: "no_command",
    });
  });
  it("reports file-shot dialogue and links all warning scopes without shrinking timeline labels", async () => {
    const f = await media();
    const doc = {
      version: 1,
      name: "demo",
      shots: [
        {
          id: "final",
          dialogue: "Explicit <dialogue> & text",
          keyframe: { file: "frame.png" },
          video: { file: "clip.mp4" },
          cut: { start: 0, duration: 5 },
        },
      ],
    };
    const resolved = await f.save(doc);
    await runScene(resolved, {}, f.launcher);
    const report = await reportScene(resolved);
    expect(report.shots[0].video.expected_dialogue).toBe(doc.shots[0].dialogue);
    const cutChanged = await f.save({
      ...doc,
      shots: [{ ...doc.shots[0], cut: { start: 1.25, duration: 0.5 } }],
    });
    const stale = await reportScene(cutChanged);
    expect(stale.all_warnings).toEqual([
      ...stale.warnings.map((warning) => ({ scope: "scene", ...warning })),
      ...stale.final!.warnings.map((warning) => ({ scope: "final", ...warning })),
      ...stale.shots[0].warnings.map((warning) => ({ scope: "shot:final", ...warning })),
    ]);
    expect(stale.warning_count).toBe(stale.all_warnings.length);
    expect(stale.all_warnings).toContainEqual(
      expect.objectContaining({
        scope: "final",
        code: "final_not_fresh",
      }),
    );
    expect(stale.all_warnings).toContainEqual(
      expect.objectContaining({
        scope: "shot:final",
        code: "speech_cut_at_end",
      }),
    );
    const html = renderReportHtml(stale);
    const summary = html.slice(
      html.indexOf('<section id="warnings">'),
      html.indexOf('<section id="final">'),
    );
    expect(summary).toContain('href="#final">Final edit</a>');
    expect(summary).toContain('href="#shot-final">Shot final</a>');
    expect(summary).not.toContain("No warnings");
    expect(html).toContain("Explicit &lt;dialogue&gt; &amp; text");
    expect(html).toContain('class="timeline-label">final</span>');
    expect(html).not.toContain("<text ");
    expect(html).toContain("20th-percentile level");
    expect(html).not.toContain("noise estimate");
    const one = renderReportHtml({
      ...report,
      warning_count: 1,
      all_warnings: [stale.all_warnings.at(-1)!],
    });
    expect(one).toContain("1 warning ·");
    expect(one).not.toContain("1 warnings");
    const zero = renderReportHtml({ ...report, warning_count: 0, all_warnings: [] });
    expect(zero).toContain("0 warnings ·");
    expect(zero).toContain("No warnings from these checks.");
  });
  it("supports scene report --json and includes report paths in CLI plans", async () => {
    const f = await media();
    await f.save();
    const result = await runCli(["scene", "report", f.dir, "--json"], { cwd: f.cwd });
    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      report: "out/report/report.html",
      shots: expect.any(Array),
    });
    const plan = await runCli(["scene", "plan", f.dir, "--json"], { cwd: f.cwd });
    expect(JSON.parse(plan.stdout).report).toBe(path.join(f.dir, "out/report/report.html"));
  });
});
