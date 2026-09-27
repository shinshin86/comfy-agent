# Qwen-Image 2.1 UC-Q4_K_M GGUF on Colab

> **Status: Verified E2E (Colab L4, 2026-09-23).** Setup, tunnel, local-Mac
> `doctor`/`import`/`run`, output retrieval, and visual inspection passed for
> all three workflows.

This separate kit runs the `qwen-image-2.1-UC-Q4_K_M.gguf` file from
[abenzerps/Qwen-Image-2.1-Uncensored-GGUF](https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-GGUF)
with [leejet/ComfyUI-GGUF](https://github.com/leejet/ComfyUI-GGUF). It keeps
the existing [safetensors kit](../qwen_image_2_1/) and its verified workflows
unchanged. ComfyUI **master/nightly** is required for the native Qwen-Image 2.1
text-encoding and cache nodes.

The catalog keeps the older unqualified kit names as aliases for this UC kit.
For new selections, use the explicit `qwen_image_2_1_gguf_uc` or
`qwen_image_2_1_gguf_base` name.

## What the UC file is

`Q4_K_M` is a GGUF quantization format. `UC` is the publisher's filename label;
it does **not** mean "the checkpoint before fine-tuning." The model card calls
the files quantizations of the original upstream base weights, but does not
document a fine-tuning procedure, weight modification, or reproducible
comparison demonstrating different content behavior. Treat any claimed
"uncensored" behavior as unverified. The GGUF file is pinned by the SHA-256
published in that repository's `SHA256SUMS`; a changed download stops setup
until it is reviewed.

The weights retain the [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE):
research or evaluation use only unless the model owner grants a separate
commercial license. Review [Google Colab's policies](https://research.google.com/colaboratory/faq.html)
for your intended prompts and outputs.

## Requirements and downloads

Use an **L4 (24 GB) or larger GPU**. All bundled workflows were verified at
1024×1024 on L4. Higher resolutions have not been tested. The setup downloads
approximately:

| File | Destination | Size |
|---|---|---:|
| `qwen-image-2.1-UC-Q4_K_M.gguf` | `models/diffusion_models/` | 4.60 GB |
| `qwen3vl_8b_int8_convrot.safetensors` | `models/text_encoders/` | 9.35 GB |
| `qwen_image_2.1_vae_bf16.safetensors` | `models/vae/` | 0.68 GB |
| **Total** | | **~14.63 GB** |

The encoder and VAE filenames match the existing Qwen-Image 2.1 kit, so a
shared ComfyUI workspace can reuse those downloads. The GGUF diffusion file
still needs its own 4.60 GB. The setup also clones `leejet/ComfyUI-GGUF` and
installs its Python requirements. If `custom_nodes/ComfyUI-GGUF` already points
to another repository, setup stops and asks you to resolve that conflict.

## Colab flow

1. Open a Colab notebook using an L4 runtime.
2. Paste and run [`01_setup.py`](./01_setup.py) in the first cell.
3. Paste and run [`../02_start_comfyui.py`](../02_start_comfyui.py) in the second cell.
4. Wait for `/content/comfy_url.txt` and run the printed `comfy-agent connect`
   line on your local Mac.
5. Import a workflow and generate an image locally:

   ```bash
   comfy-agent import ./scripts/colab/qwen_image_2_1_gguf_uc/qwen_image_2_1_gguf_uc_t2i.json --name qwen21_gguf_uc_t2i
   comfy-agent run qwen21_gguf_uc_t2i --prompt "A ceramic teapot on a wooden table" --seed 7
   ```

The tunnel URL changes when Colab restarts. Local presets and outputs remain
under `.comfy-agent/`; reconnect to the new URL without re-importing.

## Workflows

| File | Task | Input |
|---|---|---|
| `qwen_image_2_1_gguf_uc_t2i.json` | Text to image | `--prompt`, optional size and seed |
| `qwen_image_2_1_gguf_uc_edit.json` | Image edit | `--image` and `--prompt` |
| `qwen_image_2_1_gguf_uc_edit_2ref.json` | Two-image edit | `--image`, `--image-2`, and `--prompt` |

These API workflows use the same `TextEncodeQwenImage21`, `CLIPLoader`, VAE,
sampler, and edit structure as the verified safetensors kit. Node `1` is
`UnetLoaderGGUF` with `unet_name: qwen-image-2.1-UC-Q4_K_M.gguf`; it has no
`weight_dtype` input. To use another compatible GGUF file, change node `1`'s
`unet_name` in the workflow JSON and re-import it. The edit workflows route the
model through `QwenImage21Cache` as before. Native 2K, RGBA, and the publisher's
"uncensored" behavior remain unverified with this GGUF file.

## Verification record (2026-09-23)

- Colab GPU: NVIDIA L4, 23034 MiB. ComfyUI commit:
  `b5cc8830279eae909a59de030af1e50761c36751` (v0.37.0-15); GGUF node
  commit: `edd981b10e107d3b8f58e16c498f2d08f631bc47`.
- `01_setup.py` completed, including the GGUF SHA-256 check. The shared
  launcher opened a cloudflared tunnel. Local `comfy-agent doctor` reported a
  working connection and no missing nodes or model files.
- All three API workflows imported into local presets. Local `comfy-agent run`
  produced one 1024×1024 PNG per workflow, and `comfy-agent verify` passed the
  image/count checks for each.
- Text to image: a red teapot and a card reading `QWEN 2.1 GGUF` appeared as
  prompted. One-image edit: the teapot changed to blue while the card text and
  composition remained. Two-image edit: the red teapot took the blue color
  from the second reference, again preserving the card text and composition.
