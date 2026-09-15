# LynnReal-Omni Standard INT8 on Colab A100

Verified E2E on Colab A100 40GB for four-step text-to-video and first-frame
image-to-video at 640×384 / 56 frames. Both videos were downloaded through
the local CLI and visually inspected. Generated stereo audio was checked for
format and non-silence; listening remains unverified. See [VERIFICATION.md](VERIFICATION.md)
for timings, evidence and scope.

## Requirements and scope

- Select an A100 high-RAM Colab runtime. The INT8 DiT alone is 47.80 GB;
  the dedicated launcher uses CPU offload (`--reserve-vram 4`, automatic layer offload).
- Model downloads total **69.30 GB decimal**, including the Qwen encoder and
  video/audio VAEs. Allow at least 90 GB of free disk for models and dependencies.
- Defaults: 640×384, 56 frames at 24 fps (about 2.33 seconds), Euler,
  `simple` schedule, four steps. These are reduced verification settings,
  not the upstream 1344×768 performance benchmark.
- This kit supports Standard INT8 T2V/I2V only. Flash, Light VAE, reference,
  pose control and long-video workflows are outside this kit.
- The four stock H3 model components are sufficient for T2V/I2V; no custom
  nodes, LoRA, extra sampling shift or optional prompt embedding are installed.
- Use a fresh runtime. This kit pins its own ComfyUI checkout and dependencies
  and refuses to launch over an existing server on port 8188.

## License

Review the upstream [MiniMax H3 Community License](https://github.com/LynnReal-AI/LynnReal-Omni/blob/a25052112192dca4674e4e5e68eb76e6da7fc548/LICENSE)
before downloading or using these weights. Its Applicable Territory excludes
the EU, UK, South Korea and USA, including where the runtime is operated.
Commercial attribution, prior authorization above US$20 million annual revenue,
acceptable-use and output-use restrictions also apply. This kit does not infer
runtime location or grant license permission.

## Setup and use

1. Run [01_setup.py](01_setup.py) in Colab. Downloads are revision-pinned and
   checked by size and SHA-256. Large files use resumable parallel downloads.
2. Run this kit's [02_start_comfyui.py](02_start_comfyui.py). It uses stock
   ComfyUI INT8 backends and CPU offload. Do not use another kit's launcher.
3. Copy the printed `comfy-agent connect https://…` command to the local host.
4. Import and run locally:

```bash
comfy-agent import scripts/colab/lynnreal_omni/lynnreal_omni_t2v.json --name lynnreal_omni_t2v
comfy-agent run lynnreal_omni_t2v --seed 42 --timeout-seconds 1800
comfy-agent import scripts/colab/lynnreal_omni/lynnreal_omni_i2v.json --name lynnreal_omni_i2v
comfy-agent run lynnreal_omni_i2v --image /path/to/first-frame.png --seed 42 --timeout-seconds 1800
```

Use `--104_prompt`, `--104_width`, `--104_height` and `--104_length` to
adjust the scene and geometry. Use dimensions divisible by 32 and lengths
of `5 + 17n` frames. Preserve the three prompt fields in the examples:
`integrated_multimodal_description`, `overall_soundscape`, `non_diegetic_music`.
For I2V, describe the supplied image and assign it to `<Picture 1>`.

After each run, use `comfy-agent verify <run-dir> --expect-kind video --json`
and inspect the generated contact sheet. Increasing geometry can exhaust GPU
or host memory; A100 40GB is not equivalent to the upstream 80GB environment.

## Provenance

- [Official ComfyUI workflows](https://github.com/LynnReal-AI/LynnReal-Omni/tree/a25052112192dca4674e4e5e68eb76e6da7fc548/comfyui): the bundled API graphs use the Standard four-step Euler/simple path, fixed INT8 selection, direct size/frame inputs and no optional embedding.
- [Weights](https://huggingface.co/stdstu123/LynnReal-Onmi-beta-0.1/tree/ef06e618f44a6cb0f2ed111645052098c4b7364a/comfyui/models): note the upstream repository spelling `Onmi`.
- ComfyUI: v0.35.0, commit `40c4fcdf513a4523e39d54a9d391908af8df8171`.
- PyTorch: 2.11.0 CUDA 13.0, torchvision 0.26.0, torchaudio 2.11.0.
- Actual pinned INT8 file size is 47,795,349,048 bytes; the upstream README's
  41.4 GiB figure differs. The setup uses the actual file metadata.
