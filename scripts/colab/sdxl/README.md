# Stable Diffusion XL (base 1.0) on Colab

Verified end-to-end on Colab L4 (T4 16GB is also enough). SDXL base 1.0
via ComfyUI + comfy-agent over a cloudflared tunnel.

Upstream references:
- https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
- https://comfyanonymous.github.io/ComfyUI_examples/sdxl/

## Flow

1. Colab runtime = T4 (16GB) is enough; L4 / A100 give headroom.
2. Run `01_setup.py` in a cell (clones ComfyUI, installs deps, downloads
   `sd_xl_base_1.0.safetensors` ~6.9GB + cloudflared).
3. Run `../02_start_comfyui.py` in the next cell (shared launcher).
4. Poll `/content/comfy_url.txt` for the cloudflared URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/sdxl/sdxl_base.json --name sdxl_base
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run sdxl_base --2_text "your prompt here" --5_seed 123
   ```

Parameter flags follow the `--<node_id>_<input>` convention (`--2_text` =
positive prompt, `--3_text` = negative, `--5_seed` / `--5_steps` /
`--5_cfg` for sampler). Rename keys in
`.comfy-agent/presets/sdxl_base.yaml` for friendlier flags.

## Notes

- Defaults match the official ComfyUI SDXL example: 1024×1024, 20 steps,
  cfg 8.0, sampler `euler` / scheduler `normal`.
- This kit ships only the **base** model. The optional refiner pass
  (Stability's `sd_xl_refiner_1.0.safetensors`) is not included — the
  base alone produces strong results and avoids a second 6GB download.
- License: SDXL base 1.0 is released under OpenRAIL++ (commercial use
  permitted with the listed restrictions). Verify upstream before
  redistribution.
