# anima_pencil v2.0.0 on Colab

Anime-style merge built on Anima by bluepen5805
([CivitAI model 2697089](https://civitai.com/models/2697089/animapencil)).
Architecture is inherited from Anima Base v1.0, so the same Qwen 3 0.6B
text encoder and Qwen-Image VAE are reused at inference. Fits on a T4
runtime (~5.6 GB total weights: 4.2 GB UNet + 1.2 GB text encoder + 254
MB VAE).

Upstream references:
- https://civitai.com/models/2697089/animapencil (model card / settings)
- https://huggingface.co/bluepen5805/anima-models (diffusion model mirror
  used by this kit — no CivitAI token required)
- https://huggingface.co/circlestone-labs/Anima (Anima Base v1.0; text
  encoder + VAE are reused from here)

## License — non-commercial only

anima_pencil inherits the **CircleStone Labs Non-Commercial License v1.0**
from Anima Base. Anima Base is itself a derivative of NVIDIA
Cosmos-Predict2-2B-Text2Image (governed by the NVIDIA Open Model License
Agreement). Personal and research use is fine; commercial use is not.
Review the LICENSE files in the upstream repos and the CivitAI model card
before redistributing weights or outputs.

## Status — Verified E2E

Verified end-to-end on 2026-06-14 from a local Mac driving a Colab L4
runtime over the cloudflared tunnel: `01_setup.py` →
`../02_start_comfyui.py` → `comfy-agent doctor` (`connection: OK`) →
`comfy-agent import` → `comfy-agent run anima_pencil` produced a
1024×1024 image under the local `.comfy-agent/outputs/anima_pencil/`.
Weights are identical in size/architecture to the T4-verified `ooo_anima`
kit, so a T4 runtime is expected to work as well.

## Flow

1. Run `01_setup.py` in a Colab cell (clones ComfyUI, installs deps,
   downloads the anima_pencil v2.0.0 UNet + the Anima Base text
   encoder/VAE + cloudflared).
2. Run `../02_start_comfyui.py` (shared launcher).
3. Poll `/content/comfy_url.txt` for the tunnel URL.
4. Locally:

   ```bash
   comfy-agent import ./scripts/colab/anima_pencil/anima_pencil.json --name anima_pencil
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run anima_pencil --11_text "masterpiece, best quality, an anime girl reading a book under a cherry blossom tree"
   ```

Parameter flags follow the `--<node_id>_<input>` convention of the
auto-generated preset (`--11_text` = positive prompt, `--12_text` =
negative, `--19_seed` = sampler seed, `--19_steps`, `--19_cfg`). Rename
keys in `.comfy-agent/presets/anima_pencil.yaml` for friendlier flags if
needed.

## Notes

- The bundled workflow follows the model card's recommended settings:
  `er_sde` sampler, `simple` scheduler, 30 steps, CFG 4.0, 1024×1024.
- Prompt style: Danbooru-style tags mixed with natural language. Quality
  tags (`masterpiece, best quality, high quality, newest, year 2025`)
  and safety tags (`safe` / `sensitive` / `nsfw` / `explicit`) work, as
  with the rest of the Anima family.
- `CLIPLoader` uses `type: stable_diffusion` even though the encoder is
  Qwen 3 — this matches the Anima reference wiring and is what
  anima_pencil expects, since it inherits the encoder unchanged.
- If you've already run the `anima` or `ooo_anima` kit in the same Colab
  session, the text encoder and VAE downloads are skipped (same
  filenames, `wget -nc`).
- To use an older release, change `unet_name` in `anima_pencil.json` to
  another file in the mirror (e.g., `anima_pencil-v1.0.0.safetensors`)
  and download that file in `01_setup.py`.
