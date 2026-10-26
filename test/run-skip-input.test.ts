import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { listJobs } from "../src/jobs/store.js";
import { buildRerunArgs, buildRerunForm } from "../src/studio/rerun.js";
import { startMockComfy } from "./helpers/mock-comfyui.js";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";
import {
  optionalObjectInfo,
  optionalPreset,
  writeOptionalFixture,
} from "./helpers/optional-workflow.js";
const servers: Array<Awaited<ReturnType<typeof startMockComfy>>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
const setup = async (info: Record<string, unknown> = optionalObjectInfo) => {
  const server = await startMockComfy({ objectInfo: info });
  servers.push(server);
  const tmp = await createTmpWorkdir();
  await writeOptionalFixture(tmp.workdir);
  return {
    server,
    tmp,
    opts: {
      cwd: tmp.cwd,
      env: {
        HOME: tmp.home,
        USERPROFILE: tmp.home,
        COMFY_AGENT_BASE_URL: server.baseUrl,
        COMFY_AGENT_TEST_ENTRY: "tsx",
      },
    },
  };
};
describe("run --skip-input", () => {
  it("parses repeated flags, prunes the submitted graph once, records and restores skipped slots", async () => {
    const { server, tmp, opts } = await setup();
    const result = await runCli(
      [
        "run",
        "optional_i2v",
        "--skip-input",
        "image",
        "--skip-input",
        "reference",
        "--async",
        "--json",
      ],
      opts,
    );
    expect(result.code, result.stderr).toBe(0);
    const request = server.requests.find((r) => r.path === "/prompt")!;
    const graph = (request.body as { prompt: Record<string, unknown> }).prompt;
    expect(Object.keys(graph)).toEqual(["3", "4"]);
    expect(graph["3"]).toEqual({
      class_type: "WanImageToVideo",
      inputs: { length: 81, prompt: "A scene" },
    });
    expect(server.requests.filter((r) => r.path === "/object_info")).toHaveLength(1);
    const [job] = await listJobs(tmp.cwd, "local");
    expect(job!.skipped_inputs).toEqual(["image", "reference"]);
    expect(job!.uploads).toEqual({});
    expect(
      JSON.parse(await fs.readFile(path.join(job!.output_dir, "run.json"), "utf8")).skipped_inputs,
    ).toEqual(["image", "reference"]);
    expect(await buildRerunForm(job!, optionalPreset)).toMatchObject({
      supported: true,
      skip: ["image", "reference"],
      inputs: [],
    });
    const replay = buildRerunArgs(job!, optionalPreset, { overrides: {}, seed: "new", count: 1 });
    expect(
      replay.slice(replay.indexOf("--skip-input"), replay.indexOf("--skip-input") + 4),
    ).toEqual(["--skip-input", "image", "--skip-input", "reference"]);
    const again = await runCli(replay.slice(0, 2).concat(["--async"], replay.slice(2)), opts);
    expect(again.code, again.stderr).toBe(0);
    expect(await listJobs(tmp.cwd, "local")).toHaveLength(2);
  });
  it("applies pruning to dry-run even with --no-preflight", async () => {
    const { server, opts } = await setup();
    const result = await runCli(
      [
        "run",
        "optional_i2v",
        "--skip-input=image",
        "--skip-input=reference",
        "--no-preflight",
        "--dry-run",
        "--json",
      ],
      opts,
    );
    expect(result.code, result.stderr).toBe(0);
    expect(Object.keys(JSON.parse(result.stdout))).toEqual(["3", "4"]);
    expect(server.requests.filter((r) => r.path === "/prompt")).toHaveLength(0);
  });
  it.each([
    { slot: "unknown", info: optionalObjectInfo, code: "UNKNOWN_INPUT_SLOT" },
    { slot: "image", info: {}, code: "INPUT_NOT_SKIPPABLE" },
    {
      slot: "image",
      info: {
        ...optionalObjectInfo,
        WanImageToVideo: { input: { required: { start_image: ["LATENT"] } } },
      },
      code: "INPUT_NOT_SKIPPABLE",
    },
  ])("rejects unsafe or unknown skip: $code", async ({ slot, info, code }) => {
    const { server, opts } = await setup(info);
    const result = await runCli(
      ["run", "optional_i2v", "--skip-input", slot, "--no-preflight", "--json"],
      opts,
    );
    expect(result.code).not.toBe(0);
    expect(JSON.parse(result.stdout).error.code).toBe(code);
    expect(server.requests.filter((r) => r.path === "/prompt")).toHaveLength(0);
  });
  it("rejects a supplied and skipped input together", async () => {
    const { tmp, opts } = await setup();
    const result = await runCli(
      [
        "run",
        "optional_i2v",
        "--skip-input",
        "image",
        "--image",
        path.join(tmp.cwd, "unused.png"),
        "--json",
      ],
      opts,
    );
    expect(result.code).not.toBe(0);
    expect(JSON.parse(result.stdout).error.code).toBe("INVALID_PARAM");
  });
});
