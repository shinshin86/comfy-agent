# Hunyuan Video on Colab

Verified end-to-end on Colab A100 40GB. Tencent Hunyuan Video
text-to-video via ComfyUI + comfy-agent over a cloudflared tunnel. L4
24GB should also work via runtime fp8 quantization but was not
re-verified in this kit.

Upstream references:
- https://comfyanonymous.github.io/ComfyUI_examples/hunyuan_video/
- https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged
- https://huggingface.co/tencent/HunyuanVideo

## Variants included

| File | Use | Notes |
|---|---|---|
| `hunyuan_video_t2v.json` | T2V 720p, single workflow | bf16 on disk, fp8_e4m3fn at load via UNETLoader. Uses DualCLIPLoader (clip_l + llava_llama3) and FluxGuidance distilled CFG. |

I2V variants (image-to-video) are documented in the upstream
HunyuanVideo_repackaged repo but not included here yet. Pattern for
adding them: clone this workflow, swap `UNETLoader.unet_name` to
`hunyuan_video_image_to_video_720p_bf16.safetensors`, and add image
input nodes per the upstream example.

## Flow

1. Colab runtime = L4 24GB or A100. Hunyuan Video is large; T4 16GB is
   not enough.
2. Run `01_setup.py` in a cell. This downloads ~35GB of weights:
   - 25.6GB diffusion model (bf16, runtime-quantized to fp8)
   - 9.1GB llava_llama3_fp8_scaled text encoder
   - 246MB clip_l text encoder
   - 493MB VAE
3. Run `../02_start_comfyui.py` in the next cell.
4. Poll `/content/comfy_url.txt` for the cloudflared URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/hunyuan_video/hunyuan_video_t2v.json --name hunyuan_video_t2v
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run hunyuan_video_t2v --6_text "your prompt" --3_seed 7 --timeout-seconds 1800
   ```

Parameter flags follow `--<node_id>_<input>` (`--6_text` = positive
prompt, `--26_guidance` = embedded CFG strength, `--3_seed` /
`--3_steps` = sampler, `--55_width` / `--55_height` / `--55_length` =
video shape).

## Notes

- Defaults match the official ComfyUI Hunyuan Video example: 832×480,
  33 frames @ 24fps, 20 steps, `euler` / `simple`, **cfg=1.0** with
  **FluxGuidance 6.0**. Hunyuan Video is CFG-distilled — keep
  `--3_cfg` at 1.0 and adjust strength via `--26_guidance` instead.
- **Generation time**: ~5–8 minutes per clip on L4 24GB. Bump
  `--timeout-seconds` accordingly. The first request is slower because
  the bf16 → fp8 quantization happens at model load.
- **VRAM management**: ComfyUI offloads text encoders before sampling,
  then the VAE before decode. Peak VRAM is ~13GB for the fp8 UNet plus
  activations — fits on L4 with comfortable headroom.
- **Output format**: `SaveAnimatedWEBP` produces `.webp`. Switch to
  `SaveVideo` / `VHS_VideoCombine` (requires
  ComfyUI-VideoHelperSuite) if you want `.mp4`.
- License: Hunyuan Video is released by Tencent under the **Tencent
  Hunyuan Community License**. Verify the upstream license before
  commercial deployment — it has restrictions on certain regions and
  usage scenarios.
