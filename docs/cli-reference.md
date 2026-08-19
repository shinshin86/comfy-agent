# CLI reference

Complete command, preset, output, and error reference for `comfy-agent`.
For the orchestration policy used by AI agents, see the
[Agent Playbook](./agent-playbook.md). Japanese: [CLI reference (日本語)](./cli-reference.ja.md).
For planned milestones and explicit non-goals, see the [Roadmap](./roadmap.md).

## Work directory

`comfy-agent init` creates the local `.comfy-agent/` directory. A successful
`comfy-agent connect` also creates this structure, so the QuickStart does not
need a separate `init` step.

```text
.comfy-agent/
  config.yaml
  workflows/
  presets/
  outputs/
  jobs/
  cache/
```

- `workflows/` stores runnable ComfyUI API JSON.
- `presets/` stores parameter and upload mappings.
- `outputs/` stores generated files and `run.json` manifests.
- `jobs/` stores resumable job records for synchronous and asynchronous runs.
- `cache/` stores server metadata used while importing workflows.

### Global scope

Use `--global` to switch from the current project's `.comfy-agent/` to
`~/.config/.comfy-agent`.

```bash
comfy-agent init --global
comfy-agent list --global
comfy-agent run text2img_v1 --global --prompt "A cat"
```

Use separate local work directories when one project needs independent presets,
outputs, or server settings.

## `base_url` precedence

The ComfyUI URL is resolved in this order:

1. `--base-url`
2. `COMFY_AGENT_BASE_URL`
3. `base_url` in `.comfy-agent/config.yaml`, written by `comfy-agent connect`
   (the requested scope is checked first, followed by the other scope)
4. `http://127.0.0.1:8188`

Keep the URL out of presets. For an ephemeral Colab tunnel, run
`comfy-agent connect <new-url>` after each runtime restart; presets, workflows,
jobs, and outputs remain local.

## ComfyUI integration flow

- POST `/prompt` with workflow JSON to enqueue a generation.
- Follow WebSocket progress when available, falling back to polling
  GET `/history/{prompt_id}` until completion.
- Read `filename`, `subfolder`, and `type` from history, then download via GET `/view`.
- Upload images and masks to POST `/upload/image` or `/upload/mask`. Audio and
  generic files use ComfyUI's input upload path and can target nodes such as
  `LoadAudio`.
- During `import`, read GET `/object_info` when available to improve type inference
  and safely expand ComfyUI subgraph templates.
- Before `run`, compare workflow node classes and model inputs with `/object_info`
  unless `--no-preflight` is explicitly selected.

## Commands

Every command accepts `--lang <en|ja>`; `COMFY_AGENT_LANG=ja` changes the default.
Commands documented with `--json` return a stable machine-readable envelope.

### `init`

Create the work directory. Existing directories are retained; `--force` replaces
a conflicting path that is not a directory.

```bash
comfy-agent init
comfy-agent init --global
comfy-agent init --json
comfy-agent init --force
```

### `connect`

Verify a ComfyUI base URL, initialize the selected work directory if necessary,
and persist the URL to `config.yaml`.

```bash
comfy-agent connect https://xxxx.trycloudflare.com
comfy-agent connect https://xxxx.trycloudflare.com --json
comfy-agent connect http://127.0.0.1:8188 --global
comfy-agent connect https://xxxx.trycloudflare.com --force
```

Without `--force`, an unreachable server returns `SERVER_UNREACHABLE` and is not
saved. `--force` stores the URL with an `UNVERIFIED` connection state.

### `import`

Import a ComfyUI API JSON or saved UI workflow JSON and generate a preset template.

```bash
comfy-agent import ./workflow_api.json --name text2img_v1
comfy-agent import ./workflow_api.json --name text2img_v1 --json
comfy-agent import ./workflow_api.json --name text2img_v1 --base-url http://127.0.0.1:8188
comfy-agent import ./workflow_api.json --name text2img_v1 --global
comfy-agent import ./workflow_api.json --name text2img_v1 --force
```

UI workflows containing `definitions.subgraphs` require a reachable target
ComfyUI server. The importer uses live `/object_info` input order to flatten active
subgraph nodes into API nodes before saving locally. It stops with a concrete error
when a node schema is unavailable or when a muted/bypass execution mode cannot be
represented safely. Save or download in-memory editor state before importing it.

When `/object_info` is available, inference is enhanced and cached at
`.comfy-agent/cache/object_info.json`. Generated presets receive:

