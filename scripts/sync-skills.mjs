import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repoRoot, ".claude", "skills");
const mirrorRoot = path.join(repoRoot, ".agents", "skills");

await fs.mkdir(mirrorRoot, { recursive: true });
const sourceEntries = (await fs.readdir(sourceRoot, { withFileTypes: true })).filter((entry) =>
  entry.isDirectory(),
);
const sourceNames = new Set(sourceEntries.map((entry) => entry.name));
for (const entry of await fs.readdir(mirrorRoot, { withFileTypes: true })) {
  if (!sourceNames.has(entry.name)) {
    await fs.rm(path.join(mirrorRoot, entry.name), { recursive: true, force: true });
  }
}
for (const entry of sourceEntries) {
  const source = path.join(sourceRoot, entry.name);
  const destination = path.join(mirrorRoot, entry.name);
  await fs.rm(destination, { recursive: true, force: true });
  await fs.cp(source, destination, { recursive: true });
}

process.stdout.write(`Synced ${sourceEntries.length} skill(s) into .agents/skills.\n`);
