import { describe, expect, it } from "vitest";
import { selectPromptTargets, summarizePromptFields } from "../src/jobs/summary.js";
import type { Preset } from "../src/preset/schema.js";

const preset = (parameters: NonNullable<Preset["parameters"]>): Preset => ({
  version: 1,
  name: "summary-test",
  workflow: "summary-test.json",
  parameters,
});

describe("job prompt summaries", () => {
  it("prefers prompt and negative aliases over roles", () => {
    const targetPreset = preset({
      role_prompt: {
        type: "string",
        role: "prompt",
        target: { node_id: "1", input: "text" },
      },
      aliased_prompt: {
        type: "string",
        aliases: ["prompt"],
        target: { node_id: "2", input: "text" },
      },
      role_negative: {
        type: "string",
        role: "negative_prompt",
        target: { node_id: "3", input: "text" },
      },
      aliased_negative: {
        type: "string",
        aliases: ["negative"],
        target: { node_id: "4", input: "text" },
      },
    });

    expect(selectPromptTargets(targetPreset)).toEqual({
      prompt: { param: "aliased_prompt", source: "alias" },
      negative: { param: "aliased_negative", source: "alias" },
    });
    expect(
      summarizePromptFields(targetPreset, {
        aliased_prompt: "portrait",
        aliased_negative: "blurry",
      }),
    ).toEqual({ prompt_input: "portrait", prompt_source: "alias", negative: "blurry" });
  });

  it("uses the first string role in preset order without sorting parameter names", () => {
    const targetPreset = preset({
      "10_text": {
        type: "string",
        role: "prompt",
        target: { node_id: "10", input: "text" },
      },
      "9_text": {
        type: "string",
        role: "prompt",
        target: { node_id: "9", input: "text" },
      },
      non_string: {
        type: "int",
        role: "negative_prompt",
        target: { node_id: "11", input: "value" },
      },
      negative_text: {
        type: "string",
        role: "negative_prompt",
        target: { node_id: "12", input: "text" },
      },
    });

    expect(selectPromptTargets(targetPreset)).toEqual({
      prompt: { param: "10_text", source: "role_fallback" },
      negative: { param: "negative_text", source: "role_fallback" },
    });
  });

  it("returns no targets when aliases and compatible roles are absent", () => {
    const targetPreset = preset({
      steps: {
        type: "int",
        role: "steps",
        target: { node_id: "1", input: "steps" },
      },
    });

    expect(selectPromptTargets(targetPreset)).toEqual({});
    expect(summarizePromptFields(targetPreset, { steps: 20 })).toEqual({});
  });
});
