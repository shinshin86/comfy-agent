# Agent Playbook

How an AI agent (Claude Code, Codex, or any CLI-driving agent) should turn a
natural-language request like "make me a 10-second anime video prototype"
into a working generation pipeline with comfy-agent — including when to fix
problems itself and when to hand an action back to the human.

This document is the single source of truth for agent behavior.
`.claude/skills/comfy-agent/SKILL.md` and `AGENTS.md` are thin entry points
that reference this file.

Layering rule that keeps this portable across agents:

- **The CLI reports facts** (structured JSON errors, doctor output). It never
  decides policy.
- **This playbook defines policy** (what to do for each fact).
- **The agent executes** the policy with its own judgment.

---

## 1. Blueprint protocol — always design before generating

When the human states a creative goal, do NOT start installing or generating.
Produce a **blueprint** first, in this order:

1. **Decompose the goal into capability steps.**
   Examples:
   - "10-second anime video" → `text_to_video` (anime style)
   - "music video" → `text_to_audio` (song) + `text_to_image` (keyframes)
     + `image_to_video` (clips) + local ffmpeg assembly
2. **Find kits per capability** (run from a checkout of this repo):
   ```bash
   comfy-agent colab suggest "<capability + style + constraints>" --json
   ```
   The result includes GPU requirements, verification status, license notes,
   and (once catalog enrichment lands) download sizes and setup minutes.
3. **Check the current state:**
   ```bash
   comfy-agent doctor --json                      # connection alive?
   comfy-agent doctor --preset <name> --json      # server has models/nodes?
   ```
4. **Present the blueprint** to the human before doing anything heavy:
   - pipeline stages and the kit chosen for each (with alternatives)
   - GPU requirement and its cost implication (e.g. A100 needs Colab Pro)
   - what the human must do, counted in actions and minutes
     (e.g. "open notebook, Run All, paste one line — ~8 min")
   - what the agent will do (import, run, verify, assemble)
   - license cautions from `license_notes` (non-commercial models, etc.)
5. **Wait for approval** before large downloads, paid-GPU choices, or
   anything license-sensitive. Small local runs on an already-connected
   server do not need re-approval.

While waiting for an environment to boot, do connection-independent work:
prompt design, scene splitting, parameter tables, output directories.

## 2. Environment model

- The CLI state that matters lives **locally and persistently**:
  presets (`.comfy-agent/presets/`), workflows, outputs, config.
- The ComfyUI server is **per-kit and possibly ephemeral** (Colab runtimes
  are deleted between sessions; trycloudflare URLs change every session).
- Therefore: the only thing a dead Colab session costs is the base URL.
  **Never re-import presets or redo setup that lives locally.**

Connection resolution order (after Phase 1 lands):
`--base-url` > `COMFY_AGENT_BASE_URL` > `.comfy-agent/config.yaml` > default.

Persist a working URL with:

```bash
comfy-agent connect <url>     # verifies reachability, saves to config.yaml
```

Colab kits print a ready-to-paste `comfy-agent connect https://…` line when
setup finishes; when the human pastes such a line, run it and resume the
interrupted task immediately.

### First-time environment choice

If no environment exists at all, ask the human ONCE:

- **Local** — best for Apple Silicon / NVIDIA machines and light models
  (z_image, sdxl class). Survives across sessions; the agent can build it
  autonomously.
- **Colab** — required for heavy models (A100-class video/audio). Ephemeral;
  the human re-runs the notebook each session.

Record the choice (project memory / CLAUDE.md note) and do not ask again.
Prefer local for light tasks even when Colab was used before — it avoids the
ephemerality tax entirely.

## 3. Error contract (CLI → agent)

All commands emit `--json` errors in this shape:

```json
{ "ok": false, "error": { "code": "...", "message": "...", "details": { } } }
```

Codes the orchestration flow relies on (Phase 1):

| Code | Exit | Meaning | Key `details` fields |
|---|---|---|---|
| `SERVER_UNREACHABLE` | 3 | TCP/HTTP connection to base URL failed | `server`, `cause` |
| `MISSING_NODE_ON_SERVER` | 3 | Workflow references a node class the server does not have | `server`, `missing_nodes: [{node_id, class_type}]`, `missing_models` |
| `MISSING_MODEL_ON_SERVER` | 3 | Workflow references model files absent on the server | `server`, `missing_models: [{node_id, class_type, input, value, available[], available_truncated?}]`, `missing_nodes` |
| `WORKDIR_NOT_FOUND` | 2 | No `.comfy-agent/` — run `comfy-agent init` | — |
| `MISSING_REQUIRED_PARAM` | 2 | Bad invocation | `param` |
| `API_ERROR` | 3 | Server reached but request failed (5xx, invalid response) | — |
| `TIMEOUT` | 3 | Generation exceeded timeout | — |

