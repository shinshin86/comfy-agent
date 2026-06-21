# 10Eros (LTX-2.3 fine-tune) on Colab

Starter kit for running [TenStrip/LTX2.3-10Eros][hf] — an **uncensored**
LTX-2.3 22B fine-tune built on top of Sulphur-2-base — via ComfyUI +
comfy-agent.

[hf]: https://huggingface.co/TenStrip/LTX2.3-10Eros

> **Status: i2v Verified E2E (Colab A100, fp8mixed_learned); t2v starter.**
> The `video_10eros_i2v_distilled.json` path has been exercised end-to-end:
> Colab A100 → cloudflared → `comfy-agent run` from a local Mac →
> `.mp4` lands under `.comfy-agent/outputs/10eros_i2v/...` (verified with a
> 41-frame image→video clip; checkpoint streams into the 40 GB A100 fine).
> The `video_10eros_t2v_distilled_api.json` path shares the same
> checkpoint / text encoder / node graph but has **not** been run
> separately yet — treat t2v as a starter until verified. See the
> repo-root `CLAUDE.md` for what "Verified E2E" requires.

> **Acceptable use warning.** 10Eros is described by its author as
> uncensored. Generating, hosting, or distributing NSFW / sexually
> explicit / non-consensual content on Google Colab generally violates
> Colab's terms of service and can result in account suspension. Use
> this kit only for purposes that comply with Colab's policy and your
> local laws. The kit author and this repository do not endorse or
> assist with policy-violating use.

## Upstream references

- Model: https://huggingface.co/TenStrip/LTX2.3-10Eros
- Parent fine-tune / distill LoRA: https://huggingface.co/SulphurAI/Sulphur-2-base
- Base (LTX-2.3) / spatial upscaler: https://huggingface.co/Lightricks/LTX-2.3
- Author's ComfyUI nodes: https://github.com/TenStrip/10S-Comfy-nodes
- ComfyUI custom nodes:
  - https://github.com/Lightricks/ComfyUI-LTXVideo
  - https://github.com/kijai/ComfyUI-KJNodes (`PatchSageAttentionKJ`)
  - https://github.com/evanspearman/ComfyMath (`ComfyMathExpression`)
  - https://github.com/aria1th/ComfyUI-LogicUtils (`ResizeImageResolution`)
  - https://github.com/sipherxyz/comfyui-art-venture (`ImageScaleDownBy`)
- License: the upstream 10Eros model card does not state an explicit
  license. The parent Lightricks/LTX-2.3 is governed by the LTX-2
  Community License Agreement. Review both before redistribution or
  commercial use.

## How this differs from the `sulphur2` kit

10Eros shares LTX-2.3's architecture and the exact ComfyUI node graph as
Sulphur-2, so the workflows here are derived from the sulphur2 kit with
three substitutions:

| | sulphur2 | 10eros |
|---|---|---|
| Checkpoint | `sulphur_dev_fp8mixed.safetensors` | `10Eros_v1.2_fp8mixed_learned.safetensors` |
| Text encoder | `gemma_3_12B_it_fp4_mixed.safetensors` (Comfy-Org repack) | `gemma-3-12b-it-ablit-norms-biproj-fp8mixed.safetensors` (10Eros's own abliterated Gemma) |
| `SaveVideo` prefix | `video/sulphur2_*` | `video/10eros_*` |

The distilled LoRA (`ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors`)
and spatial upscaler (`ltx-2.3-spatial-upscaler-x2-1.0.safetensors`) are
unchanged — the 10Eros card recommends the same "cond_safe" LTX-2.3 1.1
distilled LoRA. As with sulphur2, the full checkpoint already bakes in
the fine-tune, so no model LoRA is stacked on top.

## Variants included

| File | Use | Notes |
|---|---|---|
| `video_10eros_i2v_distilled.json` | image→video, distilled (API format) | Patched from `sulphur2/video_sulphur2_i2v_distilled.json` with the 10Eros checkpoint + text encoder. Consumable directly by `comfy-agent import`. |
| `video_10eros_t2v_distilled_api.json` | text→video, distilled (API format) | Patched from `sulphur2/video_sulphur2_t2v_distilled_api.json`. Consumable directly by `comfy-agent import`. |

## Variant choice (fp8mixed vs bf16)

`01_setup.py` defaults `CHECKPOINT_VARIANT = "fp8mixed"`
(`10Eros_v1.2_fp8mixed_learned.safetensors`, ~34 GB on disk) — the
realistic option on Colab A100 40 GB. Setting it to `"bf16"` downloads
`10Eros_v1.2_bf16.safetensors` (~46 GB) and is intended for A100 80 GB or
aggressive offload.

If you want bf16, edit `CHECKPOINT_VARIANT` in `01_setup.py` **and**
override the workflow's checkpoint name at run time (nodes 4, 5, 44 all
read the checkpoint — override each):