- a `description` for every parameter;
- a recognized `role`, such as `prompt`, `seed`, `steps`, `guidance`, `width`,
  `height`, `sampler`, `scheduler`, `lora`, `lora_strength`, `denoise`, or `strength`;
- numeric hints for known roles;
- stable aliases such as `--prompt`, `--negative`, `--steps`, `--cfg`, `--width`,
  and `--height`, plus applicable video/audio aliases such as `--length`, `--fps`,
  `--seconds`, and `--lyrics`.

Re-import with `--force` to add generated aliases to an existing preset. A handwritten
alias is retained when its parameter target is unchanged; other handwritten preset
edits are overwritten. Each generated alias controls one target. Use the canonical
`--<node_id>_<input>` flag for additional linked inputs.

### `list`

```bash
comfy-agent list
comfy-agent list --json
comfy-agent list --global
comfy-agent list --source all
comfy-agent list --source remote --base-url http://127.0.0.1:8188
comfy-agent list --source remote-catalog --base-url http://127.0.0.1:8188
```

- `local`: presets under the selected work directory.
- `remote`: saved ComfyUI userdata workflows.
- `remote-catalog`: ComfyUI template catalog entries, only when explicitly requested.
- `all`: local and saved remote workflows.

Some remote catalog templates cannot run directly through the API. Save them once in
ComfyUI and use the resulting saved userdata workflow through `--source remote`.

### `run`

Resolve a preset, apply parameter/upload values, preflight the server, submit the
workflow, wait for completion, and download outputs.

```bash
comfy-agent run text2img_v1 --prompt "A cat" --steps 30
comfy-agent run text2img_v1 --prompt "A cat" --json
comfy-agent run text2img_v1 --prompt "A cat" --dry-run
comfy-agent run text2img_v1 --prompt "A cat" --n 3 --seed 42 --seed-step 1
comfy-agent run text2img_v1 --prompt "A cat" --async --json
comfy-agent run text2img_v1 --out ./generated --timeout-seconds 600
comfy-agent run text2img_v1 --source local --poll-interval-ms 1000
comfy-agent run text2img_v1 --global --prompt "A cat"
comfy-agent run portrait --character miko --form casual --json
```

Important options:

| Option                       | Meaning                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `--source <local\|remote\|remote-catalog>` | Select the preset/workflow source. |
| `--n <count>`                | Submit multiple runs.                                                       |
| `--seed <int\|random>` / `--seed-step <int>` | Set and advance seed targets. |
| `--out <dir>`                | Override the output directory.                                              |
| `--poll-interval-ms <ms>`    | Set history polling interval.                                               |
| `--timeout-seconds <sec>`    | Set completion timeout.                                                     |
| `--async`                    | Return after submission and persist job records.                            |
| `--dry-run`                  | Print the patched workflow without contacting ComfyUI.                      |
| `--no-preflight`             | Skip server node/model validation for debugging.                            |
| `--character <name>`         | Inject a local-first reusable character.                                    |
| `--form <id>`                | Select a character form (default: `default`).                               |
| `--character-ref <index\|file>` | Select a form-compatible character reference. |
| `--character-prompt <replace\|prefix\|off>` | Choose prompt injection mode (default: `replace`). |
| `--lora <file>`              | Overwrite the single `role: lora` target; also works without `--character`. |

`--seed` targets the first matching category: parameter name `seed`, alias `seed`,
then `role: seed`. If that category contains multiple targets, all receive the same
value and advance together. An explicit flag such as `--12_noise_seed 5` wins for
that target.

Character injection runs before required-input checks, seed resolution, dry-run, and
preflight. It writes the original and injected strings as `prompt_input` and
`prompt_final` in JSON, job records, and `run.json`. References only target uploads
with `role: reference_image`; `input_image` and `init_image` are never filled from a
character. A preset with multiple LoRA targets returns `LORA_TARGET_AMBIGUOUS`, while
an occupied single target is preserved unless `--lora` is explicit.

`run --dry-run --json` keeps its legacy raw-workflow shape when no character option is
used. With `--character`, it returns `{ok, workflow, prompt_input, prompt_final,
character}` so the injection remains inspectable.

Preset parameters use their generated alias or canonical `--<node_id>_<input>` flag.
If both are present, the later value wins. Upload flags come from `uploads.*.cli_flag`:

