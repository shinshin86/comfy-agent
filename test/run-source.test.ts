import { describe, expect, it } from "vitest";
import { resolveRunSource, resolveSelectedRunSource, selectRunSource } from "../src/cli/run.js";

describe("resolveRunSource", () => {
  it("defaults to auto", () => {
    expect(resolveRunSource()).toBe("auto");
  });

  it("accepts local/remote/remote-catalog", () => {
    expect(resolveRunSource("local")).toBe("local");
    expect(resolveRunSource("remote")).toBe("remote");
    expect(resolveRunSource("remote-catalog")).toBe("remote-catalog");
  });

  it("throws on invalid source", () => {
    expect(() => resolveRunSource("all")).toThrow();
  });
});

describe("selectRunSource", () => {
  it("resolves explicit source", () => {
    expect(selectRunSource("local", true, true, true)).toBe("local");
    expect(selectRunSource("remote", true, true, true)).toBe("remote");
    expect(selectRunSource("remote-catalog", true, true, true)).toBe("remote-catalog");
  });

  it("resolves auto when only one source exists", () => {
    expect(selectRunSource("auto", true, false, false)).toBe("local");
    expect(selectRunSource("auto", false, true, false)).toBe("remote");
  });

  it("resolves auto with local-first priority", () => {
    expect(selectRunSource("auto", true, true, true)).toBe("local");
  });

  it("does not select remote-catalog in auto mode", () => {
    expect(() => selectRunSource("auto", false, false, true)).toThrow();
  });

  it("throws on missing", () => {
    expect(() => selectRunSource("auto", false, false, false)).toThrow();
  });
});

describe("resolveSelectedRunSource", () => {
  it("rethrows remote error for auto source when remote lookup failed", () => {
    const remoteError = new Error("remote failed");
    expect(() => resolveSelectedRunSource("auto", false, false, false, remoteError, null)).toThrow(
      remoteError,
    );
  });

  it("keeps preset-not-found for local-only lookup", () => {
    const remoteError = new Error("remote failed");
    expect(() =>
      resolveSelectedRunSource("local", false, false, false, remoteError, null),
    ).toThrow();
  });

  it("rethrows remote-catalog error for explicit remote-catalog source", () => {
    const remoteCatalogError = new Error("remote-catalog failed");
    expect(() =>
      resolveSelectedRunSource("remote-catalog", false, false, false, null, remoteCatalogError),
    ).toThrow(remoteCatalogError);
  });
});
