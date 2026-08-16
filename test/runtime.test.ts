import { describe, expect, it } from "vitest";
import { checkRuntime, MIN_NODE_MAJOR, REQUIRED_GLOBALS } from "../src/utils/runtime.js";

const supportedGlobals = Object.fromEntries(
  REQUIRED_GLOBALS.map((name) => [name, () => undefined]),
) as Record<string, unknown>;

describe("checkRuntime", () => {
  it("passes on the current runtime", () => {
    const result = checkRuntime(process.version, globalThis as unknown as Record<string, unknown>);
    expect(result.ok).toBe(true);
  });

  it("reports a missing File global as unsupported", () => {
    const result = checkRuntime(`v${MIN_NODE_MAJOR}.0.0`, {
      ...supportedGlobals,
      File: undefined,
    });
    expect(result).toEqual({ ok: false, missing: ["File"] });
  });

  it("warns below Node.js major 22 when required globals exist", () => {
    const result = checkRuntime("v20.19.0", supportedGlobals);
    expect(result).toEqual({
      ok: true,
      warning: "Node.js v20.19.0 is below the supported version >=22.",
    });
  });

  it("does not warn at Node.js major 22 or newer", () => {
    expect(checkRuntime("v22.0.0", supportedGlobals)).toEqual({ ok: true, warning: null });
  });
});
