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
import { registerColabKitCommand, runColabCatalog, runColabSuggest } from "./colab.js";
import { runPlaybook } from "./playbook.js";
import { runSkillInstall, runSkillList } from "./skill.js";
import { runConnect } from "./connect.js";
import { runJobsList, runJobsPrune, runJobsShow, runJobsWait } from "./jobs.js";
import {
  runHistoryList,
  runHistoryNote,
  runHistoryOpen,
  runHistoryShow,
  runHistoryTag,
} from "./history.js";
import { runVerify } from "./verify.js";
import { runBrief } from "./brief.js";
import { CliError, errorPayloadFrom, exitCodeFrom, isCliError } from "../io/errors.js";
import { log } from "../io/output.js";
import { resolveLanguage, setLanguage, t } from "../i18n/index.js";
import { assertRuntimeSupported } from "../utils/runtime.js";
import { getPackageVersion } from "../utils/version.js";
import { extractRunPassthrough } from "./run/args.js";
import {
  runCharacterCreate,
  runCharacterExport,
  runCharacterFormAdd,
  runCharacterGalleryAdd,
  runCharacterGalleryApprove,
  runCharacterGalleryRemove,
  runCharacterImport,
  runCharacterList,
  runCharacterLoraAdd,
  runCharacterNote,
  runCharacterRefAdd,
  runCharacterRefRemove,
  runCharacterRemove,
  runCharacterShow,
  runCharacterSheet,
  runCharacterUpdate,
} from "./character.js";

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
  .option("--character <name>", t("cli.run.option.character"))
  .option("--form <id>", t("cli.run.option.form"))
  .option("--character-ref <index|file>", t("cli.run.option.character_ref"))
  .option("--character-prompt <replace|prefix|off>", t("cli.run.option.character_prompt"))
  .option("--lora <file>", t("cli.run.option.lora"))
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

const withHistoryListOptions = (command: Command) =>
  command
    .option("--preset <name>", t("cli.history.list.option.preset"))
    .option("--character <name>", t("cli.history.list.option.character"))
    .option("--kind <image|video|audio>", t("cli.history.list.option.kind"))
    .option("--status <status>", t("cli.history.list.option.status"))
    .option("--tag <tag>", t("cli.history.list.option.tag"))
    .option("--search <text>", t("cli.history.list.option.search"))
    .option("--since <ISO|7d|24h>", t("cli.history.list.option.since"))
    .option("--favorite", t("cli.history.list.option.favorite"))
    .option("--rejected", t("cli.history.list.option.rejected"))
    .option("--limit <n>", t("cli.history.list.option.limit"))
    .option("--all-scopes", t("cli.history.list.option.all_scopes"))
    .option("--full-prompts", t("cli.history.list.option.full_prompts"))
    .option("--global", t("cli.option.global"))
    .option("--json", t("cli.option.json"))
    .option("--lang <lang>", t("cli.option.lang"));

const history = withHistoryListOptions(
  program.command("history").description(t("cli.history.description")),
);

history.action(async (options) => {
  try {
    await runHistoryList(options);
  } catch (err) {
    handleError(err, options?.json);
  }
});

withHistoryListOptions(
  history.command("list").description(t("cli.history.list.description")),
).action(async (options) => {
  try {
    await runHistoryList(options);
  } catch (err) {
    handleError(err, options?.json);
  }
});

