import { describe, expect, it, vi } from "vitest";
import { CliError } from "../src/io/errors.js";
import {
  ALL_REMOTE_TEMPLATE_ENDPOINTS,
  REMOTE_USERDATA_LIST_ENDPOINTS,
  REMOTE_TEMPLATE_ENDPOINTS,
  extractRemoteUserdataWorkflowNames,
  extractRemoteTemplates,
  fetchRemoteTemplateByName,
  extractRemoteTemplateNames,
  fetchRemoteTemplateNames,
  fetchRemoteUserdataWorkflows,
  extractRemoteUserdataWorkflows,
  fetchRemoteUserdataWorkflowNames,
} from "../src/preset/remote.js";

describe("extractRemoteTemplateNames", () => {
  it("extracts names from object map", () => {
    const payload = {
      template_a: { workflow: { nodes: {} } },
      template_b: { workflow: { nodes: {} } },
    };

    expect(extractRemoteTemplateNames(payload)).toEqual(["template_a", "template_b"]);
  });

  it("extracts names from array payload", () => {
    const payload = {
      templates: [{ name: "alpha" }, { template_name: "beta" }, "gamma"],
    };

    expect(extractRemoteTemplateNames(payload)).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("extractRemoteTemplates", () => {
  it("keeps template raw payload", () => {
    const payload = {
      templates: [{ name: "alpha", workflow: "wf_a" }],
    };
    const templates = extractRemoteTemplates(payload);
    expect(templates).toHaveLength(1);
    expect(templates[0]?.name).toBe("alpha");
    expect((templates[0]?.raw as { workflow?: string })?.workflow).toBe("wf_a");
  });

  it("extracts templates from /templates/index.json style payload", () => {
    const payload = [
      {
        title: "Getting Started",
        type: "builtin",
        templates: [{ name: "text2img_starter" }, { name: "img2img_starter" }],
      },
    ];
    const templates = extractRemoteTemplates(payload);
    expect(templates.map((t) => t.name)).toEqual(["img2img_starter", "text2img_starter"]);
  });
});

describe("fetchRemoteTemplateNames", () => {
  it("merges templates from multiple endpoints", async () => {
    const getJson = vi
      .fn()
      .mockRejectedValueOnce(new CliError("API_ERROR", "not found", 3, { status: 404 }))
      .mockResolvedValueOnce({ templates: [{ name: "demo" }] })
      .mockResolvedValueOnce({
        templates: [{ name: "text2img_starter" }],
      });

    const result = await fetchRemoteTemplateNames({ getJson });

    expect(getJson).toHaveBeenNthCalledWith(1, REMOTE_TEMPLATE_ENDPOINTS[0], {
      retries: 1,
      retryDelayMs: 300,
    });
    expect(getJson).toHaveBeenNthCalledWith(2, REMOTE_TEMPLATE_ENDPOINTS[1], {
      retries: 1,
      retryDelayMs: 300,
    });
    expect(getJson).toHaveBeenNthCalledWith(3, ALL_REMOTE_TEMPLATE_ENDPOINTS[2], {
      retries: 1,
      retryDelayMs: 300,
    });
    expect(result).toEqual({
      names: ["demo", "text2img_starter"],
      endpoint: `${REMOTE_TEMPLATE_ENDPOINTS[1]}, ${ALL_REMOTE_TEMPLATE_ENDPOINTS[2]}`,
    });
  });

  it("tries both endpoints even when first fails with non-404", async () => {
    const getJson = vi
      .fn()
      .mockRejectedValueOnce(new CliError("API_ERROR", "server error", 3, { status: 500 }))
      .mockResolvedValueOnce({ templates: [{ name: "demo2" }] })
      .mockRejectedValueOnce(new CliError("API_ERROR", "not found", 3, { status: 404 }));

    const result = await fetchRemoteTemplateNames({ getJson });
    expect(result).toEqual({ names: ["demo2"], endpoint: REMOTE_TEMPLATE_ENDPOINTS[1] });
  });

  it("throws REMOTE_TEMPLATE_FETCH_FAILED when all endpoints fail", async () => {
    const getJson = vi
      .fn()
      .mockRejectedValueOnce(new CliError("API_ERROR", "first failed", 3, { status: 404 }))
      .mockRejectedValueOnce(new CliError("API_ERROR", "second failed", 3, { status: 404 }))
      .mockRejectedValueOnce(new CliError("API_ERROR", "third failed", 3, { status: 404 }));

    await expect(fetchRemoteTemplateNames({ getJson })).rejects.toMatchObject({
      code: "REMOTE_TEMPLATE_FETCH_FAILED",
    });
  });
});

describe("fetchRemoteTemplateByName", () => {
  it("returns matched template", async () => {
    const getJson = vi
      .fn()
      .mockResolvedValueOnce({ templates: [{ name: "demo", workflow: "wf_demo" }] })
      .mockRejectedValueOnce(new CliError("API_ERROR", "404", 3, { status: 404 }))
      .mockRejectedValueOnce(new CliError("API_ERROR", "404", 3, { status: 404 }));
    const result = await fetchRemoteTemplateByName({ getJson }, "demo");
    expect(result.endpoint).toBe(REMOTE_TEMPLATE_ENDPOINTS[0]);
    expect(result.template?.name).toBe("demo");
  });
});

describe("extractRemoteUserdataWorkflowNames", () => {
  it("extracts workflow names from userdata payload", () => {
    const payload = {
      items: [
        { path: "workflows/alpha.json" },
        { filename: "workflows/beta.json" },
        { path: "workflows/.index.json" },
        { path: "images/sample.png" },
      ],
    };

    expect(extractRemoteUserdataWorkflowNames(payload)).toEqual(["alpha", "beta"]);
  });

  it("extracts workflow names from subfolder + filename payload", () => {
    const payload = {
      items: [{ subfolder: "workflows", filename: "gamma.json" }],
    };

    expect(extractRemoteUserdataWorkflowNames(payload)).toEqual(["gamma"]);
  });

  it("supports japanese workflow filenames", () => {
    const payload = {
      items: [{ path: "workflows/ねこ 生成 (最終).json" }],
    };

    expect(extractRemoteUserdataWorkflowNames(payload)).toEqual(["ねこ 生成 (最終)"]);
  });
});

describe("extractRemoteUserdataWorkflows", () => {
  it("prefers workflows/ path over basename when names collide", () => {
    const payload = {
      items: [
        { name: "sample_text_to_image_copy.json" },
        { path: "workflows/sample_text_to_image_copy.json" },
      ],
    };

    expect(extractRemoteUserdataWorkflows(payload)).toEqual([
      {
        name: "sample_text_to_image_copy",
        file: "workflows/sample_text_to_image_copy.json",
      },
    ]);
  });
});

describe("fetchRemoteUserdataWorkflowNames", () => {
  it("merges names from userdata endpoints", async () => {
    const getJson = vi.fn(async (endpoint: string) => {
      if (endpoint === "/userdata?dir=workflows&recurse=true") {
        return { items: [{ path: "workflows/alpha.json" }] };
      }
      if (endpoint === "/v2/userdata?path=workflows") {
        return { items: [{ path: "workflows/beta.json" }] };
      }
      throw new CliError("API_ERROR", "404", 3, { status: 404 });
    });

    const result = await fetchRemoteUserdataWorkflowNames({ getJson });
    expect(result).toEqual({
      names: ["alpha", "beta"],
      endpoint: `${REMOTE_USERDATA_LIST_ENDPOINTS[0]}, ${REMOTE_USERDATA_LIST_ENDPOINTS[2]}`,
      endpoints: [REMOTE_USERDATA_LIST_ENDPOINTS[0], REMOTE_USERDATA_LIST_ENDPOINTS[2]],
    });
  });

  it("throws REMOTE_USERDATA_FETCH_FAILED when all userdata endpoints fail", async () => {
    const getJson = vi.fn(async () => {
      throw new CliError("API_ERROR", "failed", 3, { status: 404 });
    });

    await expect(fetchRemoteUserdataWorkflowNames({ getJson })).rejects.toMatchObject({
      code: "REMOTE_USERDATA_FETCH_FAILED",
    });
  });
});

describe("fetchRemoteUserdataWorkflows", () => {
  it("returns workflow name and file mapping", async () => {
    const getJson = vi.fn(async (endpoint: string) => {
      if (endpoint === "/userdata?dir=workflows&recurse=true") {
        return { items: [{ path: "workflows/alpha.json" }] };
      }
      throw new CliError("API_ERROR", "404", 3, { status: 404 });
    });

    const result = await fetchRemoteUserdataWorkflows({ getJson });
    expect(result.workflows).toEqual([{ name: "alpha", file: "workflows/alpha.json" }]);
    expect(result.endpoints).toEqual([REMOTE_USERDATA_LIST_ENDPOINTS[0]]);
  });

  it("adds workflows/ prefix when scoped endpoint returns relative file path", async () => {
    const getJson = vi.fn(async (endpoint: string) => {
      if (endpoint === "/userdata?dir=workflows&recurse=true") {
        return { items: [{ path: "alpha.json" }] };
      }
      throw new CliError("API_ERROR", "404", 3, { status: 404 });
    });

    const result = await fetchRemoteUserdataWorkflows({ getJson });
    expect(result.workflows).toEqual([{ name: "alpha", file: "workflows/alpha.json" }]);
  });

  it("prefers better file path across endpoints when workflow names collide", async () => {
    const getJson = vi.fn(async (endpoint: string) => {
      if (endpoint === "/userdata?dir=workflows&recurse=true") {
        return { items: [{ path: "alpha.json" }] };
      }
      if (endpoint === "/v2/userdata") {
        return { items: [{ path: "workflows/alpha.json" }] };
      }
      throw new CliError("API_ERROR", "404", 3, { status: 404 });
    });

    const result = await fetchRemoteUserdataWorkflows({ getJson });
    expect(result.workflows).toEqual([{ name: "alpha", file: "workflows/alpha.json" }]);
  });
});
