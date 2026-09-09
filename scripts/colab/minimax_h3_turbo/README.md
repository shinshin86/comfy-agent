# MiniMax H3 768p Turbo on Colab

**Starter — A100 T2V/I2V E2E paths measured; audio listening/quality acceptance pending.**
See [A100 validation results](VERIFICATION.md): warm T2V 74–75 seconds, I2V
82–86 seconds through server MP4 save. G4 remains untested.
This separate kit adds LightX2V's FL2VA 768p four-step adapter to the existing
H3 INT8 ConvRot base. It supports T2V and first-frame I2V with jointly generated
stereo audio. It does not modify ordinary H3 or FastH3 presets/checkouts.

## Configuration

| Component | Default |
| --- | --- |
| GPU | A100 40GB tested; G4 / RTX PRO 6000 Blackwell 96GB untested |
| Base | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` |
| Adapter | `minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors`, strength 1 |
| Sampling | 4 NFE, Euler, simple, BasicGuider / CFG 1 equivalent |
| Sigma shifts | video 6, audio 3; applied to both scheduler and guider |
| Canvas / duration | 1344x768, 124 frames, 24 fps, approximately 5.17 seconds |
| Text encoder | Existing Qwen3-VL-32B NVFP4 AWQ |
| Video / audio VAE | Existing FP16 / FP32 weights |
| Attention | SageAttention v2.2.0, pinned source build |
| Compile / CUDA Graph | No explicit activation |
| Memory | `--highvram` on GPUs with at least 80 GiB; automatic management otherwise |

Steps alone do not make base H3 Turbo. Keep the adapter, Euler and the **6/3**
shifts together. Do not substitute the older 544p or Ref2VA adapter. No VSA,
FastH3 checkpoint, reference audio, Motion, Guide or SNS combination is supplied.
Four steps need not match ordinary H3 quality, especially motion and speech.

## Setup

Use a **fresh** GPU/high-RAM Colab runtime. G4 availability depends on the account
and capacity. No GPU allocation, Drive mount or persistent global cache is automated.
The setup uses `/content/comfy-agent-h3-turbo/ComfyUI`, independent of the
notebook's working directory. It refuses an occupied server port or a modified
existing checkout. Python dependencies remain runtime-wide, so separate paths do
not make it safe to install alongside a running kit.

1. Run `01_setup.py` as the first cell.
2. Run **this directory's** `02_start_comfyui.py` as the second cell.
3. Copy the printed `comfy-agent connect https://...` command to the local host.

`comfy-agent colab kit minimax_h3_turbo --json` returns both dedicated cell paths.
Do not use the shared launcher: it does not enable SageAttention. Do not rerun
the launcher while its server is running.

Setup installs official PyTorch 2.11.0 CUDA 13.0 wheels and the CUDA 13.0 compiler,
and requires BF16 and at least approximately 40GB VRAM. The pinned ComfyUI
revision disables optimized kitchen kernels with Colab's default CUDA 12.8.
It builds Sage against the matching torch/CUDA/GPU,
then runs a BF16 attention kernel self-test **before** model downloads. A source
build needs a compatible CUDA toolkit/compiler, Ninja and sufficient system RAM.
Commands print progress every 30 seconds and retain a runtime log at
`/content/h3_turbo_setup.log`. A tested Sage build is reused only for the same
GPU/torch/CUDA configuration, and its kernel self-test runs again.
A failure is an error, not permission to substitute another attention backend.
The self-test does not prove the full H3 graph or LoRA is correct.

Model downloads total **44.43 GB decimal**, including the 1.956 GB LoRA. Allow
at least 90 GB free disk including CUDA wheels and build/cache space; sampled A100 peak was 40,432 MiB including cache; retain automatic offload.
Setup budget: roughly 35 minutes, not a measured promise. Every weight is pinned
by revision, size and SHA-256. Valid files are reused within the same VM; runtime
reset removes them. Model download/setup are not per-video latency.

## Local generation after setup

