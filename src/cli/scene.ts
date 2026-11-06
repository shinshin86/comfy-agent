import path from "node:path";
import { promises as fs } from "node:fs";
import type { Command } from "commander";
import YAML from "yaml";
import { resolveCharacter } from "../characters/store.js";
import { resolveCharacterForm } from "../characters/resolve.js";
import { CliError } from "../io/errors.js";
import { print, printJson } from "../io/output.js";
import { getWorkdirPath } from "../io/workdir.js";
import { currentLang, t } from "../i18n/index.js";
import { buildPlan, type ScenePlan } from "../scene/plan.js";
import { resolveScene } from "../scene/resolve.js";
import { pickScene, runScene, type SceneRunOptions } from "../scene/run.js";
import { SceneIdSchema, sceneInvalid } from "../scene/schema.js";
import { reportScene } from "../scene/report.js";

type CommonOptions = { json?: boolean; global?: boolean; lang?: string };
const resolveOptions = (options: CommonOptions) => ({
  cwd: process.cwd(),
  ...(options.global ? { scope: "global" as const } : {}),
});

const showPlan = (plan: ScenePlan & { ok?: boolean }, options: CommonOptions) => {
  if (options.json) {
    printJson({ ok: true, ...plan });
    return;
  }
  for (const stage of plan.stages)
    print(
      `${stage.id}: ${stage.status}${stage.reasons.length ? ` (${stage.reasons.join(", ")})` : ""}`,
    );
  if (plan.final) print(t("scene.final", { path: plan.final }));
  if (plan.report) print(t("scene.report_saved", { path: plan.report }));
  print(t("scene.next", { action: plan.next_action }));
};

export const initScene = async (
  name: string,
  options: CommonOptions & { character?: string; form?: string; shots?: string; force?: boolean },
) => {
  if (!SceneIdSchema.safeParse(name).success)
    throw sceneInvalid(
      "name",
      "Use 1–64 lowercase letters, digits, underscores or hyphens, starting with a letter or digit",
    );
  const count = options.shots === undefined ? 2 : Number(options.shots);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000)
    throw sceneInvalid("--shots", "Use an integer from 1 to 1000");
  for (const key of ["character", "form"] as const)
    if (options[key] !== undefined && !SceneIdSchema.safeParse(options[key]).success)
      throw sceneInvalid(key, "Invalid identifier");
  if (options.character) {
    const resolved = await resolveCharacter(options.character, resolveOptions(options));
    resolveCharacterForm(resolved.character, options.form ?? "default");
  }
  const dir = path.join(
    getWorkdirPath(process.cwd(), options.global ? "global" : "local"),
    "scenes",
    name,
  );
  const file = path.join(dir, "scene.yaml");
  const template = {
    version: 1,
    name,
    ...(options.character ? { character: options.character, form: options.form ?? "default" } : {}),
    vars: { style: "Describe the visual style here." },
    defaults: {
      keyframe: {
        preset: "p_h3_image_edit",
        candidates: 2,
        params: { width: 2592, height: 1440 },
        inputs: { image: options.character ? "{ref}" : "assets/reference.png" },
        timeout_seconds: 300,
      },
      video: {
        preset: "minimax_h3_i2v",
        input_size: [864, 480],
        params: { length: 124 },
        inputs: { image: "{keyframe}" },
        timeout_seconds: 1200,
      },
    },
    shots: Array.from({ length: count }, (_, index) => ({
      id: `shot${index + 1}`,
      keyframe: {
        prompt: `Describe shot ${index + 1}.${options.character ? " Keep {appearance}." : ""} {style}`,
        seed: 100 + index,
      },
      video: {
        prompt:
          "Replace with a video prompt directing motion, dialogue and sound. See docs/minimax-h3-prompting.md.",
        seed: 200 + index,
      },
      cut: { start: 0, duration: 3 },
    })),
    edit: { output: "final.mp4" },
  };
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.writeFile(
      file,
      "# Replace the prompts and import the presets before running.\n# Paths are relative to this directory. Use file: assets/clip.mp4 to bring your own clip.\n# Multiple keyframe candidates require scene pick before video generation.\n" +
        YAML.stringify(template),
      { flag: options.force ? "w" : "wx" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new CliError("SCENE_EXISTS", t("scene.exists"), 2, { scene: name });
    throw error;
  }
  const next_action = `comfy-agent scene validate ${JSON.stringify(file)}`;
  if (options.json) printJson({ ok: true, scene: name, path: file, next_action });
  else {
    print(t("scene.created", { path: file }));
    print(t("scene.next", { action: next_action }));
  }
};

