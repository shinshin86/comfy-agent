# Stable Diffusion 3.5 Large (fp8 scaled) on Colab

Verified end-to-end on Colab L4 (24GB): SD3.5 Large fp8 scaled via ComfyUI +
comfy-agent over a cloudflared tunnel, producing a 1024×1280 image saved to the
local `.comfy-agent/outputs/`. L4 is enough; A100 gives headroom.

Upstream references:
- https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8
- https://comfyanonymous.github.io/ComfyUI_examples/sd3/

## Why the Comfy-Org repack

`Comfy-Org/stable-diffusion-3.5-fp8` is a **public** repository — no Hugging
Face access request and no token are required, unlike the gated
`stabilityai/stable-diffusion-3.5-large`. The license is unchanged: both fall
under the **Stability AI Community License** (free for non-commercial use and
for commercial use under $1M annual revenue with registration). Review the
upstream terms before redistribution or commercial use.

## Flow

1. Colab runtime: L4 (24GB) verified, A100 for headroom. The fp8
   checkpoint + fp8 t5xxl encoder make T4 (16GB) tight — start at L4.
2. Run `01_setup.py` in a cell (clones ComfyUI, installs deps, downloads
   `sd3.5_large_fp8_scaled.safetensors` ~14.9GB + the three SD3.5 text
   encoders ~6.8GB + cloudflared).
3. Run `../02_start_comfyui.py` in the next cell (shared launcher).
4. Poll `/content/comfy_url.txt` for the cloudflared URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/sd35/sd35_large.json --name sd35_large
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run sd35_large --3_text "your prompt here" --6_seed 123
   ```

Parameter flags follow the `--<node_id>_<input>` convention (`--3_text` =
positive prompt, `--4_text` = negative, `--6_seed` / `--6_steps` /
`--6_cfg` for the sampler). Rename keys in
`.comfy-agent/presets/sd35_large.yaml` for friendlier flags.

## Notes

- The fp8 scaled checkpoint (`CheckpointLoaderSimple`) provides the MMDiT
  model + VAE. The text encoders are loaded separately via
  `TripleCLIPLoader` (clip_l + clip_g + t5xxl_fp8_e4m3fn_scaled), matching
  the official Comfy-Org fp8 scaled workflow.
- Defaults follow that workflow: 1024×1024, 30 steps, cfg 5.45, sampler
  `euler` / scheduler `sgm_uniform`, `EmptySD3LatentImage` latent.
- This kit ships SD3.5 **Large**. The Turbo variant (4 steps, cfg ~1.2)
  and the Medium checkpoint are not included here.
