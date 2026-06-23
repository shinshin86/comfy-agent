# Krea 2 (Turbo, fp8) on Colab

Krea 2 (K2) is an image generation model by [Krea.ai](https://www.krea.ai/krea-2),
trained from scratch and released under a permissive community license. It
runs **natively in ComfyUI 0.25.0+** (no custom nodes) and is built on the
Qwen-Image stack — a Qwen3-VL text encoder (`CLIPLoader` type `krea2`) plus
the Qwen-Image VAE.

This kit uses the community **fp8 Turbo** repack (8-step distilled): the
diffusion model is ~12.9 GB, so the three weights fit an **L4 24 GB**
runtime (RAW/bf16 would need an A100).

**Verified E2E** on a Colab L4 (23 GB): the canonical local-Mac →
cloudflared → `comfy-agent run` flow produced a 1280×720 image in 8 steps.

Upstream references:
- Krea 2 OSS bucket: https://huggingface.co/buckets/krea-community/krea-2
- fp8 Turbo repack: https://huggingface.co/AlperKTS/Krea2_FP8
- Qwen3-VL text encoder: https://huggingface.co/Comfy-Org/Qwen3-VL
- Qwen-Image VAE: https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI

## Weights (downloaded by `01_setup.py`)

| File | Dest | Source |
|---|---|---|
| `krea2_turbo_fp8.safetensors` (~12.9 GB) | `models/diffusion_models/` | `AlperKTS/Krea2_FP8` |
| `qwen3vl_4b_fp8_scaled.safetensors` | `models/text_encoders/` | `Comfy-Org/Qwen3-VL` |
| `qwen_image_vae.safetensors` (254 MB) | `models/vae/` | `Comfy-Org/Qwen-Image_ComfyUI` |

## Flow

1. Open a Colab notebook on an **L4+** GPU runtime.
2. Run `01_setup.py` in a cell (clones ComfyUI, installs deps, downloads
   the 3 weight files + cloudflared).
3. Run `../02_start_comfyui.py` (shared launcher).
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/krea2/krea2_turbo.json --name krea2
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run krea2 --11_text "a red fox in a snowy pine forest at golden hour"
   ```

Parameter flags follow the `--<node_id>_<input>` convention of the
auto-generated preset (`--11_text` = prompt, `--19_seed` = sampler seed,
`--19_steps`, `--19_cfg`, `--28_width`, `--28_height`). Rename keys in
`.comfy-agent/presets/krea2.yaml` for friendlier flags if needed.

## Notes

- The bundled workflow mirrors the upstream Turbo defaults: 8 steps,
  cfg 1.0, `er_sde` sampler, `simple` scheduler, 1280×720. Because cfg is
  1.0 the negative prompt is a `ConditioningZeroOut` of the positive — the
  distilled model does not use classifier-free guidance.
- `CLIPLoader` uses `type: krea2`, which ComfyUI 0.25.0+ recognizes for the
  Qwen3-VL encoder. Older ComfyUI builds will not have this type — `git
  pull` in `01_setup.py` keeps the checkout current.
- License: Krea 2 ships under a permissive community license; commercial
  use is available via opensource@krea.ai. Review upstream terms before
  commercial use.
