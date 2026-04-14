# Flux 2 (black-forest-labs) on Colab A100

Starter kit for running Flux 2 dev (bf16) via ComfyUI + comfy-agent.

Upstream references:
- https://github.com/black-forest-labs/flux2
- https://comfyanonymous.github.io/ComfyUI_examples/flux2/
- https://huggingface.co/Comfy-Org/flux2_ComfyUI_repackaged

## Flow

1. Colab runtime = A100 (recommended). The fp8 repack is much lighter than bf16 full precision — fits comfortably on A100 40GB and may even run on L4 24GB.
2. Run `01_setup.py` in a cell.
3. Run `../02_start_comfyui.py` in the next cell (generic launcher, shared).
4. Poll `/content/comfy_url.txt` for the cloudflared URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/flux2/flux2_dev.json --name flux2_dev
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run flux2_dev --6_text "your prompt here" --48_steps 20 --26_guidance 4.0
   ```

## Caveats to verify before first run

- **Filenames**: Comfy-Org periodically renames quantized weights. Open the
  HF repo (linked above) and update the three `wget` lines in `01_setup.py`
  if any file 404s.
- **CLIPLoader type**: the workflow uses `type: flux2`. If a future ComfyUI
  release renames it, check `/object_info/CLIPLoader` and adjust the preset.
- **Disk space**: A100 runtimes ship with ~200GB; bf16 full stack is ~70GB
  so it fits, but repeated sessions without Drive will re-download.
- **Sampler/steps/guidance**: defaults here (euler via `KSamplerSelect`,
  20 steps via `Flux2Scheduler`, guidance 4.0 via `FluxGuidance`) match
  the official ComfyUI Flux 2 example.
- **Reference-image conditioning**: the official workflow supports
  optional `ReferenceLatent` + `VAEEncode` branches for image prompts.
  Not included in the minimal JSON here; clone the example PNG workflow
  from https://comfyanonymous.github.io/ComfyUI_examples/flux2/ if needed.
