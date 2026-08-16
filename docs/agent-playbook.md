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
2. **Find kits per capability** (available from `npm i -g comfy-agent` since 0.1.0):
   ```bash
   comfy-agent colab suggest "<capability + style + constraints>" --json
   ```
   Each suggestion carries GPU requirements (`gpu`), verification status
   (`status`), `download_gb`, `setup_minutes`, and `composable`; license
   cautions live in `colab catalog --json` under the kit's `license_notes`.
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

Connection resolution order:
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

Commands with a `--json` flag (`init`, `import`, `run`, `jobs *`, `doctor`,
`list`, `status`, `preset`, `connect`, `verify`, `analyze`, `colab *`) emit
errors in this shape:

```json
{ "ok": false, "error": { "code": "...", "message": "...", "details": { } } }
```

Success and failure both use an `{ "ok": ... }` envelope. The sole exception
is `run --dry-run --json`, which emits the raw patched workflow so it can be
sent directly to ComfyUI.

The CLI returns only exit codes `0`, `2`, and `3`:

- `2` — the invocation, input, or local environment is invalid; fix the command.
- `3` — the inspected or executed target state differs from what was expected
  (server failure or artifact mismatch); regenerate or retry.

`INVALID_PARAM` is for an invalid value type or range. `INVALID_USAGE` is for
an invalid argument structure, including Commander errors such as missing
required options and unknown commands.

