import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import YAML from "yaml";
import { CliError } from "../io/errors.js";
import { resolvePackageRoot } from "../io/resources.js";
import { t } from "../i18n/index.js";
import { getPackageVersion } from "../utils/version.js";
import { listBundledSkills, type BundledSkill } from "./catalog.js";
import { collectLinkedResources, rewriteLinks } from "./rewrite.js";
import { resolveSkillTarget, type ResolveSkillTargetOptions } from "./targets.js";

const INSTALL_MARKER = ".comfy-agent-skill.json";
const MAX_REFERENCE_DEPTH = 3;

type Marker = {
  source: string;
  package_version: string;
  installed_at: string;
  sha256: string;
};

export type SkillInstallStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "overwritten"
  | "would_create"
  | "would_update";

export type InstallSkillsOptions = ResolveSkillTargetOptions & {
  agent: string;
  force?: boolean;
  dryRun?: boolean;
  now?: () => Date;
};

type PreparedSkill = {
  skill: BundledSkill;
  files: Map<string, string>;
  marker: Omit<Marker, "installed_at">;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const referenceNames = (relativePaths: string[]) => {
  const byBase = new Map<string, string[]>();
  for (const relative of relativePaths) {
    const base = path.posix.basename(relative);
    byBase.set(base, [...(byBase.get(base) ?? []), relative]);
  }
  const result = new Map<string, string>();
  for (const relative of [...relativePaths].sort()) {
    const base = path.posix.basename(relative);
    const collisions = byBase.get(base) ?? [];
    if (collisions.length === 1) {
      result.set(relative, base);
      continue;
    }
    const directory = path.posix
      .dirname(relative)
      .split("/")
      .slice(1)
      .join("__");
    result.set(relative, `${directory || relative.split("/")[0]}__${base}`);
  }
  return result;
};

const crawlReferences = async (skill: BundledSkill, packageRoot: string) => {
  const found = new Map<string, { source: string; markdown: string; depth: number }>();
  const pending: Array<{ source: string; markdown: string; depth: number }> = [
    { source: skill.skillFile, markdown: skill.markdown, depth: 0 },
  ];
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (current.depth >= MAX_REFERENCE_DEPTH) continue;
    const links = collectLinkedResources(current.markdown, {
      sourcePath: current.source,
      packageRoot,
    });
    for (const link of links) {
      if (found.has(link.packageRelative)) continue;
      const markdown = await fs.readFile(link.source, "utf-8");
      const depth = current.depth + 1;
      found.set(link.packageRelative, { source: link.source, markdown, depth });
      pending.push({ source: link.source, markdown, depth });
    }
  }
  return found;
};

const installedNotice = (version: string) =>
  `> Installed by \`comfy-agent skill install\` (v${version}). Live copy of the policy: \`comfy-agent playbook\`. Re-run the install command to refresh.`;

const installedFrontmatter = (skill: BundledSkill) => {
  const yaml = YAML.stringify({ name: skill.name, description: skill.description }).trimEnd();
  return `---\n${yaml}\n---`;
};

const prepareSkill = async (skill: BundledSkill): Promise<PreparedSkill> => {
  const packageRoot = resolvePackageRoot();
  const packageVersion = getPackageVersion();
  const references = await crawlReferences(skill, packageRoot);
  const names = referenceNames([...references.keys()]);
  const rewrittenSkill = rewriteLinks(skill.body, {
    sourcePath: skill.skillFile,
    packageRoot,
    outputPath: "SKILL.md",
    referenceMap: names,
    unmappedReferencesToGitHub: true,
  }).content;
  const skillMarkdown = `${installedFrontmatter(skill)}\n\n${installedNotice(packageVersion)}\n\n${rewrittenSkill.trimStart()}`;
  const files = new Map<string, string>([["SKILL.md", skillMarkdown]]);
  for (const [relative, reference] of [...references.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const referenceName = names.get(relative)!;
    const rewritten = rewriteLinks(reference.markdown, {
      sourcePath: reference.source,
      packageRoot,
      outputPath: path.posix.join("references", referenceName),
      referenceMap: names,
      unmappedReferencesToGitHub: true,
    }).content;
    files.set(path.posix.join("references", referenceName), rewritten);
  }
  return {
    skill,
    files,
    marker: {
      source: path.posix.join(".claude/skills", skill.sourceName),
      package_version: packageVersion,
      sha256: sha256(skillMarkdown),
    },
  };
};

const pathExists = async (target: string) =>
  fs
    .access(target)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });

