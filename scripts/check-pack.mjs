import path from "node:path";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: repoRoot,
  encoding: "utf-8",
  maxBuffer: 16 * 1024 * 1024,
});
if (packed.status !== 0) {
  throw new Error(`npm pack --dry-run failed:\n${packed.stderr || packed.stdout}`);
}
const packageInfo = JSON.parse(packed.stdout)[0];
const files = packageInfo.files.map((entry) => entry.path);
const fileSet = new Set(files);

const required = [
  "AGENTS.md",
  "docs/agent-playbook.md",
  "docs/cli-reference.md",
  "docs/minimax-h3-prompting.md",
  "recipes/music-video/RECIPE.md",
  "scripts/colab/catalog.yaml",
  "scripts/colab/02_start_comfyui.py",
  ".claude/skills/comfy-agent/SKILL.md",
  ".claude/skills/minimax-h3-prompting/SKILL.md",
];
const colabRoot = path.join(repoRoot, "scripts", "colab");
for (const entry of await fs.readdir(colabRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const relative = `scripts/colab/${entry.name}/01_setup.py`;
  try {
    await fs.access(path.join(repoRoot, relative));
    required.push(relative);
  } catch {
    // Directories without a setup script are shared resources, not kits.
  }
}
const missing = required.filter((file) => !fileSet.has(file));
if (missing.length > 0) throw new Error(`Required package files are missing: ${missing.join(", ")}`);

const forbidden = files.filter(
  (file) =>
    file === "scripts/e2e-smoke.sh" ||
    file.startsWith("tmp/") ||
    /(^|\/)TASKS_/.test(file) ||
    /(^|\/)\.comfy-agent\//.test(file),
);
if (forbidden.length > 0) throw new Error(`Forbidden package files found: ${forbidden.join(", ")}`);

const localPathPattern = /\/Users\/|\/home\/[a-z]/;
const leaks = [];
for (const file of files) {
  const absolute = path.join(repoRoot, file);
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) continue;
  const content = await fs.readFile(absolute, "utf-8");
  if (localPathPattern.test(content)) leaks.push(file);
}
if (leaks.length > 0) throw new Error(`Local filesystem paths found in package files: ${leaks.join(", ")}`);

const unpackedSize = Number(packageInfo.unpackedSize ?? 0);
const warning = unpackedSize > 5 * 1024 * 1024 ? " WARNING: unpacked size exceeds 5 MiB." : "";
process.stdout.write(
  `Package contents OK: ${packageInfo.totalFiles ?? files.length} files, ${packageInfo.size} bytes packed, ${unpackedSize} bytes unpacked.${warning}\n`,
);