One shape exception: when `doctor` itself cannot reach the server it still
exits 0-vs-3 as usual but reports the failure **inside** its normal payload
as `connection: { ok: false, error: { code, message, details: "<string>" } }`
— branch on `connection.error.code` there, not on `details.server`. The
structured `details` objects in the table below come from thrown errors
(`run` preflight, `connect`, and `doctor --preset`'s object_info fetch).

Codes the orchestration flow relies on (Phase 1):

| Code | Exit | Meaning | Key `details` fields |
|---|---|---|---|
| `SERVER_UNREACHABLE` | 3 | TCP/HTTP connection to base URL failed | `server`, `cause` |
| `MISSING_NODE_ON_SERVER` | 3 | Workflow references a node class the server does not have | `server`, `missing_nodes: [{node_id, class_type}]`, `missing_models` |
| `MISSING_MODEL_ON_SERVER` | 3 | Workflow references model files absent on the server | `server`, `missing_models: [{node_id, class_type, input, value, available[], available_truncated?}]`, `missing_nodes` |
| `WORKDIR_NOT_FOUND` | 2 | No `.comfy-agent/` — run `comfy-agent init` | — |
| `INVALID_USAGE` | 2 | Invalid argument structure | `commander_code` for Commander errors |
| `MISSING_REQUIRED_PARAM` | 2 | Bad invocation | `param` |
| `API_ERROR` | 3 | Server reached but request failed (5xx, invalid response) | — |
| `EXECUTION_FAILED` | 3 | ComfyUI execution failed or was interrupted. For `category: oom`, reduce resolution/steps or ask the human about a higher GPU; for `kind: interrupted`, retry once | `prompt_id`, `run_index`, `kind`, `node_id`, `node_type`, `exception_type`, `exception_message`, `category`, `executed`, `traceback_tail`, `partial_outputs`, `output_dir` |
| `NO_OUTPUTS` | 2 | Execution completed without output files; add an appropriate `Save*` node | `prompt_id`, `run_index`, `output_dir` |
| `TIMEOUT` | 3 | Generation exceeded timeout | — |
| `JOB_LOST` | 3 | The submitted job is absent from both ComfyUI history and queue | `job_id`, `prompt_id`, `base_url`, `recorded_base_url`, `hint` |
| `MISSING_TOOL` | 2 | An explicitly requested verify artifact needs ffmpeg | `tool`, `hint`, `env` |
| `UNSUPPORTED_FORMAT` | 2 | A single verify target cannot be parsed | `path`, `magic`, `ext`, `supported` |
| `VERIFY_CHECKS_FAILED` | 3 | Artifact metadata failed one or more requested checks | `failed`, `report` |

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
| `MISSING_MODEL_ON_SERVER`, local server | **agent (confirm if large)** | Map `missing_models[].value` → kit via `colab catalog --json` (each kit's `assets[].file`); download into the local ComfyUI. Ask first when downloads exceed a few GB |
| `MISSING_MODEL_ON_SERVER`, Colab server | **human (setup cell)** | Identify the providing kit from catalog `assets`; hand the human that kit's `01_setup.py` cell. If the kit to add has `composable: true`, the cell can run additively on the existing runtime; otherwise advise a fresh runtime |
| `MISSING_NODE_ON_SERVER` | depends | Usually means wrong/outdated ComfyUI or missing custom node — treat like missing model: local = agent fixes, Colab = setup cell |
| GPU below kit's `gpu.minimum` | **human (choice)** | Present: upgrade runtime (cost) vs. smaller model (quality delta). Never choose paid options silently |
| License constraint (`license_notes`: non-commercial etc.) | **human (choice)** | Summarize the constraint, ask about intended use before generating |
| Generation succeeded but quality is off | **agent (bounded)** | Inspect the output yourself, adjust params, retry ≤ 3 times, then report with evidence |
| `EXECUTION_FAILED` with `category: oom` | depends | Reduce resolution or steps first; if that is insufficient, present a higher-GPU option to the human because it may cost money |
| `EXECUTION_FAILED` with `kind: interrupted` | **agent** | Retry once; if the server interrupts it again, report the repeated interruption |
| `NO_OUTPUTS` | **agent** | Add or fix the workflow's appropriate `Save*` output node, then rerun |
| `TIMEOUT` | **agent** | Retry once with a raised `--timeout-seconds`; if it persists, report — the model may be too heavy for the runtime |
| `JOB_LOST` | **agent** | Re-run the preset with the same arguments, using the record's `params`, `uploads`, and `seed` |

## 5. Reconnect flow (Colab volatility, condensed)

```
run/doctor/jobs wait → SERVER_UNREACHABLE (trycloudflare URL)
  → tell human: "Run All the notebook, paste the final line"
  → human pastes: comfy-agent connect https://new-id.trycloudflare.com
  → agent runs it (verifies + persists)
  → if a job was in flight: comfy-agent jobs wait <id>
       same runtime → downloads the outputs
       new runtime → JOB_LOST → re-run the preset (local files remain intact)
```

Total human cost per Colab session: open notebook, Run All, paste one line.

## 6. Verification duty

Before reporting success, verify the artifact yourself. Start with
`comfy-agent verify <run-dir> --json` — it needs no API key and works
offline. It reports per-file kind / dimensions / duration / frame count
(pure-JS, including the animated WEBP that Wan-family kits emit), and when
`ffmpeg` is on PATH it also writes `<run-dir>/verify/sheet.png` (contact
sheet), `verify/<name>/frame_NN_*.png` (first, evenly spaced, last frames),
and `verify/<name>_wave.png` for audio. Add `--expect-kind`,
`--expect-count`, or `--min-duration` to turn the request into machine-checked
assertions (exit 3 on failure — regenerate or fix the artifact).

Then **look**: open the sheet/frames (or pass them to `analyze` when an
OpenAI key is available) and compare against the request — subject, style,
motion, count. `verify` never looks at content; its
`summary.verified_visually` is always `false` on purpose.

- **Images** — `verify` sheet → view; compare against the request.
- **Video** — `verify` frames (first/middle/last are always included) → view;
  check duration and motion plausibility. Animated WEBP: `verify` gives frame
  count/duration but cannot extract frames — use the PIL one-liner from its
  warning hint before viewing.
- **Audio** — `verify` duration/waveform; play it back when possible.

Report differences from the request honestly. Never say "done" for an
output you have not inspected; if verification is impossible (no ffmpeg or
viewer), say so explicitly and mark the result unverified.

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
   `MISSING_MODEL_ON_SERVER`? (mismatched kit → §4) →
   `comfy-agent verify <run-dir> --expect-kind video --min-duration 8` →
   view the frames → deliver with a summary of what was verified.
