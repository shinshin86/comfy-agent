# BiRefNet background removal on Colab

This kit removes an image background with ComfyUI's native BiRefNet nodes and
saves a transparent PNG.

Upstream references:

- https://github.com/ZhengPeng7/BiRefNet
- https://huggingface.co/Comfy-Org/BiRefNet
- https://github.com/Comfy-Org/workflow_templates

## Flow

1. Run `01_setup.py` in a Colab code cell.
2. Run `../02_start_comfyui.py` in another cell.
3. Read the generated trycloudflare URL from `/content/comfy_url.txt`.
4. On the local machine:

   ```bash
   comfy-agent import ./scripts/colab/birefnet/birefnet_remove_background.json --name birefnet_remove_background
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run birefnet_remove_background --image ./input.png
   ```

`comfy-agent import` detects the `LoadImage` node and creates the required
`--image` upload automatically. Output is written below
`.comfy-agent/outputs/birefnet_remove_background/`.

## Notes

- The output PNG keeps the original RGB pixels and adds the inferred alpha
  mask. Transparent areas depend on the model's foreground segmentation.
- CPU execution is possible but slow; a T4 or better GPU is recommended.
- The model is distributed under the MIT license. Review upstream terms before
  redistribution.
