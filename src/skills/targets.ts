import os from "node:os";
import path from "node:path";
import { CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";

export const SKILL_AGENTS = ["claude", "codex", "cursor", "gemini", "openclaw"] as const;
export type SkillAgent = (typeof SKILL_AGENTS)[number];
export type SkillScope = "project" | "global" | "custom";

const TARGETS: Record<SkillAgent, { project: string[]; global: string[] }> = {
  claude: { project: [".claude", "skills"], global: [".claude", "skills"] },
  codex: { project: [".agents", "skills"], global: [".agents", "skills"] },
  cursor: { project: [".cursor", "skills"], global: [".cursor", "skills"] },
  gemini: { project: [".gemini", "skills"], global: [".gemini", "skills"] },
  openclaw: { project: [".agents", "skills"], global: [".openclaw", "skills"] },
};

export type ResolveSkillTargetOptions = {
  cwd?: string;
  home?: string;
  global?: boolean;
  project?: boolean;
  dir?: string;
};

export const resolveSkillTarget = (
  requestedAgent: string,
  options: ResolveSkillTargetOptions = {},
) => {
  if (!SKILL_AGENTS.includes(requestedAgent as SkillAgent)) {
    throw new CliError(
      "SKILL_AGENT_UNSUPPORTED",
      t("skill.agent_unsupported", { agent: requestedAgent }),
      2,
      { agent: requestedAgent, supported: [...SKILL_AGENTS] },
    );
  }
  const selected = [options.global, options.project, options.dir !== undefined].filter(
    Boolean,
  ).length;
  if (selected > 1) {
    throw new CliError("SKILL_SCOPE_CONFLICT", t("skill.scope_conflict"), 2, {
      global: options.global ?? false,
      project: options.project ?? false,
      dir: options.dir ?? null,
    });
  }

  const agent = requestedAgent as SkillAgent;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const home = path.resolve(options.home ?? os.homedir());
  if (options.dir !== undefined) {
    return { agent, scope: "custom" as const, targetDir: path.resolve(cwd, options.dir) };
  }
  if (options.global) {
    return { agent, scope: "global" as const, targetDir: path.join(home, ...TARGETS[agent].global) };
  }
  return { agent, scope: "project" as const, targetDir: path.join(cwd, ...TARGETS[agent].project) };
};
