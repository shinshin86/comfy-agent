# comfy-agent Studio — agent guide

`comfy-agent studio` starts a local web page (http://127.0.0.1:8790/ by default)
that shows the production state of the current folder: generated outputs,
characters, plans, and requests. **The studio has no model of its own.** You,
the agent session running in this folder, make every creative and technical
decision. The page displays those decisions and records the user's selections
and feedback into the same `.comfy-agent/` files you read.

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
or sends it to the inbox. Both carry the same text: the request, a
`request_id`, an optional character, and the absolute paths of selected
outputs.

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
