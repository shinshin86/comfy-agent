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
paths. For creation requests, copying previews a request without storing it; its `request_id` is
`(preview)`, so omit `request_id` when writing a plan for that draft. Sending
stores a real request ID that the plan can reference.

- To react to sent requests live, run `comfy-agent studio inbox --follow` in a
  background monitor (for example Claude Code's Monitor tool). Each new request
  is printed as one JSON line.
- `comfy-agent studio inbox --json` lists requests not yet answered by a plan or prompt suggestion.

Before deciding anything, read the context the request points to:

- `comfy-agent brief <character> --preset <preset> --json` for a character.
- `comfy-agent history show <job_id>` for each selected output, including
  its prompt, parameters, notes, and tags.
- `comfy-agent history list --favorite --json` for the user's favorites.
- `comfy-agent studio feedback --json` for reasons given when deleting outputs
  (see **Read feedback** below).

## Create directly or ask an agent

1. Choose what to make from the composer mode chips. Only capabilities whose
   engines pass the connected server's preflight appear. If there is only one
   capability, no mode row is needed. Large model menus group choices by model family and provide a name filter.
   The most recently used engine selects
   the initial mode; otherwise Studio selects the first capability.
2. Add compatible inputs by dropping files anywhere on the page, pasting an
   image into the composer, dragging results onto a slot, or choosing
   **Pick from results** / **Choose a file**. Drops on a slot fill that slot;
   drops elsewhere fill empty compatible slots in order. Extra files and
   incompatible inputs show a message. Attaching an image while creating an
   image or video switches to editing or animation when available. Input zones
   use compact columns with previews sized to the composer; the input area
   itself never scrolls, including with one, two, or three filled slots; filled zones offer
   **Use another image** (or video/audio/file) and **Remove**. The replacement
   button opens **Choose a file** / **Pick from results**; optional empty slots
   say they can be omitted and are skipped when generating.
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
links, and removes nodes that no longer feed an output. Empty optional slots
send `skip`. Removing a filled slot clears it; zones that remain visible
return to their empty drop zone. There is no separate omission toggle. Required slots still block generation when empty.
Missing metadata never implies optionality.

In text-only variants, the omitted main input zones are hidden. **+ Start from
an image** (or video/audio/file) switches to the corresponding input mode.
Dropping or selecting an image in text-to-video switches to image-to-video
with the same engine when available. Removing the last main image returns
to text-to-video when that engine can run without images. Other optional inputs follow the same rule for their
text-only variant. The model and generation settings are retained. Selecting
an input mode while it is empty still allows generation when the input is
optional, with a message explaining that no source image will be used. A
skippable main image/video input also offers the engine in the matching
text-only mode, marked **Run without images/video**.
Each engine appears once per mode.

An active, non-optional slot requires a supplied file if the preset marks it
required or the workflow has no baked file name. A non-required slot that
cannot be omitted may use its baked file. An empty optional slot is skipped
instead, so it does not send a baked input. The **Required** badge is shown for active,
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
show all results, favorites, images, or videos. Older results tagged `reject`
are displayed normally.
Requests and plans appear only when non-empty, in a side sheet opened by the
header's **Agent** button.

## Re-create and use results

Selecting a result opens a detail dialog with three groups:

- **Create next**: **Re-create** loads the job into the composer with its
  parameters, original inputs and fixed seed. The next action names the actual
  destination, such as **Animate this image**. When several modes accept the
  result, **Create from this image** (or video/audio/result) opens their menu.
  The action is hidden if no available mode accepts the output.
- **Organize**: favorite and notes.
- **Consult**: **Ask the agent about this image** (or video/audio/result)
  opens the agent request dialog directly with the selected result attached.

**Delete** sits in the detail header next to **Close**. It opens a confirmation
with an optional reason; confirming removes that output file and its entry.
Other outputs remain, and the job record is removed when its last output is
gone. The API accepts only exact local job IDs and files inside this folder's
`.comfy-agent/outputs/`; global jobs, external paths and file links are refused.
In-progress jobs cannot be deleted. No ComfyUI server files, uploads, or input
references are deleted. The deletion is permanent after confirmation.

`POST /api/jobs/:job_id/outputs/:index/delete` takes
`{ saved_to, reason? }`, with `saved_to` from the output's `delete_key` in
`/api/state`. This identity check refuses stale indices rather than deleting
another output. Reasons are optional and limited to 4,000 characters.
Files and records are staged locally so a write failure before the final
unlink can restore them. Host, Origin and local-workdir guards apply.
Card model labels come from workflow profiles even for unavailable engines;
when no profile can be read, cards show the output kind.

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

Favorites and notes stay in the job record. Read them with
`comfy-agent history show <job_id>` and `history list --favorite` before the
next plan. Carry the user's preferences forward, and move approved outputs
into a character's gallery only when the user asks
(`character gallery add/approve`).

```sh
comfy-agent studio feedback --json
```

Read this before proposing the next creation. A non-empty deletion reason
adds one entry to `.comfy-agent/studio/feedback.jsonl` with `kind: "deleted"`,
`at`, `preset`, `prompt`, `params`, and `reason`. The parameter summary contains
only numeric and boolean values, with at most 64 entries; it stores no media.
No entry is written when the user leaves the reason blank. The command reads
feedback only from the current folder's local workdir.

Older `reject` tags and `reject_reason` fields remain readable through the
history CLI for compatibility. Studio has no rejection action or filter and
never writes new rejection metadata.

## Prompt assist requests

**Suggest a prompt** (「プロンプトを提案してもらう」) explains that the agent
rewrites for the connected model and explains the meaning in the UI language.
It queues `kind: "prompt_assist"` with the prompt, UI language,
selected capability and preset, model label, controls, filled input slot roles
and upload/output references, and an optional character. Studio never calls an
LLM or starts another agent process. The running agent session handles it.

1. Read `comfy-agent studio inbox --json` or watch `studio inbox --follow`.
   Branch on `kind`: `creation` requests use plans; `prompt_assist` requests
   stay pending until a suggestion references their `request_id`.
2. Run `comfy-agent studio prompt-guide <preset> [--json]`. It selects the
   packaged guide from the workflow profile's model and capability: MiniMax H3,
   Krea 2 / Qwen-Image, general image, video, or audio. Read referenced input
   context when needed. Prompt assistance must not start a generation.
3. Rewrite while preserving the user's intent. Add only structure required
   by the model, without inventing content, music, dialogue or style. Provide
   one to three usable alternatives and a brief meaning in the UI language.
   Japanese requests require `explanation.ja`; English text is shown only when
   `explanation.en` is provided. Optional localized notes explain material changes.
4. Write JSON and run `comfy-agent studio suggest reply.json --json`, or pipe
   it to `comfy-agent studio suggest - --json`:

```json
{
  "request_id": "req-example",
  "preset": "example",
  "suggestions": [
    {
      "prompt": "A cat watches through the window.",
      "explanation": {
        "ja": "猫が窓の外を見ている場面です。",
        "en": "A cat looking out through a window."
      }
    }
  ]
}
```

Use the actual ID and preset from the request. Each prompt is limited to
32,000 characters; each localized explanation or note to 4,000. Replies are
limited to 256 KiB. Optional `settings` accepts only `negative_prompt`,
`duration_s`, and either `size: [width, height]` or `aspect` (1:1, 16:9, 9:16,
4:3), validated against controls exposed by that engine and its preset bounds.
Do not suggest unrelated controls. No reply is applied automatically.

Replies live at `.comfy-agent/studio/suggestions/<request_id>.json` and are read
through `GET /api/requests/:id/suggestion` under the usual loopback/Host guard.
A pending reply returns `suggestion: null`. An answer marks the inbox request
handled; a plan alone does not answer prompt assistance. `inbox --all` includes
answered requests. Follow mode prints new requests after the watcher starts.

The user can edit or compare suggestions, apply each setting individually,
**Use** the prompt, and **Undo** the prompt replacement. **Copy** copies the
currently edited suggestion, briefly confirms success, and selects its text
for manual copying if clipboard access is blocked. **Copy request** copies
the agent request instead; the two actions are labeled separately. The
answer uses the composer's fonts, borders and chips. On desktop the explanation
and notes have room beside the prompt controls; on small screens long answers
scroll within the answer area with an explicit hint, while Use/Copy/Close stay
visible. The input slot area itself does not scroll. Closing or cancelling
stops waiting in this tab; it does not retract a request already in the inbox.
Late replies do not reopen a cancelled panel. After about 20 seconds without
a reply, the panel explains how to start a watcher or copy the same request,
including its actual ID, into the active agent session.
