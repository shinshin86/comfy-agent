import { describe, expect, it } from "vitest";
import { decideComfyBaseUrl, resolveComfyBaseUrl } from "../src/utils/base-url.js";

describe("base url resolver", () => {
  it("uses --base-url first", () => {
    const decision = decideComfyBaseUrl({ baseUrl: "http://cli.example" }, {
      COMFY_AGENT_BASE_URL: "http://env.example",
    } as NodeJS.ProcessEnv);
    expect(decision).toEqual({ source: "--base-url", value: "http://cli.example" });
  });

  it("uses env when --base-url is not provided", () => {
    const decision = decideComfyBaseUrl({}, {
      COMFY_AGENT_BASE_URL: "http://env.example",
    } as NodeJS.ProcessEnv);
    expect(decision).toEqual({ source: "COMFY_AGENT_BASE_URL", value: "http://env.example" });
  });

  it("falls back to default", () => {
    const value = resolveComfyBaseUrl({}, {} as NodeJS.ProcessEnv);
    expect(value).toBe("http://127.0.0.1:8188");
  });
});