```bash
comfy-agent run inpaint_v1 --prompt "fix" --init-image ./in.png --mask ./mask.png
comfy-agent run talking_v1 --image ./portrait.png --audio ./voice.mp3
```

Remote source notes:

- `--source remote` targets workflows saved under ComfyUI `userdata/workflows`.
- Saved UI-format workflows (`nodes`/`links`) are converted to API prompt format.
- UI-only nodes such as notes are ignored when safe.
- For custom or complex graphs that cannot be converted, export ComfyUI API JSON and
  import it as a local preset.

#### Asynchronous runs

`run --async` submits prompt(s), writes `.comfy-agent/jobs/<job_id>.json`, and returns
immediately. Its JSON payload contains `async: true`, the output directory, and each
job's `job_id`, `prompt_id`, batch index, seed, status, and record path. Use
`jobs wait` to finish downloading later.

Every synchronous run also writes job records, so a locally interrupted command can
be resumed. ComfyUI history is in memory: if the server process or Colab runtime is
restarted, the job may become `JOB_LOST` and must be submitted again.

### `history`

Use `history` to inspect creative work; use `jobs` for operational inspection and
resuming submissions.

```bash
comfy-agent history
comfy-agent history list --preset portrait --kind image --limit 20
comfy-agent history --search "soft light" --since 7d --json
comfy-agent history --character miko --favorite --all-scopes --json
comfy-agent history show <job_id> --json
comfy-agent history note <job_id> "Keep the lighting soft" --json
comfy-agent history tag <job_id> portrait approved --json
comfy-agent history tag <job_id> reject --reason "identity drift" --json
comfy-agent history tag <job_id> reject --rm --json
comfy-agent history open <job_id>
```

List filters include `--preset`, `--character`, `--kind image|video|audio`, `--status`,
`--tag`, `--search`, `--since <ISO|7d|24h>`, `--favorite`, `--rejected`, and `--limit`
(default 30). The default scope is local; `--global` selects global records and
`--all-scopes` merges both. Cross-scope JSON truncates `prompt_final` to 60 characters
unless `--full-prompts` is set.
For a global character, `--character <name> --all-scopes` also follows that character's
cross-project `index.jsonl`; cross-project prompts use the same 60-character default.

`history show` includes the job record, `run.json`, the `verify/verify.json` summary when
present, and absolute output paths. Full job IDs and unique prefixes are accepted.
`history open` only prints the output directory and never opens a GUI.

### `character`

Character resources live independently under `.comfy-agent/characters/<name>/` (or the
global work directory with `--global`). A character directory contains `character.yaml`,
append-only `notes.md`, `gallery.json`, copied reference images under `refs/`, and copied
gallery artifacts under `gallery/`. A lookup without `--global` prefers local and then
falls back to global.

```yaml
version: 1
name: miko
display_name: Miko
appearance: dark bob hair, small red hairpin, brown eyes
triggers:
  default: m1ko
style: anime, soft lighting
negative: extra fingers, text
prompt_template: "{trigger} {appearance}, {prompt}, {style}"
forms:
  - id: default
  - id: casual
    appearance: dark bob hair, red hairpin, casual hoodie
references:
  - file: refs/front.png
    role: reference_image
    forms: [default]
loras:
  - file: miko_flux.safetensors
    strength: 1
    base: flux1
content_rating:
  age_depicted: teen
  allow_nsfw: false
privacy:
  export_refs: false
  export_gallery: false
```

The `default` form is mandatory and is added by `create` when omitted. Safe defaults
include an empty default trigger, `allow_nsfw: false`, and metadata-only exports.
Gallery additions copy job outputs into the character directory as `pending`; only
`gallery approve` marks them `human` and sets the corresponding job record's
`favorite` field.

