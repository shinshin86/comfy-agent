# Boogu-Image Turbo on Colab

Starter kit for running Boogu-Image Turbo text-to-image generation via
ComfyUI + comfy-agent.

Verified end-to-end on Colab L4 (24 GB VRAM) with ComfyUI 0.26.0:
1024x1024, 4 steps, batch 1 finished via `comfy-agent run` in about 27
seconds; the ComfyUI prompt execution itself took about 11 seconds.

Upstream references:
- https://github.com/boogu-project/ComfyUI-Boogu
- https://github.com/Comfy-Org/ComfyUI/pull/14523
- https://huggingface.co/Comfy-Org/Boogu-Image
- https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_boogu_image_0_1_turbo_t2i.json

Note: Boogu-Image is an image model. The linked `ComfyUI-Boogu` repository is
now a legacy custom node; the recommended path is native ComfyUI support with
the Comfy-Org repackaged weights.

## Variant included

| File | Use | Notes |
|---|---|---|
| `boogu_turbo_t2i.json` | Boogu-Image Turbo, text-to-image | CLI-oriented API prompt derived from the official ComfyUI template. |

## Flow

1. Colab runtime: L4 is sufficient for the included fp8 Turbo text-to-image
   workflow. A100 gives more headroom for higher resolutions or future edit
   workflows.
2. Run `01_setup.py` in a cell.
3. Run `../02_start_comfyui.py` in the next cell.
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/boogu/boogu_turbo_t2i.json --name boogu_turbo
   ```

6. Run:

   ```bash
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run boogu_turbo \
       --11_text "a cinematic editorial portrait, soft window light, fine film grain" \
       --32_seed 42 \
       --timeout-seconds 1800
   ```

Useful flags after import:

- `--11_text`: prompt.
- `--8_width` / `--8_height`: output resolution.
- `--32_seed`: seed.
- `--32_steps`: default `4`, matching the official Turbo template.

Output lands under `.comfy-agent/outputs/boogu_turbo/<timestamp>/`.

## Caveats

- Requires a recent ComfyUI build with native Boogu support. Do not install the
  legacy `ComfyUI-Boogu` custom node unless you specifically need its old
  pipeline-folder workflow.
- This kit covers text-to-image only. Boogu image editing is available upstream
  via the native `TextEncodeBooguEdit` workflow, but it needs the separate
  `boogu_image_edit_fp8_scaled.safetensors` diffusion model and is not included
  here yet.
- The official Boogu model card lists a `flux1_vae_bf16.safetensors` VAE, while
  the current ComfyUI workflow template uses `ae.safetensors`. This kit follows
  the workflow template.