`run` performs the preflight automatically before submitting;
`doctor --preset <name>` runs the same check standalone;
`--no-preflight` skips it (debugging only).

## 4. Decision table — self-solve vs. hand to human

Guiding principle: **work that only costs time → the agent does it;
work that costs money, rights, or physical human action → the human decides.**

| Situation | Who acts | Agent behavior |
|---|---|---|
| No environment configured (first run) | ask once | Offer Local / Colab (see §2), persist the answer |
| Local: ComfyUI not installed | **agent** | Install it (announce disk/time first), start it, `connect` |
| Local: server installed but not running | **agent** | Start it in background, wait for port, continue |
| `SERVER_UNREACHABLE` and base URL is `*.trycloudflare.com` | **human (1 action)** | Say exactly: "Colab session expired. Open the notebook, Run All, paste the final line." Nothing else is lost — do not re-import. If a Colab automation MCP is available, offer to do it |
| `SERVER_UNREACHABLE` and base URL is local | **agent** | Start/restart the local server |
| `MISSING_MODEL_ON_SERVER`, local server | **agent (confirm if large)** | Map `missing[].value` → kit via catalog `assets`; download into the local ComfyUI. Ask first when downloads exceed a few GB |
| `MISSING_MODEL_ON_SERVER`, Colab server | **human (setup cell)** | Identify the kit from catalog; hand the human that kit's `01_setup.py` cell. If the runtime's current kit is `composable`, the cell can run additively; otherwise advise a fresh runtime |
| `MISSING_NODE_ON_SERVER` | depends | Usually means wrong/outdated ComfyUI or missing custom node — treat like missing model: local = agent fixes, Colab = setup cell |
| GPU below kit's `gpu.minimum` | **human (choice)** | Present: upgrade runtime (cost) vs. smaller model (quality delta). Never choose paid options silently |
| License constraint (`license_notes`: non-commercial etc.) | **human (choice)** | Summarize the constraint, ask about intended use before generating |
| Generation succeeded but quality is off | **agent (bounded)** | Inspect the output yourself, adjust params, retry ≤ 3 times, then report with evidence |
| `TIMEOUT` | **agent** | Retry once with a raised `--timeout-seconds`; if it persists, report — the model may be too heavy for the runtime |

## 5. Reconnect flow (Colab volatility, condensed)

```
run/doctor → SERVER_UNREACHABLE (trycloudflare URL)
  → tell human: "Run All the notebook, paste the final line"
  → human pastes: comfy-agent connect https://new-id.trycloudflare.com
  → agent runs it (verifies + persists), then resumes the exact task
```

Total human cost per Colab session: open notebook, Run All, paste one line.

## 6. Verification duty

Before reporting success, verify the artifact yourself:

- **Images** — view the file; compare against the request.
- **Video** — extract frames (`ffmpeg -i out.mp4 -vf fps=1 f_%02d.png`) and
  view them; check duration and motion plausibility.
- **Audio** — check duration/waveform (`ffprobe`); play it back when possible.

Report differences from the request honestly. Never say "done" for an
output you have not inspected; if verification is impossible, say so
explicitly and mark the result unverified.

## 7. Worked example

Human: "アニメ調で10秒くらいの動画プロトタイプを作りたい"

1. Decompose → `text_to_video`, anime style, ~10 s.
2. `colab suggest "anime text to video" --json` →
   `animegen_t2v` (A100, verified) / fallback `wan21` 1.3B (T4, lower quality).
3. `doctor --json` → `SERVER_UNREACHABLE` (no environment yet).
4. Blueprint to human: one-stage pipeline; A100 (Colab Pro) vs T4 trade-off;
   human does Run All + one paste; agent does the rest; ~N min setup.
5. Human picks `animegen_t2v`, runs the notebook, pastes
   `comfy-agent connect https://….trycloudflare.com`.
6. Agent: `import` the kit workflow → `run` with designed prompt →
   `MISSING_MODEL_ON_SERVER`? (mismatched kit → §4) → frames check →
   deliver with a summary of what was verified.
