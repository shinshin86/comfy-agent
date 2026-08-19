import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyCharacter } from "../src/characters/inject.js";
import { CharacterSchema } from "../src/characters/schema.js";
import { buildPresetTemplate } from "../src/cli/import.js";
import { PresetSchema } from "../src/preset/schema.js";
import type { Preset } from "../src/preset/schema.js";

const character = CharacterSchema.parse({
  version: 1,
  name: "miko",
  appearance: "dark bob hair",
  triggers: { default: "m1ko", flux1: "flux-miko" },
  style: "anime",
  negative: "extra fingers",
  forms: [
    { id: "default" },
    { id: "casual", appearance: "dark bob hair, red hoodie", refs: ["refs/casual.png"] },
  ],
  references: [
    { file: "refs/front.png", role: "reference_image" },
    { file: "refs/side.png", role: "reference_image", forms: ["default"] },
  ],
  loras: [{ file: "miko.safetensors", strength: 0.8, base: "flux1" }],
  kits: { flux1: { negative: "text", prompt_prefix: "portrait" } },
  created_at: "2026-08-16T00:00:00.000Z",
  updated_at: "2026-08-16T00:00:00.000Z",
});

const promptPreset = (extra: Partial<Preset> = {}): Preset => ({
  version: 1,
  name: "portrait",
  workflow: "portrait.json",
  parameters: {
    text: {
      type: "string",
      role: "prompt",
      default: "at a cafe",
      target: { node_id: "1", input: "text" },
    },
    negative: {
      type: "string",
      role: "negative_prompt",
      default: "blurry",
      target: { node_id: "2", input: "text" },
    },
  },
  ...extra,
});

const loadLoraPreset = async (file: string) => {
  const workflow = JSON.parse(
    await fs.readFile(path.join(process.cwd(), "test", "helpers", "fixtures", file), "utf-8"),
  ) as Record<string, unknown>;
  return PresetSchema.parse({
    ...buildPresetTemplate("flux-lora", file, workflow, null),
    tags: ["flux1"],
  });
};

const emptyLoraPreset = await loadLoraPreset("lora-workflow-api.json");
const occupiedLoraPreset = await loadLoraPreset("lora-workflow-api-occupied.json");
const LORA_PARAM = "1_lora_name";
const LORA_STRENGTH_PARAM = "1_strength_model";

