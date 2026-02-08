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
      json: async () => ({ ok: true }),
    });

    const client = new ComfyClient("http://127.0.0.1:8188");
    const res = await client.getJson("/queue");
    expect(res).toEqual({ ok: true });
  });

  it("postJson throws on non-ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const client = new ComfyClient("http://127.0.0.1:8188");
    await expect(client.postJson("/prompt", { prompt: {} })).rejects.toThrow();
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
