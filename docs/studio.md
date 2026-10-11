# Comfy Agent Studio — agent guide

`comfy-agent studio` starts a local web page (http://127.0.0.1:8790/ by default)
organized around what the connected ComfyUI can actually create. Results fill
the page, with a prompt composer docked at the bottom. **The studio has no
model of its own.** The agent session makes creative and technical decisions;
the user can also generate directly or re-create a recorded job through the
normal CLI. The page displays those decisions and records selections and
feedback into the same `.comfy-agent/` files you read. Job routes and feedback
are limited to jobs in this folder's local workdir. Global characters and
presets can still be read.

```
agent session ──(comfy-agent CLI)──> ComfyUI
      │  writes plans / jobs                ▲
      ▼                                     │
 .comfy-agent/ (jobs, characters, studio/) ─┘
      ▲  writes feedback / requests
      │
 browser (comfy-agent studio)
```

## 1. Receive requests

The user writes a request in the studio and either copies it into your session
or sends it to the inbox. Both carry the request, an optional character, the selected
output IDs, and a `context` containing the chosen task, preset, parameters,
input selections, count, seed, and source job when re-creating. Uploaded input IDs resolve
to files in `.comfy-agent/studio/uploads/`; copied requests include their
resolved paths. Read this context before choosing a workflow. The copied prompt also includes resolved output
paths. Copying previews a request without storing it; its `request_id` is
`(preview)`, so omit `request_id` when writing a plan for that draft. Sending
stores a real request ID that the plan can reference.

- To react to sent requests live, run `comfy-agent studio inbox --follow` in a
  background monitor (for example Claude Code's Monitor tool). Each new request
  is printed as one JSON line.
- `comfy-agent studio inbox --json` lists requests that no plan answers yet.

Before deciding anything, read the context the request points to:

- `comfy-agent brief <character> --preset <preset> --json` for a character.
- `comfy-agent history show <job_id>` for each selected output, including
  its prompt, parameters, notes, tags, and `reject_reason`.
- `comfy-agent history list --favorite --json` and `--rejected` for the
  user's past preferences.

## Create directly or ask an agent

1. Choose what to make from the composer mode chips. Only capabilities whose
   engines pass the connected server's preflight appear. If there is only one
   capability, no mode row is needed. Large model menus group choices by model family and provide a name filter.
   The most recently used engine selects
   the initial mode; otherwise Studio selects the first capability.
2. Add compatible inputs by dropping files, dragging results onto a slot, or
   choosing **Select a result** / **Choose a file**. Attaching an image while
   creating an image or video switches to editing or animation when available.
3. Write the prompt in the large input box. Chips below it choose the model
   (when multiple engines exist), length in seconds, aspect ratio, and count
   (1–4). **Details** contains the negative prompt, seed, strength, and remaining
   controls. Enter generates; Shift+Enter adds a line. IME composition does
   not submit.
4. **Generate** sends these settings through
   `comfy-agent run <preset> --json --source local`. **Ask the agent** opens a
   request dialog; copying or sending to the inbox does not generate.

The connection pill summarizes the GPU and available capabilities. Open it
for the full URL, its configuration source, VRAM, version, available modes,
and a collapsed list of unavailable workflows with missing nodes or models.
**Check again** bypasses the 60-second server cache. When ComfyUI does not
respond, the composer explains how to check the running server and URL;
there are no unverified modes to choose. Past results, favorites, notes, and
agent requests remain available.

`GET /api/catalog` reads local and global presets (local names shadow global
ones), their workflow profiles, and ComfyUI's `/object_info` and
`/system_stats`. It returns only runnable engines grouped by capability, with resolved human-readable controls and input slots. Engines
within one mode may use different numbers of input slots. Engines that lack
the main image/video upload needed by their capability appear in the
unavailable list with instructions to import them again.
Changing an engine retains compatible filled inputs with the same semantic
role, including original inputs loaded from a recorded job.

The line above the task buttons explains that the connected ComfyUI determines
the available tasks and shows only its host (or “Colab” for a trycloudflare tunnel).
It remains visible when only one task is available. **Details** opens **What you
can make and why**, listing the available model options and explaining tasks
hidden because required nodes, models, or input settings are missing. The model
option count includes different settings for the same model family; family names
are listed once, with at most three shown. Task buttons provide the same model
summary in a tooltip and accessible description.

Cached checks are labeled as results from the previous check; **Check again**
refreshes the existing 60-second server snapshot. An online server with no
usable tasks has an explanation and a link to the missing items. Offline,
past results and agent requests remain accessible.

An input is marked **Can be omitted** only when the connected server's
`object_info` confirms that disconnecting its upload node leaves an output.
Studio removes dependent nodes with required links, disconnects optional
links, and removes nodes that no longer feed an output. **Do not use**
collapses the slot; restoring it keeps its selected file. Missing metadata
never implies optionality. A skippable main image/video input also offers the
engine in the matching text-only mode, marked **Run without images/video**.
Each engine appears once per mode.

An active slot requires a supplied file if the preset marks it required or
the workflow has no baked file name. A non-required slot with a baked file
uses that default. This differs from omitting the slot: a skipped slot does
not send the baked input either. The **Required** badge is shown for active,
non-skippable slots requiring a file; skippable slots instead show **Can be
omitted** and still require a file while active when no default is permitted.

Duration choices use whole or half seconds and map to valid integer frame
counts, respecting bounds, choices, and frame steps from the preset/server
(including documented `8n+1` rules). The chip shows an approximate duration;
**Details** retains the exact frame count. Model group headings name the
family once; rows only add a description when it contributes new information.
The server fingerprint hashes sorted node classes and model-list values.
`?refresh=1` refreshes both probes; catalog derivation uses the new snapshot.
The offline catalog has no capabilities and sets `unverified: true`.
The older `/api/capabilities` route remains for compatibility.

### Confirm workflow profiles

Profiles are stored locally in `.comfy-agent/studio/profiles/<preset>.json`.
Studio creates missing profiles automatically from preset parameters and
workflow nodes. They describe output type, semantic input roles, capability,
model label, localized title/summary, controls, and duration/size constraints.
Titles use the preset description or a cleaned display name. Model detection
prioritizes diffusion-model/checkpoint loaders over text encoders and VAEs.
Automatic profiles regenerate when the workflow, preset mapping, or inference
revision changes.
Agent-confirmed profiles are retained and marked stale instead.

When the user starts using Studio, and after importing a workflow, review and
confirm the profile's capability, model label, title, summary, and control/input
mapping. Automatic inference is a starting point; it cannot establish every
workflow's intended use.

```sh
comfy-agent studio profile <preset> --json
comfy-agent studio profile --all --json
comfy-agent studio profile <preset> --set profile.json --json
```

Edit the `profile` object returned by the first command, save that object to
`profile.json`, and pass it to `--set`. Studio validates the schema and preset
mapping, records the current workflow hash, and sets `source: "agent"`.
For engines in one capability, default selection follows most recently used
job, then an agent-confirmed `recommended: true`, then normal speed, then name
order. Imports create automatic profiles on a best-effort basis.

Typing `@` in the prompt opens a character picker when characters exist. The
picker is also available inside **Ask the agent**. A selected character appears
as a chip and makes the agent action prominent. Direct generation is disabled
because applying appearance and LoRA requires agent judgment; removing the
chip enables direct generation again.

Running generations appear as placeholder cards at the top of the feed.
Completed outputs join the results; failures remain until dismissed. Filters
show all results, favorites, images, or videos and can reveal rejected results.
Requests and plans appear only when non-empty, in a side sheet opened by the
header's **Agent** button.

## Re-create and use results

Selecting a result opens a detail dialog with preview, favorite, rejection
reason, notes, and the agent's linked plan.
Card model labels come from workflow profiles even for unavailable engines;
when no profile can be read, cards show the output kind. **Re-create with these settings**
loads that job into the same composer, including parameters, original
inputs, and fixed seed. **Create with this** puts the output in a compatible
input slot; otherwise it remains available as a reference for an agent request. Use
**Add to agent context** to attach extra reference outputs to a request.

Jobs from remote workflows cannot be replayed directly. Missing presets must
be restored. For original upload slots, Studio first uses the recorded local
file, then downloads the ComfyUI input copy into
`.comfy-agent/cache/studio-inputs/`. If both are gone, choose a replacement.
Replacement files are checked against the upload definition's kind.

`POST /api/generate` accepts
`{ capability, preset, prompt, params, inputs, count, seed, lang }`, with optional
`negative_prompt`, `duration_s`, and either `aspect` or `size`. Semantic controls
require a matching catalog capability and engine; older preset/params requests
remain supported. Seconds map to frames using the selected frame rate, and
aspect/size choices must match the engine's constraints.
`inputs` maps each slot to `{ job_id, output_index }`, `{ upload_id }`, or
`{ input_job_id, input_slot }` for an original upload recorded in a local job.
A `source_job_id` restores original parameters/inputs for re-creation. Only
known, typed parameters and compatible inputs are accepted. New runs and the
legacy re-run endpoint share one CLI argument builder and at most two active
runs, including input preparation. A third request returns HTTP 429. Fixed
seeds require count one. The length chip shows seconds; Details also shows the corresponding frame count.

`skip: [slot]` explicitly disconnects optional slots and cannot overlap
`inputs`. If omitted when re-creating, the recorded skipped slots are used.
Studio validates the entire combination against the cached server snapshot
before starting a run. Its CLI arguments include repeated
`--skip-input <slot>`. The CLI verifies `object_info` even with
`--no-preflight` or `--dry-run`, reports `UNKNOWN_INPUT_SLOT` or
`INPUT_NOT_SKIPPABLE` when needed, and stores `skipped_inputs` in jobs and
run manifests so re-creation reproduces the omission.

`POST /api/uploads` streams a whitelisted image/audio/video content type to
`.comfy-agent/studio/uploads/`, with a 200 MiB limit. It returns an upload ID,
kind, and preview URL. Preview routes accept IDs only. Studio stays on
loopback with Host and Origin checks, and does not enable cross-origin writes.

## 2. Write a plan before generating

Translate the request into a plan and save it so the user can see what you
decided and why. Write the JSON to a file and save it with
`comfy-agent studio plan <file>` (or pipe it with `-`). Re-run the same
command with the same `id` to update the plan as steps progress; `created_at`
is kept.

```json
{
  "id": "cafe-scene",
  "title": "Seat miko in a café",
  "request_id": "req-20261007120000-ab12cd",
  "intent": "この子をカフェに座らせて",
  "summary": "Keep miko's identity via her LoRA; new scene from text.",
  "status": "running",
  "steps": [
    {
      "title": "Key image",
      "purpose": "Create the café scene with miko",
      "method": "t2i + character LoRA",
      "model": "Flux.1 dev",
      "preset": "flux1_lora",
      "character": "miko",
      "inputs": [],
      "prompt": "m1ko sitting at a window seat in a quiet café, afternoon light",
      "settings": { "width": 1024, "height": 1024 },
      "reason": "Her approved gallery was made with this LoRA; t2i keeps her look in a new scene.",
      "status": "done",
      "job_ids": ["0f3c9a2e"]
    }
  ]
}
```

| Field                                 | Meaning                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `id`                                  | Plan ID (`[A-Za-z0-9_-]`, up to 64 characters).                                  |
| `request_id`                          | The studio request this plan answers. Linking it marks the request handled.      |
| `intent` / `summary`                  | The user's words and your interpretation.                                        |
| `status`                              | `proposed`, `running`, `done`, or `cancelled`.                                   |
| `steps[].purpose`                     | What the step achieves, in creative terms.                                       |
| `steps[].method` / `model` / `preset` | How you chose to do it.                                                          |
| `steps[].inputs`                      | Job IDs or file paths used as inputs.                                            |
| `steps[].reason`                      | Why you chose this method and model. Shown to the user as written.               |
| `steps[].status`                      | `pending`, `running`, `done`, `failed`, or `skipped`.                            |
| `steps[].job_ids`                     | Job IDs from `run --json`. Prefixes are accepted. Outputs link back to the step. |

Write `reason` for the user, not for yourself: one or two sentences naming the
choice and what it protects (identity, composition, speed).

## 3. Generate and link the results

Run generations with the normal CLI (`comfy-agent run <preset> ... --json`).
Add each returned `job_id` to the step's `job_ids` and save the plan again. The
studio refreshes when job records or plans change.

## 4. Read feedback before the next decision

The user's feedback in the studio is written to the job record:

- ★ favorite → `favorite: true`
- reject → tag `reject` with `reject_reason`
- notes → `notes[]`

Read these with `comfy-agent history show <job_id>` or
`history list --favorite/--rejected` before the next plan, and carry the
preferences forward ("darker", "keep this mood"). Move approved outputs into a
character's gallery only when the user asks (`character gallery add/approve`).
