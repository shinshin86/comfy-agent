# Comfy Agent

![Logo](https://github.com/shinshin86/comfy-agent/raw/main/assets/comfy-agent-logo.png)

[![npm version](https://img.shields.io/npm/v/comfy-agent.svg)](https://www.npmjs.com/package/comfy-agent)
[![CI](https://github.com/shinshin86/comfy-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/shinshin86/comfy-agent/actions/workflows/ci.yml)

Comfy Agent is a CLI for GPU-less individual creators to delegate image, video,
and music generation to AI agents across any ComfyUI server—Google Colab,
RunPod, or a home GPU.

Japanese documentation: [README.ja.md](./README.ja.md)

## QuickStart (3 lines)

```bash
npm install -g comfy-agent
comfy-agent connect http://127.0.0.1:8188            # or a Colab tunnel URL: https://<id>.trycloudflare.com
comfy-agent run default --source remote --prompt "a cat riding a bicycle"
```

`connect` verifies the server once and remembers the URL (re-run it when a Colab
tunnel changes — presets and outputs stay local). `run` submits the workflow, waits,
and saves files under `./.comfy-agent/outputs/<preset>/<timestamp>/`. `default` is
any workflow saved in the ComfyUI UI; to run your own JSON, `comfy-agent import <file> --name <preset>`.

No GPU? Jump to [Run on Google Colab](#run-on-google-colab). Driving this from an AI
agent? See [For AI agents](#for-ai-agents).

## Why comfy-agent

- **Verified environment catalog** — [36 kits](./scripts/colab/README.md) expose
  GPU, download size, setup time, license, and E2E evidence as machine-readable data.
- **Artifacts and instructions stay local** — presets, outputs, recipes, and jobs
  survive server resets; [`connect`](./docs/cli-reference.md#connect) absorbs volatile URLs.
- **Facts and policy stay separate** — the CLI returns a structured
  [error contract](./docs/agent-playbook.md#3-error-contract-cli--agent), while the
  [playbook](./docs/agent-playbook.md) defines agent-independent recovery policy.
- **Production recipes and verification** — reusable
  [recipes](./recipes/music-video/RECIPE.md) combine generation with `verify` and
  evidence-based artifact review.

<a id="for-ai-agents"></a>

## For AI agents (Claude Code, Codex, Cursor, Gemini CLI, OpenClaw)

Install the bundled skill for your agent and read the live policy:

```bash
comfy-agent skill install --agent claude
comfy-agent skill install --agent codex
comfy-agent playbook
```

Other supported targets are `cursor`, `gemini`, and `openclaw`; use
`comfy-agent skill list` to see bundled skills. Repository agents should also follow
[AGENTS.md](./AGENTS.md). Prefer `--json`, branch on structured error codes, and use
only exit codes `0`, `2`, and `3`; the [CLI reference](./docs/cli-reference.md) is canonical.

## Run on Google Colab

No local GPU? The bundled kits run ComfyUI on a Colab GPU and expose it to the local
CLI through a cloudflared tunnel. Start with this five-step flow:

```bash
comfy-agent colab kit z_image      # prints installed paths: 01_setup.py / 02_start_comfyui.py / workflows
# paste setup + launcher into Colab, copy the tunnel URL
comfy-agent connect https://<id>.trycloudflare.com
comfy-agent import <workflow path printed above> --name z_image_turbo
comfy-agent run z_image_turbo --prompt "a cat riding a bicycle"
```

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

Statuses are evidence levels, not model quality: **Verified** passed the complete
Colab-to-local flow, **Partial** passed only some GPUs or workflow variants, and
**Starter** is statically validated but awaits recorded E2E verification. Review each
kit README for gated, non-commercial, territory, acceptable-use, and paid-GPU cautions.

Use the catalog before choosing a runtime:

```bash
comfy-agent colab catalog --json
comfy-agent colab suggest "fast image generation on a T4" --json
comfy-agent colab kit z_image --json
```

Presets and outputs survive Colab resets. Rerun the two printed scripts, then
`connect` the new tunnel URL; do not re-import the preset. Full setup and license notes
are in the [Colab kit guide](./scripts/colab/README.md).

## Install & requirements

- Node.js 22 or newer.
- A reachable ComfyUI server for connection and generation commands.

```bash
npm install -g comfy-agent
comfy-agent --help
```

Contributors can use `npm install`, `npm run build`, and `npm run dev -- <command>`.
On Windows, use PowerShell and quote file paths containing spaces.

The npm package includes the playbooks, skills, recipes, catalog, setup scripts, and
workflow JSON used by the commands above. No repository checkout is required to read
or install those bundled resources.

## Commands at a glance

| Command | Purpose |
|---|---|
| `init` | Create a local or global work directory. |
| `connect` | Verify and remember a ComfyUI URL. |
| `import` | Turn API/UI workflow JSON into a local preset. |
| `run` | Preflight, submit, wait/download, or submit with `--async`. |
| `jobs list|show|wait|prune` | Inspect and resume persisted jobs. |
| `doctor` | Check connection, workdirs, nodes, and models. |
| `list` | Discover local and remote workflows. |
| `preset` | Show parameters, aliases, uploads, and metadata. |
| `status` | Show resolved runtime configuration. |
| `verify` | Probe outputs and create review aids offline. |
| `analyze` | Evaluate an image with OpenAI image input. |
| `colab catalog|suggest|kit` | Inspect and resolve bundled Colab kits. |
| `playbook` | Read bundled agent policy documents. |
| `skill list|install` | Install bundled skills for supported agents. |

See the [complete CLI reference](./docs/cli-reference.md) for every option and payload.

## Outputs & work directory

`connect` or `init` creates `.comfy-agent/` with `workflows/`, `presets/`, `outputs/`,
`jobs/`, and `cache/`; the remembered URL is in `config.yaml`. Use `--global` for
`~/.config/.comfy-agent`. Generated files default to
`.comfy-agent/outputs/<preset>/<timestamp>/`, alongside `run.json`; `verify` writes
review aids below `<run-dir>/verify/`.

## Exit codes & JSON

The CLI returns only `0` (success), `2` (invalid invocation/input/local environment),
or `3` (server/executed target/artifact state differs from expectations). With
`--json`, success is `{ "ok": true, ... }` and failure is
`{ "ok": false, "error": { "code": "...", "message": "...", "details": ... } }`.
The only shape exception is `run --dry-run --json`, which prints raw workflow JSON.
See [Exit codes and errors](./docs/cli-reference.md#exit-codes).

## Documentation

- [Agent Playbook](./docs/agent-playbook.md) — blueprint, recovery, and verification policy.
- [CLI reference](./docs/cli-reference.md) — commands, presets, JSON, and errors.
- [Roadmap](./docs/roadmap.md) — released foundations, planned milestones, and non-goals.
- [MiniMax H3 prompting](./docs/minimax-h3-prompting.md) — H3 video/audio prompt format.
- [Music-video recipe](./recipes/music-video/RECIPE.md) — multi-stage production workflow.
- [Colab kit guide](./scripts/colab/README.md) — all kits and their setup details.
- [CHANGELOG](./CHANGELOG.md) — release history.

## Contributing / License

Contributors must follow the E2E verification discipline in [CLAUDE.md](./CLAUDE.md).
Comfy Agent is available under the [MIT License](./LICENSE).

## Command reference

For complete command documentation, see [docs/cli-reference.md](./docs/cli-reference.md).
