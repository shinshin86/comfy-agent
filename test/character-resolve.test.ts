import { describe, expect, it } from "vitest";
import { buildPromptFinal, resolveKitKey } from "../src/characters/resolve.js";
import { CharacterSchema } from "../src/characters/schema.js";
import type { Preset } from "../src/preset/schema.js";

const character = CharacterSchema.parse({
  version: 1,
  name: "miko",
  appearance: "dark bob hair",
  triggers: { default: "m1ko", portrait_kit: "portrait-token" },
  style: "anime",
  forms: [{ id: "default" }, { id: "casual", appearance: "dark bob hair, red hoodie" }],
  kits: {
    direct: { prompt_prefix: "close-up", note: "direct preset" },
    portrait_kit: {
      prompt_template: "{trigger}, {appearance}, {prompt}, {style}",
    },
  },
  created_at: "2026-08-16T00:00:00.000Z",
  updated_at: "2026-08-16T00:00:00.000Z",
});

const preset = (name: string, tags?: string[]): Preset => ({
  version: 1,
  name,
  workflow: `${name}.json`,
  tags,
});

describe("character prompt resolution", () => {
  it("resolves the preset name before the first matching kit tag", () => {
    expect(resolveKitKey(character, preset("direct", ["portrait_kit"]))).toBe("direct");
    expect(resolveKitKey(character, preset("other", ["unused", "portrait_kit"]))).toBe(
      "portrait_kit",
    );
    expect(resolveKitKey(character, preset("other", ["unused"]))).toBeUndefined();
  });

  it("expands kit overrides and form appearance", () => {
    expect(
      buildPromptFinal(character, {
        form: "casual",
        kitKey: "portrait_kit",
        promptInput: "looking at camera",
        mode: "replace",
      }),
    ).toBe("portrait-token, dark bob hair, red hoodie, looking at camera, anime");
    expect(
      buildPromptFinal(character, {
        kitKey: "direct",
        promptInput: "looking at camera",
        mode: "replace",
      }),
    ).toContain("close-up looking at camera");
  });

  it("compacts empty template elements without leaving commas", () => {
    const sparse = CharacterSchema.parse({
      ...character,
      appearance: "silver hair",
      triggers: { default: "" },
      style: "",
      kits: {},
    });
    expect(buildPromptFinal(sparse, { promptInput: "", mode: "replace" })).toBe("silver hair");
    expect(buildPromptFinal(sparse, { promptInput: "portrait", mode: "prefix" })).toBe(
      "silver hair, portrait",
    );
    expect(buildPromptFinal(sparse, { promptInput: "portrait", mode: "off" })).toBe("portrait");
  });
});
