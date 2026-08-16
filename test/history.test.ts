import { describe, expect, it } from "vitest";
import { classifyExecutionFailure, getHistoryEntry, judgeHistory } from "../src/api/history.js";
import { loadHistoryFixture } from "./helpers/mock-comfyui.js";

const PROMPT_ID = "history-test-prompt";

const messageData = (history: Record<string, Record<string, unknown>>) => {
  const status = history[PROMPT_ID]?.status as Record<string, unknown>;
  const messages = status.messages as unknown[][];
  return messages[0]?.[1] as Record<string, unknown>;
};

describe("history verdict", () => {
  it("returns pending for empty history and does not treat a bare entry as history", () => {
    expect(getHistoryEntry({}, PROMPT_ID)).toBeNull();
    expect(getHistoryEntry({ outputs: {} }, PROMPT_ID)).toBeNull();
    expect(judgeHistory({}, PROMPT_ID)).toEqual({ state: "pending" });
  });

  it("returns failed with execution_error details", async () => {
    const history = await loadHistoryFixture("error", PROMPT_ID);
    Object.assign(messageData(history), {
      node_type: "KSampler",
      exception_type: "RuntimeError",
      executed: ["1", "2"],
    });

    expect(judgeHistory(history, PROMPT_ID)).toMatchObject({
      state: "failed",
      failure: {
        kind: "error",
        node_id: "9",
        node_type: "KSampler",
        exception_type: "RuntimeError",
        exception_message: "mock execution failed",
        executed: ["1", "2"],
        category: "unknown",
      },
    });
  });

  it("returns failed kind=interrupted", async () => {
    const history = await loadHistoryFixture("interrupted", PROMPT_ID);
    expect(judgeHistory(history, PROMPT_ID)).toMatchObject({
      state: "failed",
      failure: { kind: "interrupted", node_id: "9", category: "unknown" },
    });
  });

  it("returns success when history is completed", async () => {
    const history = await loadHistoryFixture("success", PROMPT_ID);
    expect(judgeHistory(history, PROMPT_ID)).toMatchObject({
      state: "success",
      entry: { status: { completed: true } },
    });
  });

  it("supports legacy entries without status when they have outputs", async () => {
    const history = await loadHistoryFixture("success", PROMPT_ID);
    delete history[PROMPT_ID]?.status;
    expect(judgeHistory(history, PROMPT_ID).state).toBe("success");
  });

  it("classifies OOM and missing-file failures", () => {
    expect(classifyExecutionFailure("torch.OutOfMemoryError")).toBe("oom");
    expect(classifyExecutionFailure(undefined, "Allocation on device failed")).toBe("oom");
    expect(classifyExecutionFailure("FileNotFoundError")).toBe("missing_file");
    expect(classifyExecutionFailure(undefined, "No such file: model.safetensors")).toBe(
      "missing_file",
    );
    expect(classifyExecutionFailure("RuntimeError", "unexpected")).toBe("unknown");
  });

  it("truncates traceback to the last 10 lines", async () => {
    const history = await loadHistoryFixture("error", PROMPT_ID);
    const traceback = Array.from({ length: 12 }, (_, index) => `line-${index + 1}`);
    messageData(history).traceback = traceback;

    expect(judgeHistory(history, PROMPT_ID)).toMatchObject({
      state: "failed",
      failure: { traceback_tail: traceback.slice(-10) },
    });
  });
});
