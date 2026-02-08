import { randomUUID } from "node:crypto";

export type ProgressEventKind =
  | "channel_connected"
  | "channel_unavailable"
  | "channel_lost"
  | "progress"
  | "executing"
  | "executed"
  | "execution_start"
  | "execution_cached"
  | "execution_interrupted"
  | "execution_error";

export type ProgressEventRecord = {
  kind: ProgressEventKind;
  at: string;
  prompt_id?: string;
  node?: string;
  value?: number;
  max?: number;
  percent?: number;
  message?: string;
  raw_type?: string;
};

type WebSocketLike = {
  onopen: (() => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  close: () => void;
};

type WebSocketCtor = new (url: string) => WebSocketLike;

const nowIso = () => new Date().toISOString();

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const asNumber = (value: unknown): number | undefined => {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const toWsUrl = (baseUrl: string, clientId: string) => {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.searchParams.set("clientId", clientId);
  return url.toString();
};

const getWebSocketCtor = (): WebSocketCtor | null => {
  const ctor = (globalThis as { WebSocket?: unknown }).WebSocket;
  if (typeof ctor !== "function") return null;
  return ctor as WebSocketCtor;
};

const messageDataToText = (data: unknown): string | null => {
  if (typeof data === "string") return data;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return data.toString("utf-8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf-8");
  }
  return null;
};

const buildEvent = (
  kind: ProgressEventKind,
  values?: Partial<Omit<ProgressEventRecord, "kind" | "at">>,
): ProgressEventRecord => ({
  kind,
  at: nowIso(),
  ...(values ?? {}),
});

export const normalizeProgressMessage = (
  payload: unknown,
  targetPromptId: string,
): ProgressEventRecord | null => {
  const obj = asRecord(payload);
  if (!obj) return null;

  const rawType = asString(obj.type);
  if (!rawType) return null;

  const data = asRecord(obj.data) ?? {};
  const promptId = asString(data.prompt_id);

  if (promptId && promptId !== targetPromptId) {
    return null;
  }

  if (rawType === "progress") {
    const value = asNumber(data.value);
    const max = asNumber(data.max);
    const node = asString(data.node);
    const percent =
      value !== undefined && max !== undefined && max > 0
        ? Number(((value / max) * 100).toFixed(2))
        : undefined;
    return buildEvent("progress", {
      raw_type: rawType,
      prompt_id: promptId,
      node,
      value,
      max,
      percent,
    });
  }

  if (rawType === "executing") {
    return buildEvent("executing", {
      raw_type: rawType,
      prompt_id: promptId,
      node: asString(data.node),
    });
  }

  if (rawType === "executed") {
    return buildEvent("executed", {
      raw_type: rawType,
      prompt_id: promptId,
      node: asString(data.node),
    });
  }

  if (rawType === "execution_start") {
    return buildEvent("execution_start", {
      raw_type: rawType,
      prompt_id: promptId,
    });
  }

  if (rawType === "execution_cached") {
    return buildEvent("execution_cached", {
      raw_type: rawType,
      prompt_id: promptId,
      node: asString(data.node),
    });
  }

  if (rawType === "execution_interrupted") {
    return buildEvent("execution_interrupted", {
      raw_type: rawType,
      prompt_id: promptId,
    });
  }

  if (rawType === "execution_error") {
    return buildEvent("execution_error", {
      raw_type: rawType,
      prompt_id: promptId,
      node: asString(data.node_id) ?? asString(data.node),
      message: asString(data.exception_message) ?? asString(data.error),
    });
  }

  return null;
};

export class ComfyProgressChannel {
  private ws: WebSocketLike | null = null;

  private closedByUser = false;

  private lostEmitted = false;

  private targetPromptId: string;

  private clientId: string;

  constructor(
    private readonly baseUrl: string,
    private readonly onEvent: (event: ProgressEventRecord) => void,
    options?: { targetPromptId?: string; clientId?: string },
  ) {
    this.targetPromptId = options?.targetPromptId ?? "";
    this.clientId = options?.clientId ?? randomUUID();
  }

  setTargetPromptId(promptId: string) {
    this.targetPromptId = promptId;
  }

  getClientId() {
    return this.clientId;
  }

  start() {
    const WebSocketClass = getWebSocketCtor();
    if (!WebSocketClass) {
      this.onEvent(buildEvent("channel_unavailable"));
      return;
    }

    const wsUrl = toWsUrl(this.baseUrl, this.clientId);
    const ws = new WebSocketClass(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.onEvent(buildEvent("channel_connected"));
    };

    ws.onerror = () => {
      if (this.closedByUser || this.lostEmitted) return;
      this.lostEmitted = true;
      this.onEvent(buildEvent("channel_lost"));
    };

    ws.onclose = () => {
      if (this.closedByUser || this.lostEmitted) return;
      this.lostEmitted = true;
      this.onEvent(buildEvent("channel_lost"));
    };

    ws.onmessage = (event) => {
      const text = messageDataToText(event.data);
      if (!text) return;
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        return;
      }

      const normalized = normalizeProgressMessage(payload, this.targetPromptId);
      if (!normalized) return;
      this.onEvent(normalized);
    };
  }

  stop() {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }
}
