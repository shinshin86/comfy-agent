# Roadmap

This roadmap describes the intended direction of comfy-agent. It is a plan, not a
commitment: priorities may change as ComfyUI, model runtimes, and user needs evolve.

## Purpose

Evolve comfy-agent from a single-generation CLI into the shortest practical route
for creators without a local GPU to delegate image, video, and music production to
AI agents using ComfyUI on Google Colab, RunPod, or a home GPU.

## What makes comfy-agent different

1. **Verified environment catalog** — kits describe GPU requirements, setup time,
   download size, license cautions, and recorded end-to-end evidence in a
   machine-readable catalog.
2. **Local, durable artifacts** — presets, workflows, recipes, jobs, and outputs stay
   with the creator. An ephemeral server URL is replaced with `connect` instead of
   rebuilding local work.
3. **Facts separated from policy** — the CLI reports structured facts through JSON,
   exit codes, and an error contract. The agent playbook defines portable recovery
   policy without tying it to one agent product.
4. **Production recipes and verification** — recipes capture repeatable creative
   workflows, while `verify` and explicit inspection keep artifact claims grounded in
   evidence.

## 0.0.4 — agent-grown character memory

Version 0.0.4 adds a queryable generation history and durable character resources that
agents can grow from human feedback: canonical appearances, forms, triggers, references,
LoRAs, notes, and an approved gallery flow into `brief`, `run --character`, and identity
sheets while preserving the prompt before and after injection. See the
[0.0.4 changelog](../CHANGELOG.md#004---2026-08-16) for the complete release notes.

## 0.0.3 — a distributable agent workflow

Version 0.0.3 makes the full workflow available from the npm package: structured
preflight and execution errors, generated parameter aliases, resumable jobs and
asynchronous submission, offline artifact verification, bundled kits/playbooks/skills,
and concise bilingual documentation. See the [0.0.3 changelog](../CHANGELOG.md#003---2026-08-16)
for the complete release notes.

## Planned next: recipes, portable archives, and scale

- Recipes distilled from successful runs and replayed as linear pipelines with matrix
  expansion, shell stages, and resume-from-stage support.
- ZIP export for moving a character archive between projects or machines while keeping
  reference and gallery inclusion explicit.
- Character history indexing that remains fast and bounded as cross-project records,
  notes, and approved gallery items grow.

## Planned later

- Reproducible environment locks for ComfyUI revisions, custom nodes, and model
  checksums, with `doctor` reporting drift.
- Shared and time-bounded preflight caching to avoid repeated `/object_info` work.
- Job cancellation, server-side interruption, and bounded WebSocket reconnection.
- Runtime and cost estimates based on measured GPU time and selected providers.
- A verified RunPod template to demonstrate the same local-artifact workflow beyond
  Colab.
- Broader automated coverage for connection handling, WebSocket-to-polling fallback,
  installed-package flows, and recipe execution.

## Non-goals

- Building a hosted generation service or billing platform.
- Building a GUI or web dashboard. Notebooks may still be used as setup entry points.
- Editing or wiring ComfyUI graphs from the CLI; kits provide workflow JSON instead.
- Building a general-purpose DAG runner; pipelines remain linear with matrix and
  shell stages.
- Training LoRAs inside comfy-agent; recipes may document external training and attach
  compatible results.
- Adding client-side concurrency for a server that executes its queue serially.
- Competing by continuously increasing kit count instead of improving verified,
  maintainable workflows.
- Weakening the definition of Verified: end-to-end setup, execution, output download,
  and artifact inspection remain required.
