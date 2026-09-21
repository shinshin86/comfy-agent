# Qwen-Image 2.1 on Colab

> **Status: Verified E2E (Colab L4, int8 convrot).** The full path —
> `01_setup.py` → `02_start_comfyui.py` → cloudflared → local-Mac
> `comfy-agent doctor` / `import` / `run` → image saved under
> `.comfy-agent/outputs/` — was exercised end-to-end on 2026-09-21 on an
> **NVIDIA L4 (23 GB, compute capability 8.9)** runtime reporting ComfyUI
> **0.37.0** from master. All three bundled workflows plus the RGBA path
> were run from the local Mac in that session.

## Verification record (2026-09-21, L4)

| Leg | Result |
|---|---|
| `01_setup.py` | Completed. The nightly guard found `TextEncodeQwenImage21` / `QwenImage21Cache`; 17.3 GB downloaded in ~6 min (DiT 6.8 GB in 43 s, text encoder 8.7 GB in 4 m 39 s, VAE 644 MB in 7 s). |
| `02_start_comfyui.py` | Wrote a working `trycloudflare.com` URL to `/content/comfy_url.txt`. |
| `comfy-agent doctor` | `connection: OK` from the local Mac. |
| `comfy-agent import` | Generated presets for all three workflows. |
| `qwen_image_2_1_t2i` | 1024x1024, 25 steps. In-image text ("COMFY AGENT") rendered correctly. |
| RGBA path | The prompt-wrapped run produced a real alpha channel: PNG colour type 6, 76.6% of pixels effectively transparent (alpha <= 4), 22.4% opaque, 1.0% edge antialiasing. |
| `qwen_image_2_1_edit` | Background replaced as instructed; subject, steam and in-image text preserved. The API-format `images.image_1` key works. |
| `qwen_image_2_1_edit_2ref` | Second reference composited into the scene with a contact shadow; `images.image_2` works. |

Notes from that run: int8 convrot loaded and sampled fine on L4 (Ada,
`torch._int_mm`), and `/system_stats` reported 10.6 GB of free VRAM with
the stack loaded, so the L4 minimum has real headroom. Prompts asking for
a flat vector or poster style tended to come back photographic — steer
style explicitly when that matters.

Qwen-Image 2.1 is Alibaba's unified **text-to-image + instruction-editing**
model: one 7B visual-generation core (32 single-stream DiT layers, mixed
granularity attention, prefix KV-cache reuse) handles generation and editing
without swapping checkpoints. Highlights: native 2K output (up to
2048×2048 directly), dense small-text and layout rendering, up to 10
reference images per edit, and a four-channel VAE that produces
**transparent (RGBA) images** natively.

Upstream references:
- https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1
- https://blog.comfy.org/p/qwen-image-21-in-comfyui-open-weight
- https://huggingface.co/Comfy-Org/Qwen-Image-2.1 (ComfyUI repack)
- https://huggingface.co/Qwen/Qwen-Image-2.1 (original model + LICENSE)
- Templates: `Comfy-Org/workflow_templates` →
  `image_qwen_image_2_1_t2i.json`, `image_qwen_image_2_1_image_edit.json`

## ComfyUI nightly required

Support landed on ComfyUI **master on 2026-09-19** (commit `6bfaacc6`,
"feat: Qwen-image 2.1 support") — adding `comfy/ldm/qwen_image21/model.py`,
`comfy/text_encoders/qwen_image21.py`, and the `TextEncodeQwenImage21` /
`QwenImage21Cache` core nodes. The newest tagged release at the time of
writing is **v0.36.0 (2026-09-15)**, which does **not** include it.

So this kit tracks **master**, not a stable tag:

- `01_setup.py` clones/pulls master and then checks that
  `comfy_extras/nodes_qwen.py` really contains `TextEncodeQwenImage21`,
  aborting before the ~17 GB download if the checkout is too old.
- ComfyUI **Desktop / Cloud** builds follow stable tags and cannot run
  these workflows yet.
- `COMFYUI_COMMIT` in `01_setup.py` pins the checkout to a fixed revision
  if a master regression breaks the kit. Leave it empty to follow master.
  The 2026-09-21 verification ran master as of that morning, which reported
  version **0.37.0**; the exact commit SHA was not captured during that run,
  so the pin is left empty rather than recording a revision we did not check.

No custom nodes are needed — every node in the bundled workflows ships
with ComfyUI core.

## License & acceptable use

Weights are governed by the **Qwen Research License** (`license: other`,
`qwen-research`;
https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE). Key points:

- "Non-Commercial" is defined upstream as **research or evaluation
  purposes only** — narrower than the usual "non-commercial" wording.
- Commercial use requires a separate license from the model owner.
- If you use the model or its outputs to train, fine-tune or improve a
  model you distribute, the license requires displaying **"Built with
  Qwen"** in the product documentation, and forbids using "Qwen" as the
  primary name of the derivative.

Note this is **not** the same license as the `qwen_image` kit
(Qwen-Image 2512, Apache-2.0) or `qwen_image_edit`. Same family, different
terms. Respect Colab's Acceptable Use Policy as well.

## GPU / VRAM

**L4 (24 GB) minimum, A100 (40 GB) recommended.** Defaults are the int8
convrot variants, which is what the bundled workflows reference.

| Component | Folder | Size |
|---|---|---|
| `qwen_image_2.1_int8_convrot.safetensors` (default) | `diffusion_models/` | 7.26 GB |
| `qwen3vl_8b_int8_convrot.safetensors` (default) | `text_encoders/` | 9.35 GB |
| `qwen_image_2.1_vae_bf16.safetensors` | `vae/` | 0.68 GB |
| **Total download (default path)** | | **~17.3 GB** |
| `qwen_image_2.1_bf16.safetensors` (optional) | `diffusion_models/` | 14.23 GB |
| `qwen3vl_8b_bf16.safetensors` (optional) | `text_encoders/` | 17.53 GB |
| `qwen3vl_8b_w4a8.safetensors` (optional, lowest VRAM) | `text_encoders/` | 6.31 GB |

