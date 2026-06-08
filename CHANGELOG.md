# Changelog

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
