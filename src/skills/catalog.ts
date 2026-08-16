import path from "node:path";
import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import YAML from "yaml";
import { RESOURCES, resourcePath } from "../io/resources.js";
import { CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";

export type BundledSkill = {
  name: string;
  description: string;
  path: string;
  sourceName: string;
  skillFile: string;
  markdown: string;
  body: string;
};

const parseFrontmatter = (markdown: string) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) throw new Error("SKILL.md is missing YAML frontmatter.");
  const parsed = YAML.parse(match[1]) as { name?: unknown; description?: unknown };
  if (typeof parsed?.name !== "string" || typeof parsed.description !== "string") {
    throw new Error("SKILL.md frontmatter requires string name and description.");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(parsed.name)) {
    throw new Error("SKILL.md frontmatter contains an invalid name.");
  }
  return {
    name: parsed.name,
    description: parsed.description,
    body: markdown.slice(match[0].length),
  };
};

export const listBundledSkills = async (): Promise<BundledSkill[]> => {
  const skillsDir = resourcePath(RESOURCES.skillsDir);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError(
        "RESOURCE_NOT_FOUND",
        t("resource.not_found", { resource: RESOURCES.skillsDir, path: skillsDir }),
        2,
        { resource: RESOURCES.skillsDir, path: skillsDir },
      );
    }
    throw error;
  }
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
        const markdown = await fs.readFile(skillFile, "utf-8");
        const frontmatter = parseFrontmatter(markdown);
        return {
          ...frontmatter,
          path: path.dirname(skillFile),
          sourceName: entry.name,
          skillFile,
          markdown,
        };
      }),
  );
  return skills.sort((left, right) => left.name.localeCompare(right.name));
};
