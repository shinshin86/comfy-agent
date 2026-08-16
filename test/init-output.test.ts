import { describe, expect, it } from "vitest";
import { buildInitPayload } from "../src/cli/init.js";
import { getWorkdirPath } from "../src/io/workdir.js";

describe("buildInitPayload", () => {
  it("marks an existing workdir as already initialized", () => {
    const workdir = getWorkdirPath(process.cwd(), "local");

    expect(buildInitPayload("local", { created: [], skipped: [workdir] })).toEqual({
      ok: true,
      scope: "local",
      workdir,
      created: [],
      skipped: [workdir],
      already_initialized: true,
    });
  });
});
