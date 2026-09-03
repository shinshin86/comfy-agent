# krea2_h3 — Krea 2 keyframes + MiniMax H3 video

**Status: Starter.** This combo kit has not completed the canonical Colab
E2E flow. It must remain Starter until every item in the verification
checklist below is recorded from one A100 run.

One A100 Colab runtime provides three linked workflows:

| Capability | Model | Workflow | Imported name |
|---|---|---|---|
| Keyframe image | Krea 2 Turbo fp8 | `krea2_turbo.json` | `k2h3_keyframe` |
| First-frame image-to-video with generated stereo audio | MiniMax H3 FL2VA | `minimax_h3_i2v.json` | `k2h3_i2v` |
| Reference image + reference audio lip sync | MiniMax H3 Ref2VA | `minimax_h3_r2v.json` | `k2h3_r2v` |

- **GPU**: A100 required.
- **Downloads**: 82.08 GB with both H3 families enabled (the default).
- **ComfyUI**: pinned to the native MiniMax H3 revision; Krea 2 and H3
  model snapshots, cloudflared version, file sizes, and SHA-256 values are pinned.
- **Not composable**: use this pin as a fresh runtime instead of stacking
  another kit's setup cell on it.

## Setup and import

1. Select an A100 Colab runtime and run `01_setup.py` in one cell (~40 min).
2. Run [`../02_start_comfyui.py`](../02_start_comfyui.py) in the next cell.
3. On the local machine, connect and import all three workflows:

```bash
comfy-agent connect https://<id>.trycloudflare.com

comfy-agent import scripts/colab/krea2_h3/krea2_turbo.json --name k2h3_keyframe
comfy-agent import scripts/colab/krea2_h3/minimax_h3_i2v.json --name k2h3_i2v
comfy-agent import scripts/colab/krea2_h3/minimax_h3_r2v.json --name k2h3_r2v
```

The generated flags were measured through `comfy-agent import`:

| Preset | Main flags | Seed target | Required uploads |
|---|---|---|---|
| `k2h3_keyframe` | `--prompt` (`11_text`), `--steps`, `--cfg`, `--width`, `--height` | `19.seed` | none |
| `k2h3_i2v` | `--prompt` (`104_prompt`), `--width`, `--height`, `--length` | `15.noise_seed` | `--image` |
| `k2h3_r2v` | `--prompt` (`104_prompt`), `--width`, `--height`, `--length` | `15.noise_seed` | `--image`, `--audio` |

`--seed` targets the seed field listed above. Run `comfy-agent preset
<name>` to inspect every generated parameter before a production run.

## Chain a keyframe into H3

Generate Krea 2 candidates at H3's 864x480 canvas and capture the output path
from `runs[0].outputs[0].saved_to`:

```bash
comfy-agent run k2h3_keyframe \
  --prompt "cinematic character keyframe, medium close-up" \
  --steps 8 --cfg 1 --width 864 --height 480 --seed 1001 \
  --out ./k2h3-keyframes --json > keyframe-run.json

KEYFRAME="$(jq -r '.runs[0].outputs[0].saved_to' keyframe-run.json)"
```

Animate it with FL2VA. MiniMax H3 produces the video and stereo audio together:

```bash
comfy-agent run k2h3_i2v --image "$KEYFRAME" \
  --prompt "<MiniMax H3 three-field prompt>" \
  --width 864 --height 480 --length 124 --seed 2001 --json
```

Or drive identity and lip timing from a reference image and WAV:

```bash
comfy-agent run k2h3_r2v --image "$KEYFRAME" --audio ./voice.wav \
  --prompt "<MiniMax H3 three-field prompt>" \
  --width 864 --height 480 --length 124 --seed 3001 --json
```

Read [`../../../docs/minimax-h3-prompting.md`](../../../docs/minimax-h3-prompting.md)
before composing either H3 prompt. For R2V, use 2–15 seconds of reference
audio and match `--length` to it: 124 frames ≈ 5.17 s, 243 ≈ 10.13 s,
and 362 ≈ 15.08 s at 24 fps. H3 uses the reference for timing and content,
but generates a new output waveform rather than preserving the input audio.

For candidate selection, I2V/R2V choice, and bounded retakes, follow
[`../../../recipes/krea2-h3/RECIPE.md`](../../../recipes/krea2-h3/RECIPE.md).

## Licenses and runtime region

- Krea 2 uses the Krea community license. Review the full upstream terms;
  contact `opensource@krea.ai` for commercial use.
- The MiniMax H3 license defines an **Applicable Territory** that excludes
  the EU, UK, Republic of Korea, and USA. Check the **Colab runtime region**,
  not only the user's physical location, before downloading or using H3.
- Review the H3 license for commercial authorization, attribution, output-use,
  and acceptable-use terms. This kit does not geolocate the user or block execution.

## Verification checklist

- [ ] `01_setup.py` completes on an A100 Colab runtime
- [ ] `02_start_comfyui.py` writes a usable URL to `/content/comfy_url.txt`
- [ ] `comfy-agent doctor` reports `connection: OK` from the local machine
- [ ] all three `comfy-agent import` commands generate preset YAML files
- [ ] `comfy-agent run k2h3_keyframe` saves an image under the local `.comfy-agent/outputs/`
- [ ] `comfy-agent run k2h3_i2v` saves a video with stereo audio locally
- [ ] `comfy-agent run k2h3_r2v` saves a lip-synced video with stereo audio locally
