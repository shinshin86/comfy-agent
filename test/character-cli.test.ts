import { describe, expect, it } from "vitest";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

describe("character CLI", () => {
  it("creates and shows JSON, and requires --force for removal", async () => {
    const tmp = await createTmpWorkdir();
    const cli = (args: string[]) =>
      runCli(args, {
        cwd: tmp.cwd,
        env: {
          HOME: tmp.home,
          USERPROFILE: tmp.home,
          COMFY_AGENT_TEST_ENTRY: "tsx",
        },
      });

    const created = await cli([
      "character",
      "create",
      "miko",
      "--display-name",
      "Miko",
      "--appearance",
      "dark bob hair",
      "--json",
    ]);
    expect(created.code, created.stderr).toBe(0);
    expect(JSON.parse(created.stdout)).toMatchObject({
      ok: true,
      character: { name: "miko", display_name: "Miko", appearance: "dark bob hair" },
      scope: "local",
    });

    const shown = await cli(["character", "show", "miko", "--json"]);
    expect(shown.code, shown.stderr).toBe(0);
    expect(JSON.parse(shown.stdout)).toMatchObject({
      ok: true,
      character: { name: "miko", appearance: "dark bob hair" },
      scope: "local",
    });

    const refused = await cli(["character", "rm", "miko", "--json"]);
    expect(refused.code).toBe(2);
    expect(JSON.parse(refused.stdout)).toMatchObject({
      ok: false,
      error: { code: "INVALID_USAGE" },
    });

    const removed = await cli(["character", "rm", "miko", "--force", "--json"]);
    expect(removed.code, removed.stderr).toBe(0);
    expect(JSON.parse(removed.stdout)).toMatchObject({ ok: true, removed: true });
  });
});