```bash
comfy-agent character list [--global] [--json]
comfy-agent character create <name> [--display-name <text>] [--appearance <text>|--appearance-file <path>] [--trigger <text>] [--style <text>] [--negative <text>] [--age <age>] [--allow-nsfw] [--tag <tags...>] [--global] [--json]
comfy-agent character show <name> [--notes] [--gallery] [--full] [--global] [--json]
comfy-agent character update <name> [the create metadata options] [--global] [--json]
comfy-agent character note <name> <text> [--kit <preset-or-kit>] [--global] [--json]
comfy-agent character ref add <name> <path> [--role <role>] [--form <id>] [--note <text>] [--global] [--json]
comfy-agent character ref rm <name> <file> [--global] [--json]
comfy-agent character form add <name> <id> --appearance <text> [--ref <paths...>] [--global] [--json]
comfy-agent character lora add <name> <file> [--strength <n>] [--base <tag>] [--global] [--json]
comfy-agent character gallery add <name> <job_id> [--output <n>] [--caption <text>] [--tag <tags...>] [--form <id>] [--global] [--json]
comfy-agent character gallery approve <name> <gallery_ids...> [--global] [--json]
comfy-agent character gallery rm <name> <gallery_id> [--global] [--json]
comfy-agent character sheet <name> [--form <id>] [--out <png>] [--global] [--json]
comfy-agent character export <name> [--out <dir>] [--with-refs] [--with-gallery] [--global] [--json]
comfy-agent character import <dir> [--name <override>] [--global] [--force] [--json]
comfy-agent character rm <name> --force [--global] [--json]
```

`show --notes` returns the last 4,000 characters unless `--full` is present.
Exports always contain `character.yaml`, `notes.md`, and metadata-only `gallery.json`;
the two `--with-*` flags opt into copied binaries. Stored metadata paths remain relative.
Character commands return exit 2 errors such as `CHARACTER_NOT_FOUND`,
`CHARACTER_EXISTS`, `INVALID_CHARACTER`, `CHARACTER_REF_NOT_FOUND`,
`CHARACTER_FORM_NOT_FOUND`, `GALLERY_JOB_NOT_FOUND`, `GALLERY_ITEM_NOT_FOUND`, and
`CHARACTER_IMPORT_CONFLICT`.

`character sheet` tiles only `approved: human` gallery files. It uses the first
extracted frame for videos, defaults to `<character-dir>/sheet.png`, returns
`GALLERY_EMPTY` for no eligible items, and requires ffmpeg (`MISSING_TOOL`). Presets
intended for adult content must declare a tag such as `nsfw`, `adult`, or `explicit`;
these tags block characters whose `allow_nsfw` is false. Tag-based gating is a guard,
not a content classifier.

### `brief`

Use `brief` as the single memory lookup before generating a known character:

```bash
comfy-agent brief miko --preset portrait --json
comfy-agent brief miko --preset portrait --form casual
```

The result contains the resolved character/form and canonical appearance,
`applicable` prompt/negative/reference/LoRA flags with reasons, an exact
`prompt_preview`, kit notes, up to five preferred jobs (favorites first, then verified
jobs), rejected jobs under `avoid`, human-approved gallery metadata, the last 2,000
characters of notes, and warnings. It merges ordinary history with a global
character's cross-project usage index.

### `jobs`

Inspect, resume, and prune local job records.

```bash
comfy-agent jobs list
comfy-agent jobs list --status completed --limit 20 --json
comfy-agent jobs show <job_id> --json
comfy-agent jobs wait <job_id> --poll-interval-ms 1000
comfy-agent jobs wait <job_id> <another_job_id> --base-url <url> --json
comfy-agent jobs prune --older-than-days 30 --dry-run --json
```

`jobs list` and `jobs show` do not contact the server. Full IDs and unique prefixes of
at least four characters are accepted by `show` and `wait`; an ambiguous prefix returns
`JOB_AMBIGUOUS_ID`. A specific lookup falls back to the other workdir scope. Completed
jobs are safe to wait for again. `prune` removes only terminal records older than the
selected age and never deletes generated outputs.

### `doctor`

Inspect workdir configuration and server reachability.

```bash
comfy-agent doctor
comfy-agent doctor --json
comfy-agent doctor --global
comfy-agent doctor --all-scopes
comfy-agent doctor --preset text2img_v1
comfy-agent doctor --preset text2img_v1 --json
```

With `--preset`, `doctor` fetches `/object_info` and reports whether the server has
every referenced node class and model file. Missing dependencies return exit 3. A
plain connection failure is represented inside the normal doctor payload as
`connection: { ok: false, error: { code, message, details } }`.

### `status`

Show resolved runtime settings: scope, base URL and its source, workdir state, and
preset count.

```bash
comfy-agent status
comfy-agent status --json
comfy-agent status --global
comfy-agent status --base-url <url>
```

### `preset`

Show a human- and agent-readable preset definition.

```bash
comfy-agent preset text2img_v1
comfy-agent preset text2img_v1 --json
comfy-agent preset text2img_v1 --global
comfy-agent preset text2img_v1 --source local
comfy-agent preset text2img_v1 --source remote --base-url http://127.0.0.1:8188
```

