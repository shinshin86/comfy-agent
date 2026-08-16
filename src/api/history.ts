import { extractOutputFiles } from "../output/provider.js";

export type ExecutionFailure = {
  kind: "error" | "interrupted";
  node_id?: string;
  node_type?: string;
  exception_type?: string;
  exception_message?: string;
  traceback_tail?: string[];
  executed?: string[];
  category: "oom" | "missing_file" | "unknown";
};

export type HistoryVerdict =
  | { state: "pending" }
  | { state: "success"; entry: Record<string, unknown> }
  | {
      state: "failed";
      entry: Record<string, unknown>;
      failure: ExecutionFailure;
    };

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
};

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const strings = value.map(asString).filter((item): item is string => item !== undefined);
  return strings.length > 0 ? strings : undefined;
};

const findStatusMessage = (
  messages: unknown,
  messageType: "execution_error" | "execution_interrupted",
): Record<string, unknown> | null => {
  if (!Array.isArray(messages)) return null;
  for (const message of messages) {
    if (!Array.isArray(message) || message[0] !== messageType) continue;
    const data = asRecord(message[1]);
    if (data) return data;
  }
  return null;
};

export const getHistoryEntry = (
  history: unknown,
  promptId: string,
): Record<string, unknown> | null => {
  const records = asRecord(history);
  if (!records || !Object.prototype.hasOwnProperty.call(records, promptId)) return null;
  return asRecord(records[promptId]);
};

export const classifyExecutionFailure = (
  exceptionType?: string,
  message?: string,
): ExecutionFailure["category"] => {
  const combined = `${exceptionType ?? ""}\n${message ?? ""}`;
  if (/outofmemory|out of memory|allocation on device/i.test(combined)) return "oom";
  if (/filenotfounderror|no such file/i.test(combined)) return "missing_file";
  return "unknown";
};

const buildFailure = (
  kind: ExecutionFailure["kind"],
  data: Record<string, unknown> | null,
): ExecutionFailure => {
  const nodeId = asString(data?.node_id);
  const nodeType = asString(data?.node_type);
  const exceptionType = asString(data?.exception_type);
  const exceptionMessage = asString(data?.exception_message);
  const traceback = asStringArray(data?.traceback);
  const executed = asStringArray(data?.executed);

  return {
    kind,
    ...(nodeId === undefined ? {} : { node_id: nodeId }),
    ...(nodeType === undefined ? {} : { node_type: nodeType }),
    ...(exceptionType === undefined ? {} : { exception_type: exceptionType }),
    ...(exceptionMessage === undefined ? {} : { exception_message: exceptionMessage }),
    ...(traceback === undefined ? {} : { traceback_tail: traceback.slice(-10) }),
    ...(executed === undefined ? {} : { executed }),
    category: classifyExecutionFailure(exceptionType, exceptionMessage),
  };
};

export const judgeHistory = (history: unknown, promptId: string): HistoryVerdict => {
  const entry = getHistoryEntry(history, promptId);
  if (!entry) return { state: "pending" };

  const hasStatus = Object.prototype.hasOwnProperty.call(entry, "status");
  const status = asRecord(entry.status);
  if (status?.status_str === "error") {
    const executionError = findStatusMessage(status.messages, "execution_error");
    const interruption = findStatusMessage(status.messages, "execution_interrupted");
    const kind = executionError ? "error" : interruption ? "interrupted" : "error";
    return {
      state: "failed",
      entry,
      failure: buildFailure(kind, executionError ?? interruption),
    };
  }

  if (status?.completed === true) return { state: "success", entry };
  if (!hasStatus && extractOutputFiles(entry).length > 0) return { state: "success", entry };
  return { state: "pending" };
};
