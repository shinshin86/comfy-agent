import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComfyClient } from "../src/api/client.js";

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  mockFetch.mockReset();
});

describe("ComfyClient", () => {
  it("getJson returns json", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    });

    const client = new ComfyClient("http://127.0.0.1:8188");
    const res = await client.getJson("/queue");
    expect(res).toEqual({ ok: true });
  });

  it("getJson throws API_ERROR with invalid_response kind on non-JSON body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html>login page</html>",
    });

    const client = new ComfyClient("http://127.0.0.1:8188");
    await expect(client.getJson("/queue", { retries: 0 })).rejects.toMatchObject({
      code: "API_ERROR",
      details: { status: 200, kind: "invalid_response" },
    });
  });

  it("postJson throws on non-ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const client = new ComfyClient("http://127.0.0.1:8188");
    await expect(client.postJson("/prompt", { prompt: {} })).rejects.toThrow();
  });

  it("returns PROMPT_REJECTED with ComfyUI validation details", async () => {
    const error = {
      type: "prompt_outputs_failed_validation",
      message: "model input is invalid",
    };
    const nodeErrors = {
      "9": { errors: [{ message: "Value not in list" }] },
    };
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error, node_errors: nodeErrors }),
    });

    const client = new ComfyClient("http://127.0.0.1:8188");
    await expect(client.postJson("/prompt", { prompt: {} })).rejects.toMatchObject({
      code: "PROMPT_REJECTED",
      exitCode: 3,
      message: "model input is invalid",
      details: { status: 400, error, node_errors: nodeErrors },
    });
  });

  it("keeps unstructured prompt 400 responses as API_ERROR", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: "bad request" }),
    });

    const client = new ComfyClient("http://127.0.0.1:8188");
    await expect(client.postJson("/prompt", { prompt: {} })).rejects.toMatchObject({
      code: "API_ERROR",
      exitCode: 3,
      details: { status: 400 },
    });
  });

  it("prompt sends client_id and prompt_id when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prompt_id: "p1" }),
    });

    const client = new ComfyClient("http://127.0.0.1:8188");
    await client.prompt(
      { "1": { class_type: "Test", inputs: {} } },
      {
        clientId: "c1",
        promptId: "p1",
      },
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8188/prompt",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          prompt: { "1": { class_type: "Test", inputs: {} } },
          client_id: "c1",
          prompt_id: "p1",
        }),
      }),
    );
  });
});
