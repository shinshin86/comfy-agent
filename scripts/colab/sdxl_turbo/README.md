# SDXL Turbo on Colab

Verified end-to-end on Colab L4 (T4 16GB is also enough). SDXL Turbo
(1-step distilled SDXL) via ComfyUI + comfy-agent over a cloudflared
tunnel.

Upstream references:
- https://huggingface.co/stabilityai/sdxl-turbo
- https://comfyanonymous.github.io/ComfyUI_examples/sdturbo/

## Flow

1. Colab runtime = T4 is enough (turbo runs at 512×512 in 1 step). L4 /
   A100 just give headroom and faster batching.
2. Run `01_setup.py` in a cell (clones ComfyUI, installs deps, downloads
   `sd_xl_turbo_1.0_fp16.safetensors` ~6.9GB + cloudflared).
3. Run `../02_start_comfyui.py` in the next cell (shared launcher).
4. Poll `/content/comfy_url.txt` for the cloudflared URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/sdxl_turbo/sdxl_turbo.json --name sdxl_turbo
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run sdxl_turbo --2_text "your prompt here" --7_noise_seed 123
   ```

Parameter flags follow the `--<node_id>_<input>` convention (`--2_text` =
positive prompt, `--6_steps` = step count, `--7_noise_seed` = seed,
`--7_cfg` = cfg). Rename keys in `.comfy-agent/presets/sdxl_turbo.yaml`
for friendlier flags.

## Notes

- Defaults match the official ComfyUI SDXL Turbo example: 512×512, 1 step,
  cfg 1.0, `SDTurboScheduler` + `SamplerCustom` with `euler_ancestral`.
  You can push `--6_steps` up to 4 for quality without much speed loss.
- **Negative prompts are essentially a no-op** at cfg 1.0; the empty
  negative encode is wired up only because `SamplerCustom` requires the
  input.
- License: SDXL Turbo is released under the **Stability AI
  Non-Commercial Research Community License**. Research / personal use
  only — verify the upstream license before commercial deployment.