If the name exists in both local and remote sources, select one explicitly with
`--source`.

### `verify`

Inspect generated artifact metadata offline and create files that make visual or
audio review easier. Directories use `run.json` when present; otherwise their
immediate output files are scanned. No API key is required.

```bash
comfy-agent verify .comfy-agent/outputs/text2img_v1/<timestamp> --json
comfy-agent verify ./clip.mp4 --expect-kind video --min-duration 4
comfy-agent verify ./images --expect-kind image --expect-count 4 --expect-size 1280x704
comfy-agent verify ./audio.flac --hash --no-ffmpeg
comfy-agent verify ./clip.mp4 --frames 6 --sheet contact.png --out ./inspection
```

The built-in probe reports format, dimensions, duration, frame count, and audio
metadata for common image/video/audio formats, including animated WEBP. When
`ffmpeg` is available, `verify` can also write video frames, contact sheets, and
audio waveforms under `<run-dir>/verify/`. `--no-sheet` disables the default sheet;
`--no-ffmpeg` performs built-in probing only.

Expectation failures return `VERIFY_CHECKS_FAILED` with exit 3 and save the complete
report to `verify/verify.json`. `summary.verified_visually` is always `false`: open
the generated sheet/frames or pass an image to `analyze` before claiming the content
was inspected.

### `analyze`

Use OpenAI image input to evaluate whether a generated image matches an instruction.

```bash
export OPENAI_API_KEY=...
comfy-agent analyze ./output.png --prompt "A cat on a sofa"
comfy-agent analyze ./output.png --prompt "A cat" --json
comfy-agent analyze ./output.png --prompt "A cat" --out ./analysis.json
comfy-agent analyze ./output.png --prompt "A cat" --detail low --threshold 0.8
```

Optional controls include `--model`, `--detail <low|high|auto>`, `--threshold`,
`--temperature`, `--max-output-tokens`, and `--api-key`.

### `playbook`

Read policy documents bundled with the npm package.

```text
comfy-agent playbook [agent-playbook|minimax-h3-prompting]
  [--section <n|slug>] [--list] [--path] [--json]
```

- With no selector, print the complete document.
- `--section` prints one `##` section by number or slug.
- `--list` lists the document's sections.
- `--path` prints the installed package's resolved document path.
- The default document is `agent-playbook`.

### `skill`

List or install agent skills bundled with the package.

```text
comfy-agent skill list [--json]
comfy-agent skill install [<name>...]
  --agent <claude|codex|cursor|gemini|openclaw>
  [--global|--project|--dir <path>] [--force] [--dry-run] [--json]
```

The default installation scope is the current project. Omitting skill names installs
all bundled skills. Installed directories contain a rewritten `SKILL.md`, local
`references/`, and a `.comfy-agent-skill.json` ownership marker. A marked installation
can be updated by rerunning the command. An unmarked directory requires `--force`.
Use `--dry-run` to preview file operations.

### `colab`

Read the bundled, machine-readable kit catalog, rank compatible workflows, or resolve
the installed files for one kit.

```bash
comfy-agent colab catalog --json
comfy-agent colab suggest "fast image generation on a T4" --json
comfy-agent colab suggest "anime video" --task text_to_video --output video --gpu A100 --limit 5
comfy-agent colab kit z_image
comfy-agent colab kit z_image --json
```

`colab suggest` filters incompatible task, output, audio, and GPU requirements, then
ranks compatible workflows by goal fit and reliability. `catalog --json` and
`suggest --json` contain portable catalog-relative paths only.

`colab kit <name>` prints installed paths for the kit directory, its `01_setup.py`,
the shared `02_start_comfyui.py`, and its workflow JSON files. Its JSON envelope is:

```json
{
  "ok": true,
  "kit": { "name": "z_image" },
  "paths": {
    "dir": "/path/to/package/scripts/colab/z_image",
    "setup": "/path/to/package/scripts/colab/z_image/01_setup.py",
    "launcher": "/path/to/package/scripts/colab/02_start_comfyui.py",
    "workflows": {
      "z_image_turbo.json": "/path/to/package/scripts/colab/z_image/z_image_turbo.json"
    }
  }
}
```

The `kit` object contains the full selected catalog entry; paths are local by design.

## Usage notes

