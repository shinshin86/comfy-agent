# FastH3 Preview v1 on Colab A100

Verified E2E kit for FastH3 Preview v1 text-to-video-and-audio (T2VA) through
ComfyUI and `comfy-agent`. It uses Kijai's experimental INT8 ConvRot repack of
the recommended four-forward VSA/Data-Free checkpoint.

Status: **Verified E2E on Colab A100.** The canonical Colab A100 → cloudflared
→ local `comfy-agent` flow produced a visually and audibly inspected output.

Upstream references:

- https://haoailab.com/blogs/fasth3-preview/
- https://huggingface.co/FastVideo/FastVideo-FastH3-4-step-Preview-v1-VSA-DataFree
- https://huggingface.co/Kijai/MiniMax-H3-experimental
- https://github.com/Comfy-Org/ComfyUI/pull/15958
- https://github.com/Comfy-Org/comfy-kitchen/pull/117

## Scope

- T2VA only: prompt in, video with jointly generated stereo audio out.
- Default: 864x480, 124 frames, 24 fps (about 5.17 seconds).
- Four transformer forwards: Euler sampler, simple scheduler, four steps,
  BasicGuider/CFG 1 behavior.
- VSA over the full sampling range with 10% video-cube keep (90% sparsity),
  tile size 64, and the checkpoint's 50 `to_gate_compress` weights.
- No FL2VA, I2V, Ref2VA, Turbo LoRA, or dense FastH3 fallback.

FastVideo Preview v1 documents FL2VA and Ref2VA as future checkpoints. Do not
infer those capabilities from the base H3 architecture.

## Pinned experimental runtime

The setup fixes all moving parts instead of following their latest branches:

- ComfyUI FastH3 PR head:
  `10febb01d7be73d1491cf5e5347b5ab8b6c2c09e`
- Merged comfy-kitchen Sol-Attn change:
  `dae00a13d458876570804523ae045a487fd92961`
- Kijai model upload revision:
  `641f2a0a2df14cf24665277d8417930b57cc7710`
- Temporary `SolAttnMiniMax` v5 source SHA-256:
  `97c9d56fdc7c9a102e59bff9ac8d79503299514d061892088a03d99dcf415b0c`

ComfyUI's pinned requirements still install a pre-VSA `comfy-kitchen`
release, so `01_setup.py` builds the pinned merged source afterward for the
visible GPU architecture. The script also runs a small native CUDA Sol-Attn
self-test before downloading the model weights.

The temporary node normally permits dense fallback. For this dedicated
FastH3 workflow, setup applies narrowly matched runtime changes that fail when
the H3 layout, gate weights, CUDA BF16 producer path, or VSA kernel is missing.
The source hash and every replacement are checked before the node is installed.

## Cost and requirements

- Runtime: fresh Colab A100 high-RAM runtime.
- Model downloads: 44.40 GB decimal.
- Source build requirements: CUDA toolkit 12.8+, CMake 3.26+, Ninja, and
  NVIDIA compute capability 8.0+.
- Allow additional disk and setup time for the comfy-kitchen CUDA build.
- A fresh runtime is required because this kit pins a Draft ComfyUI revision
  and replaces the stock comfy-kitchen wheel.

## License notice

FastH3 inherits the MiniMax H3 Community License. Review the full current
upstream terms before downloading or using the weights, including territory,
commercial authorization, attribution, output-use, and acceptable-use terms.
The setup does not geolocate or block the Colab runtime.

## Setup

Do not run these steps until an A100 verification session has been approved.

1. Start a fresh Colab notebook with an A100 high-RAM runtime.
2. Paste `01_setup.py` into the first cell and run it.
3. Paste `../02_start_comfyui.py` into the second cell and run it.
4. Copy the printed `comfy-agent connect https://...` command to the local Mac.

The setup verifies:

- exact ComfyUI and comfy-kitchen commits;
- FastH3 model-detection source markers;
- the native CUDA Sol-Attn kernel with BF16 tensors;
- all model sizes and SHA-256 values;
- exactly 50 checkpoint `to_gate_compress` weights;
- the temporary VSA node source before applying its fail-closed changes.

## Local import and run

After the approved Colab session is connected:

```bash
comfy-agent import ./scripts/colab/minimax_h3_fast/minimax_h3_fast_t2v.json \
  --name minimax_h3_fast_t2v

comfy-agent run minimax_h3_fast_t2v \
  --104_prompt "integrated_multimodal_description: [Shot 1] ...

overall_soundscape: ...

non_diegetic_music: ..." \
  --15_noise_seed 42 \
  --timeout-seconds 1800
```

Useful generated flags include `--104_width`, `--104_height`,
`--104_length`, `--9_steps`, and `--92_filename_prefix`. Keep four steps and
the VSA node's locked inputs unchanged for the initial verification.

## E2E verification record

Verified on 2026-09-01 with a Colab `NVIDIA A100-SXM4-40GB` runtime and the
canonical local Mac → cloudflared → Colab flow:

- [x] `01_setup.py` completed, including the native BF16 CUDA Sol-Attn test,
  pinned revisions and hashes, and the 50/50 gate-compress checkpoint check.
- [x] `02_start_comfyui.py` produced a usable trycloudflare URL.
- [x] Local `comfy-agent doctor` connected through the tunnel; the preset
  preflight reported no missing nodes or models.
- [x] Local `comfy-agent import` used live server object info and created the
  preset.
- [x] Local `comfy-agent run` completed through the tunnel in 151.039 seconds
  and downloaded one MP4 to the local output directory.
- [x] Logs reported `chunked qkv producer on 50 blocks` and a 15,521-token VSA
  producer path at `topk=0.100`, with no kernel failure or dense fallback.
- [x] The output was H.264 at 864×480, 124 frames, 24 fps, and 5.167 seconds,
  with 32 kHz stereo AAC audio.
- [x] Six extracted frames showed a stable paper lantern, expanding water
  ripples, and a slow push-in without unwanted people, text, or watermarks.
  The extracted stereo track had no 0.3-second interval below -50 dB, its
  waveform showed distinct events across the clip, and local playback exited
  successfully.
