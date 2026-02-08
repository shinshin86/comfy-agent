import { describe, expect, it } from "vitest";
import { resolveListSource } from "../src/cli/list.js";

describe("resolveListSource", () => {
  it("defaults to all", () => {
    expect(resolveListSource()).toBe("all");
  });

  it("accepts local/remote/remote-catalog/all", () => {
    expect(resolveListSource("local")).toBe("local");
    expect(resolveListSource("remote")).toBe("remote");
    expect(resolveListSource("remote-catalog")).toBe("remote-catalog");
    expect(resolveListSource("all")).toBe("all");
  });

  it("throws on invalid source", () => {
    expect(() => resolveListSource("foo")).toThrow();
  });
});
