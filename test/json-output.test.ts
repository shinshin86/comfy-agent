import { describe, expect, it } from "vitest";
import { buildErrorPayload, CliError } from "../src/io/errors.js";

describe("json output shape", () => {
  it("error output", () => {
    const err = new CliError("MISSING_REQUIRED_PARAM", "prompt is required", 2, {
      param: "prompt",
    });

    const payload = buildErrorPayload(err.code, err.message, err.details ?? null);

    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("MISSING_REQUIRED_PARAM");
    const details = payload.error.details as { param?: string } | null;
    expect(details?.param).toBe("prompt");
  });
});