- Dynamic parameters use `--param value` and must match a preset parameter or alias.
- Upload flags come from `uploads.*.cli_flag`.
- `--dry-run` prints patched workflow JSON without calling the API.
- The default output path is
  `.comfy-agent/outputs/<preset>/<YYYYmmdd_HHMMSS>/`.
- Completed runs project metadata to `run.json`; `verify` writes inspection aids and
  `verify.json` below its `verify/` subdirectory.
- `run` logs the resolved output directory and each saved file path.
- WebSocket progress falls back to polling when its channel is unavailable or lost.
- Iteration uses `--n`; seeds use `--seed random` or
  `--seed <int> --seed-step <int>`.
- For multiple servers, prefer separate project work directories or reconnect before
  switching servers.
- Video output is saved from `/history` metadata just like image/audio output.
- `analyze` requires `OPENAI_API_KEY`; `verify` does not.

## Generate → analyze → adjust

1. Generate:

   ```bash
   comfy-agent run text2img_v1 --prompt "A cat on a sofa" --steps 30
   ```

2. Analyze a saved image:

   ```bash
   export OPENAI_API_KEY=...
   comfy-agent analyze .comfy-agent/outputs/text2img_v1/20260203_120000/00001_123_1.png \
     --prompt "A cat on a sofa" --json
   ```

3. Adjust the prompt or parameters and regenerate:

   ```bash
   comfy-agent run text2img_v1 --prompt "A fluffy orange cat on a sofa" --steps 35
   ```

For video or audio, run `verify` first to check metadata and create review aids, then
inspect the result before adjusting the next run.

## Analyze limits

- Supported image types: PNG, JPEG, WEBP, and non-animated GIF.
- Images larger than 8 MiB are rejected by the API path used here.
- `--detail low` is cheaper but may reduce accuracy.
- Direct video analysis is not supported; use `verify` to extract frames first.

## Preset definition

```yaml
version: 1
name: text2img_v1
workflow: text2img_v1.json
parameters:
  prompt:
    type: string
    target:
      node_id: 12
      input: text
    required: true
  negative:
    type: string
    target:
      node_id: 13
      input: text
    default: ""
  steps:
    type: int
    target:
      node_id: 5
      input: steps
    default: 30
uploads:
  init_image:
    kind: image
    cli_flag: --init-image
    target:
      node_id: 21
      input: image
  mask:
    kind: mask
    cli_flag: --mask
    target:
      node_id: 22
      input: mask
  audio:
    kind: audio
    cli_flag: --audio
    target:
      node_id: 23
      input: audio
```

### Metadata fields

Every field below is optional. Existing presets remain valid without metadata. Apart
from `aliases`, metadata describes intent and does not change workflow execution.

Preset-level fields:

| Field         | Type     | Meaning                                                                                                                                                                                                           |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description` | string   | What the preset does.                                                                                                                                                                                             |
| `task`        | enum     | `text_to_image`, `image_to_image`, `image_edit`, `remove_background`, `inpaint`, `upscale`, `text_to_audio`, `audio_to_audio`, `audio_inpaint`, `text_to_video`, `image_to_video`, `video_to_video`, or `custom`. |
| `tags`        | string[] | Free-form discovery labels.                                                                                                                                                                                       |

Parameter fields, in addition to `type`, `target`, `required`, and `default`:

| Field         | Type     | Meaning                                                                                                                                                                                |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description` | string   | Human/agent-readable explanation.                                                                                                                                                      |
| `role`        | enum     | `prompt`, `negative_prompt`, `seed`, `steps`, `guidance`, `width`, `height`, `sampler`, `scheduler`, `model`, `lora`, `lora_strength`, `strength`, `denoise`, `advanced`, or `custom`. |
| `aliases`     | string[] | Alternate CLI flags accepted by `run`.                                                                                                                                                 |
| `min` / `max` | number   | Advisory numeric bounds.                                                                                                                                                               |
| `choices`     | array    | Advisory list of allowed values.                                                                                                                                                       |
| `recommended` | any      | Advisory suggested value.                                                                                                                                                              |

Upload fields:

