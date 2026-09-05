# Optional H3 profiles on Colab A100

**Starter — not Verified E2E.** Ordinary H3 remains unchanged. See
[environment selection](../../../docs/h3-environment-selection.md) for intent,
cost, license, compatibility and verification rules.

Use a fresh A100 high-RAM runtime. Set `PROFILE` in `01_setup.py` to `guide`, `sns`,
or `motion`, run it, then run [the shared launcher](../02_start_comfyui.py).
Connect locally with the printed `comfy-agent connect` command. Motion prompts
for Google Drive authorization and persists latents across runtime resets.
Set `REF2VA=True` only for `minimax_h3_motion_r2v`; this downloads Ref2VA instead
of FL2VA. All profiles are isolated from the original H3 checkout. Do not run
this installer on an active normal H3 or FastH3 runtime.

Import only the matching workflow, keeping its name. Examples from the repo root:

```bash
comfy-agent import scripts/colab/minimax_h3_extensions/minimax_h3_sns_t2v.json --name minimax_h3_sns_t2v
comfy-agent doctor --preset minimax_h3_sns_t2v --json
comfy-agent run minimax_h3_sns_t2v --104_prompt "<your H3 three-field prompt>" --120_strength_model 0.75 --seed 42 --timeout-seconds 3600
```

SNS I2V adds `--image ./first-frame.png`. Strength 0 is the comparison baseline;
0.75 is the starting style strength. Neither speed nor quality improvement is
promised. Start at the default 864x480; for portrait use a supported 32-pixel
canvas (for example 480x864), then increase only after memory/quality verification.

For Guide, import `minimax_h3_guide.json` as `minimax_h3_guide`. Use `--image`
for the anchor and `--120_frame_idx -1` for the end, or a pixel-frame index within
`--104_length` for an intermediate guide. This graph has one image guide. For audio only, import `minimax_h3_guide_audio.json`;
for image plus audio, use `minimax_h3_guide_av.json`. These expose `--audio` and
`--image` as appropriate, and default to frame 0 (audio at the last frame would
be cropped almost entirely). Multiple guide anchors or other combinations require
separately verified graph variants.

## Continue motion and audio

Import `minimax_h3_motion_t2v.json` as `minimax_h3_motion_t2v` (or the `_r2v`
variant with its own exact name). `chain.py` runs **locally on macOS/Linux** using
Python 3 and the installed `comfy-agent` executable. It executes one clip per
`next`, waits for local retrieval and metadata verification, then records it.
It never uses ComfyUI's browser Chain button and never submits `/prompt` directly.

Create a local plan under the ignored `.comfy-agent/` directory:

```json
{
  "preset": "minimax_h3_motion_t2v",
  "width": 864,
  "height": 480,
  "length": 124,
  "seed": 42,
  "prompts": ["<clip 1 three-field prompt>", "<clip 2 continuation prompt>", "<clip 3 continuation prompt>"]
}
```

For R2V add `"image": "./portrait.png"` and `"audio": "./voice.wav"`; reference
paths resolve from the local working directory at init. Their contents are hashed
so a changed reference cannot silently alter the remaining chain. Each clip uses
`seed + zero-based clip index`. Treat the initialized plan and imported preset as
immutable: start a new state path for changed resolution, model, workflow or plan.
Use the normal H3 prompting skill; continue the preceding closing shot, budget the
22-frame pinned head, and avoid an abrupt contradiction at the join.

```bash
python3 scripts/colab/minimax_h3_extensions/chain.py init --plan .comfy-agent/chain-plan.json --state .comfy-agent/chains/demo/state.json
python3 scripts/colab/minimax_h3_extensions/chain.py next --state .comfy-agent/chains/demo/state.json
# Inspect the returned clip's frames and listen to its audio, then repeat next.
python3 scripts/colab/minimax_h3_extensions/chain.py status --state .comfy-agent/chains/demo/state.json
python3 scripts/colab/minimax_h3_extensions/chain.py assemble --state .comfy-agent/chains/demo/state.json --output .comfy-agent/chains/demo/combined.mp4
```

`assemble` requires ffmpeg and all planned clips; it combines already trimmed
clips with 32 kHz stereo audio, refuses an existing output, and does not certify
perceptual continuity. Run `comfy-agent verify` and inspect the combined file.

Each chain gets a unique Drive folder. Reconnect to a new motion runtime with the
same mounted Drive account and rerun `next` with the same local state. The previous
clip is loaded from its explicit numbered latent slot; missing files fail.
No directory scanning for "latest" and no automatic fallback to pixels is used.
Keep both the local state/results and Drive latents for restart.

Failures do not advance clip indices. A process crash or network failure may leave
a server job running: inspect `runs/<index>/*.log` and `comfy-agent jobs` first.
If `result.json` exists, `next` recovers and verifies that result without generating
again. Otherwise it refuses to rerun until you explicitly pass `--retry-pending`,
after confirming/stopping the old job. Retrying overwrites only that chain's current
latent slot. Local concurrent callers are blocked with an OS file lock.

For custom orchestration, nodes 120/122 control load/save indices, node 121 sets
context (22 video frames / 24 audio frames), and node 123 trims both streams with
`match_tail=true`. Load 0 / Save 1 produces clip 1; Load 1 / Save 2 continues it.
Keep resolution, checkpoint and 24 fps fixed. Do not add Spectrum or Turbo LoRAs
to these starter graphs. Long chains can still lose audio detail.
