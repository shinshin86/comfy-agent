# P-H3-Image (INT8) on Colab

[P-H3-Image](https://huggingface.co/PrunaAI/P-H3-Image-Comfy) is an image model
by Pruna AI based on MiniMax-H3. It renders 8-megapixel images in 8 steps without
CFG and edits with reference images. ComfyUI supports it natively from v0.44.0;
this kit pins that tag and needs no custom nodes.

**Verified E2E** on Colab A100 40GB for text-to-image, single-image edit, and
two-image edit through the local Mac → cloudflared → `comfy-agent run` flow. See
[Verification record](#verification-record).

## Important license notice

The weights are under the MiniMax H3 Community License. Its **Applicable Territory
excludes the European Union, the United Kingdom, the Republic of Korea, and the
United States of America**. Products built on it must show "Powered by MiniMax H3",
commercial products above US$20 million in yearly revenue need prior written
authorization, and the license has further output-use and acceptable-use terms.
The text encoder's Qwen3-VL-4B parts and the prompt upsampler are Apache-2.0.

The setup script does not geolocate you or block execution. You are responsible
for checking whether the place where the model is downloaded and used, including
the Colab runtime region, and the intended use comply with the current terms.
Downloading or using the weights may constitute acceptance of those terms.

- https://huggingface.co/PrunaAI/P-H3-Image-Comfy/blob/main/LICENSE
- https://huggingface.co/PrunaAI/P-H3-Image-Comfy/blob/main/NOTICE

## Requirements and weights

Use an A100 40GB runtime. `01_setup.py` stops before downloading on less than
38 GiB of GPU memory or too little disk. Downloads are pinned to a model revision
and checked by size and SHA-256. Total download: 48.79 GB.

| File | Dest | Size |
|---|---|---|
| `p-h3-image_int8_convrot.safetensors` | `models/diffusion_models/` | 21.21 GB |
| `p-h3-image_text_encoder_int8_convrot.safetensors` | `models/text_encoders/` | 5.12 GB |
| `p-h3-image_prompt_upsampler_bf16.safetensors` | `models/text_encoders/` | 19.31 GB |
| `p-h3-image_vae_int8_convrot.safetensors` | `models/vae/` | 3.15 GB |

Upstream also ships bf16 and w4a8 weights. They are not part of this kit and were
not tested here.

## Flow

1. Open a Colab notebook on an **A100** runtime.
2. Run `01_setup.py` in a cell.
3. Run `../02_start_comfyui.py` (shared launcher).
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Locally:

   ```bash
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent doctor
   comfy-agent import ./scripts/colab/p_h3_image/p_h3_image_t2i.json --name p_h3_image_t2i
   comfy-agent run p_h3_image_t2i --prompt "a ramen shop at night in the rain" --seed 42
   ```

## Workflows

| Workflow | Inputs | Default output |
|---|---|---|
| `p_h3_image_t2i.json` | `--prompt` | 2912×2912 |
| `p_h3_image_edit.json` | `--image`, `--prompt` | 4 MP, aspect ratio of `--image` |
| `p_h3_image_edit_2ref.json` | `--image`, `--image-2`, `--prompt` | 4 MP, aspect ratio of `--image` |

The graphs are upstream's API-format equivalents with the int8 file names, a fixed
default seed, and one or two edit inputs. Upstream's Resolution Selector is replaced
by direct `--width` / `--height` values.

### Text-to-image aspect ratios

The request reaches the prompt upsampler with its aspect ratio, so change both the
size and `--17_f_string` together:

```bash
comfy-agent run p_h3_image_t2i --prompt "..." --width 3872 --height 2176 \
  --17_f_string $'Aspect ratio: 16:9\nRequest: {a}'
```

| Aspect ratio | 8 MP size | 4 MP size for edits |
|---|---|---|
| 1:1 | 2912×2912 | 2048×2048 |
| 4:3 | 3360×2496 | 2368×1760 |
| 3:4 | 2496×3360 | 1760×2368 |
| 3:2 | 3552×2368 | 2496×1664 |
| 2:3 | 2368×3552 | 1664×2496 |
| 16:9 | 3872×2176 | 2720×1536 |
| 9:16 | 2176×3872 | 1536×2720 |

### Editing

Refer to inputs as `<Picture 1>` (the image being edited) and `<Picture 2>` (the
reference) in `--prompt`. Upstream supports up to 8 images; adding more needs new
graph nodes and a `<Picture N>` block per image in `17_f_string`.

### Prompt upsampler

Keep a short request in `--prompt`; the upsampler expands it and the expansion can
be read from node 15 in the ComfyUI history. `--19_switch false` sends the request
to the model as written, which upstream warns gives weak results for short prompts.

## Limitations

Upstream notes that hands and small background people can break, small or dense
text can turn into pseudo-text, and hype words or very long prompts make images
worse. This kit's runs cover four images and do not measure these limits.

## Verification record

2026-11-05, Colab `NVIDIA A100-SXM4-40GB`, 83 GB RAM, ComfyUI v0.44.0
(`2c75dc1b`), comfy-kitchen 0.2.40, model revision `44a0fb73`. All runs used the
local `comfy-agent` over the cloudflared tunnel, and images were saved under the
local `.comfy-agent/outputs/`. `doctor` reported `connection: OK`. Setup took
7.5 minutes. The setup and launcher ran as background processes so that long
downloads would not hit the cell tool's timeout.

| Run | Output | ComfyUI execution | Observed result |
|---|---|---|---|
| T2I, cold start, seed 42 | 2912×2912 | 95.4 s | Neon sign reads `OPEN 24/7` as requested |
| Edit, 1024×1024 character sheet, seed 42 | 2048×2048 | 29.2 s | Sweater recolored; character, pose, and layout kept |
| T2I, 16:9 with `--17_f_string`, seed 7 | 3872×2176 | 24.1 s | Product photo of the requested beret |
| Two-image edit, same sheet + beret, seed 42 | 2048×2048 | 54.6 s | Beret added in all three views; outfit and layout kept |

- Sampled GPU memory reached 40,208 MiB. ComfyUI keeps models loaded while memory
  is available, so this is not a minimum requirement. Upstream's published figures
  are 31 GB for this set and about 21 GB for the upsampler at 8 MP.
- `comfy-agent run` took about 3 minutes 59 seconds for the first T2I against
  95.4 s of ComfyUI execution. The cause of the difference was not isolated.
- The first two-image run failed with `Network error on POST /upload/image` while
  uploading a 5.7 MB reference after about 1 minute 47 seconds. A direct upload of
  the same file then took 3 seconds and the same command succeeded on retry, so the
  cause was not identified. Retry if you see this error.
