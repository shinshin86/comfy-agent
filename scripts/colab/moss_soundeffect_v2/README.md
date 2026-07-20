# MOSS-SoundEffect v2.0 on Colab

This kit generates environmental and action sound effects from English or
Chinese text with the latest DiT-based MOSS-SoundEffect v2.0 model. It uses an
original thin ComfyUI adapter around the official OpenMOSS Python pipeline; it
does not use the older autoregressive MOSS-SoundEffect model.

Upstream references:

- https://huggingface.co/OpenMOSS-Team/MOSS-SoundEffect-v2.0
- https://github.com/OpenMOSS/MOSS-TTS/tree/main/moss_soundeffect_v2

Status: **Verified E2E** on an A100 40 GB Colab runtime with Python 3.12,
ComfyUI 0.28.0, and PyTorch 2.9.0+cu128. Verification covered the public
cloudflared URL and the local `comfy-agent doctor`, `import`, and `run` flow,
including local FLAC download and playback.

## Flow

1. Connect a Colab runtime with an A100 GPU.
2. Run `01_setup.py` in a Colab code cell. The setup downloads roughly 11 GB
   of model data on the first run.
3. Run `../02_start_comfyui.py` in another cell.
4. Read the trycloudflare URL from `/content/comfy_url.txt`.
5. On the local machine:

   ```bash
   comfy-agent import ./scripts/colab/moss_soundeffect_v2/moss_soundeffect_v2_t2a.json \
     --name moss_soundeffect_v2_t2a
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run moss_soundeffect_v2_t2a \
     --1_prompt "A heavy wooden door slams shut in a large stone hall with a long echo." \
     --1_seconds 5 \
     --timeout-seconds 900
   ```

The lossless FLAC file is downloaded below
`.comfy-agent/outputs/moss_soundeffect_v2_t2a/`.

## Parameters and limits

- `--1_prompt`: English or Chinese description of the sound effect.
- `--1_seconds`: output duration from 1 to 30 seconds.
- `--1_steps`: diffusion steps. The upstream default is 100; fewer steps are
  useful for quick checks but may reduce quality.
- `--1_cfg_scale`: prompt guidance. The upstream default is `4.0`.
- `--1_sigma_shift`: flow-matching scheduler shift. The upstream default is
  `5.0`.
- `--1_seed`: deterministic noise seed.
- `--1_negative_prompt`: optional description of unwanted audio content.

The current v2.0 DAC produces 48 kHz mono audio. The first generation can take
longer while the model loads and CUDA kernels initialize. The setup disables
TorchDynamo compilation for more predictable Colab compatibility. ComfyUI and
MOSS run in a dedicated Python 3.12 virtual environment so the model's pinned
NumPy and Protobuf dependencies do not modify Colab's base environment.

The model and official inference package use the Apache-2.0 license. Review the
upstream model card before redistributing weights or publishing generated
assets.
