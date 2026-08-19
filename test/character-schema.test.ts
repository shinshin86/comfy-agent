import { describe, expect, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { CharacterSchema } from "../src/characters/schema.js";
import { createCharacter } from "../src/characters/store.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const timestamps = {
  created_at: "2026-08-16T00:00:00.000Z",
  updated_at: "2026-08-16T00:00:00.000Z",
};

describe("character schema", () => {
  it("applies safe defaults", () => {
    const character = CharacterSchema.parse({ version: 1, name: "miko", ...timestamps });

    expect(character).toMatchObject({
      appearance: "",
      triggers: { default: "" },
      prompt_template: "{trigger} {appearance}, {prompt}, {style}",
      forms: [{ id: "default" }],
      content_rating: { age_depicted: "unspecified", allow_nsfw: false },
      privacy: { export_refs: false, export_gallery: false },
    });
  });

  it("validates names and requires a default form", () => {
    expect(CharacterSchema.safeParse({ version: 1, name: "Miko", ...timestamps }).success).toBe(
      false,
    );
    expect(
      CharacterSchema.safeParse({
        version: 1,
        name: "miko",
        forms: [{ id: "casual" }],
        ...timestamps,
      }).success,
    ).toBe(false);
  });

  it("adds the default form when creating with only custom forms", async () => {
    const tmp = await createTmpWorkdir();
    const resolved = await createCharacter(
      { name: "miko", forms: [{ id: "casual", appearance: "casual outfit", refs: [] }] },
      { cwd: tmp.cwd, scope: "local" },
    );

    expect(resolved.character.forms.map(({ id }) => id)).toEqual(["default", "casual"]);
    await expect(fs.stat(path.join(resolved.path, "refs"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(resolved.path, "gallery"))).resolves.toBeDefined();
  });
});