Variant switches live at the top of `01_setup.py`
(`USE_QWEN_IMAGE_2_1_INT8` / `USE_QWEN_IMAGE_2_1_BF16`,
`TEXT_ENCODER_VARIANT`). If you change either, update `unet_name` (node
`1`) and `clip_name` (node `2`) in the workflow JSON to match.

T4 (15 GB) is **untested** and not recommended: the text encoder alone is
9.35 GB in int8. Upstream also ships `qwen3.5_9b_..._pe_t2i` /
`pe_i2i` encoders that the official ComfyUI templates do not reference;
this kit does not download them.

## Flow

1. Open a Colab notebook on an **L4** or **A100** runtime.
2. Run `01_setup.py` in a cell (clones ComfyUI master, installs deps,
   downloads the 3 default weight files + cloudflared).
3. Run `../02_start_comfyui.py` (shared launcher).
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/qwen_image_2_1/qwen_image_2_1_t2i.json --name qwen21_t2i
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent doctor
   comfy-agent run qwen21_t2i \
     --prompt "a neon ramen shop sign at night reading \"OPEN\", cinematic photo" \
     --seed 7
   ```

## Workflows

| File | Preset task | What it does |
|---|---|---|
| `qwen_image_2_1_t2i.json` | text-to-image | Prompt → image (also the RGBA path, see below) |
| `qwen_image_2_1_edit.json` | image edit | One source image + edit instruction |
| `qwen_image_2_1_edit_2ref.json` | image edit | Source image + one reference image (`<image1>` / `<image2>`) |

Generated aliases (`comfy-agent import`):

| Flag | Node | Meaning |
|---|---|---|
| `--prompt` | `TextEncodeQwenImage21` | Prompt / edit instruction |
| `--steps` `--cfg` `--denoise` | `KSampler` | Sampling controls |
| `--seed` | `KSampler` | Seed (role-based, applies to every seed target) |
| `--width` `--height` | `EmptyLatentImage` | t2i output size (multiples of 32) |
| `--image` / `--image-2` | `LoadImage` | Source / reference image upload (edit workflows) |

There is **no `--negative` alias**: positive and negative conditioning
come out of the same `TextEncodeQwenImage21` node, so the importer
collapses them. Use `--<node_id>_negative_prompt` (`--4_negative_prompt`
for t2i, `--5_negative_prompt` for the edit workflows) when you actually
need one — and remember it is ignored while `cfg` is 1.

## Settings

Defaults follow the official templates: `euler` / `simple`, **25 steps**,
**cfg 1.0**, 1024×1024. Notes:

- **cfg must stay at 1.0** for the official path. Raise it only together
  with a negative prompt.
- The official pipeline uses **40–50 steps**; the template (and this kit)
  starts at 25 as a speed/quality compromise.
- **Native 2K**: set `--width 2048 --height 2048` for the t2i workflow.
  Prefer multiples of 32.
- **Edit resolution**: node `5`'s `resolution` (default 1024) is a total
  pixel budget, not a side length — aspect ratio is preserved. Set
  `--5_resolution 0` to keep each reference at its own size (rounded to a
  multiple of 32); the output canvas follows `image_1`.
- Edit workflows route `latent_image` from the text encoder's third
  output, which is an empty latent matched to `image_1`'s size. Feeding a
  different-sized latent shifts the edit.
- `QwenImage21Cache` (node `6` in the edit workflows) controls the prefix
  KV cache: `--6_device` (`auto` / `gpu` / `cpu` / `off`) and `--6_dtype`
  (`default` / `int8` / `int4`). `int8` halves the cache at roughly bf16
  accuracy — useful when VRAM-starved on L4.

## Transparent (RGBA) images

2.1 generates alpha natively; there is no separate workflow. Use the t2i
preset and wrap the prompt as the model expects:

```
This is an RGBA format image with transparency. <your description>. The image has an alpha channel and a transparent background.
```

`SaveImage` writes PNG, which preserves the alpha channel. `--prompt`
replaces the whole string, so include the wrapper every time.

## Multi-reference editing

`TextEncodeQwenImage21` accepts up to **10 reference images**
(`image_1` … `image_10`; the node schema reserves 16 slots). `image_1` is
the edit target, the rest are references, and the prompt addresses them as
`<image1>`, `<image2>`, … To go beyond two, copy the `LoadImage` node in
`qwen_image_2_1_edit_2ref.json` and add another
`"images.image_N": ["<node_id>", 0]` entry to node `5`.

> The dotted `images.image_N` key is the API-format spelling of the
> node's autogrow input group (`images` + slot name). It is not a typo.

## Notes

- `CLIPLoader` uses `type: qwen_image` — the same loader type as the older
  Qwen-Image kits; the 2.1 text encoder is Qwen3-VL 8B, not Qwen2.5-VL 7B,
  so the two families' encoder files are not interchangeable.
- The int8 convrot weights need the `comfy-kitchen` build pinned by
  ComfyUI's `requirements.txt`; `01_setup.py` installs it from there
  after the loose dependency line, so do not reorder those two installs.
- The bundled workflows are hand-flattened API-format exports of the
  official subgraph templates (which are UI-format and cannot be posted
  to `/prompt` directly).
- Weights are **not** shared with the `qwen_image` / `qwen_image_edit`
  kits — different diffusion model, text encoder, and VAE.
