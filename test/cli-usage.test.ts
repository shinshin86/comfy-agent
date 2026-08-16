import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir, type TmpWorkdir } from "./helpers/tmp-workdir.js";

const packageJson = createRequire(import.meta.url)("../package.json") as { version: string };

const cliOptions = (workdir: TmpWorkdir) => ({
  cwd: workdir.cwd,
  env: {
    HOME: workdir.home,
    USERPROFILE: workdir.home,
    COMFY_AGENT_TEST_ENTRY: "tsx",
  },
});

describe("commander usage output", () => {
  it("returns INVALID_USAGE JSON and exit 2 when --name is missing", async () => {
    const workdir = await createTmpWorkdir();
    const result = await runCli(["import", "x.json", "--json"], cliOptions(workdir));

    expect(result.code).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      error: {
        code: "INVALID_USAGE",
        message: "error: required option '--name <preset_name>' not specified",
        details: { commander_code: "commander.missingMandatoryOptionValue" },
      },
    });
  });

  it("returns INVALID_USAGE JSON for an unknown command", async () => {
    const workdir = await createTmpWorkdir();
    const result = await runCli(["nosuch", "--json"], cliOptions(workdir));

    expect(result.code).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      error: {
        code: "INVALID_USAGE",
        message: "error: unknown command 'nosuch'",
        details: { commander_code: "commander.unknownCommand" },
      },
    });
  });

  it("returns FILE_NOT_FOUND and exit 2 for a missing import workflow", async () => {
    const workdir = await createTmpWorkdir();
    const result = await runCli(
      ["import", "missing-workflow.json", "--name", "demo", "--json"],
      cliOptions(workdir),
    );

    expect(result.code).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      error: {
        code: "FILE_NOT_FOUND",
        message: "missing-workflow.json not found.",
        details: { path: "missing-workflow.json", kind: "workflow_source" },
      },
    });
  });

  it("prints the package version and exits successfully", async () => {
    const workdir = await createTmpWorkdir();
    const result = await runCli(["--version"], cliOptions(workdir));

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
    expect(result.stderr).toBe("");
  });
});
