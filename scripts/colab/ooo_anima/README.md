# OOO_Anima v10 on Colab

Community fine-tune of Anima Base v1.0 by oron1208, trained on ~53k
images with kohya's sd-scripts. Fits on a T4 runtime (~5.6 GB total
weights: 4.2 GB UNet + 1.2 GB text encoder + 254 MB VAE).

Upstream references:
- https://huggingface.co/oron1208/OOO_Anima (this fine-tune)
- https://huggingface.co/circlestone-labs/Anima (Anima Base v1.0; text
  encoder + VAE are reused from here)

## License — non-commercial only

OOO_Anima inherits the **CircleStone Labs Non-Commercial License v1.0**
from Anima Base. Anima Base is itself a derivative of NVIDIA
Cosmos-Predict2-2B-Text2Image (governed by the NVIDIA Open Model License
Agreement). Personal and research use is fine; commercial use is not.
Review the LICENSE files in both upstream repos before redistributing
weights or outputs.

## Flow

1. Run `01_setup.py` in a Colab cell (clones ComfyUI, installs deps,
   downloads the OOO_Anima v10 UNet + the Anima Base text encoder/VAE +
   cloudflared).
2. Run `../02_start_comfyui.py` (shared launcher).
3. Poll `/content/comfy_url.txt` for the tunnel URL.
4. Locally:

   ```bash
   comfy-agent import ./scripts/colab/ooo_anima/ooo_anima.json --name ooo_anima
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run ooo_anima --11_text "masterpiece, best quality, an anime girl reading a book under a cherry blossom tree"
   ```

Parameter flags follow the `--<node_id>_<input>` convention of the
auto-generated preset (`--11_text` = positive prompt, `--12_text` =
negative, `--19_seed` = sampler seed, `--19_steps`, `--19_cfg`). Rename
keys in `.comfy-agent/presets/ooo_anima.yaml` for friendlier flags if
needed.

## Notes

- The bundled workflow follows the model card's recommended settings:
  `euler_ancestral` sampler, `simple` scheduler, 30 steps, CFG 4.5,
  1024×1024. Upstream suggests steps 30–50 and CFG 4–5; bump steps if
  you want more refinement.
- Prompt style: Danbooru-style tags mixed with natural language. Quality
  tags (`masterpiece, best quality, high quality, newest, year 2025`)
  and safety tags (`safe` / `sensitive` / `nsfw` / `explicit`) work.
  Artist tags use the `@artist` prefix format.
- `CLIPLoader` uses `type: stable_diffusion` even though the encoder is
  Qwen 3 — this matches the Anima reference wiring and is what
  OOO_Anima expects, since it inherits the encoder unchanged.
- If you've already run the `anima` kit in the same Colab session, the
  text encoder and VAE downloads are skipped (same filenames, `wget
  -nc`).
