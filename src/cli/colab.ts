import { print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import {
  buildColabCatalogPayload,
  buildColabSuggestPayload,
  loadColabCatalogFile,
  type ColabOutput,
  type ColabTask,
} from "../colab/catalog.js";

export type ColabCatalogOptions = {
  json?: boolean;
};

export type ColabSuggestOptions = {
  json?: boolean;
  task?: ColabTask;
  output?: ColabOutput;
  gpu?: string;
  limit?: string;
};

const VALID_TASKS = new Set<ColabTask>([
  "text_to_image",
  "image_to_image",
  "image_edit",
  "inpaint",
  "upscale",
  "text_to_video",
  "image_to_video",
  "video_to_video",
  "custom",
]);

const VALID_OUTPUTS = new Set<ColabOutput>(["image", "video"]);

const resolveTask = (value: string | undefined) => {
  if (!value) return undefined;
  if (VALID_TASKS.has(value as ColabTask)) return value as ColabTask;
  throw new CliError("INVALID_PARAM", t("colab.invalid_task"), 2, { value });
};

const resolveOutput = (value: string | undefined) => {
  if (!value) return undefined;
  if (VALID_OUTPUTS.has(value as ColabOutput)) return value as ColabOutput;
  throw new CliError("INVALID_PARAM", t("colab.invalid_output"), 2, { value });
};

const resolveLimit = (value: string | undefined) => {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CliError("INVALID_PARAM", t("colab.invalid_limit"), 2, { value });
  }
  return parsed;
};

export const runColabCatalog = async (options: ColabCatalogOptions) => {
  const catalog = await loadColabCatalogFile();
  const payload = buildColabCatalogPayload(catalog);

  if (options.json) {
    printJson(payload);
    return;
  }

  print(t("colab.catalog_header"));
  for (const kit of payload.catalog.kits) {
    print(
      `- ${kit.name}: ${kit.tasks.join(",")} -> ${kit.outputs.join(",")} (${kit.status}, GPU: ${
        kit.gpu.recommended ?? kit.gpu.minimum ?? "unknown"
      })`,
    );
  }
};

export const runColabSuggest = async (goal: string | undefined, options: ColabSuggestOptions) => {
  const catalog = await loadColabCatalogFile();
  const payload = buildColabSuggestPayload(catalog, {
    goal,
    task: resolveTask(options.task),
    output: resolveOutput(options.output),
    gpu: options.gpu,
    limit: resolveLimit(options.limit),
  });

  if (options.json) {
    printJson(payload);
    return;
  }

  print(t("colab.suggest_header"));
  for (const item of payload.suggestions) {
    print(
      `- ${item.kit}/${item.workflow}: ${item.task} -> ${item.outputs.join(",")} (${item.status}, score=${item.score})`,
    );
  }
};
