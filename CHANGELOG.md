# Changelog

## 0.1.0 - 2026-08-16

### Added

- Added a queryable creative history backed by job record v2, including captured input/final prompts, full-text search and filters, notes, tags, rejection reasons, favorites, related manifests and artifacts, and compact `verify` summaries written back to matching records.
- Added reusable character resources with canonical appearance, forms, per-kit triggers, reference images, LoRA attachments, content ratings, kit notes, privacy-safe defaults, a pending-to-human-approved gallery, and metadata-first export/import with opt-in reference and gallery files.
- Added `run --character` with form selection, prompt-template expansion, transparent `prompt_input` / `prompt_final` reporting, reference-image injection, guarded LoRA injection, and tag-based NSFW gating.
- Added `brief` as the single character-memory lookup before generation, returning preset applicability, prompt preview, kit notes, preferred and rejected history, approved gallery items, and recent notes.
- Added `character sheet` to build an identity board from human-approved gallery images and extracted video frames.
- Added `lora` and `lora_strength` preset roles and import inference for `LoraLoader` and `LoraLoaderModelOnly` inputs.
- Added `ALIAS_SHADOWED` preset warnings when a handwritten alias collides with a reserved `run` flag.
- Added a Flux 1 dev workflow with an empty character-LoRA slot and catalog capability metadata; this workflow is a statically validated Starter pending Colab E2E verification.
- Added the creative-memory workflow to the agent playbook so agents brief before generation, record failures, and retain only human-approved identity references.

### Changed

- `run --dry-run --json` keeps the legacy raw-workflow response without character options, but returns an envelope containing `workflow` and character injection metadata when `--character` is present.
- Character injection now occurs before required-input checks, seed resolution, dry-run output, and server preflight so every downstream stage sees the final workflow.

### Fixed

- Fixed required reference-image uploads being rejected before character data had a chance to satisfy them.

### Compatibility

- Job records are now written as version 2. Version 1 records remain readable, and `updateJob` promotes them when a patch adds version 2 fields.
- `run.json` headers may now include additive `character` metadata; consumers should continue ignoring unknown fields.
- `character`, `form`, `character-ref`, `character-prompt`, and `lora` are reserved `run` flags. Existing handwritten aliases with those names remain in preset files, but `preset` reports `ALIAS_SHADOWED` because the aliases are unreachable.
- Character commands write a new `.comfy-agent/characters/` tree containing metadata, notes, references, and gallery files.
- The content gate depends on preset tags such as `nsfw`, `adult`, or `explicit`. It is a guardrail, not a complete content classifier.

## 0.0.3 - 2026-08-16

### Added

- Added `comfy-agent connect <url>` to verify and persist a ComfyUI base URL, with scope-aware precedence: `--base-url` > `COMFY_AGENT_BASE_URL` > config > default.
- Added automatic server preflight to `run`, with machine-actionable `SERVER_UNREACHABLE`, `MISSING_NODE_ON_SERVER`, and `MISSING_MODEL_ON_SERVER` errors; `doctor --preset <name>` runs the same checks and `--no-preflight` skips them for debugging.
- Added ComfyUI subgraph expansion during `import`, `run`, and `doctor`, using live `/object_info` schemas for workflows such as LTX-2.5 and MiniMax H3.
- Added import-time upload inference for `LoadImage`, `LoadAudio`, and `LoadVideo`, including image/audio/video flags, roles, `audio` and `file` upload kinds, and `MISSING_REQUIRED_UPLOAD`.
- Added `--json` to `init` and `import`, plus `INVALID_USAGE` JSON envelopes for missing options, unknown commands, and extra positional arguments, so every command has a machine-readable mode.
- Added `--seed` resolution through parameter name, handwritten alias, or every `role: seed` target; `run --json` now reports the resolved `seed_targets`.
- Added stable import-generated aliases such as `--prompt`, `--negative`, `--steps`, `--cfg`, dimensions, duration, and audio/video controls while retaining canonical `--<node_id>_<input>` flags.
- Added immediate `EXECUTION_FAILED` and `NO_OUTPUTS` verdicts from ComfyUI history, including normalized node, exception, category, partial-output, and output-directory details.
- Added durable job records under `.comfy-agent/jobs/` and portable `<output-dir>/run.json` manifests for synchronous and asynchronous runs.
- Added `run --async` and `jobs list|show|wait|prune`; submitted work can be resumed after a local terminal interruption, with `JOB_LOST` reported when a restarted server no longer has the prompt.
- Added `comfy-agent verify` for offline image/video/audio metadata probes, animated WEBP inspection, ffmpeg-assisted frames, contact sheets, waveforms, hashes, and machine-checkable artifact expectations.
- Added an agent playbook, installable skills for Claude Code, Codex, Cursor, Gemini CLI, and OpenClaw, MiniMax H3 prompting guidance, and the music-video production recipe.
- Added `playbook`, `skill list|install`, and `colab kit` commands, and bundled the documentation, recipes, Colab catalog/kits, and agent skills in the npm package.
- Added concise English and Japanese READMEs, complete bilingual CLI references, a public roadmap, and relative-link validation for published documentation.
- Added a mock ComfyUI smoke suite and CI/package gates for Node.js 22/24, built-CLI smoke tests, required package contents, installed-tarball behavior, skill synchronization, and documentation links.
- Added 19 Colab kits: 10Eros, ACE-Step 1.5, anima_pencil, AnimeGen-T2V, BiRefNet, Boogu, HiDream-O1, Krea 2, LTX-2.3 T2V, LTX-2.5, MiniMax H3, MiniMax Music 3, MOSS SoundEffect v2, music_video, SD3.5 Large, SeedVR2, Stable Audio 3, Stable Audio 3 Small Music, and Wan 2.2 S2V (36 kits total); LTX-2.3 also gained an image-and-audio-to-video workflow.
- Added Colab catalog assets, setup-time/download estimates, composability, audio tasks/outputs, verified GPU metadata, stricter GPU validation, and richer `colab suggest --json` results.

