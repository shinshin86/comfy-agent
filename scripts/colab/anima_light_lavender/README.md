# Anima-Light-Lavender on Colab

> **Status: Starter.** The workflow imports cleanly into `comfy-agent` and
> the wiring matches the upstream reference, but no Colab end-to-end run
> has been recorded yet. It becomes *Verified E2E* only after
> `01_setup.py` → `02_start_comfyui.py` → `comfy-agent doctor` / `import`
> / `run` → local output file has been observed in one run-through.

Post-train of Anima Base v1.0 by Johnny-Z, focused on understanding
**natural-language descriptions at the 512-token scale**. The architecture
is unchanged from the base (~2B, 28-layer DiT, itself a derivative of
NVIDIA Cosmos-Predict2-2B-Text2Image), so the Qwen 3 0.6B text encoder and
Qwen-Image VAE are reused unchanged. Fits a T4 runtime (~5.6 GB total
weights: 4.18 GB UNet + 1.2 GB text encoder + 254 MB VAE).

Upstream references:
- https://huggingface.co/Johnny-Z/Anima-Light-Lavender (this post-train)
- https://huggingface.co/circlestone-labs/Anima (Anima Base v1.0; text
  encoder + VAE are reused from here)

## License — non-commercial only

Anima-Light-Lavender inherits the **CircleStone Labs Non-Commercial
License v1.0** from Anima Base. As a Cosmos-Predict2 derivative it is also
subject to the **NVIDIA Open Model License Agreement**. Personal and
research use is fine; commercial use is not. Review the LICENSE files in
both upstream repos before redistributing weights or outputs.

## Flow

1. Run `01_setup.py` in a Colab cell on a **T4** (or better) runtime.
2. Run `../02_start_comfyui.py` (shared launcher).
3. Poll `/content/comfy_url.txt` for the tunnel URL.
4. Locally:

   ```bash
   comfy-agent import ./scripts/colab/anima_light_lavender/anima_light_lavender.json --name anima_light_lavender
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run anima_light_lavender --prompt "$(cat caption.json)" --seed 7
   ```

Generated aliases: `--prompt` (node `11`), `--negative` (node `12`),
`--steps` / `--cfg` / `--denoise` (node `19`), `--width` / `--height`
(node `28`), plus `--seed`. Detailed inputs keep the
`--<node_id>_<input>` form.

## Prompting — structured caption

The model is trained on a **structured caption**: a JSON-shaped text block
with a fixed field order, fed to the text encoder as plain text. The
bundled workflow ships one in node `11`:

```json
{
  "year": 2025,
  "preference_level": "best",
  "image_description": "An anime girl with long silver hair sits by a tall window ...",
  "extra_tags": ["1girl", "solo", "indoors", "rain"]
}
```

| Field | Purpose |
|---|---|
| `year` | Year anchor (integer, default 2025) |
| `preference_level` | `normal` / `high` / `very_high` / `best` (default `best`) |
| `artist` | Artist / style tags (array) |
| `copyright` | Series / franchise tags (array) |
| `character` | Character tags (array) |
| `image_description` | **The image content, as plain natural language** — as detailed as you can make it |
| `extra_tags` | Supplementary content tags (array) |

Rules that match the upstream `Danbooru Caption JSON` node: keep the field
order above, **drop fields you are not using** rather than sending empty
values, and escape parentheses that are not prompt weights as `\(` `\)`.

`--prompt` replaces the whole block, so pass the complete caption (a
heredoc or `"$(cat caption.json)"` is the easiest way). Writing only the
`image_description` value as a bare sentence also works, just with less
control.

**Leave the negative prompt empty.** The model card states results stay
clean without quality words or a negative prompt; that is why node `12`
ships empty.

## Settings

The bundled workflow follows the model card's recommendations: `euler`
sampler, `simple` scheduler, **25 steps**, **CFG 4.0**, **1152×1536**
(the card suggests staying around 1280×1280 worth of pixels), and
`CFGZeroStar` on the model path — all as in the upstream reference
workflow.

## Variants

| Flag in `01_setup.py` | File | Size |
|---|---|---|
| `USE_ANIMA_LIGHT_LAVENDER_BF16` (default) | `anima-light-lavender.safetensors` | 4.18 GB |
| `USE_ANIMA_LIGHT_LAVENDER_MXFP8` | `anima-light-lavender_mxfp8.safetensors` | 2.84 GB |

**MXFP8 buys nothing on Colab.** ComfyUI's `supports_mxfp8_compute()`
requires an NVIDIA GPU of compute capability 10.0+ (Blackwell) and
torch ≥ 2.10; Colab's T4 (7.5), L4 (8.9) and A100 (8.0) all fall short.
Enable it only on Blackwell hardware, and update `unet_name` in node `44`
to match the downloaded filename.

## Notes

- `CLIPLoader` uses `type: stable_diffusion` even though the encoder is
  Qwen 3 — this matches the Anima reference wiring, inherited unchanged.
- If you have already run the `anima`, `ooo_anima` or `anima_pencil` kit
  in the same Colab session, the text encoder and VAE downloads are
  skipped (same filenames, `wget -nc`).
- The bundled workflow deliberately uses **core nodes only**. Upstream
  ships two templates built on the `comfyui-zako-pe` custom nodes: the
  `Danbooru Caption JSON` node just assembles the JSON text shown above,
  which this kit inlines instead. The `anima-pe.json` variant additionally
  calls an OpenAI-compatible LLM server on `127.0.0.1:1234` (LM Studio +
  the `zako-pe` model) to expand tags into natural language — install
  `comfyui-zako-pe` yourself if you want that path; it is not reachable
  through the Colab tunnel setup.
- Weak at photorealism and at rendering long text, per the model card.
