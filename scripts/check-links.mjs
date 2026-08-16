import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readmePaths = ["README.md", "README.ja.md"];

const collectMarkdownFiles = async (relativeDir) => {
  const absoluteDir = path.join(repoRoot, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = path.posix.join(relativeDir, entry.name);
      if (entry.isDirectory()) return collectMarkdownFiles(relative);
      return entry.isFile() && entry.name.endsWith(".md") ? [relative] : [];
    }),
  );
  return nested.flat();
};

const docs = await collectMarkdownFiles("docs");
const recipes = await collectMarkdownFiles("recipes");
const files = [
  ...new Set([...readmePaths, ...docs, ...recipes, "scripts/colab/README.md"]),
].sort();

const markdownLinks = (markdown) => {
  const links = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
    for (const match of line.matchAll(pattern)) links.push(match[1].trim());
  }
  return links;
};

const relativeDestination = (raw) => {
  const destination = raw.startsWith("<")
    ? raw.slice(1, raw.indexOf(">") === -1 ? undefined : raw.indexOf(">"))
    : raw.split(/\s+/)[0];
  if (
    !destination ||
    destination.startsWith("#") ||
    destination.startsWith("/") ||
    destination.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(destination)
  ) {
    return null;
  }
  const withoutFragment = destination.split("#", 1)[0].split("?", 1)[0];
  return withoutFragment ? decodeURIComponent(withoutFragment) : null;
};

const countCodeBlocks = (markdown) => {
  let openMarker = null;
  let count = 0;
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (!match) continue;
    const marker = match[1][0];
    if (openMarker === null) {
      openMarker = marker;
      count += 1;
    } else if (openMarker === marker) {
      openMarker = null;
    }
  }
  return count;
};

const missing = [];
for (const source of files) {
  const markdown = await fs.readFile(path.join(repoRoot, source), "utf-8");
  for (const raw of markdownLinks(markdown)) {
    const destination = relativeDestination(raw);
    if (!destination) continue;
    const resolved = path.resolve(repoRoot, path.dirname(source), destination);
    try {
      await fs.access(resolved);
    } catch {
      missing.push({ source, destination });
    }
  }
}

const readmeMetrics = await Promise.all(
  readmePaths.map(async (source) => {
    const markdown = await fs.readFile(path.join(repoRoot, source), "utf-8");
    return {
      source,
      headings: (markdown.match(/^## /gm) ?? []).length,
      codeBlocks: countCodeBlocks(markdown),
    };
  }),
);
const [english, japanese] = readmeMetrics;
if (english.headings !== japanese.headings) {
  process.stderr.write(
    `WARNING: README heading counts differ (${english.source}: ${english.headings}, ${japanese.source}: ${japanese.headings}).\n`,
  );
}
if (english.codeBlocks !== japanese.codeBlocks) {
  process.stderr.write(
    `WARNING: README code-block counts differ (${english.source}: ${english.codeBlocks}, ${japanese.source}: ${japanese.codeBlocks}).\n`,
  );
}

if (missing.length > 0) {
  const details = missing
    .map(({ source, destination }) => `- ${source}: ${destination}`)
    .join("\n");
  throw new Error(`Missing relative Markdown link targets:\n${details}`);
}

process.stdout.write(`Documentation links OK: ${files.length} Markdown files checked.\n`);
