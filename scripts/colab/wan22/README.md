# Wan 2.2 on Colab A100

Starter kit for running Wan 2.2 video generation via ComfyUI + comfy-agent.

Upstream references:
- https://comfyanonymous.github.io/ComfyUI_examples/wan22/
- https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged

## Variants included

| File | Use | Notes |
|---|---|---|
| `wan22_ti2v_5b.json` | TI2V 5B, text→video | Single unet, wan2.2 VAE. Fast, recommended first test. |
| `wan22_t2v_14b.json` | T2V 14B, text→video | Dual expert unets (high_noise → low_noise, switch at step 10). Uses wan 2.1 VAE. Heavy. |

I2V variants (image→video) are not included yet; clone `wan22_t2v_14b.json`
and swap `EmptyHunyuanLatentVideo` for the image-conditioned latent node
from the ComfyUI example page.

## Flow

1. Colab runtime = A100.
2. Edit `01_setup.py` `OPTIONS` to toggle which variants to download
   (`DOWNLOAD_TI2V_5B`, `DOWNLOAD_T2V_14B`). Each set is ~30–60 GB.
3. Run `01_setup.py` in a cell.
4. Run `../02_start_comfyui.py` in the next cell.
5. Poll `/content/comfy_url.txt` for the tunnel URL.
6. Locally:

   ```bash
   # TI2V 5B
   comfy-agent import ./scripts/colab/wan22/wan22_ti2v_5b.json --name wan22_ti2v_5b
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run wan22_ti2v_5b --4_text "your prompt" --6_length 81

   # T2V 14B (much slower)
   comfy-agent import ./scripts/colab/wan22/wan22_t2v_14b.json --name wan22_t2v_14b
   comfy-agent run wan22_t2v_14b --4_text "your prompt" --6_length 81 --timeout-seconds 1800
   ```

## Caveats

- **Starter workflows, not canonical**: node names (`EmptyHunyuanLatentVideo`,
  `SaveAnimatedWEBP`, `CLIPLoader type=wan`) match recent ComfyUI releases
  but may drift. If a node fails to resolve, open the ComfyUI example page,
  copy their API JSON, and re-import.
- **T2V 14B expert switching**: the provided JSON splits steps 0–10 on the
  high_noise unet and 10–20 on the low_noise unet via `KSamplerAdvanced`.
  Adjust the split point / total steps via `--7_steps`, `--7_end_at_step`,
  `--11_start_at_step`, `--11_steps`.
- **Output format**: `SaveAnimatedWEBP` produces `.webp`. Switch to
  `SaveVideo` / `VHS_VideoCombine` (requires ComfyUI-VideoHelperSuite) if
  you want `.mp4`.
- **Generation time**: expect several minutes per clip on A100. Bump
  `--timeout-seconds` accordingly.
