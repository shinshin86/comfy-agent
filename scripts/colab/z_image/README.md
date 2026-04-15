# Z-Image turbo on Colab

Verified end-to-end: ComfyUI on Colab (T4+ is enough; A100 gives headroom)
driven by local `comfy-agent` over a cloudflared tunnel.

Upstream references:
- https://huggingface.co/Comfy-Org/z_image_turbo
- https://comfyanonymous.github.io/ComfyUI_examples/

## Flow

1. Run `01_setup.py` in a Colab cell (clones ComfyUI, installs deps,
   downloads the 3 Z-Image weight files + cloudflared).
2. Run `../02_start_comfyui.py` (shared launcher).
3. Poll `/content/comfy_url.txt` for the tunnel URL.
4. Locally:

   ```bash
   comfy-agent import ./scripts/colab/z_image/z_image_turbo.json --name z_image_turbo
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run z_image_turbo --4_text "a fluffy orange cat on a sofa"
   ```

Parameter flags follow the `--<node_id>_<input>` convention of the
auto-generated preset (`--4_text` = positive prompt, `--7_seed` = sampler
seed). Rename keys in `.comfy-agent/presets/z_image_turbo.yaml` for
friendlier flags if needed.
