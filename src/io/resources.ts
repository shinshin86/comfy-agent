import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { CliError } from "./errors.js";
import { t } from "../i18n/index.js";

export const RESOURCES = {
  playbook: "docs/agent-playbook.md",
  docsDir: "docs",
  catalog: "scripts/colab/catalog.yaml",
  colabDir: "scripts/colab",
  launcher: "scripts/colab/02_start_comfyui.py",
  skillsDir: ".claude/skills",
  recipesDir: "recipes",
} as const;

const resourceNotFound = (resource: string, resourcePath: string) =>
  new CliError(
    "RESOURCE_NOT_FOUND",
    t("resource.not_found", { resource, path: resourcePath }),
    2,
    { resource, path: resourcePath },
  );

const isPackageRoot = (candidate: string) => {
  const packageJson = path.join(candidate, "package.json");
  if (!existsSync(packageJson)) return false;
  try {
    const parsed = JSON.parse(readFileSync(packageJson, "utf-8")) as { name?: unknown };
    return parsed.name === "comfy-agent";
  } catch {
    return false;
  }
};

export const resolvePackageRoot = (): string => {
  const override = process.env.COMFY_AGENT_RESOURCE_ROOT;
  if (override) {
    const resolved = path.resolve(override);
    if (isPackageRoot(resolved)) return resolved;
    throw resourceNotFound("package_root", resolved);
  }

  let candidate = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (isPackageRoot(candidate)) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw resourceNotFound("package_root", candidate);
};

export const resourcePath = (...segments: string[]) =>
  path.join(resolvePackageRoot(), ...segments);

export const readResource = async (relPath: string): Promise<string> => {
  const resolved = resourcePath(relPath);
  try {
    return await fs.readFile(resolved, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw resourceNotFound(relPath, resolved);
    }
    throw error;
  }
};

export const resourceExists = async (relPath: string): Promise<boolean> => {
  const resolved = resourcePath(relPath);
  try {
    await fs.access(resolved);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};