describe("character injection", () => {
  it("replaces, prefixes, or leaves the shared prompt target and appends negatives", () => {
    const replace = applyCharacter(
      promptPreset(),
      { text: "at a cafe", negative: "blurry" },
      {},
      new Set(),
      character,
    );
    expect(replace.prompt_input).toBe("at a cafe");
    expect(replace.prompt_final).toBe("m1ko dark bob hair, at a cafe, anime");
    expect(replace.params).toMatchObject({
      text: "m1ko dark bob hair, at a cafe, anime",
      negative: "blurry, extra fingers",
    });
    expect(replace.injected).toMatchObject({ prompt: "replace", negative: true });

    const prefix = applyCharacter(
      promptPreset(),
      { text: "at a cafe", negative: "" },
      {},
      new Set(),
      character,
      { characterPrompt: "prefix" },
    );
    expect(prefix.params.text).toBe("m1ko dark bob hair, at a cafe");

    const off = applyCharacter(
      promptPreset(),
      { text: "at a cafe", negative: "" },
      {},
      new Set(),
      character,
      { characterPrompt: "off" },
    );
    expect(off.params.text).toBe("at a cafe");
    expect(off.prompt_final).toBe("at a cafe");
  });

  it("injects only role: reference_image, respects form and explicit uploads", () => {
    const referencePreset = promptPreset({
      uploads: {
        reference: {
          kind: "image",
          cli_flag: "--reference",
          role: "reference_image",
          target: { node_id: "3", input: "image" },
        },
      },
    });
    const result = applyCharacter(
      referencePreset,
      { text: "", negative: "" },
      {},
      new Set(),
      character,
      { form: "casual", characterPath: "/character", characterRef: "0" },
    );
    expect(result.uploads.reference).toBe("/character/refs/casual.png");
    expect(result.injected.reference).toBe("refs/casual.png");

    const explicit = applyCharacter(
      referencePreset,
      { text: "", negative: "" },
      { reference: "/user/ref.png" },
      new Set(),
      character,
      { characterPath: "/character" },
    );
    expect(explicit.uploads.reference).toBe("/user/ref.png");
    expect(explicit.warnings.map(({ code }) => code)).toContain("CHARACTER_REF_NOT_USED");

    const inputOnly = promptPreset({
      uploads: {
        input: {
          kind: "image",
          cli_flag: "--input",
          role: "input_image",
          target: { node_id: "3", input: "image" },
        },
      },
    });
    expect(
      applyCharacter(inputOnly, { text: "", negative: "" }, {}, new Set(), character).uploads,
    ).toEqual({});
  });

  it("injects an empty LoRA slot and strength, but protects occupied slots", () => {
    const injected = applyCharacter(
      emptyLoraPreset,
      { [LORA_PARAM]: "", [LORA_STRENGTH_PARAM]: 1 },
      {},
      new Set(),
      character,
    );
    expect(injected.params).toMatchObject({
      [LORA_PARAM]: "miko.safetensors",
      [LORA_STRENGTH_PARAM]: 0.8,
    });

    const occupied = applyCharacter(
      occupiedLoraPreset,
      { [LORA_PARAM]: "ltx-2.3-22b-distilled-lora-384.safetensors", [LORA_STRENGTH_PARAM]: 1 },
      {},
      new Set(),
      character,
    );
    expect(occupied.params[LORA_PARAM]).toBe("ltx-2.3-22b-distilled-lora-384.safetensors");
    expect(occupied.warnings.map(({ code }) => code)).toContain("CHARACTER_LORA_SLOT_OCCUPIED");

    const overwritten = applyCharacter(
      occupiedLoraPreset,
      { [LORA_PARAM]: "ltx-2.3-22b-distilled-lora-384.safetensors", [LORA_STRENGTH_PARAM]: 1 },
      {},
      new Set(),
      character,
      { lora: "explicit.safetensors" },
    );
    expect(overwritten.params[LORA_PARAM]).toBe("explicit.safetensors");
  });

  it("supports --lora without a character and rejects multiple LoRA targets", () => {
    expect(
      applyCharacter(emptyLoraPreset, { [LORA_PARAM]: "" }, {}, new Set(), undefined, {
        lora: "solo.safetensors",
      }).params[LORA_PARAM],
    ).toBe("solo.safetensors");

    const ambiguous = structuredClone(emptyLoraPreset);
    ambiguous.parameters!.second_lora = {
      type: "string",
      role: "lora",
      default: "",
      target: { node_id: "21", input: "lora_name" },
    };
    expect(() => applyCharacter(ambiguous, {}, {}, new Set(), character)).toThrowError(
      expect.objectContaining({ code: "LORA_TARGET_AMBIGUOUS", exitCode: 2 }),
    );
  });

  it("warns on a LoRA base mismatch", () => {
    const result = applyCharacter(
      { ...emptyLoraPreset, tags: ["sdxl"] },
      { [LORA_PARAM]: "" },
      {},
      new Set(),
      character,
    );
    expect(result.warnings.map(({ code }) => code)).toContain("CHARACTER_LORA_BASE_MISMATCH");
  });

  it("blocks disallowed content tags before injection", () => {
    expect(() =>
      applyCharacter(
        promptPreset({ tags: ["nsfw"] }),
        { text: "portrait" },
        {},
        new Set(),
        character,
      ),
    ).toThrowError(expect.objectContaining({ code: "CHARACTER_CONTENT_BLOCKED", exitCode: 2 }));
  });

  it("returns a next action when the preset has no compatible role", () => {
    const result = applyCharacter(
      { version: 1, name: "plain", workflow: "plain.json" },
      {},
      {},
      new Set(),
      character,
    );
    expect(result.warnings.map(({ code }) => code)).toContain("CHARACTER_NOT_APPLICABLE");
    expect(result.next_action).toContain("import --force");
  });
});
