# Z-Anime on Colab

Anime-style full fine-tune of Z-Image (S3-DiT 6B) by SeeSee21. Same
architecture as the upstream `z_image` kit, so the workflow only swaps
the UNet and adjusts the recommended sampler. Apache 2.0 (commercial
use permitted).

Upstream references:
- https://huggingface.co/SeeSee21/Z-Anime
- Reference workflow: `workflows/Z-Anime-Workflow-v1.json` in the repo

## Variants included

| File | Model | Size | GPU | Notes |
|---|---|---|---|---|
| `z_anime_base.json` | Z-Anime base fp8 | ~6 GB | T4 / L4 | Default. 28 steps, cfg 4.0, `euler_ancestral` / `beta`. |
| `z_anime_distill_8step.json` | Z-Anime distill-8step fp8 | ~6 GB | T4 / L4 | Fast iterations. 8 steps, cfg 1.0. Set `DOWNLOAD_DISTILL_8STEP=True` in setup. |

Both variants share the same `qwen_3_4b-fp8.safetensors` text encoder
(~4 GB) and `ae.safetensors` VAE (~168 MB) — these are downloaded
unconditionally by `01_setup.py`.

## Flow

1. Colab runtime = T4 (fp8 fits in 8 GB VRAM per upstream).
2. Edit `01_setup.py` flags as needed (`DOWNLOAD_BASE`,
   `DOWNLOAD_DISTILL_8STEP`).
3. Run `01_setup.py` in a cell.
4. Run `../02_start_comfyui.py` in the next cell.
5. Poll `/content/comfy_url.txt` for the cloudflared URL.
6. Locally:

   ```bash
   # Base (default, higher quality)
   comfy-agent import ./scripts/colab/z_anime/z_anime_base.json --name z_anime_base
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run z_anime_base --4_text "an anime girl reading a book under a cherry blossom tree"

   # Distill 8-step (fast)
   comfy-agent import ./scripts/colab/z_anime/z_anime_distill_8step.json --name z_anime_distill_8step
   comfy-agent run z_anime_distill_8step --4_text "an anime girl reading a book under a cherry blossom tree"
   ```

Parameter flags follow `--<node_id>_<input>` (`--4_text` = positive
prompt, `--5_text` = negative, `--7_seed` / `--7_steps` / `--7_cfg` for
sampler, `--6_width` / `--6_height` for resolution).

## Notes

- **Defaults match upstream guidance**: base → 28 steps, cfg 4.0,
  `euler_ancestral`, `beta`; distill-8step → 8 steps, cfg 1.0 (negative
  prompt has limited effect on the distilled checkpoint).
- **Resolution presets** (per upstream): portrait 832×1216, landscape
  1216×832, square 1024×1024, full body 768×1344. The bundled
  workflow defaults to portrait 832×1216.
- **Text encoder & VAE are sourced from the Z-Anime repo**, not from
  `Comfy-Org/z_image_turbo` — the files are byte-identical to the
  Z-Image originals (Qwen 3 4B + Z-Image VAE) but mirrored under
  `SeeSee21/Z-Anime` so the kit pulls everything from one place.
- **bf16 alternative**: swap the UNet filename in the workflow to
  `z-anime-base-bf16.safetensors` (~12 GB) for L4+ runtimes if you want
  bf16 quality. Update `01_setup.py` to download the corresponding file.
- **GGUF / AIO variants**: upstream also ships GGUF quantized and
  All-In-One bundles; not included here. Pattern for adding them:
  swap `UNETLoader` for the GGUF loader (requires
  ComfyUI-GGUF custom node) or use the AIO checkpoint with
  `CheckpointLoaderSimple`.
