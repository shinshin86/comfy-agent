import { promises as fs } from "node:fs";
import YAML from "yaml";
import { PresetSchema, type Preset } from "./schema.js";
import { CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";

export const loadPresetFile = async (filePath: string): Promise<Preset> => {
  const raw = await fs.readFile(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (err) {
    throw new CliError("INVALID_PRESET", t("preset.yaml_parse_error"), 2, {
      file: filePath,
      cause: String(err),
    });
  }

  const result = PresetSchema.safeParse(parsed);
  if (!result.success) {
    throw new CliError("INVALID_PRESET", t("preset.invalid"), 2, {
      file: filePath,
      issues: result.error.issues,
    });
  }

  return result.data;
};
