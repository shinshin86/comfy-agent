# Qwen-Image-Edit on Colab

Alibaba's image-editing variant of Qwen-Image. Provide a source image
and a natural-language edit prompt. The 2511 bf16 checkpoint (~40 GB)
is the latest and highest quality and needs A100; 2509 fp8 (~20 GB)
fits on L4 24GB.

Upstream references:
- https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI
- https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/

## Flow

1. Colab runtime = **A100** (for 2511 bf16, the default) or **L4** (if
   you flip `USE_QWEN_IMAGE_EDIT_2509_FP8 = True`).
2. Run `01_setup.py` in a cell.
3. Run `../02_start_comfyui.py` in the next cell (shared launcher).
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Upload your source image via the ComfyUI browser UI (drop it into
   the `LoadImage` node at path `input/`), or pre-stage it into
   `ComfyUI/input/example.png` on the Colab runtime.
6. Locally:

   ```bash
   comfy-agent import ./scripts/colab/qwen_image_edit/qwen_image_edit.json --name qwen_image_edit
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run qwen_image_edit \
     --5_image "example.png" \
     --6_prompt "change the background to a neon-lit cyberpunk alleyway"
   ```

Parameter flags follow the `--<node_id>_<input>` convention
(`--5_image` = source filename on the runtime, `--6_prompt` =
positive edit prompt, `--7_prompt` = negative, `--9_seed`/`--9_steps`/
`--9_cfg` = sampler). Rename keys in
`.comfy-agent/presets/qwen_image_edit.yaml` for friendlier flags if
needed.

## Variants

Set exactly one of these in `01_setup.py`:

| Flag | Weights | Size | GPU |
|---|---|---|---|
| `USE_QWEN_IMAGE_EDIT_2511_BF16` (default) | `qwen_image_edit_2511_bf16.safetensors` | ~40 GB | A100 40GB |
| `USE_QWEN_IMAGE_EDIT_2509_FP8` | `qwen_image_edit_2509_fp8_e4m3fn.safetensors` | ~20 GB | L4 24GB |
| `USE_QWEN_IMAGE_EDIT_DEFAULT` | `qwen_image_edit_fp8_e4m3fn.safetensors` | ~20 GB | L4 24GB |

If you switch variants, also update `unet_name` in
`qwen_image_edit.json` to match the downloaded filename.

## Optional LoRAs

- `DOWNLOAD_LIGHTNING_LORA_2511`: 4-step distilled LoRA for 2511. Add a
  `LoraLoaderModelOnly` node between `UNETLoader` (node `1`) and
  `ModelSamplingAuraFlow` (node `4`), then drop `steps` to 4 and `cfg`
  to 1.0 in node `9`.
- `DOWNLOAD_ANYTHING2REAL_LORA`: stylized → photoreal conversion LoRA.
- `DOWNLOAD_MULTIPLE_ANGLES_LORA`: multi-angle rotation LoRA. Also
  clones `jtydhr88/ComfyUI-qwenmultiangle` into `custom_nodes/` since
  it exposes nodes used by the reference multi-angle workflow.

## Notes

- `TextEncodeQwenImageEdit` is the node that binds the prompt to the
  source image's visual tokens. If a future ComfyUI release renames it
  (e.g. `TextEncodeQwenImageEditPlus` for 2511-specific features),
  check `/object_info` and update node `6`/`7` accordingly.
- Text encoder + VAE are identical to the `qwen_image` kit; weights
  are shared when both kits run in the same session.
- Defaults: 20 steps, cfg 4.0, `euler`/`simple`,
  `ModelSamplingAuraFlow` shift 3.1. Tune cfg upward for stronger edit
  adherence, downward for more source-image preservation.
- For strict local edits (preserve most of the source), lower
  `denoise` in node `9` from 1.0 toward 0.6–0.8.