```bash
comfy-agent import scripts/colab/minimax_h3_turbo/minimax_h3_turbo_t2v.json --name minimax_h3_turbo_t2v
comfy-agent import scripts/colab/minimax_h3_turbo/minimax_h3_turbo_i2v.json --name minimax_h3_turbo_i2v
comfy-agent doctor --preset minimax_h3_turbo_t2v --json
comfy-agent doctor --preset minimax_h3_turbo_i2v --json
comfy-agent run minimax_h3_turbo_t2v --15_noise_seed 42 --timeout-seconds 1800
comfy-agent run minimax_h3_turbo_i2v --image /path/to/first-frame.png --15_noise_seed 43 --timeout-seconds 1800
```

Use `--104_prompt` for an H3 three-field prompt; see
[the H3 prompting guide](../../../docs/minimax-h3-prompting.md). Existing bundled
smoke prompts are retained. Outputs are saved locally under
`.comfy-agent/outputs/<preset>/`. Keep 768p and 124 frames for the first test.

## Verification procedure and remaining checks

The canonical [E2E path](../../../CLAUDE.md) passed on A100; see the measured
[report](VERIFICATION.md). Listening/quality acceptance and G4 testing remain.
For reproduction or broader validation:

- Record GPU name, VRAM, power limit, Python, torch/CUDA, Sage version and ComfyUI
  revision. Check the log reports Sage, with no fallback/error messages.
- Run both local doctor/import/run paths above through cloudflared. Check LoRA
  application logs for missing/unmatched keys and confirm the 6/3 schedule.
- Measure first generation separately from warm runs. After one warmup, generate
  at least five different seeds and changed prompts; identical cached outputs
  are not a generation benchmark.
- Report ComfyUI's `Prompt executed in ... seconds` as **server execution through
  MP4 save**, including prompt encoding and any in-execution model loading.
  Do not label this pure diffusion. Exclude setup/downloads and Mac transfer from
  the speed target; retain local CLI elapsed time as separate transport evidence.
- If separating model load, prompt encode, diffusion, AV decode and encode, use
  CUDA synchronization around measured GPU stages in a separate profiling run.
  Do not infer stage timings from the short loader-node timings alone.
- Run `comfy-agent verify <output-directory> --expect-kind video --min-duration 5 --json`.
  Inspect extracted frames and listen to the audio: subject identity, hands,
  rapid motion, unwanted text, intelligible speech and AV synchronization.
- Compare ordinary 20-step H3 and Turbo on matching inputs/settings in a controlled
  validation runtime. Baseline uses no adapter and its original 12/3 schedule.
  Keep the existing ordinary kit unchanged.

Success means usable T2V/I2V with audio and a measured speed improvement, **not a
hard 39-second threshold**. Record failures and leave Starter status until both
workflows complete the canonical path and perceptual checks. Measured timings apply only to the tested A100 configuration and prompts;
local tests alone do not establish speed or quality.

## Upstream pins and licenses

- [ModelTC model specifications](https://github.com/ModelTC/Minimax-H3-Turbo)
- [ComfyUI adapter instructions](https://github.com/ModelTC/Minimax-H3-Turbo/blob/main/COMFYUI_SETUP_AND_INFERENCE.md)
- [Adapter repository](https://huggingface.co/lightx2v/Minimax-h3-Turbo):
  `2f015e66b37c585cea9dc4ae6f1850ea8788e742`
- [SageAttention](https://github.com/thu-ml/SageAttention):
  `eb615cf6cf4d221338033340ee2de1c37fbdba4a` (v2.2.0)
- ComfyUI: `e01fb4c56b7a88149d469b99cbbfe3223d715054`
- Base assets: `4cc1d817b6184899b41293954329f576cb5ae86b`

Review the [MiniMax H3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE),
including Applicable Territory, commercial authorization, attribution and output-use
terms, and the Colab runtime region. The setup does not geolocate or block by
region. Adapter/code licenses do not replace the base model's terms.
