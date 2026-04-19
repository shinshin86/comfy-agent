# LTX-2.3 on Colab A100

Starter kit for running LTX-2.3 image→video generation via ComfyUI +
comfy-agent.

Upstream references:
- https://docs.ltx.video/open-source-model/integration-tools/comfy-ui
- https://huggingface.co/Lightricks/LTX-2.3
- https://huggingface.co/Comfy-Org/ltx-2
- https://github.com/Lightricks/ComfyUI-LTXVideo

## Variants included

| File | Use | Notes |
|---|---|---|
| `video_ltx2_3_i2v_flat.json` | LTX-2.3, image→video | Minimal i2v pipeline (checkpoint + distilled LoRA + Gemma 3 12B text encoder). Verified E2E via `comfy-agent run`. |
| `video_ltx2_3_i2v.json` | LTX-2.3, image→video | Upstream Comfy-Org template. Richer (two-stage + audio), intended to be loaded in the ComfyUI browser UI. |

## Flow

1. Colab runtime = A100 (high-RAM).
2. Run `01_setup.py` in a cell. Downloads are ~55 GB total, so give it
   time. Set `USE_GOOGLE_DRIVE = True` to keep weights across sessions.
3. Run `../02_start_comfyui.py` in the next cell.
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/ltx23/video_ltx2_3_i2v_flat.json --name ltx23_i2v
   ```

   Then open `.comfy-agent/presets/ltx23_i2v.yaml` and append:

   ```yaml
   uploads:
     image:
       kind: image
       cli_flag: --image
       target:
         node_id: "6"
         input: image
   ```

   (`comfy-agent import` does not yet auto-generate `uploads` entries
   from `LoadImage` nodes — one-time manual step per preset.)

6. Run:

   ```bash
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run ltx23_i2v \
       --image ./path/to/your.png \
       --4_text "prompt describing the motion you want" \
       --timeout-seconds 1800
   ```

   Other useful flags (see `comfy-agent preset-show ltx23_i2v`):
   `--5_text` (negative prompt), `--14_noise_seed`, `--7_width` /
   `--7_height` (target resolution, multiples of 32), `--9_length`
   (frame count, 8n+1), `--18_fps`, `--2_strength_model` (LoRA weight).

   Output lands under
   `.comfy-agent/outputs/ltx23_i2v/<timestamp>/ltx23_i2v_*.mp4`.

## Caveats

- **VRAM**: official requirement is 32 GB+. A100 40 GB is the minimum.
  The 46 GB dev checkpoint does not fit in VRAM and relies on
  ComfyUI-LTXVideo's low-VRAM streaming loaders. Expect several minutes
  per clip.
- **Disk**: ~55 GB of weights (46 GB checkpoint + 9 GB text encoder +
  ~1 GB upscaler + ~8 GB LoRA). Colab A100 runtimes ship with enough
  local disk, but if you hop sessions often, flip `USE_GOOGLE_DRIVE` so
  you only download once.
- **No fp8 / GGUF repack**: Lightricks has not published a lighter
  LTX-2.3 repack at this time. If A100 is out of reach, drop down to
  `ltxv-13b-0.9.8-distilled-fp8.safetensors` (LTX-Video 0.9.8, not
  covered by this kit).
- **Swapping to distilled**: set the checkpoint download URL to
  `ltx-2.3-22b-distilled-1.1.safetensors` if you want fewer sampling
  steps. Same file size; the LoRA is redundant when using distilled.
- **Workflow drift**: the upstream JSON is pinned to the state of
  `Comfy-Org/workflow_templates` / `Lightricks/ComfyUI-LTXVideo` at
  commit time. If node names diverge after an upstream release, either
  refresh the files from upstream or regenerate
  `video_ltx2_3_i2v_flat.json` against the live `/object_info` on your
  runtime.
