# Sulphur-2 (LTX-2.3 fine-tune) on Colab

Starter kit for running [SulphurAI/Sulphur-2-base][hf] — an
**uncensored** LTX-2.3 22B fine-tune — via ComfyUI + comfy-agent.

[hf]: https://huggingface.co/SulphurAI/Sulphur-2-base

> **Status: Verified E2E (Colab A100, fp8mixed).**
> Both the i2v and t2v API workflows have been exercised end-to-end:
> Colab A100 → cloudflared → `comfy-agent run` from a local Mac →
> `.mp4` lands under `.comfy-agent/outputs/sulphur2_{i2v,t2v}/...`.

> **Acceptable use warning.** Sulphur-2 is described by its author as
> uncensored. Generating, hosting, or distributing NSFW / sexually
> explicit / non-consensual content on Google Colab generally violates
> Colab's terms of service and can result in account suspension. Use
> this kit only for purposes that comply with Colab's policy and your
> local laws. The kit author and this repository do not endorse or
> assist with policy-violating use.

## Upstream references

- Model: https://huggingface.co/SulphurAI/Sulphur-2-base
- Parent (LTX-2.3): https://huggingface.co/Lightricks/LTX-2.3
- Text encoder repack: https://huggingface.co/Comfy-Org/ltx-2
- ComfyUI custom nodes:
  - https://github.com/Lightricks/ComfyUI-LTXVideo
  - https://github.com/kijai/ComfyUI-KJNodes (`PatchSageAttentionKJ`)
  - https://github.com/evanspearman/ComfyMath (`ComfyMathExpression`)
  - https://github.com/aria1th/ComfyUI-LogicUtils (`ResizeImageResolution`)
  - https://github.com/sipherxyz/comfyui-art-venture (`ImageScaleDownBy`)
- License: LTX-2 Community License Agreement (see `LICENSE.txt` in the
  upstream model repo). Review before redistribution or commercial use.

## Variants included

| File | Use | Notes |
|---|---|---|
| `video_sulphur2_i2v_distilled.json` | image→video, distilled (API format) | Patched from upstream `workflows/ltx23_i2v distilled.json`: `ckpt_name` fields point at `sulphur_dev_fp8mixed.safetensors`, and the redundant `sulphur_final.safetensors` LoRA loader nodes (46, 60) have been rewired out since the merged dev checkpoint already contains the fine-tune. Consumable directly by `comfy-agent import`. |
| `video_sulphur2_t2v_distilled_api.json` | text→video, distilled (API format) | Converted from upstream `workflows/ltx23_t2v distilled.json` (UI format) by walking `/object_info` widget order, dropping the 8 muted nodes with passthrough rewiring, and resolving autogrow inputs (`values.a`, `values.b`). Patched the same way as i2v: Sulphur ckpt name + `sulphur_final` LoRA loaders rewired out. Consumable directly by `comfy-agent import`. |
| `video_sulphur2_t2v_distilled.json` | text→video, distilled (UI format) | Upstream `workflows/ltx23_t2v distilled.json`, **unmodified** — ComfyUI browser-UI layout, kept around for users who prefer to load it in the ComfyUI browser UI. Use the `_api.json` companion through `comfy-agent`. |

`01_setup.py` also drops all four upstream Sulphur workflows
(`i2v base / i2v distilled / t2v base / t2v distilled`) into
`ComfyUI/user/default/workflows/` on the Colab side when
`INSTALL_UPSTREAM_WORKFLOWS_IN_UI = True` (the default), so they appear
in the ComfyUI browser UI's workflow picker. **Those upstream JSONs are
not patched** — they reference `ltx-2.3-22b-dev-fp8.safetensors` and
`sulphur_final.safetensors`, neither of which is downloaded; edit the
checkpoint / LoRA widget values inside the UI before queueing, or use
the kit's patched `video_sulphur2_i2v_distilled.json` through
`comfy-agent` instead.

## Variant choice (fp8mixed vs bf16)

