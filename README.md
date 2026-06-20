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

Ready-to-paste starter kits live under [`scripts/colab/`](./scripts/colab/):

| Kit                                    | GPU  | Output                               |
| -------------------------------------- | ---- | ------------------------------------ |
| [`z_image/`](./scripts/colab/z_image/) | T4+  | Image (Z-Image turbo, fastest)       |
| [`anima/`](./scripts/colab/anima/)     | T4+  | Image (Anima Base v1.0, anime-style) |
| [`flux2/`](./scripts/colab/flux2/)     | A100 | Image (Flux 2 dev)                   |
| [`wan22/`](./scripts/colab/wan22/)     | A100 | Video (Wan 2.2 TI2V 5B / T2V 14B)    |

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

5. Back on your machine, import the bundled workflow and run it:

   ```bash
   comfy-agent import ./scripts/colab/z_image/z_image_turbo.json --name z_image_turbo
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run z_image_turbo --prompt "a cat riding a bicycle"
   ```

Notes:

- `trycloudflare` URLs change every session — re-export
  `COMFY_AGENT_BASE_URL` after restarting the Colab runtime.
- See each kit's `README.md` for model-specific parameter flags and
  VRAM/runtime expectations.

Agent-readable kit metadata is available via the `colab` helper command:

```bash
comfy-agent colab catalog --json
comfy-agent colab suggest "fast image generation on a T4" --json
```

`colab suggest` ranks kits by reliability first (`verified` > `partial` >
`starter`); the natural-language goal and `--task` / `--output` / `--gpu`
filters only break ties within the same reliability tier.

Note: `colab` is a repository-side helper. It reads
`scripts/colab/catalog.yaml`, which is **not** bundled in the npm package, so
run it from a checkout of this repository. The catalog is intentionally
portable — paths are relative to `scripts/colab/` and the JSON output never
includes local filesystem paths or environment values.

## Prerequisites

- Node.js 20+
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

## `base_url` Precedence

1. `--base-url`
2. `COMFY_AGENT_BASE_URL`
3. default `http://127.0.0.1:8188`

## Commands

### `init`

```bash
comfy-agent init
comfy-agent init --global
```

### `import`

Import a ComfyUI workflow API JSON and generate a preset template.

```bash
comfy-agent import ./workflow_api.json --name text2img_v1
comfy-agent import ./workflow_api.json --name text2img_v1 --base-url http://127.0.0.1:8188
comfy-agent import ./workflow_api.json --name text2img_v1 --global
```

Note: For this flow, export workflow API JSON from ComfyUI first. Direct import from the currently opened editor state is not supported.

If `/object_info` is available, inference is enhanced and cached at `.comfy-agent/cache/object_info.json`.

Generated presets are annotated automatically to make them easier for humans and AI agents to read:

- A `description` is added to every parameter.
- A `role` (for example `prompt`, `seed`, `steps`, `guidance`, `width`, `height`, `sampler`, `scheduler`, `denoise`, `strength`) is inferred from the node class and input name when recognizable. Inputs that are not recognized are left without a `role`.
- Numeric hints are added for known roles: `min: 1` for `steps`/`width`/`height`, `min: 0` for `guidance`, and `min: 0` / `max: 1` for `denoise`/`strength`.

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

With uploads:

```bash
comfy-agent run inpaint_v1 --prompt "fix" --init-image ./in.png --mask ./mask.png
comfy-agent run talking_v1 --image ./portrait.png --audio ./voice.mp3
```

If a preset parameter or upload defines `aliases`, any alias can be used in place of its canonical flag. For example, with `aliases: [positive]` on the `prompt` parameter, `--positive "A cat"` is equivalent to `--prompt "A cat"`. Aliases are opt-in: `import` does not generate them, so add them by hand in the preset when you want friendlier flags.

Remote source notes:

- `--source remote` targets saved ComfyUI workflows from `userdata/workflows` (runnable path).
- `--source remote-catalog` targets template catalog entries (advanced/explicit use).
- Save workflows under ComfyUI `userdata/workflows` so they can be discovered by `list --source remote`.
- If the saved file is in ComfyUI UI format (`nodes`/`links`), it is converted to API prompt format automatically.
- Some UI-only nodes (for example notes) are ignored during conversion.
- For some catalog entries, workflow JSON may not be directly downloadable from API endpoints.
- If validation still fails for complex/custom graphs, export API JSON from ComfyUI and import it as a local preset.

### `doctor`

```bash
comfy-agent doctor
comfy-agent doctor --json
comfy-agent doctor --global
comfy-agent doctor --all-scopes
```

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
| `task` | enum | One of `text_to_image`, `image_to_image`, `image_edit`, `inpaint`, `upscale`, `text_to_video`, `image_to_video`, `video_to_video`, `custom`. |
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

- `import` fills in `description`, and—where it can recognize the input—`role` and numeric hints. `aliases` are never generated; add them by hand.
- `list --json` and `preset --json` include these fields in their output, so AI agents can read a preset's intent without opening the YAML.
- Apart from `aliases` (which `run` honors as extra flags), these fields are advisory: they document intent and do not constrain or validate values at run time.

## JSON Output

Use `--json` to print JSON-only output.

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

- `0`: success
- `2`: user input error (missing param / type mismatch)
- `3`: API/network/server error

## Typical Errors

- `WORKDIR_NOT_FOUND`: run `comfy-agent init` first
- `INVALID_PRESET`: invalid YAML structure (`version/name/workflow`)
- `MISSING_REQUIRED_PARAM`: missing required parameter
- `API_ERROR`: server connection/response error; verify `base_url`
- `TIMEOUT`: increase `--timeout-seconds`
