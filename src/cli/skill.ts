import { listBundledSkills } from "../skills/catalog.js";
import { installSkills, type InstallSkillsOptions } from "../skills/install.js";
import { print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";
import type { SkillInstallStatus } from "../skills/install.js";

export type SkillListOptions = { json?: boolean };
export type SkillInstallCliOptions = Omit<InstallSkillsOptions, "agent"> & {
  agent: string;
  json?: boolean;
};

const STATUS_KEYS: Record<SkillInstallStatus, Parameters<typeof t>[0]> = {
  created: "skill.status.created",
  updated: "skill.status.updated",
  unchanged: "skill.status.unchanged",
  overwritten: "skill.status.overwritten",
  would_create: "skill.status.would_create",
  would_update: "skill.status.would_update",
};

export const runSkillList = async (options: SkillListOptions) => {
  const skills = (await listBundledSkills()).map(({ name, description, path }) => ({
    name,
    description,
    path,
  }));
  const payload = { ok: true, skills };
  if (options.json) printJson(payload);
  else {
    print(t("skill.list_header"));
    for (const skill of skills) print(`- ${skill.name}: ${skill.description}`);
  }
  return payload;
};

export const runSkillInstall = async (
  names: string[],
  options: SkillInstallCliOptions,
) => {
  const payload = await installSkills(names, options);
  if (options.json) printJson(payload);
  else {
    for (const skill of payload.installed) print(`${t(STATUS_KEYS[skill.status])}  ${skill.path}`);
    print(t("skill.restart_hint", { agent: payload.agent }));
  }
  return payload;
};
