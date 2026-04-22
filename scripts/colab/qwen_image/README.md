# Qwen-Image on Colab

Alibaba's open text-to-image model. The 2512 fp8 variant is the
recommended default (~20 GB UNet + 7.6 GB text encoder + 254 MB VAE ≈
28 GB on disk). L4 24GB is the practical minimum for fp8; A100
recommended for bf16.

Upstream references:
- https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI
- https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/

## Flow

1. Colab runtime = **L4** or **A100**. T4 16GB is tight on VRAM and is
   not recommended.
2. Run `01_setup.py` in a cell. Defaults to
   `USE_QWEN_IMAGE_2512_FP8 = True`; flip `USE_QWEN_IMAGE_2512_BF16 =
   True` on A100 if you want full precision.
3. Run `../02_start_comfyui.py` in the next cell (shared launcher).
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/qwen_image/qwen_image.json --name qwen_image
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run qwen_image --5_text "your prompt here"
   ```

Parameter flags follow the `--<node_id>_<input>` convention of the
auto-generated preset (`--5_text` = positive, `--6_text` = negative,
`--8_seed`/`--8_steps`/`--8_cfg` = sampler). Rename keys in
`.comfy-agent/presets/qwen_image.yaml` for friendlier flags if needed.

## Notes

- Defaults match the ComfyUI reference workflow: 1328×1328,
  `ModelSamplingAuraFlow` shift 3.1, `euler`/`simple`, 20 steps, cfg
  2.5.
- If you flip to bf16, change `unet_name` in `qwen_image.json` to
  `qwen_image_2512_bf16.safetensors`.
- For the 4-step Lightning LoRA, set `DOWNLOAD_LIGHTNING_LORA = True`
  in `01_setup.py`, add a `LoraLoaderModelOnly` node between
  `UNETLoader` (node `1`) and `ModelSamplingAuraFlow` (node `4`), then
  drop `steps` to 4 and `cfg` to 1.0 in node `8`.
- Text encoder + VAE are identical to the `qwen_image_edit` kit; if
  you run both in one session the weights are shared.
- `CLIPLoader` uses `type: qwen_image` (same as the `z_image` kit).
  If a future ComfyUI release renames the type, check
  `/object_info/CLIPLoader` and adjust the preset.
