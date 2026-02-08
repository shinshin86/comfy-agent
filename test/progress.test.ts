import { describe, expect, it } from "vitest";
import { normalizeProgressMessage } from "../src/api/progress.js";

describe("normalizeProgressMessage", () => {
  it("normalizes progress event", () => {
    const event = normalizeProgressMessage(
      {
        type: "progress",
        data: {
          prompt_id: "p1",
          node: "12",
          value: 5,
          max: 20,
        },
      },
      "p1",
    );

    expect(event?.kind).toBe("progress");
    expect(event?.node).toBe("12");
    expect(event?.percent).toBe(25);
  });

  it("filters events from another prompt", () => {
    const event = normalizeProgressMessage(
      {
        type: "executing",
        data: {
          prompt_id: "other",
          node: "8",
        },
      },
      "target",
    );

    expect(event).toBeNull();
  });

  it("normalizes execution_error", () => {
    const event = normalizeProgressMessage(
      {
        type: "execution_error",
        data: {
          prompt_id: "p1",
          node_id: "99",
          exception_message: "OOM",
        },
      },
      "p1",
    );

    expect(event?.kind).toBe("execution_error");
    expect(event?.node).toBe("99");
    expect(event?.message).toBe("OOM");
  });
});
