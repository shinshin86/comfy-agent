#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { runInit } from "./init.js";
import { runList } from "./list.js";
import { runImport } from "./import.js";
import { runRun } from "./run.js";
import { runDoctor } from "./doctor.js";
import { runAnalyze } from "./analyze.js";
import { runStatus } from "./status.js";
import { runPresetShow } from "./preset-show.js";
import { runColabCatalog, runColabSuggest } from "./colab.js";
import { runConnect } from "./connect.js";
import { runJobsList, runJobsPrune, runJobsShow, runJobsWait } from "./jobs.js";
import { CliError, errorPayloadFrom, exitCodeFrom, isCliError } from "../io/errors.js";
import { log } from "../io/output.js";
import { resolveLanguage, setLanguage, t } from "../i18n/index.js";
import { assertRuntimeSupported } from "../utils/runtime.js";
import { getPackageVersion } from "../utils/version.js";
import { extractRunPassthrough } from "./run/args.js";

const program = new Command();
const wantsJson = (argv: string[]) => argv.includes("--json");

setLanguage(resolveLanguage());

program.exitOverride();
program.configureOutput({
  writeErr: (message) => {
    if (!wantsJson(process.argv)) process.stderr.write(message);
  },
});

program
  .name("comfy-agent")
  .description(t("cli.description"))
  .option("--lang <lang>", t("cli.option.lang"))
  .version(getPackageVersion());

program.enablePositionalOptions();

program
  .command("init")
  .description(t("cli.init.description"))
  .option("--json", t("cli.option.json"))
  .option("--force", t("cli.option.force"))
  .option("--global", t("cli.option.global"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (options) => {
    try {
      await runInit(options);
    } catch (err) {
      handleError(err, options?.json);
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
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (workflowPath, options) => {
    try {
      await runImport(workflowPath, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

program
  .command("run")
  .description(t("cli.run.description"))
  .argument("<preset_name>", t("cli.run.arg.preset"))
  .option("--json", t("cli.option.json"))
  .option("--dry-run", t("cli.option.dry_run"))
  .option("--out <dir>", t("cli.run.option.out"))
  .option("--n <count>", t("cli.run.option.n"))
  .option("--seed <seed>", t("cli.run.option.seed"))
  .option("--seed-step <step>", t("cli.run.option.seed_step"))
  .option("--poll-interval-ms <ms>", t("cli.run.option.poll_interval"))
  .option("--timeout-seconds <sec>", t("cli.run.option.timeout"))
  .option("--async", t("cli.run.option.async"))
  .option("--no-preflight", t("cli.run.option.no_preflight"))
  .option("--base-url <url>", t("cli.option.base_url"))
  .option("--source <local|remote|remote-catalog>", t("cli.run.option.source"))
  .option("--global", t("cli.option.global"))
  .option("--lang <lang>", t("cli.option.lang"))
  .allowUnknownOption(true)
  .action(async (presetName, options, command) => {
    try {
      const rawArgs = extractRunPassthrough(presetName, command.args);
      await runRun(presetName, options, rawArgs);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

const jobs = program.command("jobs").description(t("cli.jobs.description"));

jobs
  .command("list")
  .description(t("cli.jobs.list.description"))
  .option("--status <status>", t("cli.jobs.list.option.status"))
  .option("--limit <n>", t("cli.jobs.list.option.limit"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (options) => {
    try {
      await runJobsList(options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

jobs
  .command("show")
  .description(t("cli.jobs.show.description"))
  .argument("<job_id>", t("cli.jobs.show.arg.id"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (jobId, options) => {
    try {
      await runJobsShow(jobId, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

jobs
  .command("wait")
  .description(t("cli.jobs.wait.description"))
  .argument("<job_ids...>", t("cli.jobs.wait.arg.ids"))
  .option("--timeout-seconds <sec>", t("cli.run.option.timeout"))
  .option("--poll-interval-ms <ms>", t("cli.run.option.poll_interval"))
  .option("--base-url <url>", t("cli.option.base_url"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (jobIds, options) => {
    try {
      await runJobsWait(jobIds, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

jobs
  .command("prune")
  .description(t("cli.jobs.prune.description"))
  .option("--older-than-days <n>", t("cli.jobs.prune.option.older_than_days"))
  .option("--dry-run", t("cli.option.dry_run"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (options) => {
    try {
      await runJobsPrune(options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

program
  .command("doctor")
  .description(t("cli.doctor.description"))
  .option("--json", t("cli.option.json"))
  .option("--base-url <url>", t("cli.option.base_url"))
  .option("--preset <name>", t("cli.doctor.option.preset"))
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

program
  .command("connect")
  .description(t("cli.connect.description"))
  .argument("<url>", t("cli.connect.arg.url"))
  .option("--json", t("cli.option.json"))
  .option("--force", t("cli.connect.option.force"))
  .option("--global", t("cli.option.global"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (url, options) => {
    try {
      await runConnect(url, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

const colab = program.command("colab").description(t("cli.colab.description"));

colab
  .command("catalog")
  .description(t("cli.colab.catalog.description"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (options) => {
    try {
      await runColabCatalog(options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

colab
  .command("suggest")
  .description(t("cli.colab.suggest.description"))
  .argument("[goal]", t("cli.colab.suggest.arg.goal"))
  .option("--task <task>", t("cli.colab.suggest.option.task"))
  .option("--output <output>", t("cli.colab.suggest.option.output"))
  .option("--gpu <gpu>", t("cli.colab.suggest.option.gpu"))
  .option("--limit <n>", t("cli.colab.suggest.option.limit"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (goal, options) => {
    try {
      await runColabSuggest(goal, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

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

try {
  assertRuntimeSupported();
} catch (err) {
  handleError(err, wantsJson(process.argv));
}

program.parseAsync(process.argv).catch((err) => {
  if (err instanceof CommanderError) {
    if (
      err.code === "commander.helpDisplayed" ||
      err.code === "commander.version" ||
      err.code === "commander.help"
    ) {
      process.exit(0);
    }
    handleError(
      new CliError("INVALID_USAGE", err.message.trim(), 2, { commander_code: err.code }),
      wantsJson(process.argv),
    );
    return;
  }
  handleError(err, wantsJson(process.argv));
});
