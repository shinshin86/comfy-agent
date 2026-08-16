import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import http, { type IncomingMessage, type ServerResponse } from "node:http";

export type MockComfyOptions = {
  objectInfo?: Record<string, unknown>;
  historyDelayPolls?: number;
  executionError?: { node_id: string; exception_message: string };
  forgetHistory?: boolean;
  historyFixture?: "success" | "error" | "interrupted";
};

export type RequestLog = {
  method: string;
  path: string;
  url: string;
  body?: unknown;
};

type SubmittedPrompt = {
  polls: number;
  completed: boolean;
};

const FIXTURE_ROOT = new URL("./fixtures/", import.meta.url);
const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAACklEQVR42mP4DwABAQEAG7buVgAAAABJRU5ErkJggg==",
  "base64",
);

const readJsonFixture = async <T>(relativePath: string): Promise<T> => {
  const raw = await fs.readFile(new URL(relativePath, FIXTURE_ROOT), "utf-8");
  return JSON.parse(raw) as T;
};

export const loadHistoryFixture = async (
  kind: "success" | "error" | "interrupted",
  promptId: string,
) => {
  const fixture = await readJsonFixture<Record<string, Record<string, unknown>>>(
    `history/${kind}.json`,
  );
  const entry = structuredClone(Object.values(fixture)[0] ?? {});
  const prompt = entry.prompt;
  if (Array.isArray(prompt) && prompt.length > 1) {
    prompt[1] = promptId;
  }
  const status = entry.status;
  if (status && typeof status === "object") {
    const messages = (status as Record<string, unknown>).messages;
    if (Array.isArray(messages)) {
      for (const message of messages) {
        if (!Array.isArray(message) || !message[1] || typeof message[1] !== "object") continue;
        (message[1] as Record<string, unknown>).prompt_id = promptId;
      }
    }
  }
  return { [promptId]: entry };
};

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const sendJson = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
};

const sendNotFound = (response: ServerResponse) => {
  sendJson(response, 404, { error: "not found" });
};

const multipartFilename = (body: Buffer) => {
  const match = /filename="([^"]+)"/.exec(body.toString("utf-8"));
  return path.basename(match?.[1] ?? "upload.bin");
};

export const startMockComfy = async (options: MockComfyOptions = {}) => {
  const objectInfo =
    options.objectInfo ?? (await readJsonFixture<Record<string, unknown>>("object-info.min.json"));
  const historyDelayPolls = options.historyDelayPolls ?? 1;
  const requests: RequestLog[] = [];
  const submitted = new Map<string, SubmittedPrompt>();
  let promptNumber = 0;

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const method = request.method ?? "GET";
      const bodyBuffer = await readBody(request);
      let body: unknown;
      const contentType = request.headers["content-type"] ?? "";
      if (bodyBuffer.length > 0 && contentType.includes("application/json")) {
        body = JSON.parse(bodyBuffer.toString("utf-8")) as unknown;
      }
      requests.push({
        method,
        path: requestUrl.pathname,
        url: requestUrl.href,
        ...(body ? { body } : {}),
      });

      if (method === "GET" && requestUrl.pathname === "/queue") {
        const pending = options.forgetHistory
          ? []
          : [...submitted.entries()]
              .filter(([, state]) => !state.completed)
              .map(([promptId], index) => [index, promptId, {}, {}, []]);
        sendJson(response, 200, { queue_running: [], queue_pending: pending });
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/system_stats") {
        sendJson(response, 200, { system: { os: "mock" }, devices: [] });
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/object_info") {
        sendJson(response, 200, objectInfo);
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/prompt") {
        if (JSON.stringify(body).includes("__fail_validation")) {
          sendJson(response, 400, {
            error: { type: "prompt_outputs_failed_validation", message: "mock validation failed" },
            node_errors: { "9": { errors: [{ message: "mock validation failed" }] } },
          });
          return;
        }
        const promptBody =
          body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        const promptId =
          typeof promptBody.prompt_id === "string" ? promptBody.prompt_id : randomUUID();
        promptNumber += 1;
        submitted.set(promptId, { polls: 0, completed: false });
        sendJson(response, 200, { prompt_id: promptId, number: promptNumber, node_errors: {} });
        return;
      }

      if (method === "GET" && requestUrl.pathname.startsWith("/history/")) {
        const promptId = decodeURIComponent(requestUrl.pathname.slice("/history/".length));
        const state = submitted.get(promptId);
        if (options.forgetHistory || !state) {
          sendJson(response, 200, {});
          return;
        }
        state.polls += 1;
        if (state.polls <= historyDelayPolls) {
          sendJson(response, 200, {});
          return;
        }
        state.completed = true;
        const fixtureKind = options.executionError
          ? "error"
          : (options.historyFixture ?? "success");
        const history = await loadHistoryFixture(fixtureKind, promptId);
        if (options.executionError) {
          const entry = history[promptId] as Record<string, unknown>;
          const status = entry.status as Record<string, unknown>;
          status.messages = [
            [
              "execution_error",
              {
                prompt_id: promptId,
                node_id: options.executionError.node_id,
                exception_message: options.executionError.exception_message,
              },
            ],
          ];
        }
        sendJson(response, 200, history);
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/view") {
        response.writeHead(200, { "Content-Type": "image/png" });
        response.end(MINIMAL_PNG);
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/upload/image") {
        sendJson(response, 200, {
          name: multipartFilename(bodyBuffer),
          subfolder: "",
          type: "input",
        });
        return;
      }

      sendNotFound(response);
    } catch (error) {
      sendJson(response, 500, { error: String(error) });
    }
  });

  server.on("upgrade", (_request, socket) => {
    socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Mock ComfyUI did not receive a TCP port.");
  }

  let closed = false;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};
