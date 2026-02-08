import { describe, expect, it } from "vitest";
import { AnalyzeModelOutputSchema } from "../src/analyze/schema.js";

describe("AnalyzeModelOutputSchema", () => {
  it("valid output", () => {
    const result = AnalyzeModelOutputSchema.safeParse({
      score: 0.8,
      summary: "A cat on a sofa.",
      tags: ["cat", "sofa"],
      missing: [],
      extra: [],
      reasons: ["Cat is visible"],
    });
    expect(result.success).toBe(true);
  });
});
