import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPresetTemplate } from "../src/cli/import.js";
import { PresetSchema } from "../src/preset/schema.js";

const fixturesDir = path.join(process.cwd(), "test", "helpers", "fixtures");

const cases = [
  ["lora-workflow-api.json", ""],
  ["lora-workflow-api-occupied.json", "ltx-2.3-22b-distilled-lora-384.safetensors"],
] as const;

describe("LoRA parameter role inference", () => {
  it.each(cases)("infers roles and preserves defaults from %s", async (file, loraDefault) => {
    const workflow = JSON.parse(await fs.readFile(path.join(fixturesDir, file), "utf-8")) as Record<
      string,
      unknown
    >;
    const preset = PresetSchema.parse(buildPresetTemplate("lora", file, workflow, null));

    expect(preset.parameters?.["1_lora_name"]).toMatchObject({
      role: "lora",
      description: "LoRA file name (models/loras)",
      default: loraDefault,
    });
    expect(preset.parameters?.["1_strength_model"]).toMatchObject({
      role: "lora_strength",
      description: "LoRA strength for the model",
      default: 1,
    });
    expect(preset.parameters?.["1_strength_clip"]).toMatchObject({
      role: "advanced",
      default: 1,
    });
    expect(
      Object.values(preset.parameters ?? {}).flatMap((parameter) => parameter.aliases ?? []),
    ).toEqual([]);
  });
});