export const registerSceneCommand = (
  program: Command,
  handleError: (error: unknown, json?: boolean) => void,
) => {
  const scene = program.command("scene").description(t("cli.scene.description"));
  const common = (command: Command) =>
    command
      .option("--json", t("cli.option.json"))
      .option("--lang <lang>", t("cli.option.lang"))
      .option("--global", t("cli.option.global"));
  const repeat = (value: string, previous: string[]) => [...previous, value];
  common(scene.command("report").description(t("cli.scene.report")).argument("<scene>"))
    .option("--transcribe-cmd <command>", t("cli.scene.transcribe"))
    .action(async (target, options) => {
      try {
        const resolved = await resolveScene(target, resolveOptions(options));
        const report = await reportScene(resolved, { transcribeCmd: options.transcribeCmd });
        printJson(report);
      } catch (error) {
        handleError(error, options.json);
      }
    });
  common(scene.command("init").description(t("cli.scene.init")).argument("<name>"))
    .option("--character <name>", t("cli.run.option.character"))
    .option("--form <id>", t("cli.run.option.form"))
    .option("--shots <n>", t("cli.scene.shots"))
    .option("--force", t("cli.option.force"))
    .action(async (name, options) => {
      try {
        await initScene(name, options);
      } catch (error) {
        handleError(error, options.json);
      }
    });
  common(scene.command("validate").description(t("cli.scene.validate")).argument("<scene>")).action(
    async (target, options) => {
      try {
        const resolved = await resolveScene(target, resolveOptions(options));
        const next_action = `comfy-agent scene plan ${JSON.stringify(resolved.file)}`;
        if (options.json)
          printJson({
            ok: true,
            scene: resolved.scene.name,
            path: resolved.file,
            stages: resolved.stages.map(({ id }) => id).concat("edit"),
            next_action,
          });
        else print(t("scene.valid", { name: resolved.scene.name }));
      } catch (error) {
        handleError(error, options.json);
      }
    },
  );
  common(scene.command("plan").description(t("cli.scene.plan")).argument("<scene>")).action(
    async (target, options) => {
      try {
        showPlan(await buildPlan(await resolveScene(target, resolveOptions(options))), options);
      } catch (error) {
        handleError(error, options.json);
      }
    },
  );
  common(scene.command("run").description(t("cli.scene.run")).argument("<scene>"))
    .option("--shot <id>", t("cli.scene.shot"), repeat, [])
    .option("--only <keyframe|video|bgm|edit>", t("cli.scene.only"))
    .option("--force <stage-id>", t("cli.scene.force"), repeat, [])
    .option("--fail-fast", t("cli.scene.fail_fast"))
    .option("--base-url <url>", t("cli.option.base_url"))
    .option("--dry-run", t("cli.option.dry_run"))
    .action(async (target, options: CommonOptions & SceneRunOptions) => {
      try {
        const result = await runScene(await resolveScene(target, resolveOptions(options)), {
          ...options,
          lang: currentLang(),
        });
        showPlan(result, options);
        if (!options.json && options.dryRun)
          for (const stage of result.stages) {
            if (stage.argv || stage.argv_template)
              print(
                `${stage.id} ${stage.argv ? "argv" : "argv_template"}: ${JSON.stringify(stage.argv ?? stage.argv_template)}`,
              );
          }
        if (!result.ok) process.exitCode = 3;
      } catch (error) {
        handleError(error, options.json);
      }
    });
  common(
    scene
      .command("pick")
      .description(t("cli.scene.pick"))
      .argument("<scene>")
      .argument("<shot>")
      .argument("<n>"),
  ).action(async (target, shot, n, options) => {
    try {
      showPlan(
        await pickScene(await resolveScene(target, resolveOptions(options)), shot, Number(n)),
        options,
      );
    } catch (error) {
      handleError(error, options.json);
    }
  });
};