```bash
comfy-agent run 10eros_i2v --44_ckpt_name 10Eros_v1.2_bf16.safetensors ...
```

## Flow

1. Colab runtime = A100 (40 GB high-RAM).
2. Run `01_setup.py` in a cell. Downloads are ~49 GB for the fp8mixed
   path (34 GB checkpoint + 13 GB text encoder + 1 GB upscaler + 0.7 GB
   distill LoRA). Set `USE_GOOGLE_DRIVE = True` to persist weights across
   sessions.
3. Run `../02_start_comfyui.py` in the next cell.
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Locally — pick **one** workflow:

   ```bash
   # image-to-video
   comfy-agent import ./scripts/colab/10eros/video_10eros_i2v_distilled.json --name 10eros_i2v

   # text-to-video
   comfy-agent import ./scripts/colab/10eros/video_10eros_t2v_distilled_api.json --name 10eros_t2v
   ```

   For **i2v**: open `.comfy-agent/presets/10eros_i2v.yaml` and append:

   ```yaml
   uploads:
     image:
       kind: image
       cli_flag: --image
       target:
         node_id: "67"
         input: image
   ```

   (`comfy-agent import` does not yet auto-generate `uploads` entries
   from `LoadImage` nodes — one-time manual step per preset.) The t2v
   preset has no input image, so this step is i2v-only.

6. Run:

   ```bash
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com

   # i2v
   comfy-agent run 10eros_i2v \
       --image ./path/to/your.png \
       --29_value "prompt describing the motion you want" \
       --27_value 41 \
       --68_resolution 512 \
       --timeout-seconds 1800

   # t2v
   comfy-agent run 10eros_t2v \
       --29_value "your scene description" \
       --27_value 41 \
       --40_value 512 \
       --25_value 320 \
       --timeout-seconds 1800
   ```

   Common flags (see `comfy-agent preset <name>`):
   - `--29_value` — positive prompt
   - `--41_text` — negative prompt (default: cartoonish-looking text)
   - `--1_noise_seed` / `--2_noise_seed` — seeds for the two sampling passes
   - `--27_value` — frame count (default 241; LTX expects `8n + 1`; e.g. 41 → ~1.7 s @ 24 fps)
   - `--26_value` — frame rate (default 24 fps)
   - `--47_steps` — sampler steps for the refine pass (default 8)
   - `--49_strength_model` / `--59_strength_model` — distill LoRA strengths

   i2v-only:
   - `--68_resolution` — input image target resolution before encoding (default 1024)

   t2v-only:
   - `--40_value` — width (default 1366; multiples of 32)
   - `--25_value` — height (default 768; multiples of 32)

   Output lands under
   `.comfy-agent/outputs/10eros_{i2v,t2v}/<timestamp>/`.

## Prompting

Per the upstream card, LTX has very little self-reasoning — the first
frame and every subsequent motion must be described explicitly. The
author suggests enhancing prompts with an external (uncensored) LLM
before passing them in. The kit does not bundle a prompt enhancer.

## Caveats

- **t2v not separately verified.** The i2v path is Verified E2E on a
  Colab A100; the t2v API workflow shares the same checkpoint, text
  encoder, and node graph but has not been run end-to-end yet. If a node
  errors on load, double-check the exact filenames against
  https://huggingface.co/TenStrip/LTX2.3-10Eros/tree/main .
- **VRAM**: A100 40 GB minimum. fp8mixed (34 GB) does not fully fit in
  VRAM either — relies on ComfyUI-LTXVideo's low_vram streaming loaders.
  Expect several minutes per clip.
- **Disk**: ~49 GB for the fp8mixed path; ~61 GB for bf16. The Colab A100
  disk should handle both, but `USE_GOOGLE_DRIVE = True` is recommended
  if you switch sessions often.
- **Custom nodes**: the workflows pull in `PatchSageAttentionKJ`
  (KJNodes), `ComfyMathExpression` (ComfyMath), `ResizeImageResolution`
  (LogicUtils), and `ImageScaleDownBy` (art-venture) in addition to the
  standard LTX-2 nodes. `01_setup.py` installs all five custom node packs.
- **sageattention wheel**: install can fail on certain Colab Python /
  CUDA combos; the workflow's `sage_attention="auto"` setting should fall
  back to default attention if the kernel is unavailable.
- **Checkpoint version drift**: `01_setup.py` pins `10Eros_v1.2_*`. The
  upstream repo also hosts `v1` and a Kijai fp8 *transformer* split (the
  latter goes in `diffusion_models/` and uses a different node graph —
  not what this kit uses). Refresh filenames from the HF tree if the
  upstream repo iterates.
