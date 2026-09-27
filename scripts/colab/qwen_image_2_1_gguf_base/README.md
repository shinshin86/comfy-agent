# Qwen-Image 2.1 base Q4_K_M GGUF on Colab

> **Status: Partial (Colab L4, 2026-09-27).** The text-to-image workflow completed
> setup, tunnel startup, local-Mac `doctor`/`import`/`run`, output retrieval, and
> visual inspection at 768×768 (20 steps, seed 7). The two image-edit workflows
> have not completed an end-to-end run.

This kit loads `qwen-image-2.1-Q4_K_M.gguf` from the [`base` branch](https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-GGUF/tree/base) of `abenzerps/Qwen-Image-2.1-Uncensored-GGUF`. The publisher's [`main` branch](../qwen_image_2_1_gguf_uc/) provides the separate `UC-Q4_K_M` kit. These are different files; the publisher has not documented the weight changes behind the `UC` label. Both derive from Qwen-Image 2.1. The base file is pinned to SHA-256 `833439e91bc1152d28f37aa198c7f6f4218b7de95754c2f7a318a2422ab4b2f8` from the publisher's [SHA256SUMS](https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-GGUF/raw/main/SHA256SUMS).

Use an **L4 (24 GB) or larger GPU**. This setup uses ComfyUI master/nightly and [`leejet/ComfyUI-GGUF`](https://github.com/leejet/ComfyUI-GGUF). It downloads approximately 4.60 GB for the GGUF diffusion model, 9.35 GB for the Qwen3-VL int8 text encoder, and 0.68 GB for the Qwen-Image 2.1 VAE. An existing ComfyUI workspace can reuse the text encoder and VAE from the UC kit.

The weights retain the [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE): research or evaluation use only unless the model owner grants a separate commercial license. Review [Google Colab's policies](https://research.google.com/colaboratory/faq.html) for your intended use.

## Colab flow

1. Start an L4 Colab notebook.
2. Paste and run [`01_setup.py`](./01_setup.py) in the first cell.
3. Paste and run [`../02_start_comfyui.py`](../02_start_comfyui.py) in the second cell.
4. Run the printed `comfy-agent connect` line on your local Mac.
5. Import and run a base GGUF workflow:

   ```bash
   comfy-agent import ./scripts/colab/qwen_image_2_1_gguf_base/qwen_image_2_1_gguf_base_t2i.json --name qwen21_gguf_base_t2i
   comfy-agent run qwen21_gguf_base_t2i --prompt "A ceramic teapot on a wooden table" --seed 7
   ```

The cloudflared URL changes when Colab restarts. Local presets and outputs persist under `.comfy-agent/`; reconnect without re-importing.

## Workflows

| File | Task | Inputs |
|---|---|---|
| `qwen_image_2_1_gguf_base_t2i.json` | Text to image | `--prompt`, optional size and seed |
| `qwen_image_2_1_gguf_base_edit.json` | Image edit | `--image` and `--prompt` |
| `qwen_image_2_1_gguf_base_edit_2ref.json` | Two-image edit | `--image`, `--image-2`, and `--prompt` |

The workflows use `UnetLoaderGGUF` with `unet_name: qwen-image-2.1-Q4_K_M.gguf`. The text encoder, VAE, sampler, and edit structure match the UC kit. Choose the base or UC kit by importing the corresponding workflow; each preset keeps its own model file selection.