| Field         | Type     | Meaning                                                                                                                               |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`        | enum     | `image`, `mask`, `audio`, or `file`.                                                                                                  |
| `cli_flag`    | string   | CLI flag accepted by `run`, such as `--image` or `--audio`.                                                                           |
| `target`      | object   | Workflow node input that receives the uploaded filename.                                                                              |
| `description` | string   | Human/agent-readable explanation.                                                                                                     |
| `role`        | enum     | `init_image`, `mask`, `reference_image`, `control_image`, `input_image`, `input_audio`, `reference_audio`, `input_file`, or `custom`. |
| `aliases`     | string[] | Alternate CLI flags accepted by `run`.                                                                                                |
| `required`    | boolean  | Whether the upload must be provided.                                                                                                  |

`import` fills descriptions, recognized roles, numeric hints, and common aliases.
Graph structure is considered before input names. It does not generate a `seed` alias;
the dedicated `--seed` resolution uses the seed role. `list --json` and
`preset --json` include all metadata.

## JSON output

Use `--json` to print JSON-only output. All commands that support it use an
`{ "ok": ... }` envelope for success and failure. `run --dry-run --json` emits raw
patched workflow JSON when no character option is present so it can be sent directly
to ComfyUI. With `--character`, it returns an envelope containing `workflow`,
`prompt_input`, `prompt_final`, and character injection details.

Success example:

```json
{
  "ok": true,
  "preset": "text2img_v1",
  "source": "local",
  "base_url": "http://127.0.0.1:8188",
  "scope": "local",
  "output_dir": ".comfy-agent/outputs/text2img_v1/20260203_120000",
  "runs": [
    {
      "index": 1,
      "prompt_id": "xxxxxxxx",
      "seed": 123,
      "outputs": [
        {
          "filename": "00001.png",
          "subfolder": "",
          "type": "output",
          "saved_to": ".comfy-agent/outputs/text2img_v1/20260203_120000/00001_123_1.png"
        }
      ],
      "duration_ms": 12345,
      "progress_events": []
    }
  ]
}
```

Error example:

```json
{
  "ok": false,
  "error": {
    "code": "MISSING_REQUIRED_PARAM",
    "message": "prompt is required",
    "details": { "param": "prompt" }
  }
}
```

Do not parse human-readable stdout. Branch on `ok`, `error.code`, and documented
`details` fields.

## Exit codes

The CLI returns only `0`, `2`, or `3`:

- `0`: success.
- `2`: the invocation, input, or local environment is invalid; fix the command or
  local files.
- `3`: the inspected or executed target state differs from what was expected, such
  as a server failure or artifact mismatch; regenerate or retry.

`INVALID_PARAM` means a value has an invalid type or range. `INVALID_USAGE` means
the argument structure is invalid, including missing required options, unknown
commands, and extra positional arguments.

## Typical errors

| Code                         | Exit | Meaning and recovery                                                                                                                                                                              |
| ---------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_USAGE`              |    2 | Invalid command structure. Fix missing/unknown arguments or extra positionals; Commander failures include `details.commander_code`.                                                               |
| `INVALID_PARAM`              |    2 | Invalid option value or range.                                                                                                                                                                    |
| `UNSUPPORTED_RUNTIME`        |    2 | Required Node.js runtime globals are unavailable. Use Node.js 22 or newer; details include `node`, `required`, and `missing`.                                                                     |
| `WORKDIR_NOT_FOUND`          |    2 | No workdir exists for a command that requires one. Run `init` or a successful `connect`.                                                                                                          |
| `WORKDIR_NOT_WRITABLE`       |    2 | The jobs directory cannot be created or written; inspect `details.path` and `details.cause`.                                                                                                      |
| `WORKDIR_CONFLICT`           |    2 | A workdir path exists but is not a directory; inspect it or use `init --force`.                                                                                                                   |
| `FILE_NOT_FOUND`             |    2 | An input workflow, upload, analyze target, or verify target is missing.                                                                                                                           |
| `FILE_EXISTS`                |    2 | Import target or unmarked skill directory already exists; use `--force` only after checking the target.                                                                                           |
| `INVALID_PRESET`             |    2 | Preset YAML does not match the required structure.                                                                                                                                                |
| `PRESET_NOT_FOUND`           |    2 | The requested preset is unavailable in the selected source.                                                                                                                                       |
| `PRESET_SOURCE_AMBIGUOUS`    |    2 | The same preset exists locally and remotely; pass `--source`.                                                                                                                                     |
| `MISSING_REQUIRED_PARAM`     |    2 | A required preset parameter is missing; `details.param` identifies it.                                                                                                                            |
| `MISSING_REQUIRED_UPLOAD`    |    2 | A required upload flag is missing.                                                                                                                                                                |
| `UNKNOWN_PARAM`              |    2 | A dynamic `run` flag is not defined by the preset.                                                                                                                                                |
| `SERVER_UNREACHABLE`         |    3 | The server cannot be reached. Check `base_url`, start the server, or reconnect an expired tunnel.                                                                                                 |
| `API_ERROR`                  |    3 | The server was reached but a request failed; inspect the path/status details.                                                                                                                     |
| `MISSING_NODE_ON_SERVER`     |    3 | Workflow node classes are absent; inspect `details.missing_nodes`.                                                                                                                                |
| `MISSING_MODEL_ON_SERVER`    |    3 | Model files are absent; inspect `details.missing_models[].value` and match it to `colab catalog --json` assets.                                                                                   |
| `EXECUTION_FAILED`           |    3 | ComfyUI failed or interrupted execution. Inspect `category`, `kind`, node/exception fields, partial outputs, and output directory. Reduce resolution/steps for `oom`; retry an interruption once. |
| `NO_OUTPUTS`                 |    2 | Execution completed without saved files. Add an appropriate `Save*` node.                                                                                                                         |
| `TIMEOUT`                    |    3 | Completion exceeded `--timeout-seconds`; retry once with a suitable larger value.                                                                                                                 |
| `JOB_NOT_FOUND`              |    2 | No local record matches the requested job ID or prefix.                                                                                                                                           |
| `JOB_AMBIGUOUS_ID`           |    2 | A job prefix matches multiple records; use a longer or full ID.                                                                                                                                   |
| `INVALID_JOB_RECORD`         |    2 | A local job JSON record is malformed or unsafe.                                                                                                                                                   |
| `JOB_LOST`                   |    3 | The job is absent from both server history and queue, commonly after a runtime restart. Re-run the preset using the stored arguments.                                                             |
| `VERIFY_CHECKS_FAILED`       |    3 | One or more explicit artifact expectations failed; inspect `details.failed` and `details.report`.                                                                                                 |
| `MISSING_TOOL`               |    2 | An explicitly requested verify artifact needs ffmpeg; install it or remove the explicit frames/sheet request.                                                                                     |
| `UNSUPPORTED_FORMAT`         |    2 | A single verify target cannot be parsed by the built-in probe or ffprobe.                                                                                                                         |
| `RESOURCE_NOT_FOUND`         |    2 | A bundled package resource is missing; details contain `resource` and `path`. Reinstall the package.                                                                                              |
| `PLAYBOOK_NOT_FOUND`         |    2 | Unknown playbook name; `details.available` lists choices.                                                                                                                                         |
| `PLAYBOOK_SECTION_NOT_FOUND` |    2 | Unknown playbook section; `details.available` lists sections.                                                                                                                                     |
| `SKILL_AGENT_UNSUPPORTED`    |    2 | Unknown install target; `details.supported` lists agent names.                                                                                                                                    |
| `SKILL_NOT_FOUND`            |    2 | Unknown bundled skill; `details.available` lists skills.                                                                                                                                          |
| `SKILL_SCOPE_CONFLICT`       |    2 | More than one of `--global`, `--project`, or `--dir` was selected.                                                                                                                                |
| `SKILL_INSTALL_FAILED`       |    2 | Local skill installation failed; inspect `details.path` and `details.cause`.                                                                                                                      |
| `COLAB_KIT_NOT_FOUND`        |    2 | Unknown kit name; `details.available` lists installed catalog entries.                                                                                                                            |
| `COLAB_CATALOG_UNAVAILABLE`  |    2 | The bundled catalog cannot be found. Reinstall the package.                                                                                                                                       |
| `COLAB_CATALOG_READ_FAILED`  |    2 | The bundled catalog could not be read.                                                                                                                                                            |
| `INVALID_COLAB_CATALOG`      |    2 | The bundled catalog failed schema validation.                                                                                                                                                     |
| `MISSING_API_KEY`            |    2 | `analyze` needs `OPENAI_API_KEY` or `--api-key`.                                                                                                                                                  |
| `UNSUPPORTED_IMAGE`          |    2 | `analyze` received an unsupported image format.                                                                                                                                                   |
| `OPENAI_API_ERROR`           |    3 | The OpenAI request failed.                                                                                                                                                                        |

`run` preflights the server before submission. Use `--no-preflight` only for
targeted debugging, because it defers missing-node/model failures to ComfyUI.
