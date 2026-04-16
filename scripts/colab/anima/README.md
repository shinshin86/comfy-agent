# Anima Preview 3 on Colab

Anime-style Qwen-Image finetune by circlestone-labs. Fits on a T4
runtime (~5.6 GB total weights: 4.2 GB UNet + 1.2 GB text encoder + 254
MB VAE).

Upstream references:
- https://huggingface.co/circlestone-labs/Anima
- Reference workflow embedded in the repo's `example.png`

## Flow

1. Run `01_setup.py` in a Colab cell (clones ComfyUI, installs deps,
   downloads the 3 Anima weight files + cloudflared).
2. Run `../02_start_comfyui.py` (shared launcher).
3. Poll `/content/comfy_url.txt` for the tunnel URL.
4. Locally:

   ```bash
   comfy-agent import ./scripts/colab/anima/anima_preview3.json --name anima_preview3
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run anima_preview3 --11_text "an anime girl reading a book under a cherry blossom tree"
   ```

Parameter flags follow the `--<node_id>_<input>` convention of the
auto-generated preset (`--11_text` = positive prompt, `--12_text` =
negative, `--19_seed` = sampler seed, `--19_steps`, `--19_cfg`). Rename
keys in `.comfy-agent/presets/anima_preview3.yaml` for friendlier flags
if needed.

## Notes

- The bundled workflow mirrors the settings in `example.png` (30 steps,
  cfg 4.0, `er_sde` sampler, `simple` scheduler, 1024×1024).
- `CLIPLoader` uses `type: stable_diffusion` even though the encoder is
  Qwen 3 — this matches the reference workflow and is how Anima expects
  its text conditioning to be wired.
- If you want the older Anima base instead of Preview 3, change
  `unet_name` in `anima_preview3.json` to `anima-preview.safetensors`
  and download that file in `01_setup.py`.
