# MiniMax H3 on Colab A100

Verified E2E kit for MiniMax H3 text-to-video (T2V) and image-to-video (I2V)
with native stereo audio, using ComfyUI's native H3 nodes and
`comfy-agent`.

Both workflows completed the required Colab A100 E2E path on 2026-08-03:
setup, cloudflared connection, local import/run, MP4 download, frame
inspection, and non-empty audio probing all passed.

Upstream references:

- https://docs.comfy.org/tutorials/video/minimax/minimax-h3
- https://github.com/Comfy-Org/ComfyUI/pull/15224
- https://huggingface.co/Comfy-Org/MiniMax-H3
- https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE

## Important license notice

Review the full upstream MiniMax H3 license before downloading or using the
weights. Its defined **Applicable Territory excludes the European Union, the
United Kingdom, the Republic of Korea, and the United States of America**.
The upstream license also contains commercial-authorization, attribution,
output-use, and acceptable-use terms. Among them: commercial products/services
above US$20 million in yearly revenue require prior written authorization;
commercial interfaces must prominently display `MiniMax H3`; and H3 works or
outputs may not be used to improve another AI model outside the H3 derivative
family.

The setup script deliberately does not geolocate the user or block execution.
You are responsible for checking whether the location where the model is
downloaded and used—including the Colab runtime region—and the intended use
comply with the current upstream terms. Downloading or using the weights may
constitute acceptance of those terms.

## Cost and requirements

- Runtime: Colab A100 high-RAM recommended. T4/L4 are not covered by this kit.
- Model downloads: 42.47 GB decimal (about 39.55 GiB).
- Allow at least 55–60 GB of free runtime disk for models, ComfyUI, Python
  packages, caches, and outputs.
- Default output: 864x480, 124 frames at 24 fps (about 5.17 seconds), stereo
  audio at the model's native 32 kHz path.
- A fresh runtime is recommended because the setup pins a ComfyUI revision.

## Files

| File | Task | Input |
|---|---|---|
| `minimax_h3_t2v.json` | text-to-video + audio | prompt |
| `minimax_h3_i2v.json` | image-to-video + audio | first-frame image + prompt |

Both workflows use the same pruned FL2VA diffusion model. H3 treats an absent
first frame as T2V and a connected first frame as I2V.

## Setup

1. Start a fresh Colab notebook with an A100 high-RAM runtime.
2. Read the license notice above and the full upstream license.
3. Paste `01_setup.py` into one cell and run it. The four downloads are pinned
   to a model revision and verified by file size and SHA-256.
4. Paste `../02_start_comfyui.py` into the next cell and run it.
5. Read `/content/comfy_url.txt`, then connect locally:

   ```bash
   comfy-agent connect https://<id>.trycloudflare.com
   ```

## T2V

```bash
comfy-agent import ./scripts/colab/minimax_h3/minimax_h3_t2v.json \
  --name minimax_h3_t2v

comfy-agent run minimax_h3_t2v \
  --104_prompt "A cinematic night market in gentle rain. Slow tracking shot. Audio: rain, quiet crowd ambience, and soft strings." \
  --15_noise_seed 42 \
  --timeout-seconds 1800
```

Useful generated flags are `--104_width`, `--104_height`, `--104_length`,
`--9_steps`, and `--92_filename_prefix`.

## I2V

```bash
comfy-agent import ./scripts/colab/minimax_h3/minimax_h3_i2v.json \
  --name minimax_h3_i2v

comfy-agent run minimax_h3_i2v \
  --image ./first-frame.png \
  --104_prompt "Preserve the subject. Add subtle natural motion and a slow camera push-in. Audio: scene ambience and restrained music." \
  --15_noise_seed 42 \
  --timeout-seconds 1800
```

`comfy-agent import` detects the `LoadImage.image` input and creates the
`--image` upload automatically.

## Duration and resolution

`length` is a frame count, not seconds. H3 expects the `17k+5` frame grid at
24 fps. Useful values include 124 (about 5.17 s), 243 (about 10.13 s), and
362 (about 15.08 s). The upstream implementation describes roughly 124–362
frames as the trained range.

The official template caps the native canvas at 768x1344 pixels and uses
multiples of 32. Start with the bundled 864x480 defaults before increasing
resolution or duration; both materially raise VRAM and generation time.

## Direct import of official subgraph templates

`comfy-agent` can expand the official H3 templates and compatible active
(`mode: 0`) ComfyUI subgraphs. After connecting to the updated ComfyUI server,
the official `video_minimax_h3_t2v.json` and `video_minimax_h3_i2v.json` UI
templates can be passed directly to `comfy-agent import`. The importer uses the
live `/object_info` input order and stores a flattened API workflow locally. If
the server is unavailable or too old to expose an H3 node schema, import stops
with a concrete error instead of silently saving the subgraph UUID as a node
class.

The converter currently accepts active (`mode: 0`) execution nodes. Muted or
bypass modes and malformed/ambiguous boundary widgets stop with an explicit
error rather than being guessed.

## Verification record

Verified on 2026-08-03 with a Colab `NVIDIA A100-SXM4-40GB` runtime:

- `01_setup.py` completed and all four pinned model checksums passed.
- `/object_info` exposed `MiniMaxH3ImageToVideo`, `VAEDecodeAudio`,
  `CreateVideo`, and `SaveVideo`.
- Local `comfy-agent import` and `comfy-agent run` completed through the
  cloudflared tunnel for both bundled workflows.
- T2V produced 124 coherent frames at 864x480; I2V produced 124 coherent
  frames at 480x864 while preserving the supplied subject and composition.
- Both outputs were H.264 at 24 fps with 32 kHz stereo AAC audio. Local
  playback and audio-level probing confirmed non-empty audio.

## Upstream drift

The setup pins ComfyUI at `14b05228cef127ce529bc0c08660770d4af3e9a8` and
the Comfy-Org model repository at
`fd70b39279d1ae6eb214c903f53e1bec3af19a77`. Set `UPDATE_COMFYUI = True`
only for intentional compatibility testing, then rerun `/object_info` and both
workflows before changing the recorded revision.
