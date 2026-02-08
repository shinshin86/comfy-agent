#!/usr/bin/env node
import { Command } from "commander";
import { runInit } from "./init.js";
import { runList } from "./list.js";
import { runImport } from "./import.js";
import { runRun } from "./run.js";
import { runDoctor } from "./doctor.js";
import { runAnalyze } from "./analyze.js";
import { runStatus } from "./status.js";
import { runPresetShow } from "./preset-show.js";
import { errorPayloadFrom, exitCodeFrom, isCliError } from "../io/errors.js";
import { log } from "../io/output.js";
import { resolveLanguage, setLanguage, t } from "../i18n/index.js";

const program = new Command();

setLanguage(resolveLanguage());

program
  .name("comfy-agent")
  .description(t("cli.description"))
  .option("--lang <lang>", t("cli.option.lang"))
  .version("0.1.0");

program.enablePositionalOptions();

program
  .command("init")
  .description(t("cli.init.description"))
  .option("--force", t("cli.option.force"))
  .option("--global", t("cli.option.global"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (options) => {
    try {
      await runInit(options);
    } catch (err) {
      handleError(err);
    }
  });

program
  .command("list")
  .description(t("cli.list.description"))
  .option("--json", t("cli.option.json"))
  .option("--source <local|remote|remote-catalog|all>", t("cli.list.option.source"))
  .option("--base-url <url>", t("cli.option.base_url"))
  .option("--global", t("cli.option.global"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (options) => {
    try {
      await runList(options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

program
  .command("import")
  .description(t("cli.import.description"))
  .argument("<path_to_workflow_api_json>", t("cli.import.arg.workflow"))
  .requiredOption("--name <preset_name>", t("cli.import.option.name"))
  .option("--base-url <url>", t("cli.option.base_url"))
  .option("--force", t("cli.option.force"))
  .option("--global", t("cli.option.global"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (workflowPath, options) => {
    try {
      await runImport(workflowPath, options);
    } catch (err) {
      handleError(err);
    }
  });

program
  .command("run")
  .description(t("cli.run.description"))
  .argument("<preset_name>", t("cli.run.arg.preset"))
  .option("--json", t("cli.option.json"))
  .option("--dry-run", t("cli.run.option.dry_run"))
  .option("--out <dir>", t("cli.run.option.out"))
  .option("--n <count>", t("cli.run.option.n"))
  .option("--seed <seed>", t("cli.run.option.seed"))
  .option("--seed-step <step>", t("cli.run.option.seed_step"))
  .option("--poll-interval-ms <ms>", t("cli.run.option.poll_interval"))
  .option("--timeout-seconds <sec>", t("cli.run.option.timeout"))
  .option("--base-url <url>", t("cli.option.base_url"))
  .option("--source <local|remote|remote-catalog>", t("cli.run.option.source"))
  .option("--global", t("cli.option.global"))
  .option("--lang <lang>", t("cli.option.lang"))
  .allowUnknownOption(true)
  .action(async (presetName, options, command) => {
    try {
      const rawArgs = collectRunArgs(presetName, command.args);
      await runRun(presetName, options, rawArgs);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

program
  .command("doctor")
  .description(t("cli.doctor.description"))
  .option("--json", t("cli.option.json"))
  .option("--base-url <url>", t("cli.option.base_url"))
  .option("--global", t("cli.option.global"))
  .option("--all-scopes", t("cli.doctor.option.all_scopes"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (options) => {
    try {
      await runDoctor(options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

program
  .command("status")
  .description(t("cli.status.description"))
  .option("--json", t("cli.option.json"))
  .option("--base-url <url>", t("cli.option.base_url"))
  .option("--global", t("cli.option.global"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (options) => {
    try {
      await runStatus(options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

program
  .command("preset")
  .description(t("cli.preset.description"))
  .argument("<preset_name>", t("cli.preset.arg.name"))
  .option("--json", t("cli.option.json"))
  .option("--source <local|remote>", t("cli.preset.option.source"))
  .option("--base-url <url>", t("cli.option.base_url"))
  .option("--global", t("cli.option.global"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (presetName, options) => {
    try {
      await runPresetShow(presetName, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

program
  .command("analyze")
  .description(t("cli.analyze.description"))
  .argument("<image_path>", t("cli.analyze.arg.image"))
  .requiredOption("--prompt <text>", t("cli.analyze.option.prompt"))
  .option("--json", t("cli.option.json"))
  .option("--out <file>", t("cli.analyze.option.out"))
  .option("--model <model>", t("cli.analyze.option.model"))
  .option("--detail <low|high|auto>", t("cli.analyze.option.detail"))
  .option("--threshold <score>", t("cli.analyze.option.threshold"))
  .option("--temperature <n>", t("cli.analyze.option.temperature"))
  .option("--max-output-tokens <n>", t("cli.analyze.option.max_output_tokens"))
  .option("--api-key <key>", t("cli.analyze.option.api_key"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (imagePath, options) => {
    try {
      await runAnalyze(imagePath, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

const collectRunArgs = (presetName: string, passthroughArgs: string[]) => {
  if (passthroughArgs.length > 0) return passthroughArgs;
  const argv = process.argv.slice(2);
  const runIndex = argv.indexOf("run");
  if (runIndex === -1) return [];
  const afterRun = argv.slice(runIndex + 1);
  const presetIndex = afterRun.indexOf(presetName);
  if (presetIndex === -1) return afterRun.slice(1);
  return afterRun.slice(presetIndex + 1);
};

const handleError = (err: unknown, jsonOutput?: boolean) => {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(errorPayloadFrom(err))}\n`);
  } else if (isCliError(err)) {
    log(t("error.prefix", { message: err.message }));
  } else {
    const message = err instanceof Error ? err.message : String(err);
    log(t("error.unexpected", { message }));
  }
  process.exit(exitCodeFrom(err));
};

program.parseAsync(process.argv).catch((err) => {
  handleError(err);
});
