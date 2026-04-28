# Flux 1 [dev] fp8 (no HF token) on Colab

Verified end-to-end on Colab L4 24GB. Flux 1 dev via ComfyUI +
comfy-agent over a cloudflared tunnel, using the Comfy-Org all-in-one
fp8 repack so **no Hugging Face access token is required**.

Upstream references:
- https://huggingface.co/Comfy-Org/flux1-dev
- https://comfyanonymous.github.io/ComfyUI_examples/flux/

## Flow

1. Colab runtime = L4 24GB or A100 (recommended). The fp8 checkpoint is
   ~17GB and runs comfortably on A100; L4 works with some swap pressure.
2. Run `01_setup.py` in a cell (clones ComfyUI, installs deps, downloads
   `flux1-dev-fp8.safetensors` ~17GB + cloudflared).
3. Run `../02_start_comfyui.py` in the next cell (shared launcher).
4. Poll `/content/comfy_url.txt` for the cloudflared URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/flux1/flux1_dev.json --name flux1_dev
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run flux1_dev --2_text "your prompt here" --3_guidance 3.5 --6_seed 123
   ```

Parameter flags follow the `--<node_id>_<input>` convention (`--2_text` =
positive prompt, `--3_guidance` = Flux distilled guidance, `--6_seed` /
`--6_steps` for sampler). Rename keys in
`.comfy-agent/presets/flux1_dev.yaml` for friendlier flags.

## Notes

- Defaults match the official ComfyUI Flux example: 1024×1024, 20 steps,
  `euler` / `simple`, cfg 1.0, **FluxGuidance 3.5**. Flux dev uses
  distilled guidance (`FluxGuidance`) instead of classical CFG; keep
  `--6_cfg` at 1.0 unless you know what you're doing.
- The empty negative `CLIPTextEncode` (node 4) is a no-op at cfg 1.0 but
  is required to satisfy `KSampler`'s input.
- License: Flux 1 [dev] is released under the **FLUX.1 [dev]
  Non-Commercial License** by Black Forest Labs. Non-commercial use
  only — verify the upstream license before commercial deployment.
- Disk space: A100 runtimes ship with ~200GB; the fp8 checkpoint (~17GB)
  fits easily, but repeated sessions without Drive will re-download.
