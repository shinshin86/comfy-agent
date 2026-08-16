# Comfy Agent

![Logo](https://github.com/shinshin86/comfy-agent/raw/main/assets/comfy-agent-logo.png)

Comfy Agent is a tool to use ComfyUI from the CLI.  
It is suitable for both direct CLI usage and AI-agent-driven automation.

Japanese documentation: [README.ja.md](./README.ja.md)

## QuickStart

The fastest way to try with local ComfyUI (`http://127.0.0.1:8188`) is below.

1. Install CLI

```bash
npm install -g comfy-agent
comfy-agent --help
```

2. Save ComfyUI `default` once in the browser UI

![Quick Start - 1](https://github.com/shinshin86/comfy-agent/raw/main/assets/quick-start_1.png)

- Open ComfyUI in your browser (for example `http://127.0.0.1:8188`)
- Load the built-in `default` workflow and click **Save** once
- This makes it available as `default [remote]` from CLI

**Note: You need to save the workflow once in ComfyUI, otherwise `comfy-agent` cannot discover it.**

3. List and run it from CLI

```bash
comfy-agent list --source remote --base-url http://127.0.0.1:8188
comfy-agent run default --source remote --base-url http://127.0.0.1:8188 --prompt "A cat"
```

Generated files are saved under `.comfy-agent/outputs/<preset>/<timestamp>/` by default.

If you want to use your own workflow JSON instead, see the `import` section below.

If you use ComfyUI running on Google Colab, you can run it by specifying the URL with `--base-url`.

## Run on Google Colab

No local GPU? Run ComfyUI on a Colab GPU runtime and drive it from
`comfy-agent` on your laptop over a cloudflared tunnel.

There are currently **36 ready-to-paste kits** under
[`scripts/colab/`](./scripts/colab/). The table below mirrors the implemented
kit catalog; each link includes its setup script, workflows, parameters, GPU
notes, and license cautions.

| Media | Kit / model | Status | Minimum GPU | Capability |
| --- | --- | --- | --- | --- |
| Image | [`z_image/`](./scripts/colab/z_image/) | Verified | T4 | Z-Image Turbo text-to-image |
| Image | [`sdxl/`](./scripts/colab/sdxl/) | Verified | T4 | Stable Diffusion XL Base text-to-image |
| Image | [`sdxl_turbo/`](./scripts/colab/sdxl_turbo/) | Verified | T4 | SDXL Turbo one-step text-to-image |
| Image | [`anima/`](./scripts/colab/anima/) | Verified | T4 | Anima Base v1.0 anime text-to-image |
| Image | [`ooo_anima/`](./scripts/colab/ooo_anima/) | Verified | T4 | OOO_Anima v10 anime text-to-image |
| Image | [`anima_pencil/`](./scripts/colab/anima_pencil/) | Verified | T4 | anima_pencil v2 anime text-to-image |
| Image | [`z_anime/`](./scripts/colab/z_anime/) | Partial | T4 | Z-Anime base / distilled text-to-image |
| Image | [`qwen_image/`](./scripts/colab/qwen_image/) | Starter | L4 | Qwen-Image text-to-image |
| Image | [`qwen_image_edit/`](./scripts/colab/qwen_image_edit/) | Starter | L4 | Qwen-Image-Edit instruction-based editing |
| Image | [`boogu/`](./scripts/colab/boogu/) | Verified | L4 | Boogu-Image Turbo text-to-image |
| Image | [`krea2/`](./scripts/colab/krea2/) | Verified | L4 | Krea 2 Turbo text-to-image |
| Image | [`flux1/`](./scripts/colab/flux1/) | Verified | L4 | Flux 1 dev text-to-image |
| Image | [`flux2/`](./scripts/colab/flux2/) | Verified | A100 | Flux 2 dev text-to-image |
| Image | [`hidream_i1/`](./scripts/colab/hidream_i1/) | Verified | L4 | HiDream-I1 Fast / Dev / Full text-to-image |
| Image | [`hidream_o1/`](./scripts/colab/hidream_o1/) | Verified | A100 | HiDream-O1 Dev reasoning-oriented 2K text-to-image |
| Image | [`ideogram4/`](./scripts/colab/ideogram4/) | Verified | L4 | Ideogram 4.0 text-to-image with strong text rendering |
| Image | [`sd35/`](./scripts/colab/sd35/) | Verified | L4 | Stable Diffusion 3.5 Large text-to-image |
| Image | [`birefnet/`](./scripts/colab/birefnet/) | Verified | T4 | BiRefNet background removal / transparent PNG |
| Image | [`seedvr2/`](./scripts/colab/seedvr2/) | Verified | L4 | SeedVR2 image upscaling and restoration |
| Video | [`wan21/`](./scripts/colab/wan21/) | Partial | T4 | Wan 2.1 1.3B / 14B text-to-video |
| Video | [`wan22/`](./scripts/colab/wan22/) | Partial | A100 | Wan 2.2 TI2V 5B / T2V 14B |
| Video | [`wan22_s2v/`](./scripts/colab/wan22_s2v/) | Verified | A100 | Wan 2.2 S2V reference-image + audio-to-video |
| Video | [`animegen_t2v/`](./scripts/colab/animegen_t2v/) | Verified | A100 | AnimeGen-T2V anime text-to-video |
| Video | [`hunyuan_video/`](./scripts/colab/hunyuan_video/) | Verified | L4 | Hunyuan Video text-to-video |
| Video | [`ltx23/`](./scripts/colab/ltx23/) | Starter | A100 | LTX-2.3 image / image+audio-to-video |
| Video | [`ltx23_t2v/`](./scripts/colab/ltx23_t2v/) | Verified | A100 | LTX-2.3 text-to-video with generated audio |
| Video | [`ltx25/`](./scripts/colab/ltx25/) | Verified | A100 | LTX-2.5 T2V / I2V / first-last-frame video with audio |
| Video | [`minimax_h3/`](./scripts/colab/minimax_h3/) | Verified | A100 | MiniMax H3 T2V / I2V with native stereo audio |
| Video | [`sulphur2/`](./scripts/colab/sulphur2/) | Verified | A100 | Sulphur-2 T2V / I2V |
| Video | [`10eros/`](./scripts/colab/10eros/) | Partial | A100 | 10Eros T2V / I2V |
| Audio | [`ace_step_1_5/`](./scripts/colab/ace_step_1_5/) | Partial | T4 | ACE-Step 1.5 full songs with lyrics and vocals |
| Audio | [`minimax_music3/`](./scripts/colab/minimax_music3/) | Verified | L4 | MiniMax Music 3 songs with lyrics and vocals |
| Audio | [`stable_audio3_small_music/`](./scripts/colab/stable_audio3_small_music/) | Partial | T4 | Stable Audio 3 Small Music instrumental / BGM |
| Audio | [`stable_audio3/`](./scripts/colab/stable_audio3/) | Verified | L4 | Stable Audio 3 Medium music and sound effects |
| Audio | [`moss_soundeffect_v2/`](./scripts/colab/moss_soundeffect_v2/) | Verified | A100 | MOSS-SoundEffect v2 48 kHz sound effects |
| Combo | [`music_video/`](./scripts/colab/music_video/) | Verified | A100 | Song + keyframes + video clips music-video recipe |

Statuses describe verification evidence, not model quality: **Verified** has
passed the complete Colab-to-local CLI flow; **Partial** has verified only
some GPUs or workflow variants; **Starter** is statically validated but still
awaits recorded end-to-end verification. Some kits have gated,
non-commercial, territory, or acceptable-use restrictions—review the linked
kit README before downloading models or choosing a paid GPU runtime.

Flow (same for every kit):

1. Open a Colab notebook, pick the recommended GPU runtime.
2. Paste the kit's `01_setup.py` into a cell and run — installs ComfyUI,
   downloads model weights and cloudflared.
3. Paste [`scripts/colab/02_start_comfyui.py`](./scripts/colab/02_start_comfyui.py)
   into the next cell and run — ComfyUI and the tunnel start in background.
4. Read the public URL:

   ```python
   !cat /content/comfy_url.txt
   ```

5. Back on your machine, import the bundled workflow once, connect the current
   tunnel URL, preflight the preset, and run it:

   ```bash
   comfy-agent import ./scripts/colab/z_image/z_image_turbo.json --name z_image_turbo
   comfy-agent connect https://<id>.trycloudflare.com
   comfy-agent doctor --preset z_image_turbo
   comfy-agent run z_image_turbo --prompt "a cat riding a bicycle"
   ```

Notes:

- Presets, workflows, and outputs stay local under `.comfy-agent/`. After a
  Colab reset, rerun the kit cells to restore ComfyUI and its models, then run
  `comfy-agent connect <new-url>` and resume without importing again.
- See each kit's `README.md` for model-specific parameter flags and
  VRAM/runtime expectations.

Agent-readable kit metadata is available via the `colab` helper command:

```bash
comfy-agent colab catalog --json
comfy-agent colab suggest "fast image generation on a T4" --json
comfy-agent doctor --json
comfy-agent doctor --preset <preset> --json
```

`colab suggest` filters out incompatible media, audio capabilities, and GPU
requirements first, then ranks compatible workflows by goal fit and reliability
(`verified` > `partial` > `starter`). If nothing is compatible, `--json`
returns alternatives together with their unmet requirements.
The optional `gpu.verified` list records GPUs exercised in E2E tests; it is
separate from the declared `gpu.minimum` compatibility floor.

The catalog also exposes model assets, estimated download size/setup time,
composability, and license notes. `doctor --preset` checks whether the current
server has every required model and node, while `run` performs the same
preflight automatically. See the [Agent Playbook](./docs/agent-playbook.md)
for the complete blueprint, recovery, and artifact-verification flow.

Note: `colab` is a repository-side helper. It reads
`scripts/colab/catalog.yaml`, which is **not** bundled in the npm package, so
run it from a checkout of this repository. The catalog is intentionally
portable — paths are relative to `scripts/colab/` and the JSON output never
includes local filesystem paths or environment values.

## Prerequisites

- Node.js 22+
- Running ComfyUI server (default: `http://127.0.0.1:8188`)

## Installation

From npm (recommended):

```bash
npm install -g comfy-agent
comfy-agent --help
```

From source (for contributors):

```bash
npm install
npm run build
npm run dev -- init
npm run dev -- list
```

## Work Directory

`comfy-agent init` creates `.comfy-agent/`:

```text
.comfy-agent/
  workflows/
  presets/
  outputs/
  cache/
```

### Global Scope

Use `--global` to switch to `~/.config/.comfy-agent`.

```bash
comfy-agent init --global
comfy-agent list --global
comfy-agent run text2img_v1 --global --prompt "A cat"
```

## ComfyUI Integration Flow

- POST `/prompt` with workflow JSON to enqueue
- Poll GET `/history/{prompt_id}` until done
- Read output `filename/subfolder/type` from history, then download via GET `/view`
- Upload input files to POST `/upload/image` or `/upload/mask` when needed
  (audio/file uploads also use ComfyUI's input upload path and can target
  nodes such as `LoadAudio`)
- During `import`, GET `/object_info` (if available) to improve type inference
  and to expand ComfyUI subgraph templates safely

## `base_url` Precedence

1. `--base-url`
2. `COMFY_AGENT_BASE_URL`
3. `base_url` in `.comfy-agent/config.yaml` (written by `comfy-agent connect`;
   the command's scope is checked first, then the other scope)
4. default `http://127.0.0.1:8188`

## Commands

### `init`

```bash
comfy-agent init
comfy-agent init --global
```

### `import`

Import a ComfyUI API JSON or saved UI workflow JSON and generate a preset
template.

```bash
comfy-agent import ./workflow_api.json --name text2img_v1
comfy-agent import ./workflow_api.json --name text2img_v1 --base-url http://127.0.0.1:8188
comfy-agent import ./workflow_api.json --name text2img_v1 --global
comfy-agent import ./workflow_api.json --name text2img_v1 --force
```

UI workflows containing `definitions.subgraphs` require a reachable target
ComfyUI server. `comfy-agent` uses its live `/object_info` input order to
flatten active subgraph nodes into API nodes before saving locally. It stops
with a concrete error when a node schema is unavailable or when a muted/bypass
execution mode cannot be represented safely; it does not save the subgraph
UUID as a node class. Direct import from unsaved in-memory editor state is not
supported—save or download the workflow JSON first.

If `/object_info` is available, inference is enhanced and cached at `.comfy-agent/cache/object_info.json`.

Generated presets are annotated automatically to make them easier for humans and AI agents to read:

- A `description` is added to every parameter.
- A `role` (for example `prompt`, `seed`, `steps`, `guidance`, `width`, `height`, `sampler`, `scheduler`, `denoise`, `strength`) is inferred from the node class and input name when recognizable. Inputs that are not recognized are left without a `role`.
- Numeric hints are added for known roles: `min: 1` for `steps`/`width`/`height`, `min: 0` for `guidance`, and `min: 0` / `max: 1` for `denoise`/`strength`.
- Recognized inputs receive stable aliases such as `--prompt`, `--negative`,
  `--steps`, `--cfg`, `--width`, and `--height`. Video/audio workflows may
  also receive `--length`, `--fps`, `--seconds`, or `--lyrics`.

Existing presets gain generated aliases after re-importing with `--force`.
Handwritten aliases are retained when the parameter target is unchanged;
other handwritten preset edits are overwritten as before. Each generated
alias controls one target only. Workflows that require equal values on a
second sampler, scheduler, duration, or dimension input still require that
input's canonical `--<node_id>_<input>` flag.

These fields are advisory metadata only — they do not change how the workflow runs. See [Preset Definition](#preset-definition) for the full list of supported fields.

### `list`

```bash
comfy-agent list
comfy-agent list --json
comfy-agent list --global
comfy-agent list --source all
comfy-agent list --source remote --base-url http://127.0.0.1:8188
comfy-agent list --source remote-catalog --base-url http://127.0.0.1:8188
```

- `--source all`: `local + remote` (saved userdata workflows)
- `--source remote-catalog`: show catalog entries only when explicitly requested

Note: `remote-catalog` means templates already available in ComfyUI. Some of them cannot be executed directly via API, so save them once in ComfyUI and use them as remote saved workflows.

### `run`

```bash
comfy-agent run text2img_v1 --prompt "A cat" --steps 30
comfy-agent run text2img_v1 --prompt "A cat" --json
comfy-agent run text2img_v1 --prompt "A cat" --dry-run
comfy-agent run text2img_v1 --prompt "A cat" --n 3 --seed 42 --seed-step 1
comfy-agent run text2img_v1 --global --prompt "A cat"
comfy-agent run image_z_image_turbo --source remote-catalog --prompt "A cat" --base-url http://127.0.0.1:8188
```

- `--seed` targets the first matching category: parameter name `seed`, then alias `seed`, then `role: seed`.
- If that category has multiple targets, the same value is applied to all of them; `--seed-step` advances them together.
- An explicit parameter flag such as `--12_noise_seed 5` takes priority over `--seed` for that target.

With uploads:

```bash
comfy-agent run inpaint_v1 --prompt "fix" --init-image ./in.png --mask ./mask.png
comfy-agent run talking_v1 --image ./portrait.png --audio ./voice.mp3
```

If a preset parameter or upload defines `aliases`, any alias can be used in
place of its canonical flag. `import` generates aliases for recognized common
inputs, while aliases can also be added by hand. Canonical
`--<node_id>_<input>` flags remain available, and when both forms are present
the later value wins.

Remote source notes:

- `--source remote` targets saved ComfyUI workflows from `userdata/workflows` (runnable path).
- `--source remote-catalog` targets template catalog entries (advanced/explicit use).
- Save workflows under ComfyUI `userdata/workflows` so they can be discovered by `list --source remote`.
- If the saved file is in ComfyUI UI format (`nodes`/`links`), it is converted to API prompt format automatically.
- Some UI-only nodes (for example notes) are ignored during conversion.
- For some catalog entries, workflow JSON may not be directly downloadable from API endpoints.
- If validation still fails for complex/custom graphs, export API JSON from ComfyUI and import it as a local preset.

### `connect`

Verify a ComfyUI base URL and persist it to `.comfy-agent/config.yaml`, so
later commands need no `--base-url` / env var. Designed for ephemeral servers
(e.g. Colab + trycloudflare, where the URL changes every session): re-running
`connect` with the new URL is the only step needed after a runtime restart.

```bash
comfy-agent connect https://xxxx.trycloudflare.com
comfy-agent connect https://xxxx.trycloudflare.com --json
comfy-agent connect http://127.0.0.1:8188 --global
comfy-agent connect https://xxxx.trycloudflare.com --force   # save even if unreachable
```

### `doctor`

```bash
comfy-agent doctor
comfy-agent doctor --json
comfy-agent doctor --global
comfy-agent doctor --all-scopes
comfy-agent doctor --preset text2img_v1        # also check server has the models/nodes
comfy-agent doctor --preset text2img_v1 --json
```

With `--preset`, doctor additionally fetches `/object_info` and reports
whether the connected server has every node class and model file the preset's
workflow references (`preflight` section in `--json`; exit code 3 when
something is missing).

### `status`

Show currently resolved runtime settings (scope, base URL source, workdir state, preset count).

```bash
comfy-agent status
comfy-agent status --json
comfy-agent status --global
```

### `preset`

Show a user-friendly view of a preset definition.

```bash
comfy-agent preset text2img_v1
comfy-agent preset text2img_v1 --json
comfy-agent preset text2img_v1 --global
comfy-agent preset text2img_v1 --source local
comfy-agent preset text2img_v1 --source remote --base-url http://127.0.0.1:8188
```

### `analyze`

Analyze whether a generated image matches the instruction by using OpenAI image input.

```bash
export OPENAI_API_KEY=...
comfy-agent analyze ./output.png --prompt "A cat on a sofa"
comfy-agent analyze ./output.png --prompt "A cat" --json
comfy-agent analyze ./output.png --prompt "A cat" --out ./analysis.json
```

## Usage Notes

- Dynamic parameters use `--param value` (must match preset `parameters` names)
- Upload flags are defined in `uploads.*.cli_flag` (example: `--init-image`)
- `--dry-run` prints patched workflow JSON without calling API
- Default output path: `.comfy-agent/outputs/<preset>/<YYYYmmdd_HHMMSS>/`
- `run` logs the resolved output directory before execution and each saved file path
- `run` uses WebSocket progress by default; if the progress channel is lost, it automatically falls back to polling and continues monitoring
- Iteration uses `--n`; seed uses `--seed random` or `--seed <int> --seed-step <int>`
- Keep base URL out of presets and switch with `--base-url` or `COMFY_AGENT_BASE_URL`
- For multiple servers, use separate work directories
- Video outputs are saved according to `/history` output metadata
- `analyze` requires `OPENAI_API_KEY`
- Language can be switched with `--lang ja` or `COMFY_AGENT_LANG=ja` (default `en`)
- Remote workflow quick guide (English, user-facing): `docs/remote-workflow-resolution-quick.md`
- Remote workflow quick guide (Japanese, user-facing): `docs/remote-workflow-resolution-quick-ja.md`
- Remote workflow detailed spec (developer-facing): `docs/remote-workflow-resolution.md`

## Generate -> Analyze -> Adjust (Example)

1. Generate

```bash
comfy-agent run text2img_v1 --prompt "A cat on a sofa" --steps 30
```

2. Analyze

```bash
export OPENAI_API_KEY=...
comfy-agent analyze .comfy-agent/outputs/text2img_v1/20260203_120000/00001_123_1.png \
  --prompt "A cat on a sofa" --json
```

3. Adjust and regenerate

```bash
comfy-agent run text2img_v1 --prompt "A fluffy orange cat on a sofa" --steps 35
```

## Analyze Limits

- Supported image types: PNG/JPEG/WEBP/GIF (non-animated)
- Images larger than 8 MiB are rejected by the API path used here
- `--detail low` is cheaper but may reduce accuracy
- Video analysis is not supported yet (future: frame extraction)

## Preset Definition

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

A preset can carry optional metadata that describes itself to humans and AI agents. **Every field below is optional** — existing presets without them remain valid, and (apart from `aliases`) the metadata never changes how a workflow runs.

Preset-level fields:

| Field | Type | Meaning |
|---|---|---|
| `description` | string | What the preset does. |
| `task` | enum | One of `text_to_image`, `image_to_image`, `image_edit`, `remove_background`, `inpaint`, `upscale`, `text_to_audio`, `audio_to_audio`, `audio_inpaint`, `text_to_video`, `image_to_video`, `video_to_video`, `custom`. |
| `tags` | string[] | Free-form labels for discovery. |

Parameter fields (in addition to `type`, `target`, `required`, `default`):

| Field | Type | Meaning |
|---|---|---|
| `description` | string | Human/agent-readable explanation. |
| `role` | enum | One of `prompt`, `negative_prompt`, `seed`, `steps`, `guidance`, `width`, `height`, `sampler`, `scheduler`, `model`, `strength`, `denoise`, `advanced`, `custom`. |
| `aliases` | string[] | Alternate CLI flag names accepted by `run`. |
| `min` / `max` | number | Advisory numeric bounds. |
| `choices` | array | Advisory list of allowed values. |
| `recommended` | any | Advisory suggested value. |

Upload fields:

| Field | Type | Meaning |
|---|---|---|
| `kind` | enum | One of `image`, `mask`, `audio`, `file`. |
| `cli_flag` | string | CLI flag accepted by `run`, such as `--image` or `--audio`. |
| `target` | object | Workflow node input to receive the uploaded filename. |
| `description` | string | Human/agent-readable explanation. |
| `role` | enum | One of `init_image`, `mask`, `reference_image`, `control_image`, `input_image`, `input_audio`, `reference_audio`, `input_file`, `custom`. |
| `aliases` | string[] | Alternate CLI flag names accepted by `run`. |
| `required` | boolean | Whether the upload must be provided. |

Notes:

- `import` fills in `description` and, where it recognizes the input, `role`,
  numeric hints, and common parameter aliases. Alias inference uses graph
  structure first and does not generate a `seed` alias; `--seed` uses the
  dedicated seed-role resolution described above.
- `list --json` and `preset --json` include these fields in their output, so AI agents can read a preset's intent without opening the YAML.
- Apart from `aliases` (which `run` honors as extra flags), these fields are advisory: they document intent and do not constrain or validate values at run time.

## JSON Output

Use `--json` to print JSON-only output.
All commands that support `--json` use an `{ "ok": ... }` envelope for both
success and failure. The sole exception is `run --dry-run --json`, which emits
the raw patched workflow so it can be sent directly to ComfyUI.

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
      "progress_events": [
        {
          "kind": "channel_connected",
          "timestamp": 1738900000000
        },
        {
          "kind": "execution_start",
          "timestamp": 1738900000100
        },
        {
          "kind": "progress",
          "timestamp": 1738900000200,
          "node": "3",
          "value": 5,
          "max": 20,
          "percent": 25
        }
      ]
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
    "details": {
      "param": "prompt"
    }
  }
}
```

## Exit Codes

The CLI returns only `0`, `2`, or `3`:

- `0`: success
- `2`: the invocation, input, or local environment is invalid; fix the command
- `3`: the inspected or executed target state differs from what was expected,
  such as a server failure or artifact mismatch; regenerate or retry

`INVALID_PARAM` means a value has an invalid type or range (for example,
`--n abc`). `INVALID_USAGE` means the argument structure is invalid, including
missing required options, unknown commands, and extra positional arguments.

## Typical Errors

- `WORKDIR_NOT_FOUND`: run `comfy-agent init` first
- `INVALID_PRESET`: invalid YAML structure (`version/name/workflow`)
- `MISSING_REQUIRED_PARAM`: missing required parameter
- `SERVER_UNREACHABLE`: could not reach the server at all; check `base_url`,
  or reconnect an expired tunnel with `comfy-agent connect <url>`
- `MISSING_NODE_ON_SERVER`: the workflow references a node class the connected
  server does not have (`details.missing_nodes`)
- `MISSING_MODEL_ON_SERVER`: the workflow references model files absent on the
  connected server (`details.missing_models`, each with the server's
  `available` list) — usually means the server was provisioned for a different
  workflow/kit
- `API_ERROR`: server reached but the request failed; verify `base_url`
- `TIMEOUT`: increase `--timeout-seconds`

`run` checks the server (preflight) before submitting; skip with
`--no-preflight` if you need to bypass it for debugging.
