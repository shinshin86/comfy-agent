# LynnReal-Omni verification

## Result — 2026-09-16 JST

**Verified E2E for T2V and I2V video at 640×384 / 56 frames on Colab A100 40GB.**
Audio streams passed metadata and non-silence checks; perceptual listening
was not performed. This result does not certify 768p, long clips, other GPUs,
Flash, Light VAE, reference or pose workflows.

## Environment

- GPU: NVIDIA A100-SXM4-40GB (40,441 MiB reported by ComfyUI).
- Host RAM: approximately 83 GiB; high-RAM Colab runtime.
- Python 3.13.15; PyTorch 2.11.0+cu130.
- ComfyUI v0.35.0: `40c4fcdf513a4523e39d54a9d391908af8df8171`.
- Model revision: `ef06e618f44a6cb0f2ed111645052098c4b7364a`.
- comfy-kitchen 0.2.33, comfy-aimdo 0.5.3; DynamicVRAM enabled.
- Dedicated launcher: `--reserve-vram 4 --enable-triton-backend` with stock
  PyTorch attention. No custom node pack, LoRA or sampling-shift patch.
- Model download sizes and SHA-256 values passed validation; setup exited 0.
- INT8 model alone is larger than the GPU; CPU offload is part of this result.

## Canonical path

1. The kit setup ran on Colab, installing pinned ComfyUI/PyTorch, four model
   files and cloudflared. Sequential transfer was replaced with resumable
   parallel transfer; all final model hashes matched.
2. The dedicated launcher started ComfyUI and wrote a cloudflared URL.
3. The local Mac ran `node dist/cli/index.js connect` and `doctor --preset
   lynnreal_omni_t2v`: connection OK, no missing nodes or models.
4. The local CLI imported both bundled API workflows, creating local presets.
5. The local CLI ran both presets with seed 42 and a 1,800-second timeout,
   and retrieved both MP4 files through cloudflared.
6. `verify --expect-kind video --expect-count 1 --min-duration 2 --json`
   passed all eight checks for each output. Six sampled frames per video,
   including first and last, were opened and inspected.
7. After local evidence was saved, Colab MCP called `runtime.unassign()`.
   The browser showed the reconnect button; no further cells were executed.

The initial launcher was corrected before generation: `--lowvram` was removed
because it can move the quantized text encoder to CPU. Both recorded videos
used the final normal-mode launcher with DynamicVRAM.

## Outputs and timings

Both files are H.264 MP4, 640×384, 56 frames, 24 fps, approximately 2.33 s,
with stereo 32 kHz audio. No OOM occurred.

| Mode | Server execution | CLI recorded duration | Job ID |
|---|---:|---:|---|
| T2V, cold model | 189.47 s | 217.354 s | `f9dec245-6f26-4530-b849-0993c084ad56` |
| I2V, following T2V | 17.77 s | 21.335 s | `0c778dc6-02e6-4082-acd4-eb67e856f05d` |

These are different inputs and cache states, not a controlled speed comparison.
CLI duration includes polling and transfer overhead; server time excludes
setup/downloads. Larger videos were not benchmarked. Approximately 36.7 GB
of GPU memory was reported after execution; this is not a measured peak.

Output SHA-256:

- T2V: `53ee53de51de5f259ee5adb4c747a85766f50288cc4e425c0b9d27cffa414a1c`
- I2V: `5242af666104010c07180cd534a8f3027d497cf5d0a47b434fd83dfaa39c4cbf`

## Visual and audio inspection

Expected: a red toy car slowly moves on a wooden desk, without black frames
or major deformation; I2V preserves the supplied car and composition.

- T2V: the red car enters from the left and moves right. Body shape, wheels,
  cup and background remain recognizable across the inspected frames.
- I2V: input was T2V frame 44, at approximately 1.83 s. The first frame keeps
  the car and desk composition; subsequent frames move the car right.
  Desk reflections/texture change somewhat. No major body deformation or
  black frames were seen in the inspected samples.
- Audio: T2V mean/max volume was -42.0/-24.1 dB; I2V -47.1/-34.7 dB.
  Both streams are non-silent. Scene-sound accuracy and absence of speech/music
  are **not listening-verified**.

Local evidence is kept in the ignored `.comfy-agent/outputs/` and
`.comfy-agent/verification/20260916-lynnreal-omni/` directories. CLI manifests,
verification JSON and server log excerpts remain available after runtime deletion.
