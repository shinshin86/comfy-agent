# HiDream-I1 on Colab

[HiDream-I1](https://github.com/HiDream-ai/HiDream-I1) is a 17B-parameter
open image diffusion model by HiDream.ai (MIT). This kit pulls the
Comfy-Org repack so **no Hugging Face access token is required** —
including the gated Llama 3.1 8B text encoder, which Comfy-Org ships as
an fp8-scaled `.safetensors` directly downloadable.

All three fp8 variants (Fast / Dev / Full) verified end-to-end via the
canonical flow: local Mac → cloudflared tunnel → Colab ComfyUI. Each
exercised with `comfy-agent import` + `comfy-agent run` producing images
saved locally under `.comfy-agent/outputs/<preset>/<timestamp>/`.

| Variant | Verified GPU | Warm time / image (832×1216) |
|---|---|---|
| Fast (16 steps, cfg 1.0)  | L4 24GB       | ~30 s  |
| Dev  (28 steps, cfg 1.0)  | A100 40GB     | ~36 s  |
| Full (50 steps, cfg 5.0)  | A100 40GB     | ~1:15  |

Upstream references:
- https://github.com/HiDream-ai/HiDream-I1
- https://comfyanonymous.github.io/ComfyUI_examples/hidream/
- https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI

## Variants included

| File | Diffusion model | Size | GPU | Status | Notes |
|---|---|---|---|---|---|
| `hidream_i1_fast.json` | Fast fp8 | ~17 GB | L4+ | Verified E2E | Default. 16 steps, cfg 1.0, `lcm` / `normal`, shift 3.0. |
| `hidream_i1_dev.json` | Dev fp8 | ~17 GB | L4+ | Verified E2E | 28 steps, cfg 1.0, `lcm` / `normal`, shift 6.0. Set `DOWNLOAD_DEV_FP8=True` in setup. |
| `hidream_i1_full.json` | Full fp8 | ~17 GB | A100 recommended | Verified E2E | 50 steps, cfg 5.0, `uni_pc` / `simple`, shift 3.0. Set `DOWNLOAD_FULL_FP8=True` in setup. |

All variants share four text encoders (CLIP-L, CLIP-G, T5-XXL fp8,
Llama 3.1 8B Instruct fp8 ≈ 16 GB total) plus the Flux VAE (`ae.safetensors`,
~335 MB). These are downloaded unconditionally by `01_setup.py`.

**Total disk** for the default fast-only download: ~33 GB (17 GB UNet +
16 GB encoders + 335 MB VAE). Enabling all three fp8 variants pushes it
to ~67 GB. Colab disk is typically 100+ GB so this fits.

## Flow

1. Colab runtime: **L4 24GB** for Fast/Dev fp8, **A100** for Full or
   any bf16 variant. The T4 free tier (16 GB VRAM) cannot fit even the
   fp8 UNet — use the `z_image` or `flux1` kits instead for free-tier.
2. Edit `01_setup.py` flags as needed (`DOWNLOAD_FAST_FP8`,
   `DOWNLOAD_DEV_FP8`, `DOWNLOAD_FULL_FP8`, `DOWNLOAD_FULL_FP16`).
3. Run `01_setup.py` in a cell.
4. Run `../02_start_comfyui.py` in the next cell.
5. Poll `/content/comfy_url.txt` for the cloudflared URL.
6. Locally:

   ```bash
   # Fast (default, fewest steps)
   comfy-agent import ./scripts/colab/hidream_i1/hidream_i1_fast.json --name hidream_i1_fast
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run hidream_i1_fast --5_text "your prompt here"

   # Dev (balanced)
   comfy-agent import ./scripts/colab/hidream_i1/hidream_i1_dev.json --name hidream_i1_dev
   comfy-agent run hidream_i1_dev --5_text "your prompt here"

   # Full (highest quality, slow)
   comfy-agent import ./scripts/colab/hidream_i1/hidream_i1_full.json --name hidream_i1_full
   comfy-agent run hidream_i1_full --5_text "your prompt here"
   ```

Parameter flags follow `--<node_id>_<input>` (`--5_text` = positive
prompt, `--6_text` = negative, `--8_seed` / `--8_steps` / `--8_cfg` for
sampler, `--7_width` / `--7_height` for resolution, `--2_shift` for the
SD3 sampling shift).

## Notes

- **Defaults match the official ComfyUI HiDream example PNGs** (extracted
  from `hidream_dev_example.png` and `hidream_full_example.png` in
  `comfyanonymous/ComfyUI_examples`). Fast settings come from the
  upstream sampling-settings note shipped alongside those workflows.
- **Negative prompt**: Fast and Dev are distilled at cfg 1.0 — the
  negative prompt has no effect, so the workflow leaves it empty. Full
  uses cfg 5.0 and ships with a minimal `"blurry, low quality, jpeg
  artifacts"` negative.
- **Resolution**: defaults to 1024×1024 (matches the upstream examples).
  HiDream is trained on multi-aspect data so non-square resolutions like
  832×1216 / 1216×832 should work.
- **VRAM tip**: if you OOM on L4, set `--1_weight_dtype` to `fp8_e4m3fn`
  on the `UNETLoader` to force weight-time quantization (matches the
  upstream "out of memory" note).
- **bf16 alternative**: swap the UNet filename in the workflow to
  `hidream_i1_full_fp16.safetensors` / `hidream_i1_dev_bf16.safetensors`
  / `hidream_i1_fast_bf16.safetensors` (~34 GB each) for A100 runtimes
  if you want full-precision quality. Update `01_setup.py` to download
  the corresponding file (`DOWNLOAD_FULL_FP16` flag is provided as a
  starting point).
- **Edit models**: Comfy-Org also ships `hidream_e1.1_bf16.safetensors`
  for image editing — not included here. Pattern for adding: download
  that file and load the `hidream_e1.1_example.png` workflow from
  `comfyanonymous/ComfyUI_examples/hidream/`.
- **License**: MIT (commercial use permitted). The Llama 3.1 8B text
  encoder is upstream gated on HuggingFace, but Comfy-Org redistributes
  an fp8-scaled `.safetensors` extracted form under the same repo —
  treat its use according to Meta's Llama 3.1 community license.
