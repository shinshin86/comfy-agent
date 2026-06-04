# Ideogram 4.0 on Colab

> **Status: Verified E2E (Colab A100, fp8).** The full path — `01_setup.py`
> → `02_start_comfyui.py` → cloudflared → local-Mac `comfy-agent doctor` /
> `import` / `run` → image saved under `.comfy-agent/outputs/` — was
> exercised end-to-end on an A100-SXM4-40GB runtime. The bundled t2i
> workflow runs in ~29.5 GB of weights with asymmetric CFG and renders
> in-image text correctly at 1024×1024, 20 steps.

Ideogram 4.0 is Ideogram's first open-weight text-to-image model (9.3B,
native 2K resolution, structured-JSON prompting with bounding-box layout
and hex color-palette control, strong in-image text rendering). ComfyUI
added day-0 native support in **0.24.0** — no custom nodes required.

Upstream references:
- https://blog.comfy.org/p/ideogram-4-day-0-support-in-comfyui
- https://huggingface.co/Comfy-Org/Ideogram-4 (diffusion models)
- https://huggingface.co/Comfy-Org/Qwen3-VL (text encoder)
- https://huggingface.co/Comfy-Org/flux2-dev (VAE)
- https://github.com/ideogram-oss/ideogram4 (model card / prompting)
- Template: `Comfy-Org/workflow_templates` → `image_ideogram4_t2i.json`

## License & acceptable use

Weights are governed by the **ideogram-non-commercial-model-agreement**
(NON-COMMERCIAL). Review before use. The model also carries its own
safety training: an `Image blocked by safety filter` result comes from
the weights themselves, not from ComfyUI. Respect Colab's Acceptable Use
Policy.

## GPU / VRAM

**A100 (40 GB) recommended.** The text-to-image workflow uses
*asymmetric CFG*: it loads **two** diffusion models — a conditional and
an unconditional pass — at 9.28 GB each in fp8, plus the 10.6 GB Qwen3-VL
text encoder.

| Component | Folder | Size |
|---|---|---|
| `ideogram4_fp8_scaled.safetensors` | `diffusion_models/` | 9.28 GB |
| `ideogram4_unconditional_fp8_scaled.safetensors` | `diffusion_models/` | 9.28 GB |
| `qwen3vl_8b_fp8_scaled.safetensors` | `text_encoders/` | 10.59 GB |
| `flux2-vae.safetensors` | `vae/` | 0.34 GB |
| **Total download** | | **~29.5 GB** |

~18.6 GB of diffusion weight stays resident during sampling, so a **T4
(15 GB) cannot run this**; **L4 (24 GB)** may work only with aggressive
offload. The `nvfp4_mixed` half-size variants exist upstream but need a
Blackwell GPU (RTX 50-series / B200) for NVFP4 — not available on Colab —
so this kit uses the fp8 variants.

## Flow

1. Open a Colab notebook on an **A100** runtime.
2. Run `01_setup.py` in a cell (clones ComfyUI ≥0.24.0, installs deps,
   downloads the 4 weight files + cloudflared).
3. Run `../02_start_comfyui.py` (shared launcher).
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/ideogram4/ideogram4_t2i.json --name ideogram4
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run ideogram4 --24_text '{"high_level_description": "a neon ramen shop sign at night reading \"OPEN\"", "style_description": {"aesthetics": "cinematic photo"}}'
   ```

Parameter flags follow the `--<node_id>_<input>` convention of the
auto-generated preset. Rename keys in
`.comfy-agent/presets/ideogram4.yaml` for friendlier flags if needed.

| Flag | Node | Meaning |
|---|---|---|
| `--24_text` | CLIPTextEncode | The prompt (plain text or structured JSON — see below) |
| `--18_noise_seed` | RandomNoise | Seed |
| `--17_steps` | Ideogram4Scheduler | Sampling steps (Default 20 / Quality 48 / Turbo 12) |
| `--17_width` / `--17_height` | Ideogram4Scheduler | Resolution used for sigma scheduling |
| `--11_width` / `--11_height` | EmptyFlux2Latent | Latent resolution |
| `--155_cfg` | DualModelGuider | Base CFG (default 7.0) |

> **Keep resolution in sync.** Width/height appear on **two** nodes —
> the scheduler (`17`) and the latent (`11`). Set both to the same value
> (multiples of 16, ~256–2048 per side). They default to 1024×1024.

## Prompting

The model is trained on **structured JSON captions** (scene summary,
style block, background, and optional per-object descriptions with
`bbox` `[y_min, x_min, y_max, x_max]` on a 0–1000 grid and hex
`color_palette`). Plain natural language works, but JSON gives the most
predictable layout, color, and text-rendering control. The bundled
`ideogram4_t2i.json` ships a compact JSON prompt in node `24` as a
starting template; edit it or override with `--24_text`.

Guidance is flow-matching with asymmetric CFG (the unconditional pass
drops text tokens) — there is **no separate negative-prompt string**.

## Notes

- `CLIPLoader` uses `type: ideogram4` (added in ComfyUI 0.24.0). If the
  node errors on an unknown type, the runtime ComfyUI is too old — re-run
  `01_setup.py` with `UPDATE_COMFYUI = True`.
- The optional **Gemma 4 JSON Prompt Builder** from the upstream template
  (turns a short idea into schema-compliant JSON) is **not** included in
  this kit's compute path. Set `DOWNLOAD_GEMMA4_PROMPT_BUILDER = True` in
  `01_setup.py` only if you wire that helper up yourself (~9 GB extra).
- The bundled workflow is a hand-flattened API-format export of the
  official subgraph template. The preset/resolution plumbing (named
  Default/Quality/Turbo presets, multiple-of-16 rounding) was inlined as
  fixed values, so no `ComfyMath`/JSON-helper custom nodes are needed.
