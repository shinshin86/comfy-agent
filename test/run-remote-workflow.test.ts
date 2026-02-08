import { describe, expect, it, vi } from "vitest";
import { CliError } from "../src/io/errors.js";
import { extractUserdataJsonCandidates, resolveRemoteWorkflow } from "../src/cli/run.js";

describe("extractUserdataJsonCandidates", () => {
  it("extracts only json paths that match template keywords", () => {
    const payload = {
      items: [
        { path: "workflows/sample_text_to_image_copy.json" },
        { path: "workflows/other.json" },
        { path: "images/not-json.png" },
      ],
    };

    const candidates = extractUserdataJsonCandidates(payload, "sample_text_to_image", {
      name: "sample_text_to_image",
    });

    expect(candidates).toEqual(["workflows/sample_text_to_image_copy.json"]);
  });
});

describe("resolveRemoteWorkflow userdata fallback", () => {
  it("loads workflow from /userdata when template endpoints do not have workflow json", async () => {
    const workflow = {
      "1": {
        inputs: { text: "cat" },
        class_type: "CLIPTextEncode",
      },
    };

    const getJson = vi.fn(async (urlPath: string) => {
      if (urlPath === "/userdata?dir=workflows&recurse=true") {
        return { items: [{ path: "workflows/sample_remote_template.json" }] };
      }
      if (urlPath === "/userdata?dir=workflows") {
        return { items: [{ path: "workflows/sample_remote_template.json" }] };
      }
      if (urlPath === "/userdata/workflows%2Fsample_remote_template.json") {
        return workflow;
      }
      throw new CliError("API_ERROR", "not found", 3, { status: 404 });
    });

    const resolved = await resolveRemoteWorkflow({ getJson }, "sample_remote_template", {
      name: "sample_remote_template",
    });

    expect(resolved).toEqual(workflow);
    expect(getJson).toHaveBeenCalledWith("/templates/sample_remote_template.json", {
      retries: 1,
      retryDelayMs: 300,
    });
    expect(getJson).toHaveBeenCalledWith("/api/workflow_templates/sample_remote_template.json", {
      retries: 1,
      retryDelayMs: 300,
    });
    expect(getJson).toHaveBeenCalledWith("/userdata?dir=workflows&recurse=true", {
      retries: 1,
      retryDelayMs: 300,
    });
    expect(getJson).toHaveBeenCalledWith("/userdata?dir=workflows", {
      retries: 1,
      retryDelayMs: 300,
    });
    expect(getJson).toHaveBeenCalledWith("/userdata/workflows%2Fsample_remote_template.json", {
      retries: 1,
      retryDelayMs: 300,
    });
  });

  it("reports tried userdata paths when resolution fails", async () => {
    const getJson = vi.fn(async () => {
      throw new CliError("API_ERROR", "not found", 3, { status: 404 });
    });

    await expect(
      resolveRemoteWorkflow({ getJson }, "sample_remote_template", {
        name: "sample_remote_template",
      }),
    ).rejects.toMatchObject({
      code: "REMOTE_WORKFLOW_NOT_FOUND",
      details: expect.objectContaining({
        tried_paths: expect.arrayContaining([
          "/templates/sample_remote_template.json",
          "/api/workflow_templates/sample_remote_template.json",
          "/userdata/workflows%2Fsample_remote_template.json",
          "/api/userdata/workflows%2Fsample_remote_template.json",
        ]),
      }),
    });
  });

  it("loads workflow from slash-preserved userdata path", async () => {
    const workflow = {
      "1": {
        inputs: { text: "cat" },
        class_type: "CLIPTextEncode",
      },
    };

    const getJson = vi.fn(async (urlPath: string) => {
      if (urlPath === "/userdata?dir=workflows&recurse=true") {
        return { items: [{ path: "workflows/sample_remote_template.json" }] };
      }
      if (urlPath === "/userdata?dir=workflows") {
        return { items: [{ path: "workflows/sample_remote_template.json" }] };
      }
      if (urlPath === "/userdata/workflows/sample_remote_template.json") {
        return workflow;
      }
      throw new CliError("API_ERROR", "not found", 3, { status: 404 });
    });

    const resolved = await resolveRemoteWorkflow({ getJson }, "sample_remote_template", {
      name: "sample_remote_template",
    });

    expect(resolved).toEqual(workflow);
  });

  it("resolves scoped userdata listing paths that are relative to workflows dir", async () => {
    const workflow = {
      "1": {
        inputs: { text: "cat" },
        class_type: "CLIPTextEncode",
      },
    };

    const getJson = vi.fn(async (urlPath: string) => {
      if (urlPath === "/userdata?dir=workflows&recurse=true") {
        return { items: [{ path: "saved_workflow.json" }] };
      }
      if (urlPath === "/userdata/workflows%2Fsaved_workflow.json") {
        return workflow;
      }
      throw new CliError("API_ERROR", "not found", 3, { status: 404 });
    });

    const resolved = await resolveRemoteWorkflow(
      { getJson },
      "saved_workflow",
      { name: "saved_workflow" },
      { preferUserdata: true },
    );

    expect(resolved).toEqual(workflow);
  });

  it("prefers userdata candidate when preferUserdata option is enabled", async () => {
    const workflow = {
      "1": {
        inputs: { text: "cat" },
        class_type: "CLIPTextEncode",
      },
    };

    const calls: string[] = [];
    const getJson = vi.fn(async (urlPath: string) => {
      calls.push(urlPath);
      if (urlPath === "/userdata?dir=workflows&recurse=true") {
        return { items: [{ path: "workflows/sample_remote_template.json" }] };
      }
      if (urlPath === "/userdata/workflows%2Fsample_remote_template.json") {
        return workflow;
      }
      throw new CliError("API_ERROR", "not found", 3, { status: 404 });
    });

    const resolved = await resolveRemoteWorkflow(
      { getJson },
      "sample_remote_template",
      { name: "sample_remote_template", workflow_path: "workflows/sample_remote_template.json" },
      { preferUserdata: true },
    );

    expect(resolved).toEqual(workflow);
    const firstWorkflowFetch = calls.find(
      (item) => item.startsWith("/userdata/") || item.startsWith("/templates/"),
    );
    expect(firstWorkflowFetch).toBe("/userdata/workflows%2Fsample_remote_template.json");
  });
});
