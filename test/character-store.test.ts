import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { readNotes } from "../src/characters/notes.js";
import {
  addCharacterNote,
  addForm,
  addLora,
  addReference,
  createCharacter,
  listCharacters,
  removeReference,
  readCharacterIndex,
  updateCharacter,
} from "../src/characters/store.js";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

describe("character store", () => {
  it("supports CRUD helpers and records appearance changes", async () => {
    const tmp = await createTmpWorkdir();
    await createCharacter(
      { name: "miko", appearance: "dark bob hair" },
      { cwd: tmp.cwd, scope: "local" },
    );
    await addForm(
      "miko",
      { id: "casual", appearance: "dark bob hair, casual hoodie" },
      { cwd: tmp.cwd },
    );
    await addLora(
      "miko",
      { file: "miko.safetensors", strength: 0.8, base: "flux1" },
      { cwd: tmp.cwd },
    );
    const updated = await updateCharacter(
      "miko",
      { appearance: "dark bob hair with red hairpin" },
      { cwd: tmp.cwd },
    );
    const noted = await addCharacterNote(
      "miko",
      { text: "Keep cfg low", kit: "z_image_turbo" },
      { cwd: tmp.cwd },
    );

    expect(
      (await listCharacters({ cwd: tmp.cwd, scope: "local" })).map(
        ({ character }) => character.name,
      ),
    ).toEqual(["miko"]);
    expect(updated.character.forms.map(({ id }) => id)).toEqual(["default", "casual"]);
    expect(updated.character.loras).toEqual([
      { file: "miko.safetensors", strength: 0.8, base: "flux1" },
    ]);
    expect(noted.character.kits.z_image_turbo?.note).toBe("Keep cfg low");
    expect(await readNotes(updated.path)).toContain(
      "dark bob hair → dark bob hair with red hairpin",
    );
    expect(await readNotes(updated.path)).toContain("## ");
    expect(await readNotes(updated.path)).toContain("(z_image_turbo)\n\nKeep cfg low");
    await fs.writeFile(
      path.join(updated.path, "index.jsonl"),
      `${JSON.stringify({
        job_id: "indexed-job",
        at: "2026-08-16T00:00:00.000Z",
        project: tmp.cwd,
        preset: "portrait",
        output_dir: path.join(tmp.cwd, "outputs", "portrait"),
        kind: "image",
      })}\n`,
      "utf-8",
    );
    expect(await readCharacterIndex(updated.path)).toHaveLength(1);
  });

  it("resolves local before global and supports explicit global scope", async () => {
    const tmp = await createTmpWorkdir();
    const cli = (args: string[]) =>
      runCli(args, {
        cwd: tmp.cwd,
        env: {
          HOME: tmp.home,
          USERPROFILE: tmp.home,
          COMFY_AGENT_TEST_ENTRY: "tsx",
        },
      });
    expect(
      (
        await cli([
          "character",
          "create",
          "shared",
          "--appearance",
          "global appearance",
          "--global",
          "--json",
        ])
      ).code,
    ).toBe(0);
    const globalFallback = await cli(["character", "show", "shared", "--json"]);
    expect(JSON.parse(globalFallback.stdout)).toMatchObject({
      scope: "global",
      character: { appearance: "global appearance" },
    });

    expect(
      (await cli(["character", "create", "shared", "--appearance", "local appearance", "--json"]))
        .code,
    ).toBe(0);
    const localPreferred = await cli(["character", "show", "shared", "--json"]);
    expect(JSON.parse(localPreferred.stdout)).toMatchObject({
      scope: "local",
      character: { appearance: "local appearance" },
    });
    const explicitGlobal = await cli(["character", "show", "shared", "--global", "--json"]);
    expect(JSON.parse(explicitGlobal.stdout)).toMatchObject({
      scope: "global",
      character: { appearance: "global appearance" },
    });
  });

  it("copies references with stable numbered names and removes them", async () => {
    const tmp = await createTmpWorkdir();
    await createCharacter({ name: "miko" }, { cwd: tmp.cwd, scope: "local" });
    const source = path.join(tmp.root, "front.png");
    await fs.writeFile(source, "image-data", "utf-8");

    await addReference("miko", { source, note: "front" }, { cwd: tmp.cwd });
    const added = await addReference("miko", { source }, { cwd: tmp.cwd });
    expect(added.character.references.map(({ file }) => file)).toEqual([
      "refs/front.png",
      "refs/front_2.png",
    ]);
    await expect(fs.readFile(path.join(added.path, "refs", "front.png"), "utf-8")).resolves.toBe(
      "image-data",
    );

    const removed = await removeReference("miko", "front.png", { cwd: tmp.cwd });
    expect(removed.character.references.map(({ file }) => file)).toEqual(["refs/front_2.png"]);
  });
});
