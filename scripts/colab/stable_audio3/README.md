# Stable Audio 3 Medium on Colab

This kit generates stereo music or sound effects from a text description with
ComfyUI's native Stable Audio 3 support.

Upstream references:

- https://github.com/Stability-AI/stable-audio-3
- https://huggingface.co/Comfy-Org/stable-audio-3
- https://github.com/Comfy-Org/workflow_templates

## Flow

1. Run `01_setup.py` in a Colab code cell.
2. Run `../02_start_comfyui.py` in another cell.
3. Read the trycloudflare URL from `/content/comfy_url.txt`.
4. On the local machine:

   ```bash
   comfy-agent import ./scripts/colab/stable_audio3/stable_audio3_medium_t2a.json --name stable_audio3_medium_t2a
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run stable_audio3_medium_t2a \
     --3_text "Cinematic percussion and brass, energetic, BPM: 120. Length: 10 seconds" \
     --5_seconds 10 \
     --timeout-seconds 900
   ```

The MP3 is downloaded below
`.comfy-agent/outputs/stable_audio3_medium_t2a/`.

## Parameters and limits

- `--3_text`: positive audio description. Include genre, instruments, mood,
  BPM, and target length for predictable results.
- `--5_seconds`: latent duration. Keep it consistent with the length stated in
  the prompt.
- `--6_seed`, `--6_steps`, and `--6_cfg`: reproducibility and sampling controls.
- Short clips are recommended for the first Colab run. Longer audio increases
  memory use and generation time.

- Stable Audio 3 weights use the Stability AI Community License. Review the
  current commercial-use and redistribution terms at https://stability.ai/license.
- The bundled T5Gemma text encoder is governed by the Gemma Terms of Use:
  https://ai.google.dev/gemma/terms.
- Generated audio can still require rights review depending on the prompt and
  intended use.
