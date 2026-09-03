# AGENTS.md

Guidance for AI coding agents (Codex, Claude Code, and others) driving the
`comfy-agent` CLI to generate images, video, or audio with ComfyUI.

Codex can also use the generated `.agents/skills/comfy-agent` repository skill.

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
- Before generating a known character, use `comfy-agent brief <name> --preset <preset> --json` as the single memory entry point.

Model-specific prompt construction:

- **MiniMax H3** (`minimax_h3_t2v` / `minimax_h3_i2v` /
  `minimax_h3_r2v`, plus `krea2_h3` combo presets `k2h3_i2v` /
  `k2h3_r2v`): read
  [docs/minimax-h3-prompting.md](docs/minimax-h3-prompting.md) before
  composing `--104_prompt`. H3 generates video + stereo audio in one pass;
  the prompt must direct both, rendered in the official three-field format
  (`integrated_multimodal_description` / `overall_soundscape` /
  `non_diegetic_music`).

For repo development rules (building, testing, Colab kit verification
standards), see [CLAUDE.md](CLAUDE.md) — the E2E verification rules there
are non-negotiable regardless of which agent you are.
