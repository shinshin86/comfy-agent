# LTX-2.3 text-to-video with audio on Colab

This A100 kit turns one text prompt into a short MP4 with synchronized generated
audio. It uses the official fp8 checkpoint and distilled LoRA in a CLI-oriented
single-stage workflow.

Upstream references:

- https://docs.ltx.video/open-source-model/integration-tools/comfy-ui
- https://huggingface.co/Lightricks/LTX-2.3-fp8
- https://github.com/Comfy-Org/workflow_templates

## Flow

1. Run `01_setup.py`, then `../02_start_comfyui.py`, in Colab A100 cells.
2. Read the URL from `/content/comfy_url.txt`.
3. On the local machine:

   ```bash
   comfy-agent import ./scripts/colab/ltx23_t2v/ltx23_t2v_audio.json --name ltx23_t2v_audio
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run ltx23_t2v_audio \
     --4_text "A paper boat crosses a rain puddle as tiny bells and rainfall are heard" \
     --timeout-seconds 1800
   ```

The default is 640×384, 49 frames, and 24 fps. The MP4 is downloaded below
`.comfy-agent/outputs/ltx23_t2v_audio/`.

This is a smaller one-stage CLI workflow. The upstream two-stage template adds
a spatial latent upscaler for higher resolution at the cost of another model
download and sampling pass.
