# Wan 2.2 S2V on Colab

This A100 kit animates one reference image from an input audio track with Wan
2.2 S2V 14B. The default 4-step Lightning LoRA keeps the first test practical.

Upstream references:

- https://docs.comfy.org/tutorials/video/wan/wan2-2-s2v
- https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged
- https://github.com/Comfy-Org/workflow_templates

## Flow

1. Run `01_setup.py`, then `../02_start_comfyui.py`, in Colab A100 cells.
2. Read the URL from `/content/comfy_url.txt`.
3. On the local machine:

   ```bash
   comfy-agent import ./scripts/colab/wan22_s2v/wan22_s2v.json --name wan22_s2v
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run wan22_s2v \
     --image ./portrait.png \
     --audio ./speech.mp3 \
     --5_text "The presenter speaks naturally to camera" \
     --timeout-seconds 1800
   ```

`comfy-agent import` creates both required upload flags automatically. The
default is 512×512, 77 frames, and 16 fps. Use an audio clip at least 4.8
seconds long so it covers the complete clip.

Each additional official S2V extension segment adds 77 frames. This CLI starter
keeps one segment to reduce Colab runtime and VRAM pressure.