The setup script defaults `CHECKPOINT_VARIANT = "fp8mixed"` (~29 GB on
disk), which is the only realistic option on Colab A100 40 GB. Setting
it to `"bf16"` downloads the 46 GB checkpoint and is intended for A100
80 GB or aggressive offload.

If you want the bf16 variant, edit `CHECKPOINT_VARIANT` in `01_setup.py`
**and** override the workflow's checkpoint name at run time:

```bash
comfy-agent run sulphur2_i2v --44_ckpt_name sulphur_dev_bf16.safetensors ...
```

(Node IDs 4, 5, 44 in the i2v workflow all read the checkpoint —
override each if you swap variants.)

## Flow

1. Colab runtime = A100 (40 GB high-RAM).
2. Run `01_setup.py` in a cell. Downloads are ~37 GB for the fp8mixed
   path (29 GB checkpoint + 7 GB text encoder + 1 GB upscaler +
   0.7 GB distill LoRA). Set `USE_GOOGLE_DRIVE = True` to persist
   weights across sessions.
3. Run `../02_start_comfyui.py` in the next cell.
4. Poll `/content/comfy_url.txt` for the tunnel URL.
5. Locally — pick **one** workflow:

   ```bash
   # image-to-video
   comfy-agent import ./scripts/colab/sulphur2/video_sulphur2_i2v_distilled.json --name sulphur2_i2v

   # text-to-video
   comfy-agent import ./scripts/colab/sulphur2/video_sulphur2_t2v_distilled_api.json --name sulphur2_t2v
   ```

   For **i2v**: open `.comfy-agent/presets/sulphur2_i2v.yaml` and append:

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
   comfy-agent run sulphur2_i2v \
       --image ./path/to/your.png \
       --29_value "prompt describing the motion you want" \
       --27_value 41 \
       --68_resolution 512 \
       --timeout-seconds 1800

   # t2v
   comfy-agent run sulphur2_t2v \
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
   `.comfy-agent/outputs/sulphur2_{i2v,t2v}/<timestamp>/`.

## Caveats

- **VRAM**: A100 40 GB minimum. fp8mixed (29 GB) does not fully fit in
  VRAM either — relies on ComfyUI-LTXVideo's low_vram streaming loaders.
  Expect several minutes per clip.
- **Disk**: ~37 GB for the fp8mixed path; ~54 GB for bf16. The 80 GB
  Colab A100 disk should handle both, but `USE_GOOGLE_DRIVE = True` is
  recommended if you switch sessions often.
- **Custom nodes**: the workflows pull in `PatchSageAttentionKJ`
  (KJNodes), `ComfyMathExpression` (ComfyMath),
  `ResizeImageResolution` (LogicUtils), and `ImageScaleDownBy`
  (art-venture) in addition to the standard LTX-2 nodes. `01_setup.py`
  installs all five custom node packs.
- **sageattention wheel**: install can fail on certain Colab Python /
  CUDA combos; the workflow's `sage_attention="auto"` setting should
  fall back to default attention if the kernel is unavailable.
- **Upstream workflow quirks**: the upstream JSONs reference
  `ltx-2.3-22b-dev-fp8.safetensors` (does not exist on HF) and
  `sulphur_final.safetensors` (does not exist on HF). Per the author's
  README, the intent is "use the LoRA OR use the full model, not both".
  This kit chooses the **full model** path: both the i2v and t2v API
  workflows have been patched to point at `sulphur_dev_fp8mixed.safetensors`
  and the redundant `sulphur_final.safetensors` LoRA loaders have been
  rewired out. The original UI-format `video_sulphur2_t2v_distilled.json`
  remains in the kit unmodified for users who want to load it in the
  ComfyUI browser UI.
- **Prompt enhancer not included**: `prompt_enhancer/` in the upstream
  repo is a Qwen-3.5 GGUF designed for LM Studio, not ComfyUI. Skipped.
- **Workflow drift**: the upstream Sulphur-2 repo is young and may
  iterate. If node names diverge after a release, refresh from
  https://huggingface.co/SulphurAI/Sulphur-2-base/tree/main/workflows .
