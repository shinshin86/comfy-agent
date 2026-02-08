import path from "node:path";
import { promises as fs } from "node:fs";
import { getSubdirPath, type WorkdirScope } from "../io/workdir.js";
import { CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";

export const resolvePresetPath = async (
  presetName: string,
  scope: WorkdirScope,
  notFoundMessageKey: "run.preset_not_found" | "preset_show.not_found" = "run.preset_not_found",
) => {
  const base = path.join(getSubdirPath("presets", process.cwd(), scope), presetName);
  const yamlPath = `${base}.yaml`;
  const ymlPath = `${base}.yml`;

  try {
    const stat = await fs.stat(yamlPath);
    if (stat.isFile()) return yamlPath;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  try {
    const stat = await fs.stat(ymlPath);
    if (stat.isFile()) return ymlPath;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  throw new CliError("PRESET_NOT_FOUND", t(notFoundMessageKey), 2, {
    preset: presetName,
  });
};
