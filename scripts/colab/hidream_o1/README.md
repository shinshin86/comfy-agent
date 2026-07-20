# HiDream-O1 text-to-image on Colab

This A100 kit runs the HiDream-O1 Image Dev fp8 checkpoint as a focused
text-to-image workflow. It follows the official 28-step LCM sampling settings
and defaults to a native 2048×2048 canvas.

Upstream references:

- https://huggingface.co/Comfy-Org/HiDream-O1-Image
- https://github.com/Comfy-Org/workflow_templates

## Flow

1. Run `01_setup.py`, then `../02_start_comfyui.py`, in Colab A100 cells.
2. Read the URL from `/content/comfy_url.txt`.
3. On the local machine:

   ```bash
   comfy-agent import ./scripts/colab/hidream_o1/hidream_o1_dev_t2i.json --name hidream_o1_dev_t2i
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run hidream_o1_dev_t2i \
     --3_text "A glass greenhouse drifting above a rainy city at night" \
     --timeout-seconds 1800
   ```

The output PNG is downloaded below
`.comfy-agent/outputs/hidream_o1_dev_t2i/`.

The official UI template also includes an optional Gemma-4 prompt-enhancement
subgraph. This CLI starter omits that separate 9 GB text encoder so the core
generation path stays reproducible and focused.
