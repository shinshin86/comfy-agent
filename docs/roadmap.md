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

## 0.0.3 — a distributable agent workflow

Version 0.0.3 makes the full workflow available from the npm package: structured
preflight and execution errors, generated parameter aliases, resumable jobs and
asynchronous submission, offline artifact verification, bundled kits/playbooks/skills,
and concise bilingual documentation. See the [0.0.3 changelog](../CHANGELOG.md#003---2026-08-16)
for the complete release notes.

## Planned next: character memory and a generation ledger

- Character resources that an agent creates and grows over time — canonical
  appearance text, reference images, compatible LoRA attachments, and per-kit
  prompt learnings — injected into any preset with a single flag and reusable
  across projects and machines without committing them to git.
- A queryable generation ledger built on the job records and `run.json` manifests
  every run already writes: what was generated, with which preset, prompt, seed,
  and outputs, so an agent can start from past successes instead of from scratch.
- Recipes distilled by the agent from successful runs and replayed as a linear
  pipeline with matrix expansion, shell stages, and resume-from-stage support.

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
