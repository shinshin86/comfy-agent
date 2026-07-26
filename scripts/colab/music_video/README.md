# music_video — combo kit (audio + image + video on one runtime)

**Status: Verified E2E** (A100, 2026-07-25 — full canonical flow: Colab
setup → cloudflared tunnel → local `comfy-agent connect`/`import`/`run`
for all three modalities → recipe assembly to a finished MV).

One A100 Colab runtime that can do everything the
[music-video recipe](../../../recipes/music-video/RECIPE.md) needs:

| Capability | Model | Workflow | Notes |
|---|---|---|---|
| Full songs (lyrics, vocals) | ACE-Step 1.5 Turbo AIO | `ace_step_1_5_t2a.json` | same as [`../ace_step_1_5/`](../ace_step_1_5/) |
| Keyframe images | Z-Image turbo | `z_image_turbo.json` | same as [`../z_image/`](../z_image/) |
| Text-to-video clips | Wan 2.2 TI2V 5B | `wan22_ti2v_5b.json` | same as [`../wan22/`](../wan22/) |
| Image-to-video clips | Wan 2.2 TI2V 5B | `wan22_ti2v_5b_i2v.json` | adds `LoadImage` → `start_image` for keyframe-driven clips |

- **GPU**: A100 (Wan 2.2 TI2V 5B and simultaneous model switching need the
  headroom; 40 GB VRAM class).
- **Downloads**: ~49 GB total (ACE-Step 10 + Z-Image 20.6 + Wan 18.1).
- **ComfyUI**: pinned to the revision the `ace_step_1_5` kit verified —
  ACE-Step 1.5 is the newest family, so this revision covers all three.
- **Not composable**: the pin means you should not run other kits' setup
  cells on top of this runtime (see `catalog.yaml`).

## Run

1. Colab → A100 runtime → paste `01_setup.py` into a cell, run (~15-20 min).
2. Paste [`../02_start_comfyui.py`](../02_start_comfyui.py) into the next
   cell, run. It prints a `comfy-agent connect https://…` line when ready.
3. On your local machine:

```bash
comfy-agent connect https://<id>.trycloudflare.com

comfy-agent import scripts/colab/music_video/ace_step_1_5_t2a.json  --name mv_song
comfy-agent import scripts/colab/music_video/z_image_turbo.json     --name mv_keyframe
comfy-agent import scripts/colab/music_video/wan22_ti2v_5b_i2v.json --name mv_clip

comfy-agent preset mv_song      # inspect generated --<node_id>_<input> flags
```

Then follow [recipes/music-video/RECIPE.md](../../../recipes/music-video/RECIPE.md)
(agent-oriented, end-to-end pipeline including ffmpeg assembly).

## Licenses

- ACE-Step 1.5: original code/model card declare MIT; the Comfy-Org repack
  metadata declares Apache-2.0 — review both. Check generated music for
  copyright/voice/style-similarity risks before publishing.
- Z-Image turbo, Wan 2.2: see the upstream model repositories.
- Review each model's terms before commercial use of a finished MV.

## Verification record

Verified 2026-07-25 on an A100-SXM4-40GB Colab runtime, in a single
run-through from a local macOS machine over a trycloudflare tunnel:

- [x] `01_setup.py` completes on an A100 Colab runtime (~47 GB, ~12 min)
- [x] `02_start_comfyui.py` writes a usable URL
- [x] `comfy-agent doctor` → `connection: OK` from a local machine
      (via `comfy-agent connect`, config-persisted base URL)
- [x] all three presets import; `doctor --preset` passes for each
- [x] song (ACE-Step, 60 s / 48 kHz mp3), keyframes (Z-Image, 1280x704),
      and i2v clips (Wan 2.2 TI2V 5B, 121 frames via `--image` upload,
      ~5 min/clip) all produced via `comfy-agent run` and saved locally
- [x] recipe assembly (PIL webp→frames→ffmpeg) yields a playable MV
      (35.3 s, h264 + AAC), spot-checked frame-by-frame

Notes from the run: ffmpeg could not decode the animated WEBP directly —
use the recipe's PIL frame-extraction fallback. Character consistency
across scenes varies without a character LoRA.
