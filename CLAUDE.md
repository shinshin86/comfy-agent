# CLAUDE.md

Project-specific rules for Claude Code working in this repo.

## Verifying Colab kits (`scripts/colab/<kit>/`)

The canonical end-to-end verification flow is **non-negotiable**: it must
exercise the same path a real user follows.

### The canonical flow

1. User's local Mac is the **comfy-agent host**. The repo working tree.
2. Colab is the **ComfyUI host**, set up by the kit's `01_setup.py` +
   shared `02_start_comfyui.py`. Use `colab-mcp` to drive cells.
3. Transport between them is the **cloudflared tunnel** written to
   `/content/comfy_url.txt`.
4. Verification commands run **on the local Mac** with
   `COMFY_AGENT_BASE_URL` pointed at the trycloudflare URL:
   - `comfy-agent doctor` → `connection: OK`
   - `comfy-agent import scripts/colab/<kit>/<workflow>.json --name <preset>`
   - `comfy-agent run <preset> --<node_id>_<input> "<value>"` and confirm
     the image arrives under the local `.comfy-agent/outputs/<preset>/<ts>/`.

### Hard rules — never violate

- **Do not substitute the local Mac with the Colab runtime.** Installing
  `comfy-agent` inside Colab and pointing it at `127.0.0.1:8188` does
  NOT count as E2E verification. The cloudflared tunnel is the part most
  likely to break for real users; bypassing it defeats the purpose.
- **Do not skip the `comfy-agent` CLI step.** Hitting ComfyUI's
  `/prompt` HTTP API directly only proves the workflow JSON parses. It
  does NOT exercise `comfy-agent import` (preset YAML generation),
  parameter mapping, output retrieval, or the local output path — all
  of which are what users actually rely on.
- **Do not claim "Verified E2E" when any required leg is unverified.**
  If cloudflared (or anything else) is broken, surface that to the user
  and either wait for recovery or ship the kit as **Starter**. Never
  redefine "verified" to fit a green checkmark.

### Verification checklist

A kit may only be marked **Verified E2E** in `scripts/colab/README.md`
and its own README when ALL of these have been observed from the local
Mac in a single run-through:

- [ ] `01_setup.py` completes on the target Colab GPU runtime
- [ ] `02_start_comfyui.py` writes a usable URL to `/content/comfy_url.txt`
- [ ] `comfy-agent doctor` → `connection: OK` from the local Mac
- [ ] `comfy-agent import` generates a preset YAML
- [ ] `comfy-agent run <preset>` produces an image saved under the
      **local** `.comfy-agent/outputs/<preset>/<timestamp>/`

If any box is unchecked at PR time, the kit is **Starter** — not
Verified E2E.