### Changed

- `--version` is read from `package.json`; the package and CLI version are now `0.0.3`.
- Node.js 22 or newer is required. The CLI fails with `UNSUPPORTED_RUNTIME` when required runtime globals are missing and CI also tests Node.js 24.
- `run` parses passthrough flags independently of repeated argument values and rejects stray positional arguments before resolving the workdir, preset, or server.
- `import --force` preserves handwritten aliases when their targets are unchanged, while `list`, `preset`, and import JSON output expose generated metadata and alias assignments.
- Output records now carry provider kinds and use output-directory-relative `saved_to` values in persistent records, while CLI results expose absolute saved paths.
- `colab suggest` validates GPU filters and down-ranks multi-modality combo kits for single-modality goals.
- Colab setup and workflow definitions were refreshed for verified model sources and runtimes, including the official Krea 2 repack and pinned LTX-2.5 installation.
- The built CLI entry point is made executable during `npm run build`.
- A successful `connect` initializes the complete work directory, so the three-line QuickStart no longer needs a separate `init` command.

### Fixed

- Fixed `run --global` loading its workflow from the current directory instead of the global preset scope; missing workflow files now return `FILE_NOT_FOUND`.
- Fixed ComfyUI execution errors waiting until `TIMEOUT`, and fixed partial outputs from failed executions being reported as success.
- Fixed HTTP 200 responses with non-JSON proxy/login bodies being classified as network errors, and improved dead Cloudflare tunnel classification as `SERVER_UNREACHABLE`.
- Fixed missing import source files surfacing as unexpected errors instead of `FILE_NOT_FOUND` with workflow-source details.
- Fixed `connect` creating only `config.yaml`'s parent, which left a fresh workdir unable to import a workflow.
- Fixed `run` argument extraction when a value matched the preset name, and fixed extra positionals being silently ignored.
- Fixed and verified Colab workflows and setup paths for AnimeGen-T2V, LTX-2.5, and the composable music-video runtime.

### Compatibility

- Existing presets remain valid. Generated aliases are additive, and canonical `--<node_id>_<input>` flags remain supported.
- Re-importing a workflow can change a negative text input's role from `prompt` to `negative_prompt`; agents filtering `list --json` or `preset --json` by role must handle the new value.
- Runs now write `<output-dir>/run.json` and `.comfy-agent/jobs/<job_id>.json`. Both files are additive and may be deleted when their resume/provenance data is not needed.
- Commander usage failures now exit with code 2 instead of 1. The supported exit codes are `0`, `2` (invocation, input, or local environment), and `3` (inspected/executed target state).
- Failures that previously surfaced as `TIMEOUT` may now return `EXECUTION_FAILED`; completed workflows without saved files return `NO_OUTPUTS`.
- `run --json` adds `seed_targets`, and output records may include a provider `kind`; consumers should ignore unknown additive fields.
- The npm package now includes documentation, recipes, Colab files, and agent skills, increasing package contents while making these resources available without a repository checkout.
- Node.js 22 or newer is required.

## 0.0.2 - 2026-06-08

### Added

- Added optional preset metadata for human- and agent-readable workflows, including `description`, `task`, `tags`, parameter/upload `role`, `aliases`, numeric hints, `choices`, and `recommended`.
- Added alias support for `comfy-agent run` parameters and uploads.
- Added richer metadata output to `list --json` and `preset --json`.
- Added import-time parameter descriptions, role inference, and numeric hints where workflow inputs can be inferred.
- Added `comfy-agent colab catalog` and `comfy-agent colab suggest` helpers for repository checkout users.
- Added an agent-readable `scripts/colab/catalog.yaml` covering the repository Colab starter kits.

### Changed

- `colab suggest` ranks reliability first (`verified` > `partial` > `starter`) and uses goal/task/output/GPU signals to refine results.
- Colab catalog payloads use portable relative paths and avoid local filesystem or environment details.

### Fixed

- Added a clear `COLAB_CATALOG_UNAVAILABLE` error when Colab catalog helpers are run without `scripts/colab/catalog.yaml`, such as from the npm package where Colab starter kit scripts are intentionally not bundled.

### Compatibility

- Existing preset files remain compatible because all new preset metadata fields are optional.
- The npm package still excludes `scripts/colab/`; Colab kit helpers are intended for repository checkout usage.

## 0.0.1 - Initial release

### Added

- Added the core `comfy-agent` CLI for driving ComfyUI over its HTTP API.
- Added local and global work directories with `init`, `import`, `list`, `run`, `doctor`, `status`, and `preset` commands.
- Added support for local presets, ComfyUI userdata workflows, and ComfyUI remote template catalog discovery.
- Added workflow import from ComfyUI API JSON with `/object_info`-assisted type inference and local caching.
- Added workflow execution with dynamic parameters, uploads, dry-run output, JSON output, multi-run support, seed control, progress polling, and output download.
- Added image analysis support through `comfy-agent analyze`.
- Added Google Colab starter kit scripts and workflows for running ComfyUI remotely through a cloudflared tunnel.
