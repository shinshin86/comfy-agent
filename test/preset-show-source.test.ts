import { describe, expect, it } from "vitest";
import {
  resolvePresetShowSelectedSource,
  resolvePresetShowSource,
} from "../src/cli/preset-show.js";

describe("resolvePresetShowSource", () => {
  it("defaults to auto", () => {
    expect(resolvePresetShowSource()).toBe("auto");
  });

  it("accepts local/remote", () => {
    expect(resolvePresetShowSource("local")).toBe("local");
    expect(resolvePresetShowSource("remote")).toBe("remote");
  });

  it("throws on invalid source", () => {
    expect(() => resolvePresetShowSource("all")).toThrow();
  });
});

describe("resolvePresetShowSelectedSource", () => {
  it("selects local/remote for explicit source", () => {
    expect(resolvePresetShowSelectedSource("local", true, true)).toBe("local");
    expect(resolvePresetShowSelectedSource("remote", true, true)).toBe("remote");
  });

  it("auto resolves to single available source", () => {
    expect(resolvePresetShowSelectedSource("auto", true, false)).toBe("local");
    expect(resolvePresetShowSelectedSource("auto", false, true)).toBe("remote");
  });

  it("auto throws on ambiguous or missing", () => {
    expect(() => resolvePresetShowSelectedSource("auto", true, true)).toThrow();
    expect(() => resolvePresetShowSelectedSource("auto", false, false)).toThrow();
  });
});
