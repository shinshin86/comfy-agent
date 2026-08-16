import type { Preset } from "./schema.js";

export const formatPresetParameters = (parameters: Preset["parameters"]) =>
  Object.entries(parameters ?? {}).map(([name, param]) => ({
    name,
    type: param.type,
    required: param.required ?? false,
    default: param.default,
    target: param.target,
    description: param.description,
    role: param.role,
    aliases: param.aliases,
    min: param.min,
    max: param.max,
    choices: param.choices,
    recommended: param.recommended,
  }));

export const formatPresetUploads = (uploads: Preset["uploads"]) =>
  Object.entries(uploads ?? {}).map(([name, upload]) => ({
    name,
    kind: upload.kind,
    cli_flag: upload.cli_flag,
    target: upload.target,
    description: upload.description,
    role: upload.role,
    aliases: upload.aliases,
    required: upload.required ?? false,
  }));
