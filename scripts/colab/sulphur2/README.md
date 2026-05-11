# Sulphur-2 (LTX-2.3 fine-tune) on Colab

Starter kit for running [SulphurAI/Sulphur-2-base][hf] — an
**uncensored** LTX-2.3 22B fine-tune — via ComfyUI + comfy-agent.

[hf]: https://huggingface.co/SulphurAI/Sulphur-2-base

> **Status: Starter — not Verified E2E.**
> The kit has not yet been exercised end-to-end on a real Colab A100
> session against the local `comfy-agent` CLI through a cloudflared
> tunnel. Treat the workflow / setup script as best-effort. See
> `CLAUDE.md` at the repo root for what "Verified E2E" requires.

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
  - https://github.com/kijai/ComfyUI-KJNodes
  - https://github.com/evanspearman/ComfyMath
- License: LTX-2 Community License Agreement (see `LICENSE.txt` in the
  upstream model repo). Review before redistribution or commercial use.

## Variants included

| File | Use | Notes |
|---|---|---|
| `video_sulphur2_i2v_distilled.json` | image→video, distilled (API format) | Patched from upstream `workflows/ltx23_i2v distilled.json`: `ckpt_name` fields point at `sulphur_dev_fp8mixed.safetensors`, and the redundant `sulphur_final.safetensors` LoRA loader nodes (46, 60) have been rewired out since the merged dev checkpoint already contains the fine-tune. Consumable directly by `comfy-agent import`. |
| `video_sulphur2_t2v_distilled.json` | text→video, distilled (UI format) | Upstream `workflows/ltx23_t2v distilled.json`, **unmodified** — ComfyUI browser-UI layout, not API format. Load it in the ComfyUI UI on your Colab tunnel; not consumable by `comfy-agent import` as-is. |

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
5. Locally:

   ```bash
   comfy-agent import ./scripts/colab/sulphur2/video_sulphur2_i2v_distilled.json --name sulphur2_i2v
   ```

   Then open `.comfy-agent/presets/sulphur2_i2v.yaml` and append:

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
   from `LoadImage` nodes — one-time manual step per preset.)

6. Run:

   ```bash
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run sulphur2_i2v \
       --image ./path/to/your.png \
       --29_value "prompt describing the motion you want" \
       --timeout-seconds 1800
   ```

   Other useful flags (see `comfy-agent preset-show sulphur2_i2v`):
   - `--41_text` — negative prompt (default: cartoonish-looking text)
   - `--1_noise_seed` / `--2_noise_seed` — seeds for the two sampling passes
   - `--27_value` — frame count (default 241; LTX expects `8n + 1`)
   - `--26_value` — frame rate (default 24 fps)
   - `--68_resolution` — input image target resolution before encoding (default 1024)
   - `--59_strength_model` — distill LoRA strength on the first pass (default 0.7)
   - `--49_strength_model` — distill LoRA strength on the second pass (default 0.5)
   - `--47_steps` — sampler steps for the upscale/refine pass (default 8)

   Output lands under
   `.comfy-agent/outputs/sulphur2_i2v/<timestamp>/`.

## Caveats

- **VRAM**: A100 40 GB minimum. fp8mixed (29 GB) does not fully fit in
  VRAM either — relies on ComfyUI-LTXVideo's low_vram streaming loaders.
  Expect several minutes per clip.
- **Disk**: ~37 GB for the fp8mixed path; ~54 GB for bf16. The 80 GB
  Colab A100 disk should handle both, but `USE_GOOGLE_DRIVE = True` is
  recommended if you switch sessions often.
- **Custom nodes**: the workflow uses `PatchSageAttentionKJ` (KJNodes)
  and `ComfyMathExpression` (ComfyMath) in addition to the standard
  LTX-2 nodes. `01_setup.py` installs all three custom node packs.
- **sageattention wheel**: install can fail on certain Colab Python /
  CUDA combos; the workflow's `sage_attention="auto"` setting should
  fall back to default attention if the kernel is unavailable.
- **Upstream workflow quirks**: the upstream JSONs reference
  `ltx-2.3-22b-dev-fp8.safetensors` (does not exist on HF) and
  `sulphur_final.safetensors` (does not exist on HF). Per the author's
  README, the intent is "use the LoRA OR use the full model, not both".
  This kit chooses the **full model** path: the i2v workflow has been
  patched to point at `sulphur_dev_fp8mixed.safetensors` and bypass
  the missing-LoRA nodes. The t2v JSON is shipped untouched and will
  need the same edits (or a different download plan) if you want to
  run it from `comfy-agent`.
- **Prompt enhancer not included**: `prompt_enhancer/` in the upstream
  repo is a Qwen-3.5 GGUF designed for LM Studio, not ComfyUI. Skipped.
- **Workflow drift**: the upstream Sulphur-2 repo is young and may
  iterate. If node names diverge after a release, refresh from
  https://huggingface.co/SulphurAI/Sulphur-2-base/tree/main/workflows .
