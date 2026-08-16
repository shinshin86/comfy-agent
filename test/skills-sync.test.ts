import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";

const root = path.resolve(".");

const filesUnder = async (directory: string, prefix = ""): Promise<string[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path.join(directory, entry.name), relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
};

describe("generated agent skill mirror", () => {
  it("matches every Claude source skill byte-for-byte without extras", async () => {
    const source = path.join(root, ".claude", "skills");
    const mirror = path.join(root, ".agents", "skills");
    const sourceFiles = await filesUnder(source);
    const mirrorFiles = await filesUnder(mirror);
    expect(mirrorFiles).toEqual(sourceFiles);
    for (const relative of sourceFiles) {
      expect(await fs.readFile(path.join(mirror, relative))).toEqual(
        await fs.readFile(path.join(source, relative)),
      );
    }
  });
});
