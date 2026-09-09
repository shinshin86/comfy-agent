# A100 validation — 2026-09-09 JST

A100実機で、768p・約5秒のT2V／I2V生成とローカル保存を確認しました。
Colab内の生成・保存は、連続T2Vが約74〜75秒、I2Vが約82〜86秒です。
同一条件のボール動画では、通常20ステップの約285秒に対してTurboは約74秒でした。
CUDA高速演算の無効化とSageAttentionのヘッダー参照を修正済みです。
ただし、細かな動作回数の再現性に低下した例があり、音声の聴取・台詞・口の同期は
未確認です。このためStarter表記を維持しています。G4と39秒生成は未検証です。

The local Mac CLI → cloudflared → Colab ComfyUI → local MP4 path passed for
both T2V and first-frame I2V at **1344x768, 124 frames, 24 fps**. All six final
Turbo outputs contain H.264 video and 32 kHz stereo AAC audio, lasting 5.167 s.
The kit remains **Starter pending audio listening/quality acceptance**. G4 is
not tested. This report does not establish a 39-second result.

## Tested configuration

- NVIDIA A100-SXM4-40GB, driver 580.82.07; Python 3.13.15.
- PyTorch 2.11.0+cu130, torchvision 0.26.0+cu130, torchaudio 2.11.0+cu130.
- CUDA compiler 13.0.88; SageAttention 2.2.0 at the pinned revision in setup.
- ComfyUI 0.33.0 at `e01fb4c56b7a88149d469b99cbbfe3223d715054`;
  comfy-kitchen 0.2.31, comfy-aimdo 0.4.13.
- INT8 ConvRot FL2VA base, Qwen3-VL NVFP4 AWQ text encoder, original AV VAEs,
  768p Turbo BF16 LoRA strength 1; same pinned assets as the kit.
- Four steps, Euler/simple, BasicGuider, video/audio shifts 6/3.
- Sage enabled; kitchen CUDA backend available and enabled. No explicit
  torch.compile/CUDA Graph or prompt cache was added.
- Automatic dynamic VRAM/offload on A100; not `--highvram`.

The log records **208 attached model patches** with Turbo, and no unmatched
LoRA-key warnings or OOM errors in the six final Turbo runs.

## Measured latency

**Server time** is ComfyUI's `Prompt executed in ... seconds`: execution through
MP4 save, including prompt encoding and any lazy model loading. Setup, weight
downloads and transfer to the Mac are excluded. It is not pure diffusion time.
**CLI wall time** includes preflight, upload where needed, submission, execution,
retrieval and local saving. These are single runs, not service-level guarantees.

| Run | Input / seed | Server seconds | CLI wall seconds |
| --- | --- | ---: | ---: |
| First after CUDA 13 server restart | Red lantern T2V / 42 | 86.23 | 110.54 |
| Warm 1 | Blue lantern T2V / 43 | 74.52 | 100.30 |
| Warm 2 | Woman waving, Japanese speech requested / 44 | 74.30 | 95.62 |
| Warm 3 | Bouncing tennis ball T2V / 45 | 74.27 | 97.84 |
| Warm 4 | Red lantern first-frame I2V / 46 | 86.42 | 113.92 |
| Warm 5 | Same reference, changed motion/camera prompt / 47 | 82.08 | 104.35 |

Warm T2V: **74.27–74.52 s**. I2V: **82.08–86.42 s**. Across the five changed
prompt/seed warm runs, median server time is **74.52 s** and median CLI wall time
is **100.30 s**. Identical cached output was not used as a benchmark.

The first restarted server can reuse OS file caches populated by earlier work;
it is not a fresh-VM download-and-load benchmark.

### Stage observations, not synchronized GPU profiling

Local WebSocket node transitions give these wall-time intervals. GPU work can
be asynchronous and loader nodes defer work, so do not present these as isolated
model load or CUDA-event durations.

| Stage | First CUDA 13 T2V | Warm T2V range | First I2V |
| --- | ---: | ---: | ---: |
| Conditioning (node 104; includes image encoding for I2V) | 5.00 s | 0.41–0.53 s | 7.75 s |
| Sampler (node 14, including lazy loading) | 56.19 s | 52.62–52.96 s | 57.39 s |
| Audio VAE decode (23) | 1.06 s | 0.10–0.30 s | 0.28 s |
| Video VAE decode (10) | 16.23 s | 14.73–15.02 s | 14.48 s |
| MP4 save/encode (92) | 6.10 s | 5.57–6.19 s | 6.17 s |

H3 generates audio latents jointly inside sampling; there is no separate audio
model generation call. Sampler progress timers adjust their initialization
accounting, so their printed per-step/total values are not substituted for the
server metric. Pure diffusion **A**, and strictly isolated inference + decode +
encode **B**, still require a separate CUDA-synchronized profiling run. The
reported server metric includes prompt/load overhead; CLI wall time measures **C**.

