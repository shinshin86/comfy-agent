# MiniMax H3 on Colab A100

Starter kit for MiniMax H3 text-to-video (T2V), image-to-video (I2V), and
reference-to-video (R2V) with native stereo audio, using ComfyUI's native H3
nodes and `comfy-agent`.

T2V and I2V completed the required Colab A100 E2E path on 2026-08-03 at the
previous pinned ComfyUI revision. R2V is a **Starter**: its workflow, pinned
assets, import aliases, and graph wiring are statically tested, but it has not
completed the canonical Colab/cloudflared E2E path. The current revision also
adds `MiniMaxH3AddGuide`, so T2V and I2V must be rerun before the whole kit can
return to Verified E2E status.

Prompt writing: see [docs/minimax-h3-prompting.md](../../../docs/minimax-h3-prompting.md)
for how to structure H3 prompts (visual timeline + audio + music in one block).

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
- Default and R2V-only model downloads: 42.47 GB decimal (about 39.55 GiB).
- FL2VA + Ref2VA together: 63.44 GB decimal before the optional 1.96 GB Turbo
  LoRA. Allow at least 75–80 GB of free runtime disk when keeping both model
  families; the default single-family setup still needs about 55–60 GB.
- Default output: 864x480, 124 frames at 24 fps (about 5.17 seconds), stereo
  audio at the model's native 32 kHz path.
- A fresh runtime is recommended because the setup pins a ComfyUI revision.

## Files

| File                  | Task                       | Input                                      |
| --------------------- | -------------------------- | ------------------------------------------ |
| `minimax_h3_t2v.json` | text-to-video + audio      | prompt                                     |
| `minimax_h3_i2v.json` | image-to-video + audio     | first-frame image + prompt                 |
| `minimax_h3_r2v.json` | reference-to-video + audio | reference image + reference audio + prompt |

T2V and I2V use the pruned FL2VA diffusion model. R2V uses the separate pruned
Ref2VA diffusion model; the text encoder and two VAEs are shared.

## Setup

1. Start a fresh Colab notebook with an A100 high-RAM runtime.
2. Read the license notice above and the full upstream license.
3. Choose the model-family toggles at the top of `01_setup.py`, then paste it
   into one cell and run it. Every enabled download is pinned to a model
   revision and verified by file size and SHA-256.
4. Paste `../02_start_comfyui.py` into the next cell and run it.
5. Read `/content/comfy_url.txt`, then connect locally:

   ```bash
   comfy-agent connect https://<id>.trycloudflare.com
   ```

The defaults preserve existing behavior:

```python
DOWNLOAD_FL2VA = True
DOWNLOAD_REF2VA = False
DOWNLOAD_REF2V_TURBO_LORA = False
```

For an R2V-only runtime, set `DOWNLOAD_FL2VA = False` and
`DOWNLOAD_REF2VA = True`. Set both model-family toggles to `True` only when the
same runtime must serve all three workflows. The Turbo toggle only downloads
the pinned LoRA; the bundled R2V workflow remains the 20-step base graph.

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

## R2V (reference image + reference audio)

Set up a Ref2VA runtime as described above, then import and run:

```bash
comfy-agent import ./scripts/colab/minimax_h3/minimax_h3_r2v.json \
  --name minimax_h3_r2v

comfy-agent run minimax_h3_r2v \
  --image ./portrait.png \
  --audio ./voice.wav \
  --104_prompt "<Picture 1> defines the subject's identity and appearance. <Audio 1> provides the vocal performance and timing; synchronize the subject's mouth to it.

integrated_multimodal_description: [Shot 1] Cinematic medium close-up of the subject from <Picture 1>. Preserve the face, hair, clothing, and framing. The subject (S1) faces the camera and says: <d>[Japanese] ここに実際の台詞を入れる。</d> Match the delivery and lip timing to <Audio 1>. The camera remains steady. No subtitles or on-screen text.

overall_soundscape: Use the vocal performance referenced by <Audio 1>; no added environmental noise.

non_diegetic_music: N/A" \
  --104_length 124 \
  --15_noise_seed 42 \
  --timeout-seconds 1800
```

`comfy-agent import` creates the required `--image` and `--audio` uploads.
Generated aliases include `--prompt`, `--width`, `--height`, and `--length`;
the canonical node flags remain `--104_prompt`, `--104_width`,
`--104_height`, and `--104_length`. The dedicated `--seed 42` run option also
targets `15.noise_seed`, so it is interchangeable with `--15_noise_seed 42`.

References are tagged in connection order. This workflow has one image and one
standalone audio input, so use `<Picture 1>` and `<Audio 1>` and state the role
of each on the first line. Keep a blank line before the three H3 fields. Put
spoken dialogue or lyrics in the timeline as `(S1)` plus
`<d>[Language] ...</d>`.

Ref2VA accepts up to 9 images, 3 videos, and 3 standalone audio clips. Each
audio clip must be 2–15 seconds and their combined duration must not exceed 15
seconds. For songs, use a vocal-only stem when possible. Match `length` to the
audio duration so the mouth-performance and video timelines have the same
budget. H3 regenerates the output audio from the reference; it does not preserve
the original waveform. If the exact source recording is required, replace the
generated track with the original audio in a post-processing step.

The bundled graph intentionally exposes one image. A second `LoadImage` would
be imported as another required upload (`--image-2`), which would break the
minimal `--image` + `--audio` call. Multi-image identity/keyframe support is a
future workflow variant. `MiniMaxH3AddGuide` is available in the pinned
ComfyUI revision but is not used by this base R2V graph.

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

Previously verified on 2026-08-03 with a Colab `NVIDIA A100-SXM4-40GB`
runtime and ComfyUI `14b05228cef127ce529bc0c08660770d4af3e9a8`:

- `01_setup.py` completed and all four pinned model checksums passed.
- `/object_info` exposed `MiniMaxH3ImageToVideo`, `VAEDecodeAudio`,
  `CreateVideo`, and `SaveVideo`.
- Local `comfy-agent import` and `comfy-agent run` completed through the
  cloudflared tunnel for both bundled workflows.
- T2V produced 124 coherent frames at 864x480; I2V produced 124 coherent
  frames at 480x864 while preserving the supplied subject and composition.
- Both outputs were H.264 at 24 fps with 32 kHz stereo AAC audio. Local
  playback and audio-level probing confirmed non-empty audio.

Not yet verified at the current revision:

- `01_setup.py` with `DOWNLOAD_REF2VA = True` on Colab A100.
- Local-Mac `doctor` / import / run through the cloudflared tunnel for R2V.
- R2V output duration, non-empty audio, lip closure during silence, mouth
  opening on dense syllables, and reference-image identity retention.
- T2V and I2V regression runs after the ComfyUI revision change.

## Upstream drift

The setup pins ComfyUI at `e01fb4c56b7a88149d469b99cbbfe3223d715054`
and the Comfy-Org model repository at
`4cc1d817b6184899b41293954329f576cb5ae86b`. The previous ComfyUI revision
already exposed `MiniMaxH3ReferenceToVideo`; this revision is the minimal bump
that also exposes `MiniMaxH3AddGuide`. Because the bump changes H3 sampling
internals, rerun T2V, I2V, and R2V before marking the kit Verified E2E. Set
`UPDATE_COMFYUI = True` only for intentional compatibility testing, then rerun
`/object_info` and every workflow before changing the recorded revision.
