import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { startMockComfy } from "./helpers/mock-comfyui.js";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir, type TmpWorkdir } from "./helpers/tmp-workdir.js";

type MockServer = Awaited<ReturnType<typeof startMockComfy>>;

const WORKFLOW_FIXTURE = fileURLToPath(
  new URL("./helpers/fixtures/smoke-workflow-api.json", import.meta.url),
);
const servers = new Set<MockServer>();

afterEach(async () => {
  await Promise.all([...servers].map((server) => server.close()));
  servers.clear();
});

const cliOptions = (workdir: TmpWorkdir, baseUrl: string) => ({
  cwd: workdir.cwd,
  env: {
    HOME: workdir.home,
    USERPROFILE: workdir.home,
    COMFY_AGENT_BASE_URL: baseUrl,
    COMFY_AGENT_TEST_ENTRY: "tsx",
  },
});

const prepareLocalPreset = async () => {
  const server = await startMockComfy();
  servers.add(server);
  const workdir = await createTmpWorkdir();
  const result = await runCli(
    ["import", WORKFLOW_FIXTURE, "--name", "local-demo"],
    cliOptions(workdir, server.baseUrl),
  );
  expect(result.code, result.stderr).toBe(0);
  server.requests.length = 0;
  return { server, workdir };
};

describe("local source priority", () => {
  it("run auto uses an existing local preset without querying remote userdata", async () => {
    const { server, workdir } = await prepareLocalPreset();

    const result = await runCli(
      ["run", "local-demo", "--dry-run", "--json"],
      cliOptions(workdir, server.baseUrl),
    );

    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toHaveProperty("3.class_type", "KSampler");
    expect(server.requests).toEqual([]);
  });

  it("preset auto and explicit local avoid remote template endpoints", async () => {
    const { server, workdir } = await prepareLocalPreset();
    const options = cliOptions(workdir, server.baseUrl);

    const automatic = await runCli(["preset", "local-demo", "--json"], options);
    const explicit = await runCli(
      ["preset", "local-demo", "--source", "local", "--json"],
      options,
    );

    expect(automatic.code, automatic.stderr).toBe(0);
    expect(explicit.code, explicit.stderr).toBe(0);
    expect(JSON.parse(automatic.stdout)).toMatchObject({ ok: true, source: "local" });
    expect(JSON.parse(explicit.stdout)).toMatchObject({ ok: true, source: "local" });
    expect(server.requests).toEqual([]);
  });
});