## Controlled ordinary-H3 comparison

After the five warm runs, the ball prompt and seed 45 were generated on the same
CUDA 13 server with LoRA strength 0, 20 steps, `res_multistep`/simple and the
ordinary video/audio shifts 12/3. Resolution, duration, base weights, TE, VAEs,
attention and memory policy stayed the same. The log confirms **0 attached
patches** and 20 sampling steps. Only per-run CLI overrides were used; ordinary
kit files and the Turbo preset defaults were not edited.

| Ball test | Server seconds | CLI wall seconds |
| --- | ---: | ---: |
| Turbo 4 steps | 74.27 | 97.84 |
| Ordinary 20 steps | 285.37 | 305.57 |

This pair gives **3.84x faster server execution (~74% less time)** with Turbo.
It is one matched prompt/seed pair, not a broad benchmark. The ordinary output
also begins with an empty frame, then the ball enters from above. Its position
trace has three dominant bounces before settling, whereas Turbo has more
repeated bounces: fine action-count control is worse in this Turbo example.
The camera/framing and lighting also differ. Audio in the ordinary output is
-31 dBFS mean / -0.4 dBFS peak; listening and impact synchronization were not
verified for either. This evidence supports keeping ordinary H3 available for
quality-sensitive work rather than replacing it with Turbo.

## Issues found and fixes

1. Colab's original PyTorch 2.11.0+cu128 let ComfyUI start but **disabled kitchen's
   optimized CUDA backend**. The original first T2V took 217.58 s server / 243.19 s
   CLI. The same seed/prompt after the CUDA 13 fix took 86.23 / 110.54 s. This is
   about 2.5x faster server execution in this pair, with different file-cache
   conditions; it is not an isolated kernel-only speedup experiment.
2. Minimal CUDA compiler installation did not expose `cusparse.h` to Sage.
   The matching NVIDIA wheel headers already existed under `nvidia/cu13/include`.
   Explicit include flags fixed the build without mixing CUDA 12 headers into it.
3. Inherited subprocess output was invisible through the notebook bridge. Setup
   now stores a log and prints command progress. Successful builds are keyed to
   the GPU/torch/CUDA probe and kernel-tested again before reuse. File hash checks
   also report progress. The final setup rerun reused weights and the tested
   build and completed successfully (the last hash-progress-only edit was
   syntax-checked locally).
4. The first tunnel had a Mac DNS lookup failure although DNS queries and HTTPS
   to the resolved address worked. A test-process-only fallback resolver was
   used temporarily; it preserved hostname/TLS verification. The new tunnel
   subsequently passed an **ordinary CLI doctor with no resolver preload**.
   No global DNS, hosts file or browser settings were changed.

## Memory

One-second `nvidia-smi` sampling across the final Turbo session observed a peak
of **40,432 MiB (~39.48 GiB)**. This includes process allocations/cache and is not
`torch.cuda.max_memory_allocated()`. A100 dynamic memory management matters:
this is not evidence that all components can be kept resident on a 40GB card.
The tested six final runs completed without OOM. G4's larger VRAM is promising,
but its actual speed, build and quality remain unverified.

## Output quality and limits

- Inspected six extracted frames per final clip, including the first and last.
  Lanterns, porch structure and the woman's identity stayed coherent in those
  frames. The woman visibly waves; I2V preserves the supplied lantern/porch.
  No blank/NaN output or gross visual corruption was observed.
- The ball test fails fine-grained instruction following: the first frame is
  empty and the ball enters from above; it bounces more often than the requested
  three times. A higher-rate color-position trace corroborates repeated vertical
  motion. Attractive frames are not proof of correct action counts or physics.
- All files passed `comfy-agent verify --expect-kind video --min-duration 5`.
- Audio tracks are present, but their levels vary considerably. Lantern clips
  have mean levels around -51 to -56.5 dBFS; the speech-request clip is -39 dBFS
  mean / -19.8 dBFS peak; the ball clip peaks at -0.1 dBFS. No gain normalization
  was applied to conceal this. Quiet ambience is not a useful speech-quality test.
- **Listening, Japanese transcript accuracy, lip-sync and precise impact/audio
  synchronization remain unverified.** Do not treat the adapter as quality-equal
  to ordinary H3 or use these tests to promise dependable dialogue.

## Reproduce / evidence

Use the kit's setup and dedicated launcher, then the local import/doctor/run
commands in [README](README.md). Keep the dimensions and duration unchanged;
use different prompts and seeds for warm measurements. Use automatic memory
management on A100. No server-direct submission or Colab-local CLI substitutes
were used.

Raw job JSON, prompts, wall timers, verification metadata, frame sheets and
logs are retained locally under the ignored `.comfy-agent/h3-turbo-e2e/` and
`.comfy-agent/outputs/minimax_h3_turbo_{t2v,i2v}/` directories. They are not
published because runtime connection information and local paths belong there.
