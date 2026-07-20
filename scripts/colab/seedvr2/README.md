# SeedVR2 image upscaling on Colab

This kit uses ComfyUI's native SeedVR2 nodes and the 3B Int8 model for one-step
image upscaling and restoration. The default workflow doubles both dimensions
with Lanczos before SeedVR2 restores detail.

Upstream references:

- https://huggingface.co/Comfy-Org/SeedVR2
- https://github.com/Comfy-Org/workflow_templates

## Flow

1. Run `01_setup.py`, then `../02_start_comfyui.py`, in a Colab cell.
2. Read the URL from `/content/comfy_url.txt`.
3. On the local machine:

   ```bash
   comfy-agent import ./scripts/colab/seedvr2/seedvr2_3b_upscale.json --name seedvr2_3b_upscale
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run seedvr2_3b_upscale \
     --image ./input.png \
     --2_scale_by 2 \
     --timeout-seconds 1800
   ```

`comfy-agent import` creates the required `--image` upload automatically. The
output PNG is downloaded below
`.comfy-agent/outputs/seedvr2_3b_upscale/`.

Start with a moderate input size. A 2x upscale quadruples the pixel count and
therefore increases VAE memory and processing time substantially.
