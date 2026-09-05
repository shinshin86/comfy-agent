# H3 Colab generation smoke tests

Run date: 2026-09-05. These are generation smoke tests, not a quality benchmark
or a runtime-reset/recovery certification. No Google Drive access was granted.

## Environment and path

Colab A100-SXM4 40 GB, high-RAM runtime; Python 3.13, PyTorch 2.11.0+cu128.
ComfyUI `e01fb4c56b7a88149d469b99cbbfe3223d715054`, comfy-kitchen 0.2.31,
comfy-aimdo 0.4.13. The SNS profile installer completed on an empty runtime.
Later profiles used separate checkouts and hardlinks to downloaded weights;
the actual installers still ran and checked every model checksum.

Each generation used the local macOS CLI, an imported preset, the shared
launcher and a cloudflared tunnel. MP4s were downloaded locally, probed with
`comfy-agent verify`, and inspected as extracted frame contact sheets. Audio
streams were checked for format and non-silence. Artifacts and runtime logs are
kept outside version control; no runtime URLs, credentials or personal reference
images belong in this report.

## Completed samples

All samples below produced H.264 video at 24 fps with 32 kHz stereo audio.
Durations in the final column are CLI job durations (including model loading
and server work), not isolated sampler timings. Sequential runs had different
cache states, so they must not be used to rank speed.

| Preset | Frames / duration | Canvas | Job seconds |
| --- | --- | --- | ---: |
| Ordinary H3 T2V | 124 / 5.167 s | 864x480 | 338.6 |
| Ordinary H3 I2V | 124 / 5.167 s | 864x480 | 284.9 |
| SNS T2V, strength 0.75 | 124 / 5.167 s | 864x480 | 263.9 |
| SNS I2V, strength 0.75 | 124 / 5.167 s | 864x480 | 347.6 |
| Image Guide, last frame | 56 / 2.334 s | 864x480 | 126.4 |
| Audio Guide, frame 0 | 56 / 2.334 s | 864x480 | 121.9 |
| Image + Audio Guide, frame 0 | 56 / 2.334 s | 864x480 | 126.2 |
| Motion T2V clip 1 | 124 / 5.167 s | 864x480 | 273.5 |
| Motion T2V clip 2 | 102 / 4.250 s | 864x480 | 314.1 |
| VDN T2V, 8 steps | 124 / 5.167 s | 864x480 | 208.0 |

The ordinary and Guide graphs were exercised in the isolated SNS checkout.
This confirms those graphs still generate with the pinned shared base; it is
not a separate fresh installation test of every original H3 profile. Guide
length 52 was rounded by H3 to the 17k+5 grid (56 frames).

## Observations and limits

The coffee-cup samples showed recognizable cups, steam, sunlight and modest
camera motion. I2V preserved the reference composition. SNS applied 208 LoRA
patches without an unmatched-key warning. SNS was visibly different, but did
not improve every requirement: its T2V sample included a background silhouette
despite a no-people prompt. Ordinary T2V included an unrequested phone, apparently
from the phrase "smartphone close-up". No universal quality gain is claimed.

A test-preparation interrupt stopped the SNS I2V server once; that interrupted
job was excluded and the successful rerun is reported above. Motion's first
submission exposed a string-enum CLI coercion issue before sampling; the chain
helper now preserves the bundled context defaults instead of overriding them
as numeric-looking CLI values.

Motion generated two clips with 22 video frames and 24 audio context frames.
The second output was trimmed to 102 frames, and both clips preserved the cup
and table composition. The local helper assembled them into a 226-frame
(9.417-second video stream) MP4; its AAC stream was 9.455 seconds and the
container duration was 9.459 seconds. The concat path does not guarantee
sample-exact AAC boundaries. This is a short continuation smoke test, not a long-chain
continuity or restart guarantee.

VDN produced a recognizable steaming cup without a visible catastrophic artifact.
The port logged 51 AdaLN adapter deltas skipped on the pruned curve base in
merge mode. It merged 100 default and 204 Turbo weights across 50 blocks,
so this is not a full-equivalence result. Server total was 203.59 seconds;
sampler progress reported about 120 seconds after its initialization reset.
Peak VRAM was not continuously instrumented; sampled readings are not a peak
measurement. There is no controlled speed or quality comparison.

Untested scope includes original R2V regression, Motion R2V, intermediate image
guide positions, all-feature combinations, other GPUs, long chains and runtime
reset/recovery. Kit-level Starter labels remain until their full verification
requirements are met.
