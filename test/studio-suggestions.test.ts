import path from "node:path";
import http from "node:http";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { afterAll, describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import {
  appendRequest,
  handledRequestIds,
  listRequests,
  parseRequestLines,
  savePlan,
} from "../src/studio/store.js";
import {
  listSuggestions,
  readPromptGuide,
  readSuggestion,
  saveSuggestion,
  selectPromptGuide,
  StudioSuggestionSchema,
} from "../src/studio/suggestions.js";
import { startStudioServer } from "../src/studio/server.js";
import { buildAgentPrompt } from "../src/studio/prompt.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";
import { runCli } from "./helpers/run-cli.js";

// Run the CLI from source so these tests do not depend on a prior build.
const tsx = (f: { cwd: string; home: string }) => ({
  cwd: f.cwd,
  env: { HOME: f.home, USERPROFILE: f.home, COMFY_AGENT_TEST_ENTRY: "tsx" },
});
const sourceCli = [path.resolve("node_modules/tsx/dist/cli.mjs"), path.resolve("src/cli/index.ts")];

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
const setup = async () => {
  const tmp = await createTmpWorkdir();
  const param = (type: string, role: string, def: unknown, min?: number, max?: number) => ({
    type,
    role: ["frames", "fps"].includes(role) ? "custom" : role,
    default: def,
    min,
    max,
    target: { node_id: "1", input: role },
  });
  await fs.writeFile(
    path.join(tmp.workdir, "presets", "example.yaml"),
    YAML.stringify({
      version: 1,
      name: "example",
      workflow: "example.json",
      parameters: {
        prompt: param("string", "prompt", "cat"),
        negative: param("string", "negative_prompt", ""),
        frames: param("int", "frames", 120, 24, 240),
        fps: param("float", "fps", 24, 1, 60),
        width: param("int", "width", 512, 256, 1024),
        height: param("int", "height", 512, 256, 1024),
      },
    }),
  );
  await fs.writeFile(
    path.join(tmp.workdir, "workflows", "example.json"),
    JSON.stringify({
      1: {
        class_type: "MiniMaxH3TextToVideo",
        inputs: { prompt: "cat", frames: 120, fps: 24, width: 512, height: 512 },
      },
      2: { class_type: "SaveVideo", inputs: { video: ["1", 0] } },
    }),
  );
  const request = await appendRequest(tmp.cwd, {
    kind: "prompt_assist",
    lang: "ja",
    text: "猫が窓の外を見る",
    selected: [],
    context: {
      preset: "example",
      task: "text_to_video",
      model_label: "MiniMax H3",
      params: { prompt: "cat", frames: 120, fps: 24 },
      inputs: {},
      duration_s: 5,
      size: [512, 512],
      input_slots: [],
    },
  });
  const answer = {
    request_id: request.id,
    preset: "example",
    suggestions: [
      {
        prompt: "A cat looks out of a window.",
        explanation: {
          ja: "猫が窓の外を見る場面です。",
          en: "A cat looking out through a window.",
        },
        settings: { negative_prompt: "text", duration_s: 4, size: [512, 512] },
      },
    ],
  };
  return { ...tmp, request, answer };
};

describe("Studio prompt assistance", () => {
  it("round-trips kind, language and composer context while keeping old requests readable", async () => {
    const f = await setup();
    expect(await listRequests(f.cwd)).toEqual([f.request]);
    expect(f.request.kind).toBe("prompt_assist");
    expect(f.request.context?.model_label).toBe("MiniMax H3");
    const old = { ...f.request, kind: undefined };
    expect(parseRequestLines(JSON.stringify(old))[0]?.kind).toBe("creation");
    expect(buildAgentPrompt(f.request, [], "ja")).toContain("studio suggest <file|->");
    expect(buildAgentPrompt(f.request, [], "ja")).toContain(`request_id: "${f.request.id}"`);
  });
  it("stores a bounded reply and only a suggestion handles an assistance request", async () => {
    const f = await setup();
    const plan = await savePlan(f.cwd, {
      id: "plan",
      title: "Plan",
      request_id: f.request.id,
      steps: [{ title: "Draft" }],
    });
    expect(handledRequestIds([plan], [], [f.request]).has(f.request.id)).toBe(false);
    const saved = await saveSuggestion(f.cwd, f.answer);
    expect(await readSuggestion(f.cwd, f.request.id)).toEqual(saved);
    expect(
      handledRequestIds([plan], await listSuggestions(f.cwd), [f.request]).has(f.request.id),
    ).toBe(true);
    expect(
      await fs.readFile(
        path.join(f.workdir, "studio", "suggestions", `${f.request.id}.json`),
        "utf8",
      ),
    ).toContain("A cat");
  });
  it("rejects unsafe IDs, unknown/unsupported controls, wrong requests and oversized prompts", async () => {
    const f = await setup();
    const cases = [
      { ...f.answer, request_id: "../../outside" },
      { ...f.answer, request_id: "req-unknown" },
      { ...f.answer, preset: "wrong" },
      {
        ...f.answer,
        suggestions: Array.from({ length: 3 }, () => ({
          prompt: "猫".repeat(32000),
          explanation: { ja: "説明" },
        })),
      },
      { ...f.answer, suggestions: [{ prompt: "x".repeat(32001), explanation: { ja: "説明" } }] },
      { ...f.answer, suggestions: [{ prompt: "cat", explanation: { en: "Meaning" } }] },
      { ...f.answer, suggestions: [{ ...f.answer.suggestions[0], settings: { secret: true } }] },
      { ...f.answer, suggestions: [{ ...f.answer.suggestions[0], settings: { duration_s: 999 } }] },
      { ...f.answer, suggestions: [{ ...f.answer.suggestions[0], settings: { size: [12, 12] } }] },
      {
        ...f.answer,
        suggestions: [
          { ...f.answer.suggestions[0], settings: { size: [512, 512], aspect: "1:1" } },
        ],
      },
    ];
    for (const answer of cases)
      await expect(saveSuggestion(f.cwd, answer)).rejects.toMatchObject({
        code: "INVALID_SUGGESTION",
      });
    const presetPath = path.join(f.workdir, "presets", "example.yaml");
    const preset = YAML.parse(await fs.readFile(presetPath, "utf8"));
    delete preset.parameters.negative;
    await fs.writeFile(presetPath, YAML.stringify(preset));
    await expect(saveSuggestion(f.cwd, f.answer)).rejects.toMatchObject({
      code: "INVALID_SUGGESTION",
    });
    expect(await listSuggestions(f.cwd)).toEqual([]);
    expect(
      StudioSuggestionSchema.safeParse({
        ...f.answer,
        suggestions: Array(4).fill(f.answer.suggestions[0]),
      }).success,
    ).toBe(false);
  });
  it("saves through the CLI, serves pending/answered replies and updates inbox kind/handling", async () => {
    const f = await setup();
    const server = await startStudioServer({
      cwd: f.cwd,
      host: "127.0.0.1",
      port: 0,
      publicDir: path.resolve("studio/public"),
      lang: "ja",
      capabilityFetcher: async () => ({}),
    });
    try {
      const url = `${server.url}api/requests/${f.request.id}/suggestion`;
      expect((await (await fetch(url)).json()).suggestion).toBeNull();
      const tooLong = await fetch(`${server.url}api/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "prompt_assist",
          text: "x".repeat(32001),
          context: { preset: "example" },
          send: true,
        }),
      });
      expect(tooLong.status).toBe(400);
      expect((await tooLong.json()).error.code).toBe("INVALID_PARAM");
      const invalidKind = await fetch(`${server.url}api/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "unknown", text: "cat", send: true }),
      });
      expect(invalidKind.status).toBe(400);
      const inbox = await runCli(["studio", "inbox", "--json"], tsx(f));
      expect(JSON.parse(inbox.stdout).requests[0].kind).toBe("prompt_assist");
      const json = path.join(f.cwd, "answer.json");
      await fs.writeFile(json, JSON.stringify(f.answer));
      const result = await runCli(["studio", "suggest", json, "--json"], tsx(f));
      expect(result.code, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).suggestion.request_id).toBe(f.request.id);
      expect((await (await fetch(url)).json()).suggestion.suggestions[0].prompt).toBe(
        f.answer.suggestions[0].prompt,
      );
      expect(
        JSON.parse((await runCli(["studio", "inbox", "--json"], tsx(f))).stdout).requests,
      ).toEqual([]);
      expect(
        JSON.parse((await runCli(["studio", "inbox", "--all", "--json"], tsx(f))).stdout)
          .requests[0].kind,
      ).toBe("prompt_assist");
      const state = await (await fetch(`${server.url}api/state`)).json();
      expect(state.requests[0].handled).toBe(true);
      expect((await fetch(`${server.url}api/requests/bad.id/suggestion`)).status).toBe(400);
      expect((await fetch(`${server.url}api/requests/req-missing/suggestion`)).status).toBe(404);
      const status = await new Promise<number>((resolve, reject) => {
        http
          .get(url, { headers: { Host: "external.invalid" } }, (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          })
          .on("error", reject);
      });
      expect(status).toBe(403);
      const invalid = await runCli(["studio", "suggest", json, "--json", "--lang", "ja"], {
        ...tsx(f),
        cwd: f.home,
      });
      expect(invalid.code).toBe(2);
      expect(JSON.parse(invalid.stdout).error.message).toContain("提案が不正");
    } finally {
      await server.close();
    }
  });
  it("includes kind on API requests and follow output, and accepts stdin suggestions", async () => {
    const f = await setup();
    await fs.unlink(path.join(f.workdir, "studio", "requests.jsonl"));
    const follower = spawn(process.execPath, [...sourceCli, "studio", "inbox", "--follow"], {
      cwd: f.cwd,
      env: { ...process.env, HOME: f.home },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    follower.stdout.on("data", (chunk) => {
      output += chunk;
    });
    const server = await startStudioServer({
      cwd: f.cwd,
      host: "127.0.0.1",
      port: 0,
      publicDir: path.resolve("studio/public"),
      lang: "ja",
      capabilityFetcher: async () => ({}),
    });
    try {
      // Follow creates its inbox before it begins watching new lines.
      await vi.waitFor(async () =>
        expect(await fs.stat(path.join(f.workdir, "studio", "requests.jsonl"))).toBeTruthy(),
      );
      const res = await fetch(`${server.url}api/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "prompt_assist",
          text: "cat",
          lang: "en",
          context: { preset: "example" },
          send: true,
        }),
      });
      const body = await res.json();
      expect(body.request.kind).toBe("prompt_assist");
      await vi.waitFor(() => expect(output).toContain(body.request.id), { timeout: 5000 });
      expect(JSON.parse(output.trim()).kind).toBe("prompt_assist");
      const input = { ...f.answer, request_id: body.request.id };
      const result = await new Promise<{ code: number | null; stdout: string }>(
        (resolve, reject) => {
          const child = spawn(
            process.execPath,
            [...sourceCli, "studio", "suggest", "-", "--json"],
            {
              cwd: f.cwd,
              env: { ...process.env, HOME: f.home },
              stdio: ["pipe", "pipe", "pipe"],
            },
          );
          let stdout = "";
          child.stdout.on("data", (chunk) => {
            stdout += chunk;
          });
          child.on("error", reject);
          child.on("close", (code) => resolve({ code, stdout }));
          child.stdin.end(JSON.stringify(input));
        },
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout).suggestion.request_id).toBe(body.request.id);
    } finally {
      follower.kill("SIGTERM");
      await server.close();
    }
  });
  it.each([
    ["MiniMax H3", "video", "text_to_video", "docs/minimax-h3-prompting.md"],
    ["Krea 2", "image", "text_to_image", "docs/prompt-guides/krea2.md"],
    ["Qwen Image 2.1", "image", "text_to_image", "docs/prompt-guides/krea2.md"],
    ["SDXL", "image", "image_edit", "docs/prompt-guides/image.md"],
    ["LTX 2.5", "video", "image_to_video", "docs/prompt-guides/video.md"],
    ["Wan 2.2", "video", "reference_to_video", "docs/prompt-guides/video.md"],
    ["Hunyuan Video", "video", "text_to_video", "docs/prompt-guides/video.md"],
    ["Stable Audio", "audio", "music", "docs/prompt-guides/audio.md"],
  ] as const)("selects a guide for %s", (model_label, output, capability, expected) => {
    expect(selectPromptGuide({ model_label, output, capability })).toBe(expected);
  });
  it("prints the packaged model guide through CLI JSON", async () => {
    const f = await setup();
    const guide = await readPromptGuide(f.cwd, "example");
    expect(guide.guide).toBe("docs/minimax-h3-prompting.md");
    const result = await runCli(["studio", "prompt-guide", "example", "--json"], tsx(f));
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).text).toContain("integrated_multimodal_description");
  });
});
