# 10Eros-Max (MiniMax H3 fine-tune) on Colab

Starter kit for [TenStrip/10Eros-Max][model], a third-party MiniMax H3
graft/fine-tune, using ComfyUI's native H3 nodes and `comfy-agent`. It supports
text-to-video (T2V) and first-frame image-to-video (I2V), with jointly generated
stereo audio.

> **Status: Starter.** The workflows and catalog metadata are statically
> validated, but the required Colab A100 → cloudflared → local `comfy-agent`
> E2E path has not yet been recorded. Do not describe this kit as Verified E2E
> until every check in the repo-root `CLAUDE.md` passes in one run.

[model]: https://huggingface.co/TenStrip/10Eros-Max
[int8]: https://huggingface.co/cicalooo/10Eros-Max-h3-int8-convrot

## Model choice

The upstream model card links [cicalooo's INT8 ConvRot conversion][int8]. This
kit pins `10Eros_Max_h3_fl2va_beta2_pruned_int8_convrot.safetensors` because it:

- matches the native H3 FL2VA workflow used by the verified `minimax_h3` kit;
- keeps the diffusion model at about 20.20 GB instead of about 40.22 GB for the
  upstream BF16 file; and
- uses the non-Turbo Beta2 checkpoint, so the existing 20-step H3 schedule can
  be reused without the Turbo model's custom 6–7-step sigma recipe.

The quantized checkpoint is a third-party conversion rather than a file hosted
in `TenStrip/10Eros-Max`. Its model card says it uses ComfyUI's native
`int8_tensorwise` ConvRot format and follows the original model's license
declaration.

## License and acceptable-use notice

Review all current upstream terms before downloading or using the weights:

- The MiniMax H3 Community License defines an Applicable Territory that
  excludes the EU, UK, Republic of Korea, and USA. Check both your own location
  and the Colab runtime region; this setup does not geolocate or block use.
- The 10Eros-Max card says that the community licenses for MiniMax H3,
  LTX-2.3, Wan 2.2, and Krea 2 apply to transferred portions of the model.
  The combined redistribution and commercial-use implications are not resolved
  by this kit.
- The MiniMax H3 license includes acceptable-use, safeguards, attribution,
  public-output disclosure, and commercial-authorization conditions. Google
  Colab's acceptable-use policy and applicable law also continue to apply.

Downloading or using the weights may constitute acceptance of those terms.
This repository provides technical integration only and does not authorize
policy-violating or unlawful use.

## Cost and requirements

- Runtime: fresh Colab A100 high-RAM recommended. T4/L4 are not covered.
- Model downloads: 41.70 GB decimal (10Eros-Max INT8 diffusion model plus the
  pinned MiniMax H3 text encoder and video/audio VAEs).
- Free disk: allow at least 55–60 GB for models, ComfyUI, packages, caches, and
  outputs.
- Setup time: roughly 15 minutes on a fast Colab↔Hugging Face connection.
- Default output: 864x480, 124 frames at 24 fps (about 5.17 seconds), with
  stereo audio.
- Human actions per fresh session: select the A100 runtime, run the setup cell,
  run the shared launcher cell, then paste one `comfy-agent connect <url>` line.

A100 availability can require paid Colab compute. This kit never selects or
spends paid compute automatically.

## Setup

1. Start a fresh Colab notebook with an A100 high-RAM runtime.
2. Read the license and acceptable-use notice above and the linked terms.
3. Paste `01_setup.py` into one cell and run it. Downloads are pinned by
   revision, size, and SHA-256.
4. Paste `../02_start_comfyui.py` into the next cell and run it.
5. Read `/content/comfy_url.txt`, then connect locally:

   ```bash
   comfy-agent connect https://<id>.trycloudflare.com
   ```

## T2V

```bash
comfy-agent import ./scripts/colab/10eros_max/10eros_max_t2v.json \
  --name 10eros_max_t2v

comfy-agent run 10eros_max_t2v \
  --104_prompt "integrated_multimodal_description: [Shot 1] A concise 5-second audiovisual scene...\n\noverall_soundscape: ...\n\nnon_diegetic_music: N/A" \
  --15_noise_seed 42 \
  --timeout-seconds 1800
```

## I2V

```bash
comfy-agent import ./scripts/colab/10eros_max/10eros_max_i2v.json \
  --name 10eros_max_i2v

comfy-agent run 10eros_max_i2v \
  --image ./first-frame.png \
  --104_prompt "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] Preserve the subject...\n\noverall_soundscape: ...\n\nnon_diegetic_music: ..." \
  --15_noise_seed 42 \
  --timeout-seconds 1800
```

`comfy-agent import` detects the `LoadImage.image` input in the I2V workflow
and creates the `--image` upload automatically.

Useful flags for both workflows include `--104_width`, `--104_height`,
`--104_length`, `--9_steps`, and `--92_filename_prefix`. H3 expects its
`17k+5` frame grid: 124 frames is about 5.17 seconds, 243 about 10.13 seconds,
and 362 about 15.08 seconds at 24 fps.

Follow [`docs/minimax-h3-prompting.md`](../../../docs/minimax-h3-prompting.md)
for the required visual timeline, soundscape, and music prompt structure.

## Verification still required

Before promoting this kit from Starter, perform the canonical flow on one
Colab A100 session:

- `01_setup.py` completes and all checksums pass.
- `02_start_comfyui.py` produces a working cloudflared URL.
- Local `comfy-agent doctor` reports a healthy connection.
- Local imports succeed for both workflows.
- Local runs produce MP4 files under `.comfy-agent/outputs/...`.
- `comfy-agent verify` passes, extracted first/middle/last frames are inspected,
  and audio is probed and played back.

Record T2V and I2V separately; one passing workflow does not verify the other.

## Upstream references

- Original model: https://huggingface.co/TenStrip/10Eros-Max
- INT8 ConvRot conversion: https://huggingface.co/cicalooo/10Eros-Max-h3-int8-convrot
- MiniMax H3 support models: https://huggingface.co/Comfy-Org/MiniMax-H3
- Native ComfyUI tutorial: https://docs.comfy.org/tutorials/video/minimax/minimax-h3
- MiniMax H3 license: https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE
