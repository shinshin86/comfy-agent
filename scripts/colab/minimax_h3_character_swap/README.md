# MiniMax H3 Character Swap LoRA on Colab

**Status: Verified E2E on A100 (2026-09-29).** Colab setup, cloudflared,
local `comfy-agent doctor`, `import`, `run`, and `verify` passed with static and
walking source clips and reference images. See the verification record below
for scope and limits.

This kit uses MiniMax H3 Ref2VA and the experimental
[Akatz Labs Character Swap LoRA](https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA)
to replace one selected person in a source video with the character in a
reference image. It uses core ComfyUI nodes and the shared Colab launcher.

## Requirements and limits

- Use an A100 high-RAM Colab runtime. Other GPUs are untested. Model downloads
  total about 42.63 GB; allow roughly 55–60 GB of free runtime storage.
- Start with a 24 fps MP4, one continuous shot, one target person, and about
  4–5 seconds. The bundled output uses 864×480, 124 frames at 24 fps.
- H3 generates a new soundtrack. This graph does not feed the source soundtrack
  into reference conditioning or remux it into the output; original audio and
  lip sync are not guaranteed.
- Long clips, hard cuts, exact expression or motion matching, and simultaneous
  swaps of multiple people are not established capabilities of this LoRA.
- The [MiniMax H3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE)
  applies to the base model and adapter. Review its territory, commercial-use,
  attribution, and acceptable-use terms before downloading or using the weights.
  The standard territorial grant excludes the EU, UK, Republic of Korea, and
  USA; check the Colab runtime location as well as your own location. Use source
  footage and identities only with appropriate rights and consent.

## Setup

1. Create a fresh A100 high-RAM Colab runtime.
2. Paste `01_setup.py` into the first cell and run it. The script pins and
   checksums the Ref2VA model, text encoder, video and audio VAEs, Character
   Swap LoRA, and cloudflared.
3. Paste `../02_start_comfyui.py` into a second cell and run it. Read the URL
   printed in `/content/comfy_url.txt`.
4. On the local machine, connect and import the workflow:

   ```bash
   comfy-agent connect https://<id>.trycloudflare.com
   comfy-agent import scripts/colab/minimax_h3_character_swap/minimax_h3_character_swap.json \
     --name minimax_h3_character_swap
   ```

## Run

Identify the target person in the prompt. The bundled example mentions a blue
jacket; replace that description to match the actual source clip. Keep the H3
visual/audio/music fields in the prompt.

```bash
comfy-agent run minimax_h3_character_swap \
  --video ./source-24fps.mp4 \
  --image ./replacement-character.png \
  --104_prompt '<Video 1> is the source scene. <Picture 1> is the replacement character. Replace only the person in the blue jacket in <Video 1> with the character in <Picture 1>.

integrated_multimodal_description: [Shot 1] One continuous shot following <Video 1>. Preserve the camera, background, lighting, objects, and bystanders. Keep the replacement identity, outfit, and art style from <Picture 1>; match the target person position, pose, and movement. Do not show the reference sheet or its background.

overall_soundscape: Generate natural scene ambience; the source soundtrack need not be preserved.

non_diegetic_music: N/A' \
  --104_length 124 \
  --15_noise_seed 42 \
  --timeout-seconds 1800
```

`--video` uploads the MP4 to the core `LoadVideo.file` node; `--image` uploads
the replacement picture to `LoadImage.image`. The graph extracts the video's
frames and sends them to `ref_videos.ref_video_0`; `<Video 1>` and `<Picture 1>`
are the corresponding H3 reference tags. `--104_length` is an output frame
count on H3's supported frame grid, not a time in seconds. The source frames
should already be at 24 fps; the workflow does not resample them.

The adapter is applied at strength 1.0 to the Ref2VA model before both the
scheduler and guider. The workflow uses 20 base-model steps without a Turbo
LoRA. `ref_image_size` defaults to `match`; changing it to `max` may strengthen
identity at a substantial time and memory cost.

## Verification record and limits

On 2026-09-29, the kit completed the canonical flow on a Colab A100-SXM4-40GB
runtime. Setup downloaded and checksum-verified all 42.63 GB of model assets.
The shared launcher created a cloudflared URL; local `comfy-agent doctor`
reported `connection: OK`; `import` mapped `--video` and `--image`; and `run`
uploaded both inputs and saved an MP4 on the local machine. `verify` passed
all 10 checks: 864×480, 124 frames at 24 fps, 5.167 seconds, and a 32 kHz
stereo audio track. The 20-step run took about 24.6 minutes. Audio was
non-silent by level probe; perceptual listening was not completed.

The test used synthetic validation pair `CS005` from
[`akatz-ai/H3-Character-Swap-v1`](https://huggingface.co/datasets/akatz-ai/H3-Character-Swap-v1).
Its five-frame source scene was looped to 124 frames. The first, middle, and
last output frames showed the reference fox in place of the source person,
with the bridge and stream recognizable. The framing and background were
regenerated rather than preserved exactly. A second run with the same source,
reference, prompt, and seed but LoRA strength 0 also produced a similar fox
swap. This example proves the workflow runs, but does not establish a quality
advantage from the LoRA.

A second A100 run used the 24 fps, single-person
[forest walking clip from Mixkit](https://mixkit.co/free-stock-video/girl-walking-slowly-through-a-forest-32623/)
under its [Stock Video Free License](https://mixkit.co/license/modal/videoFree/).
The first 124 frames were paired with a single front-view illustrated character
reference. The resulting 864×480 MP4 passed all eight `verify` checks: 124
frames at 24 fps, 5.167 seconds, and 32 kHz stereo audio. Inspection of the
first, middle, and last frames and a four-frames-per-second contact sheet
showed one replacement character walking in approximately the source person's
position, with recognizable hairstyle and outfit. The forest remained
recognizable but was regenerated; the illustrated subject did not acquire
photorealistic shading or exact ground contact. Audio was non-silent by level
probe, but perceptual listening was not completed. Exact motion fidelity,
multiple people, audio quality, and a LoRA-specific benefit remain unverified.
