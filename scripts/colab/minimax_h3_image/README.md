# MiniMax-H3-Image (INT8) on Colab

[MiniMax-H3-Image](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image) is MiniMax's
open-weights image model. One checkpoint does text-to-image and editing with
reference images, in 6 steps without CFG. ComfyUI supports it natively from
v0.45.0; this kit pins that tag, uses the
[Comfy-Org repackaged weights](https://huggingface.co/Comfy-Org/MiniMax-H3-Image),
and needs no custom nodes.

**Starter.** Not yet verified end to end in this configuration.

## Important license notice

The weights are under the MiniMax-H3-Image Community License, which is different
from the MiniMax H3 (video) license. Its **Applicable Territory excludes the
European Union, the United Kingdom, the Republic of Korea, and the United States
of America**, and use of the model or its outputs outside that territory is not
licensed. Among other terms:

- Outputs may not be used to improve any other AI model (for example, as LoRA or
  fine-tuning data for a different model).
- Content published to a public environment must clearly disclose that it is
  machine-generated.
- Annualized revenue above US$1 million, or offering a hosted service to third
  parties, needs prior written authorization from MiniMax.
- Commercial products must display "MiniMax-H3-Image" in their user interface.

The setup script does not geolocate you or block execution. You are responsible
for checking whether the place where the model is downloaded and used, including
the Colab runtime region, and the intended use comply with the current terms.
Downloading or using the weights may constitute acceptance of those terms.

- https://huggingface.co/MiniMaxAI/MiniMax-H3-Image/blob/main/LICENSE

## Requirements and weights

Use an A100 40GB runtime. `01_setup.py` stops before downloading on less than
38 GiB of GPU memory or too little disk. Downloads are pinned to a model revision
and checked by size and SHA-256. Total download: 49.29 GB.

| File | Dest | Size |
|---|---|---|
| `minimax_h3_image_pruned_int8_convrot.safetensors` | `models/diffusion_models/` | 20.98 GB |
| `qwen3vl_32b_minimax_h3_int8_convrot.safetensors` | `models/text_encoders/` | 27.14 GB |
| `minimax_h3_image_vae_fp16.safetensors` | `models/vae/` | 1.17 GB |

Upstream also ships bf16 and w4a8 diffusion weights, an nvfp4 text encoder, and a
separate prompt-enhancer model; they are not part of this kit and were not tested
here.

## Flow

1. Open a Colab notebook on an **A100** runtime.
2. Run `01_setup.py` in a cell.
3. Run `../02_start_comfyui.py` (shared launcher).
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Locally:

   ```bash
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent doctor
   comfy-agent import ./scripts/colab/minimax_h3_image/minimax_h3_image_t2i.json --name minimax_h3_image_t2i
   comfy-agent run minimax_h3_image_t2i --prompt "a ramen shop at night in the rain" --seed 42
   ```

## Workflows

| Workflow | Inputs | Default output |
|---|---|---|
| `minimax_h3_image_t2i.json` | `--prompt` | 2048×2048 |
| `minimax_h3_image_edit.json` | `--image`, `--prompt` | 4 MP, aspect ratio of `--image` |
| `minimax_h3_image_edit_2ref.json` | `--image`, `--image-2`, `--prompt` | 4 MP, aspect ratio of `--image` |
| `minimax_h3_image_edit_3ref.json` | `--image`, `--image-2`, `--image-3`, `--prompt` | 4 MP, aspect ratio of `--image` |

The graphs follow the sampling setup of the official ComfyUI templates: KSampler
at 6 steps, cfg 1.0, `euler`/`simple`, and a zeroed negative. They send
`--prompt` to the model directly and do not include the templates' optional
prompt-enhancer stage. The text-to-image Resolution Selector is replaced by
direct `--width` / `--height` values, and the edit graphs scale every input to
4 MP in multiples of 32 before conditioning.

### Writing prompts

The model is tuned for long, complete English descriptions. Write the subject,
composition, setting, lighting, and style out in full rather than a short
request; short prompts give weaker results.

### Sizes

`--width` and `--height` must be multiples of 32. The model is tuned for about
2048×2048 pixels of area and works poorly at low resolution; upstream lists
native sizes up to 4096×4096 (16 MP). Larger sizes raise memory use and time.

### Editing and references

Refer to the inputs as `<Picture 1>` (the image being edited, `--image`),
`<Picture 2>` (`--image-2`), and `<Picture 3>` (`--image-3`) in `--prompt`. The
output takes the size of `<Picture 1>` after scaling. Upstream accepts more
references; adding them needs more `LoadImage` and scale nodes wired into node 5.

## Limitations

Upstream's model card does not list known failure modes. This kit has not
measured hands, small text, or dense backgrounds.
