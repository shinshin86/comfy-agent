# Wan 2.1 on Colab

T2V 1.3B verified end-to-end on Colab L4. Wan 2.1 text-to-video via
ComfyUI + comfy-agent over a cloudflared tunnel. T2V 14B fp8_scaled
included as an optional download for higher quality on L4+ runtimes.

Upstream references:
- https://comfyanonymous.github.io/ComfyUI_examples/wan/
- https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged

## Variants included

| File | Model | Size | GPU | Notes |
|---|---|---|---|---|
| `wan21_t2v_1_3b.json` | T2V 1.3B fp16 | ~2.8GB | T4 / L4 | Lightest Wan 2.1, fast first test. Default. |
| `wan21_t2v_14b.json` | T2V 14B fp8_scaled | ~14GB | L4 24GB / A100 | Higher quality, slower. Set `DOWNLOAD_T2V_14B=True` in setup. |

Both variants share the same `umt5_xxl_fp8_e4m3fn_scaled.safetensors` text
encoder (~6.4GB) and `wan_2.1_vae.safetensors` (~250MB).

I2V (image-to-video), VACE, and Fun-Camera variants are documented in
the upstream repo but not included here yet. Pattern for adding them:
clone the closest workflow JSON, swap the `UNETLoader.unet_name`, and
add `CLIPVisionLoader` + image inputs as the I2V example shows.

## Flow

1. Colab runtime = T4 (1.3B) or L4+ (14B).
2. Edit `01_setup.py` flags as needed (`DOWNLOAD_T2V_1_3B`,
   `DOWNLOAD_T2V_14B`).
3. Run `01_setup.py` in a cell.
4. Run `../02_start_comfyui.py` in the next cell.
5. Poll `/content/comfy_url.txt` for the cloudflared URL.
6. Locally:

   ```bash
   # T2V 1.3B (default)
   comfy-agent import ./scripts/colab/wan21/wan21_t2v_1_3b.json --name wan21_t2v_1_3b
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run wan21_t2v_1_3b --6_text "your prompt" --55_length 33

   # T2V 14B (much slower)
   comfy-agent import ./scripts/colab/wan21/wan21_t2v_14b.json --name wan21_t2v_14b
   comfy-agent run wan21_t2v_14b --6_text "your prompt" --55_length 33 --timeout-seconds 1800
   ```

Parameter flags follow `--<node_id>_<input>` (`--6_text` = positive
prompt, `--7_text` = negative, `--3_seed` / `--3_steps` / `--3_cfg` for
sampler, `--55_width` / `--55_height` / `--55_length` for video shape).

## Notes

- Defaults match the official ComfyUI Wan 2.1 example: 832×480, 33
  frames @ 16fps, 30 steps, `uni_pc` / `simple`, cfg 6.0, shift 8.0.
- **Output format**: `SaveAnimatedWEBP` produces `.webp`. Switch to
  `SaveVideo` / `VHS_VideoCombine` (requires ComfyUI-VideoHelperSuite)
  if you want `.mp4`.
- **Generation time**: 1.3B finishes in ~1–2 min on L4; 14B fp8_scaled
  takes 5–10 min. Bump `--timeout-seconds` for 14B accordingly.
- **Quality ranking** (per upstream): fp16 > bf16 > fp8_scaled >
  fp8_e4m3fn. Use fp16 if you have the VRAM headroom.
- License: Wan 2.1 is released by Wan-AI under Apache 2.0 — commercial
  use permitted. Verify upstream before redistribution.
