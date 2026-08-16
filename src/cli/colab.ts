import path from "node:path";
import type { Command } from "commander";
import { print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { RESOURCES, resourceExists, resourcePath } from "../io/resources.js";
import {
  buildColabCatalogPayload,
  buildColabSuggestPayload,
  COLAB_GPUS,
  loadColabCatalogFile,
  normalizeColabGpu,
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

export type ColabKitOptions = { json?: boolean };

const VALID_TASKS = new Set<ColabTask>([
  "text_to_image",
  "image_to_image",
  "image_edit",
  "remove_background",
  "inpaint",
  "upscale",
  "text_to_audio",
  "audio_to_audio",
  "audio_inpaint",
  "text_to_video",
  "image_to_video",
  "video_to_video",
  "custom",
]);

const VALID_OUTPUTS = new Set<ColabOutput>(["image", "video", "audio"]);

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

const resolveGpu = (value: string | undefined) => {
  if (!value) return undefined;
  const gpu = normalizeColabGpu(value);
  if (gpu) return gpu;
  throw new CliError("INVALID_PARAM", t("colab.invalid_gpu"), 2, {
    value,
    supported: COLAB_GPUS.join(","),
  });
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
    gpu: resolveGpu(options.gpu),
    limit: resolveLimit(options.limit),
  });

  if (options.json) {
    printJson(payload);
    return;
  }

  print(t("colab.suggest_header"));
  if (payload.suggestions.length === 0) print(t("colab.suggest_none"));
  for (const item of payload.suggestions) {
    print(
      `- ${item.kit}/${item.workflow}: ${item.task} -> ${item.workflow_output} (${item.status}, score=${item.score})`,
    );
    const unverifiedGpu = item.reasons
      .find((reason) => reason.startsWith("gpu_unverified:"))
      ?.split(":")[1];
    if (unverifiedGpu) print(`  ${t("colab.gpu_unverified", { gpu: unverifiedGpu })}`);
  }
  if (payload.alternatives.length > 0) {
    print(t("colab.suggest_alternatives"));
    for (const item of payload.alternatives) {
      print(
        `- ${item.kit}/${item.workflow}: ${item.task} -> ${item.workflow_output} (${item.status}; ${item.unmet_requirements?.join(", ")})`,
      );
    }
  }
};

const requireKitResource = async (relative: string) => {
  if (await resourceExists(relative)) return resourcePath(relative);
  const resolved = resourcePath(relative);
  throw new CliError(
    "RESOURCE_NOT_FOUND",
    t("resource.not_found", { resource: relative, path: resolved }),
    2,
    { resource: relative, path: resolved },
  );
};

export const runColabKit = async (name: string, options: ColabKitOptions) => {
  const catalog = await loadColabCatalogFile();
  const kit = catalog.kits.find((candidate) => candidate.name === name);
  if (!kit) {
    throw new CliError("COLAB_KIT_NOT_FOUND", t("colab.kit_not_found", { name }), 2, {
      name,
      available: catalog.kits.map((candidate) => candidate.name),
    });
  }
  const kitRelative = path.posix.join(RESOURCES.colabDir, kit.path.replace(/\/+$/, ""));
  const dir = resourcePath(kitRelative);
  const setup = await requireKitResource(path.posix.join(kitRelative, kit.setup_file));
  const launcher = await requireKitResource(RESOURCES.launcher);
  const workflows = Object.fromEntries(
    await Promise.all(
      kit.workflows.map(async (workflow) => [
        workflow.file,
        await requireKitResource(path.posix.join(kitRelative, workflow.file)),
      ]),
    ),
  );
  const payload = { ok: true, kit, paths: { dir, setup, launcher, workflows } };
  if (options.json) printJson(payload);
  else {
    print(`Kit: ${kit.name}`);
    print(`Paste ${setup} then ${launcher} into Colab.`);
    for (const workflow of Object.values(workflows)) print(`Import ${workflow}`);
  }
  return payload;
};

export const registerColabKitCommand = (
  colab: Command,
  onError: (error: unknown, jsonOutput?: boolean) => void,
) => {
  colab
    .command("kit")
    .description(t("cli.colab.kit.description"))
    .argument("<name>", t("cli.colab.kit.arg.name"))
    .option("--json", t("cli.option.json"))
    .option("--lang <lang>", t("cli.option.lang"))
    .action(async (name, options) => {
      try {
        await runColabKit(name, options);
      } catch (error) {
        onError(error, options?.json);
      }
    });
};
