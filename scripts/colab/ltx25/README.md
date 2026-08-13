# LTX-2.5 on Colab A100

Verified E2E kit for LTX-2.5 text-to-video (T2V), image-to-video (I2V), and
first/last-frame-to-video (FLF2V), with synchronized generated audio, using
native ComfyUI nodes and `comfy-agent`.

**Verified E2E on 2026-08-13 with a Colab NVIDIA A100-SXM4-40GB runtime.**
All three official workflows passed the canonical Colab + cloudflared + local
Mac `comfy-agent import` / `run` path, including local MP4 retrieval and
visual/audio inspection.

Upstream references:

- https://docs.comfy.org/tutorials/video/ltx/ltx-2-5
- https://github.com/Comfy-Org/ComfyUI/pull/15499
- https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.32.0
- https://huggingface.co/Lightricks/LTX-2.5
- https://github.com/Lightricks/LTX-2

## Access and license requirements

The official LTX-2.5 model repository is gated. Before running the setup:

1. Open https://huggingface.co/Lightricks/LTX-2.5 and accept the model terms.
2. Create a Hugging Face **Read** token. A fine-grained token must be allowed
   to read gated repositories.
3. In Colab, open **Secrets**, add the token under the name `HF_TOKEN`, and
   grant the notebook access.

Do not paste the token into a notebook cell. `01_setup.py` reads it through
`google.colab.userdata`, uses it only for gated Hub requests, and never prints
it.

LTX-2.5 uses the **LTX-2.x Community License Agreement**, not Apache-2.0 or
MIT. Review the complete current terms before downloading or using the
weights. Among the material terms in the August 11, 2026 license:

- entities with aggregate annual revenue of at least USD 10 million need a
  paid license for commercial use, except for the defined non-commercial uses;
- outputs and model use are subject to the Acceptable Use Policy and disclosure
  requirements, including intelligible disclosure when generated content is
  disseminated;
- safety, watermarking, provenance, or disclosure mechanisms must not be
  removed or circumvented;
- products or services that directly compete with Lightricks offerings require
  a separate commercial license.

The setup script does not decide whether a particular use is licensed. The
person or entity downloading and using the model is responsible for reviewing
the current upstream agreement and intended use.

## Cost and requirements

- Runtime: fresh Colab A100 high-RAM runtime recommended. T4 and L4 are not
  covered by this verification record.
- Model downloads: **49.99 GB decimal** (about 46.56 GiB).
- Allow at least 65-70 GB of free runtime disk for models, ComfyUI, packages,
  Hub metadata, and outputs.
- Default official workflows target approximately 1280x720, 5 seconds, 24 fps,
  and synchronized audio. The verified runs produced 1280x704 because the
  resolution selector rounds to a 32-pixel multiple.
- The setup pins and SHA-256 verifies the ComfyUI v0.32.0 source archive and
  therefore is not additive to an arbitrary existing runtime.

The default model is the distilled int8 ConvRot transformer. T2V and I2V use a
two-stage path with the spatial latent upscaler. FLF2V uses the same transformer,
text encoders, and VAEs without the upscaler.

## Files

| File                      | Task                              | Inputs                     | Status       |
| ------------------------- | --------------------------------- | -------------------------- | ------------ |
| `video_ltx2_5_t2v.json`   | text-to-video + audio             | prompt                     | Verified E2E |
| `video_ltx2_5_i2v.json`   | image-to-video + audio            | first-frame image + prompt | Verified E2E |
| `video_ltx2_5_flf2v.json` | first/last-frame-to-video + audio | two images + prompt        | Verified E2E |

The JSON files are the official Comfy-Org templates pinned at workflow
templates revision `96a8cab7fa7b4c201910cd59cdd94dcc3c2d2deb`.
They use native ComfyUI subgraphs. Import them only after connecting to the
pinned ComfyUI runtime because `comfy-agent import` uses live `/object_info` to
flatten the subgraphs safely.

## Setup

1. Start a fresh Colab notebook with an A100 high-RAM runtime.
2. Complete the Hugging Face access and Colab Secret steps above.
3. Paste `01_setup.py` into one cell and run it.
4. Paste `../02_start_comfyui.py` into the next cell and run it.
5. Poll `/content/comfy_url.txt`, then connect locally:

   ```bash
   comfy-agent connect https://<id>.trycloudflare.com
   ```

## Text to video

```bash
comfy-agent import ./scripts/colab/ltx25/video_ltx2_5_t2v.json \
  --name ltx25_t2v

comfy-agent run ltx25_t2v \
  --405:376_value "A paper boat crosses a rain puddle. Slow tracking shot. Rainfall and small bells are heard." \
  --405:339_noise_seed 42 \
  --timeout-seconds 1800
```

## Image to video

```bash
comfy-agent import ./scripts/colab/ltx25/video_ltx2_5_i2v.json \
  --name ltx25_i2v

comfy-agent run ltx25_i2v \
  --image ./first-frame.png \
  --398:376_value "Use the provided image as the first frame. The subject turns toward the window as the camera slowly pushes in. Quiet room ambience is heard." \
  --398:339_noise_seed 42 \
  --timeout-seconds 1800
```

## First and last frame to video

```bash
comfy-agent import ./scripts/colab/ltx25/video_ltx2_5_flf2v.json \
  --name ltx25_flf2v

comfy-agent run ltx25_flf2v \
  --image ./first-frame.png \
  --image-2 ./last-frame.png \
  --251:252_value "Move smoothly from the supplied first frame to the supplied final frame while the camera arcs left. Wind and distant traffic are heard." \
  --251:196_noise_seed 42 \
  --timeout-seconds 1800
```

Run `comfy-agent preset-show <name>` after import to inspect every generated
parameter and upload flag. The IDs above are stable for the bundled pinned
templates, but a refreshed upstream template can use different IDs.

Outputs are downloaded below `.comfy-agent/outputs/<preset>/<timestamp>/`.

## Verification evidence

The 2026-08-13 A100 verification observed the following in one runtime:

- `01_setup.py` completed with gated access, size-verified model files, pinned
  ComfyUI v0.32.0, and cloudflared 2026.7.2.
- `../02_start_comfyui.py` exposed a usable trycloudflare URL and local
  `comfy-agent doctor` reported `connection: OK`.
- T2V, I2V, and FLF2V all imported through live `/object_info`, passed
  preflight with no missing nodes or models, and downloaded one MP4 each to
  the local `.comfy-agent/outputs/` tree.
- Successful ComfyUI execution times were 132.60 s (T2V), 117.90 s (I2V), and
  151.32 s (FLF2V), excluding local upload/download and tunnel overhead.
- Every MP4 was 1280x704, 121 frames at 24 fps (5.0417 s), with a 48 kHz
  stereo AAC track lasting 5.01 s.
- T2V showed the requested paper boat moving across rippled water. The requested
  bell sound also appeared visually as small bell-shaped objects near the end,
  which is a prompt-adherence caveat rather than a pipeline failure.
- I2V began from the supplied cybernetic portrait and visibly raised the
  subject's gaze during a push-in. FLF2V began from the supplied back-of-hand
  image and ended on the supplied open palm with a blue energy crystal.
- Extracted start/middle/end frames were inspected, audio streams were confirmed
  non-empty with `ffprobe`/`astats`, and all three files played successfully.
