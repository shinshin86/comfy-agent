import { describe, expect, it } from "vitest";
import {
  applyWorkflowsDirContext,
  collectUserdataJsonPaths,
  endpointUsesWorkflowsDir,
  normalizeUserdataDirPath,
  normalizeUserdataFilePath,
} from "../src/preset/userdata-path.js";

describe("normalizeUserdataFilePath", () => {
  it("normalizes userdata URL and strips query", () => {
    const value = normalizeUserdataFilePath(
      "https://example.test/api/userdata/workflows%2Fcat.json?token=abc",
    );
    expect(value).toBe("workflows/cat.json");
  });

  it("normalizes v2 prefix", () => {
    expect(normalizeUserdataFilePath("/v2/userdata/workflows/dog.json")).toBe("workflows/dog.json");
  });

  it("returns null for non-json", () => {
    expect(normalizeUserdataFilePath("/userdata/workflows/cat.png")).toBeNull();
  });
});

describe("normalizeUserdataDirPath", () => {
  it("normalizes and trims trailing slash", () => {
    expect(normalizeUserdataDirPath("/api/userdata/workflows/")).toBe("workflows");
  });
});

describe("collectUserdataJsonPaths", () => {
  it("collects from path and subfolder+filename structures", () => {
    const payload = {
      items: [
        { path: "workflows/a.json" },
        { subfolder: "workflows", filename: "b.json" },
        { directory: "/userdata/workflows", file: "c.json" },
        { path: "images/not-target.png" },
      ],
    };
    const out = new Set<string>();
    collectUserdataJsonPaths(payload, out);
    const values = Array.from(out).sort((a, b) => a.localeCompare(b));
    expect(values).toEqual(
      expect.arrayContaining(["workflows/a.json", "workflows/b.json", "workflows/c.json"]),
    );
  });

  it("collects json-like keys recursively", () => {
    const payload = {
      nested: {
        "workflows/key-derived.json": { value: 1 },
      },
    };
    const out = new Set<string>();
    collectUserdataJsonPaths(payload, out);
    expect(Array.from(out)).toContain("workflows/key-derived.json");
  });
});

describe("workflows dir helpers", () => {
  it("detects endpoints scoped to workflows dir", () => {
    expect(endpointUsesWorkflowsDir("/userdata?dir=workflows&recurse=true")).toBe(true);
    expect(endpointUsesWorkflowsDir("/v2/userdata?path=workflows")).toBe(true);
    expect(endpointUsesWorkflowsDir("/v2/userdata")).toBe(false);
  });

  it("applies workflows dir context only when needed", () => {
    expect(applyWorkflowsDirContext("cat.json", "/userdata?dir=workflows")).toBe(
      "workflows/cat.json",
    );
    expect(applyWorkflowsDirContext("workflows/cat.json", "/userdata?dir=workflows")).toBe(
      "workflows/cat.json",
    );
    expect(applyWorkflowsDirContext("cat.json", "/v2/userdata")).toBe("cat.json");
  });
});
