# AGENTS.md

Guidance for AI coding agents (Codex, Claude Code, and others) driving the
`comfy-agent` CLI to generate images, video, or audio with ComfyUI.

**Read [docs/agent-playbook.md](docs/agent-playbook.md) before orchestrating
any generation work.** It defines:

- the **blueprint protocol** — decompose the user's creative goal, pick kits
  with `comfy-agent colab suggest "<goal>" --json`, check state with
  `comfy-agent doctor --json`, and present a plan (human actions counted,
  GPU cost, download size, licenses) before generating;
- the **decision table** — which failures you fix yourself (local install,
  server start, model downloads, bounded retries) vs. which get handed to
  the human as one concrete action (Colab Run All + paste one
  `comfy-agent connect <url>` line) or an explicit choice (paid GPU,
  non-commercial licenses);
- the **error contract** — `SERVER_UNREACHABLE`, `MISSING_NODE_ON_SERVER`,
  `MISSING_MODEL_ON_SERVER` (with `details.missing_models[].value` →
  look up the providing kit in `comfy-agent colab catalog --json` assets);
- the **verification duty** — inspect outputs (view images, extract video
  frames, probe audio) before reporting success.

Key invariants:

- Presets, workflows, and outputs live locally under `.comfy-agent/` and
  survive Colab runtime resets. Only the base URL is volatile; recover it
  with `comfy-agent connect <url>`, never by re-importing.
- `comfy-agent run` preflights the server automatically; trust its error
  codes rather than probing ComfyUI endpoints by hand.

For repo development rules (building, testing, Colab kit verification
standards), see [CLAUDE.md](CLAUDE.md) — the E2E verification rules there
are non-negotiable regardless of which agent you are.