const readMarker = async (targetDir: string): Promise<Marker | null> => {
  try {
    return JSON.parse(await fs.readFile(path.join(targetDir, INSTALL_MARKER), "utf-8")) as Marker;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
};

const managedFilesMatch = async (targetDir: string, prepared: PreparedSkill, marker: Marker) => {
  if (
    marker.source !== prepared.marker.source ||
    marker.package_version !== prepared.marker.package_version ||
    marker.sha256 !== prepared.marker.sha256
  ) {
    return false;
  }
  for (const [relative, expected] of prepared.files) {
    try {
      if ((await fs.readFile(path.join(targetDir, relative), "utf-8")) !== expected) return false;
    } catch {
      return false;
    }
  }
  return true;
};

const targetExistsError = (target: string) =>
  new CliError("FILE_EXISTS", t("import.file_exists", { path: target }), 2, {
    path: target,
    kind: "skill",
    hint: "--force",
  });

const writePreparedSkill = async (
  target: string,
  prepared: PreparedSkill,
  installedAt: string,
) => {
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  for (const [relative, content] of prepared.files) {
    const destination = path.join(target, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content, "utf-8");
  }
  const marker: Marker = { ...prepared.marker, installed_at: installedAt };
  await fs.writeFile(path.join(target, INSTALL_MARKER), `${JSON.stringify(marker, null, 2)}\n`, "utf-8");
};

export const installSkills = async (names: string[], options: InstallSkillsOptions) => {
  const target = resolveSkillTarget(options.agent, options);
  const available = await listBundledSkills();
  const requested = names.length > 0 ? [...new Set(names)] : available.map(({ name }) => name);
  const selected = requested.map((name) => {
    const skill = available.find((candidate) => candidate.name === name);
    if (skill) return skill;
    throw new CliError("SKILL_NOT_FOUND", t("skill.not_found", { name }), 2, {
      name,
      available: available.map((candidate) => candidate.name),
    });
  });

  const installed = [];
  for (const skill of selected) {
    const prepared = await prepareSkill(skill);
    const skillTarget = path.join(target.targetDir, skill.name);
    try {
      const exists = await pathExists(skillTarget);
      const marker = exists ? await readMarker(skillTarget) : null;
      const unchanged = marker ? await managedFilesMatch(skillTarget, prepared, marker) : false;
      let status: SkillInstallStatus;
      if (!exists) status = options.dryRun ? "would_create" : "created";
      else if (unchanged) status = "unchanged";
      else if (!marker && !options.force) throw targetExistsError(skillTarget);
      else if (options.dryRun) status = "would_update";
      else status = marker ? "updated" : "overwritten";

      if (!options.dryRun && status !== "unchanged") {
        await writePreparedSkill(
          skillTarget,
          prepared,
          (options.now ?? (() => new Date()))().toISOString(),
        );
      }
      installed.push({
        name: skill.name,
        path: skillTarget,
        status,
        files: ["SKILL.md", ...[...prepared.files.keys()].filter((file) => file !== "SKILL.md"), INSTALL_MARKER],
      });
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError("SKILL_INSTALL_FAILED", t("skill.install_failed", { path: skillTarget }), 2, {
        path: skillTarget,
        cause: String(error),
      });
    }
  }

  return {
    ok: true,
    agent: target.agent,
    scope: target.scope,
    target_dir: target.targetDir,
    installed,
    package_version: getPackageVersion(),
  };
};
