# AnimeGen-T2V on Colab A100

Starter kit for running [aidealab/AnimeGen-T2V](https://huggingface.co/aidealab/AnimeGen-T2V)
text-to-video via ComfyUI + comfy-agent.

AnimeGen-T2V is an **anime-style fine-tune of Wan 2.2 T2V A14B**. It ships
the two expert unets only (`high_noise` / `low_noise`, full bf16, ~28.6 GB
each), so this kit reuses the standard Wan 2.2 text encoder (umt5-xxl) and
Wan 2.1 VAE from the Comfy-Org repack. Architecture is identical to the
[`../wan22/`](../wan22/) T2V 14B kit — only the diffusion weights change.

Upstream references:
- https://huggingface.co/aidealab/AnimeGen-T2V
- https://huggingface.co/lightx2v/Wan2.2-Lightning (4-step Lightning LoRA)
- https://comfyanonymous.github.io/ComfyUI_examples/wan22/

License: **Apache-2.0** (per the model card). Review upstream before use.

## Variants included

| File | Steps | Notes |
|---|---|---|
| `animegen_t2v.json` | 20 (cfg 3.5, shift 8.0) | Plain dual-expert, no LoRA. Highest fidelity, slowest. Safest first test. |
| `animegen_t2v_lightning.json` | 8 (cfg 1.0, shift 3.0) | + lightx2v 4-step Lightning LoRA on each expert (strength 2.0 / 1.0). Matches the model card's documented fast settings. |

Both default to 832×480, 81 frames @ 16 fps (≈5 s). The model card also
notes 1280×720 works with more VRAM/time.

## Flow

1. Colab runtime = **A100** (57 GB of weights; expert unets load one at a
   time). fp8-at-load is used to fit the standard A100 40 GB — see caveats.
2. Run `01_setup.py` in a cell. Toggle `DOWNLOAD_LIGHTNING_LORA` off if you
   only want the plain workflow.
3. Run `../02_start_comfyui.py` in the next cell.
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Locally:

   ```bash
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com

   # Plain 20-step (highest quality)
   comfy-agent import ./scripts/colab/animegen_t2v/animegen_t2v.json --name animegen_t2v
   comfy-agent run animegen_t2v --6_text "your anime prompt" --61_length 81 --timeout-seconds 1800

   # Lightning 8-step (fast)
   comfy-agent import ./scripts/colab/animegen_t2v/animegen_t2v_lightning.json --name animegen_t2v_lightning
   comfy-agent run animegen_t2v_lightning --6_text "your anime prompt" --61_length 81 --timeout-seconds 900
   ```

## Caveats

- **Starter, not verified E2E**: this kit has not yet been run through the
  full Colab → cloudflared → local `comfy-agent run` path. The AnimeGen
  weights are distributed for the diffusers `WanPipeline`, not as a
  ComfyUI repack — loading the raw bf16 safetensors via `UNETLoader` is
  expected to work (state-dict keys match Wan 2.2) but is **unconfirmed**.
  If `UNETLoader` fails to resolve the model, the weights may need a
  Comfy-Org-style repack first.
- **VRAM**: each expert is ~28.6 GB in bf16. The workflows set
  `weight_dtype: fp8_e4m3fn` so a single expert fits the standard A100
  40 GB. On A100 80 GB you can switch both `UNETLoader` nodes back to
  `"default"` for full bf16 quality.
- **Expert switching**: steps 0–10 run on `high_noise`, 10–20 on
  `low_noise` (plain); 0–4 / 4–8 (lightning). Adjust via
  `--57_steps`, `--57_end_at_step`, `--58_start_at_step`, `--58_steps`.
- **Lightning LoRA**: strengths (`--40_strength_model 2.0`,
  `--41_strength_model 1.0`) and shift 3.0 follow the AnimeGen model card.
  If motion looks unstable, try shift 5.0 or lower the high-noise strength.
- **Output format**: `SaveAnimatedWEBP` produces `.webp`. Switch to
  `SaveVideo` / `VHS_VideoCombine` (ComfyUI-VideoHelperSuite) for `.mp4`.
- **Generation time**: several minutes per clip on A100 for the plain
  workflow; the Lightning path is markedly faster. Bump
  `--timeout-seconds` accordingly.
