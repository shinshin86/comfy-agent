import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfigPath, readConfigSync, writeConfig } from "../src/io/config.js";
import { decideComfyBaseUrl } from "../src/utils/base-url.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "comfy-agent-config-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("config read/write", () => {
  it("writes and reads base_url round-trip", async () => {
    const saved = await writeConfig({ version: 1, base_url: "https://abc.trycloudflare.com" }, tmpDir);
    expect(saved).toBe(getConfigPath(tmpDir));
    const config = readConfigSync(tmpDir);
    expect(config).toEqual({ version: 1, base_url: "https://abc.trycloudflare.com" });
  });

  it("returns null for missing or broken config", async () => {
    expect(readConfigSync(tmpDir)).toBeNull();
    await fs.mkdir(path.dirname(getConfigPath(tmpDir)), { recursive: true });
    await fs.writeFile(getConfigPath(tmpDir), "{not yaml::", "utf-8");
    expect(readConfigSync(tmpDir)).toBeNull();
  });

  it("merges over an existing config file", async () => {
    await writeConfig({ version: 1, base_url: "http://one.example" }, tmpDir);
    await writeConfig({ version: 1, base_url: "http://two.example" }, tmpDir);
    expect(readConfigSync(tmpDir)?.base_url).toBe("http://two.example");
  });
});

describe("base url precedence with config", () => {
  const env = {} as NodeJS.ProcessEnv;

  it("uses config when no flag/env is present", () => {
    const decision = decideComfyBaseUrl({}, env, (scope) =>
      scope === "local" ? { base_url: "http://config.example" } : null,
    );
    expect(decision).toEqual({ source: "config", value: "http://config.example" });
  });

  it("prefers env over config", () => {
    const decision = decideComfyBaseUrl(
      {},
      { COMFY_AGENT_BASE_URL: "http://env.example" } as NodeJS.ProcessEnv,
      () => ({ base_url: "http://config.example" }),
    );
    expect(decision.source).toBe("COMFY_AGENT_BASE_URL");
  });

  it("checks global scope first when --global is set", () => {
    const decision = decideComfyBaseUrl({ global: true }, env, (scope) => ({
      base_url: scope === "global" ? "http://global.example" : "http://local.example",
    }));
    expect(decision.value).toBe("http://global.example");
  });

  it("falls back to the other scope when the preferred scope has no config", () => {
    const decision = decideComfyBaseUrl({}, env, (scope) =>
      scope === "global" ? { base_url: "http://global.example" } : null,
    );
    expect(decision).toEqual({ source: "config", value: "http://global.example" });
  });

  it("falls back to default when no config exists", () => {
    const decision = decideComfyBaseUrl({}, env, () => null);
    expect(decision).toEqual({ source: "default", value: "http://127.0.0.1:8188" });
  });
});