history
  .command("show")
  .description(t("cli.history.show.description"))
  .argument("<job_id>", t("cli.history.arg.id"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (jobId, options) => {
    try {
      await runHistoryShow(jobId, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

history
  .command("note")
  .description(t("cli.history.note.description"))
  .argument("<job_id>", t("cli.history.arg.id"))
  .argument("<text>", t("cli.history.note.arg.text"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (jobId, text, options) => {
    try {
      await runHistoryNote(jobId, text, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

history
  .command("tag")
  .description(t("cli.history.tag.description"))
  .argument("<job_id>", t("cli.history.arg.id"))
  .argument("<tags...>", t("cli.history.tag.arg.tags"))
  .option("--rm", t("cli.history.tag.option.rm"))
  .option("--reason <text>", t("cli.history.tag.option.reason"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (jobId, tags, options) => {
    try {
      await runHistoryTag(jobId, tags, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

history
  .command("open")
  .description(t("cli.history.open.description"))
  .argument("<job_id>", t("cli.history.arg.id"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (jobId, options) => {
    try {
      await runHistoryOpen(jobId, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

program
  .command("brief")
  .description(t("cli.brief.description"))
  .argument("<character>", t("cli.brief.arg.character"))
  .option("--preset <name>", t("cli.brief.option.preset"))
  .option("--form <id>", t("cli.brief.option.form"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, options) => {
    try {
      await runBrief(name, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

const character = program.command("character").description(t("cli.character.description"));

character
  .command("list")
  .description(t("cli.character.list.description"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (options) => {
    try {
      await runCharacterList(options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

character
  .command("create")
  .description(t("cli.character.create.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .option("--display-name <text>", t("cli.character.option.display_name"))
  .option("--appearance <text>", t("cli.character.option.appearance"))
  .option("--appearance-file <path>", t("cli.character.option.appearance_file"))
  .option("--trigger <text>", t("cli.character.option.trigger"))
  .option("--style <text>", t("cli.character.option.style"))
  .option("--negative <text>", t("cli.character.option.negative"))
  .option("--age <age>", t("cli.character.option.age"))
  .option("--allow-nsfw", t("cli.character.option.allow_nsfw"))
  .option("--tag <tags...>", t("cli.character.option.tag"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, options) => {
    try {
      await runCharacterCreate(name, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

character
  .command("show")
  .description(t("cli.character.show.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .option("--notes", t("cli.character.option.notes"))
  .option("--gallery", t("cli.character.option.gallery"))
  .option("--full", t("cli.character.option.full"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, options) => {
    try {
      await runCharacterShow(name, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

character
  .command("update")
  .description(t("cli.character.update.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .option("--display-name <text>", t("cli.character.option.display_name"))
  .option("--appearance <text>", t("cli.character.option.appearance"))
  .option("--appearance-file <path>", t("cli.character.option.appearance_file"))
  .option("--trigger <text>", t("cli.character.option.trigger"))
  .option("--style <text>", t("cli.character.option.style"))
  .option("--negative <text>", t("cli.character.option.negative"))
  .option("--age <age>", t("cli.character.option.age"))
  .option("--allow-nsfw", t("cli.character.option.allow_nsfw"))
  .option("--tag <tags...>", t("cli.character.option.tag"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, options) => {
    try {
      await runCharacterUpdate(name, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

character
  .command("note")
  .description(t("cli.character.note.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .argument("<text>", t("cli.character.arg.text"))
  .option("--kit <name>", t("cli.character.option.kit"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, text, options) => {
    try {
      await runCharacterNote(name, text, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

const characterRef = character.command("ref").description(t("cli.character.ref.description"));

characterRef
  .command("add")
  .description(t("cli.character.ref.add.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .argument("<path>", t("cli.character.arg.path"))
  .option("--role <role>", t("cli.character.option.role"))
  .option("--form <id>", t("cli.character.option.form"))
  .option("--note <text>", t("cli.character.option.note"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, source, options) => {
    try {
      await runCharacterRefAdd(name, source, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

characterRef
  .command("rm")
  .description(t("cli.character.ref.rm.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .argument("<file>", t("cli.character.arg.file"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, file, options) => {
    try {
      await runCharacterRefRemove(name, file, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

const characterForm = character.command("form").description(t("cli.character.form.description"));

characterForm
  .command("add")
  .description(t("cli.character.form.add.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .argument("<id>", t("cli.character.arg.form"))
  .requiredOption("--appearance <text>", t("cli.character.option.appearance"))
  .option("--ref <paths...>", t("cli.character.option.ref"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, id, options) => {
    try {
      await runCharacterFormAdd(name, id, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

const characterLora = character.command("lora").description(t("cli.character.lora.description"));

characterLora
  .command("add")
  .description(t("cli.character.lora.add.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .argument("<file>", t("cli.character.arg.file"))
  .option("--strength <n>", t("cli.character.option.strength"))
  .option("--base <tag>", t("cli.character.option.base"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, file, options) => {
    try {
      await runCharacterLoraAdd(name, file, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

const characterGallery = character
  .command("gallery")
  .description(t("cli.character.gallery.description"));

characterGallery
  .command("add")
  .description(t("cli.character.gallery.add.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .argument("<job_id>", t("cli.character.arg.job_id"))
  .option("--output <n>", t("cli.character.option.output"))
  .option("--caption <text>", t("cli.character.option.caption"))
  .option("--tag <tags...>", t("cli.character.option.tag"))
  .option("--form <id>", t("cli.character.option.form"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, jobId, options) => {
    try {
      await runCharacterGalleryAdd(name, jobId, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

characterGallery
  .command("approve")
  .description(t("cli.character.gallery.approve.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .argument("<gallery_ids...>", t("cli.character.arg.gallery_ids"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, ids, options) => {
    try {
      await runCharacterGalleryApprove(name, ids, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

characterGallery
  .command("rm")
  .description(t("cli.character.gallery.rm.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .argument("<gallery_id>", t("cli.character.arg.gallery_id"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, id, options) => {
    try {
      await runCharacterGalleryRemove(name, id, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

character
  .command("sheet")
  .description(t("cli.character.sheet.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .option("--form <id>", t("cli.character.option.form"))
  .option("--out <png>", t("cli.character.sheet.option.out"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, options) => {
    try {
      await runCharacterSheet(name, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

character
  .command("export")
  .description(t("cli.character.export.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .option("--out <dir>", t("cli.character.option.out"))
  .option("--with-refs", t("cli.character.option.with_refs"))
  .option("--with-gallery", t("cli.character.option.with_gallery"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, options) => {
    try {
      await runCharacterExport(name, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

character
  .command("import")
  .description(t("cli.character.import.description"))
  .argument("<dir>", t("cli.character.arg.dir"))
  .option("--name <name>", t("cli.character.option.name"))
  .option("--force", t("cli.option.force"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (dir, options) => {
    try {
      await runCharacterImport(dir, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

character
  .command("rm")
  .description(t("cli.character.rm.description"))
  .argument("<name>", t("cli.character.arg.name"))
  .option("--force", t("cli.option.force"))
  .option("--global", t("cli.option.global"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, options) => {
    try {
      await runCharacterRemove(name, options);
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
  .command("verify")
  .description(t("cli.verify.description"))
  .argument("<path>", t("cli.verify.arg.path"))
  .option("--json", t("cli.option.json"))
  .option("--frames <n>", t("cli.verify.option.frames"))
  .option("--sheet <file.png>", t("cli.verify.option.sheet"))
  .option("--no-sheet", t("cli.verify.option.no_sheet"))
  .option("--no-ffmpeg", t("cli.verify.option.no_ffmpeg"))
  .option("--out <dir>", t("cli.run.option.out"))
  .option("--expect-kind <kind>", t("cli.verify.option.expect_kind"))
  .option("--expect-count <n>", t("cli.verify.option.expect_count"))
  .option("--expect-size <WxH>", t("cli.verify.option.expect_size"))
  .option("--min-duration <sec>", t("cli.verify.option.min_duration"))
  .option("--max-duration <sec>", t("cli.verify.option.max_duration"))
  .option("--hash", t("cli.verify.option.hash"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (target, options) => {
    try {
      await runVerify(target, {
        ...options,
        sheet: typeof options.sheet === "string" ? options.sheet : undefined,
        noSheet: options.sheet === false,
        noFfmpeg: options.ffmpeg === false,
      });
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

program
  .command("playbook")
  .description(t("cli.playbook.description"))
  .argument("[name]", t("cli.playbook.arg.name"))
  .option("--section <n|slug>", t("cli.playbook.option.section"))
  .option("--list", t("cli.playbook.option.list"))
  .option("--path", t("cli.playbook.option.path"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (name, options) => {
    try {
      await runPlaybook(name, options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

const skill = program.command("skill").description(t("cli.skill.description"));

skill
  .command("list")
  .description(t("cli.skill.list.description"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (options) => {
    try {
      await runSkillList(options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

skill
  .command("install")
  .description(t("cli.skill.install.description"))
  .argument("[names...]", t("cli.skill.install.arg.names"))
  .requiredOption("--agent <agent>", t("cli.skill.option.agent"))
  .option("--global", t("cli.skill.option.global"))
  .option("--project", t("cli.skill.option.project"))
  .option("--dir <path>", t("cli.skill.option.dir"))
  .option("--force", t("cli.option.force"))
  .option("--dry-run", t("cli.option.dry_run"))
  .option("--json", t("cli.option.json"))
  .option("--lang <lang>", t("cli.option.lang"))
  .action(async (names, options) => {
    try {
      await runSkillInstall(names ?? [], options);
    } catch (err) {
      handleError(err, options?.json);
    }
  });

const colab = program.command("colab").description(t("cli.colab.description"));

registerColabKitCommand(colab, (error, jsonOutput) => handleError(error, jsonOutput));

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
