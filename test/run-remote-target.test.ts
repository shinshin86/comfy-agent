import { describe, expect, it, vi } from "vitest";
import type { ComfyClient } from "../src/api/client.js";
import { CliError } from "../src/io/errors.js";
import { tryLoadRemoteRunTarget } from "../src/cli/run/remote.js";

describe("tryLoadRemoteRunTarget", () => {
  it("falls back to remote templates when userdata listing fails", async () => {
    const workflow = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "cat" },
      },
    };

    const getJson = vi.fn(async (urlPath: string) => {
      if (
        urlPath.startsWith("/userdata") ||
        urlPath.startsWith("/v2/userdata") ||
        urlPath.startsWith("/api/userdata") ||
        urlPath.startsWith("/api/v2/userdata")
      ) {
        throw new CliError("API_ERROR", "not found", 3, { status: 404 });
      }
      if (urlPath === "/workflow_templates") {
        return { templates: [{ name: "demo_remote", workflow }] };
      }
      throw new CliError("API_ERROR", "not found", 3, { status: 404 });
    });

    const client = { getJson } as unknown as ComfyClient;
    const target = await tryLoadRemoteRunTarget("demo_remote", client);

    expect(target?.source).toBe("remote-catalog");
    expect(target?.preset.name).toBe("demo_remote");
    expect(target?.workflow).toEqual(workflow);
  });

  it("rethrows userdata error when template is not found", async () => {
    const getJson = vi.fn(async (urlPath: string) => {
      if (
        urlPath.startsWith("/userdata") ||
        urlPath.startsWith("/v2/userdata") ||
        urlPath.startsWith("/api/userdata") ||
        urlPath.startsWith("/api/v2/userdata")
      ) {
        throw new CliError("REMOTE_USERDATA_FETCH_FAILED", "userdata failed", 3);
      }
      if (
        urlPath === "/workflow_templates" ||
        urlPath === "/api/workflow_templates" ||
        urlPath === "/templates/index.json"
      ) {
        return { templates: [{ name: "other_template" }] };
      }
      throw new CliError("API_ERROR", "not found", 3, { status: 404 });
    });

    const client = { getJson } as unknown as ComfyClient;
    await expect(tryLoadRemoteRunTarget("missing_template", client)).rejects.toMatchObject({
      code: "REMOTE_USERDATA_FETCH_FAILED",
    });
  });
});
