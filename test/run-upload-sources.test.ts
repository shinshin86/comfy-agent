import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { listJobs } from "../src/jobs/store.js";
import { startMockComfy } from "./helpers/mock-comfyui.js";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

type MockServer = Awaited<ReturnType<typeof startMockComfy>>;

const WORKFLOW_FIXTURE = fileURLToPath(
  new URL("./helpers/fixtures/smoke-workflow-api.json", import.meta.url),
);
const servers = new Set<MockServer>();

afterEach(async () => {
  await Promise.all([...servers].map((server) => server.close()));
  servers.clear();
});

describe("run upload sources", () => {
  it("records the local path of each uploaded file in the job record", async () => {
    const server = await startMockComfy();
    servers.add(server);
    const workdir = await createTmpWorkdir();
    const options = {
      cwd: workdir.cwd,
      env: {
        HOME: workdir.home,
        USERPROFILE: workdir.home,
        COMFY_AGENT_BASE_URL: server.baseUrl,
        COMFY_AGENT_TEST_ENTRY: "tsx",
      },
    };
    const imported = await runCli(["import", WORKFLOW_FIXTURE, "--name", "upload-demo"], options);
    expect(imported.code, imported.stderr).toBe(0);

    const presetPath = path.join(workdir.workdir, "presets", "upload-demo.yaml");
    await fs.appendFile(
      presetPath,
      [
        "uploads:",
        "  image:",
        "    kind: image",
        "    cli_flag: --image",
        "    target:",
        '      node_id: "6"',
        "      input: text",
        "",
      ].join("\n"),
    );
    const input = path.join(workdir.cwd, "inputs", "source.png");
    await fs.mkdir(path.dirname(input), { recursive: true });
    await fs.writeFile(input, "PNG");

    const result = await runCli(
      ["run", "upload-demo", "--image", "inputs/source.png", "--no-preflight", "--json"],
      options,
    );
    expect(result.code, result.stderr).toBe(0);

    const [job] = await listJobs(workdir.cwd, "local");
    expect(job?.uploads).toEqual({ image: "source.png" });
    expect(job?.upload_sources).toEqual({ image: await fs.realpath(input) });
  });
});
