# Recipe: Krea 2 keyframe to MiniMax H3 video

Use the [`krea2_h3` combo kit](../../scripts/colab/krea2_h3/) to make a
Krea 2 Turbo keyframe, select it visually, and animate it with MiniMax H3
FL2VA or Ref2VA on one A100 runtime.

Read [the agent playbook](../../docs/agent-playbook.md) before generation and
[the MiniMax H3 prompting guide](../../docs/minimax-h3-prompting.md) before
writing any H3 prompt. Import the workflows as `k2h3_keyframe`, `k2h3_i2v`,
and `k2h3_r2v` using the kit README.

## 1. Generate two keyframe candidates

Keep the prompt and 864x480 canvas fixed; change only the seed:

```bash
comfy-agent run k2h3_keyframe --prompt "<keyframe prompt>" \
  --width 864 --height 480 --steps 8 --cfg 1 --seed 1001 --json
comfy-agent run k2h3_keyframe --prompt "<same keyframe prompt>" \
  --width 864 --height 480 --steps 8 --cfg 1 --seed 1002 --json
```

Run `comfy-agent verify <candidate-run-dir> --expect-kind image --json` for
both runs and inspect the images. Keep the candidate with the intended
identity, composition, anatomy, and clean edges. Fix the keyframe before
spending H3 compute on animation.

## 2. Choose the H3 workflow

| Need | Preset | Inputs | Use when |
|---|---|---|---|
| Animate one starting frame with generated scene audio | `k2h3_i2v` | `--image`, `--prompt` | Motion and sound can be directed entirely in the H3 prompt. |
| Preserve a pictured subject and follow a voice/song performance | `k2h3_r2v` | `--image`, `--audio`, `--prompt` | Precise lip timing or reference-audio performance matters. |

For R2V, keep the audio between 2 and 15 seconds and set `--length` to its
duration (124/243/362 frames are about 5.17/10.13/15.08 seconds at 24 fps).
Write both visual direction and sound in H3's required three-field format.

## 3. Generate and verify the video

```bash
comfy-agent run k2h3_i2v --image ./selected.png \
  --prompt "<three-field H3 prompt>" --length 124 --json

# Or, for reference-audio lip sync:
comfy-agent run k2h3_r2v --image ./selected.png --audio ./voice.wav \
  --prompt "<three-field H3 prompt>" --length 124 --json
```

Run `comfy-agent verify <video-file> --expect-kind video --json`, then inspect
the first, middle, and last frames and confirm that an audio stream is present.
Check identity, composition drift, motion, lip sync where applicable, and
sound. Allow at most about one retake per clip: adjust the motion/sound prompt
or seed once, verify again, and keep the better take.
