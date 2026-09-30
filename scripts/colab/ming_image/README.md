# Ming-Image-0.1-Design on Colab

Partial: opaque text-to-image passed Colab E2E on A100 40GB at 1024 and 2048.
A 2048 transparent cutout passed alpha and visual checks; both 1024 cutout
trials failed. Japanese headings contained errors. See the verification record
below.

## Scope and runtime

This kit uses native ComfyUI v0.38.0 with the Design INT8 convrot diffusion
model, Ling-mini-2.0 INT8 convrot encoder and BF16 RGBA VAE. No custom nodes,
prompt-enhancer model, Design-Layer checkpoint or Google Drive mount are needed.
The ComfyUI commit and model revision are pinned in `01_setup.py`; downloads
are checked against upstream sizes and SHA-256 hashes.

Start with an approved A100 40GB+ high-RAM Colab runtime, 1024x1024, batch 1.
Plan for 64GB+ system RAM and 60GB free disk. These are conservative planning
values, not measured minimums or a guarantee that inference will fit. The setup
stops before model downloads below 38 GiB usable GPU memory, 48 GiB RAM, or
remaining weight volume plus 20GB free disk. A different or modified existing
ComfyUI checkout is rejected; use a fresh runtime instead of resetting it.

The default weights total **25.94 GB (decimal)**:

| Location under `ComfyUI/models/` | File | GB |
|---|---|---:|
| `diffusion_models/` | `ming_image_0.1_design_int8_convrot.safetensors` | 6.175 |
| `text_encoders/` | `ming_image_0.1_ling_mini_2.0_int8_convrot.safetensors` | 19.508 |
| `vae/` | `ming_image_vae_bf16.safetensors` | 0.254 |

The original BF16 deployment was validated on one GPU with at least **80 GiB**
memory. That requirement does not establish the INT8 minimum. This INT8 kit passed
opaque image generation on A100 40GB; T4/L4 and W4A8 are untested. A smaller
checkpoint file is not a measurement of peak VRAM. Long JSON prompts, MoE
encoding and 2K decoding can still exhaust GPU or system memory.

## Run after approval

Use `colab-mcp` (`colab-mcp-go`) with the intended browser profile and Google
account, and let the human approve its connection. Honor an existing approved
connection instead of asking again. Obtain approval for large downloads and
paid-GPU choices before setup. Agree on image acceptance criteria before
generating. Do not use generic browser automation when Colab MCP is unavailable.

1. Run `01_setup.py` in the approved runtime.
2. Run the shared `../02_start_comfyui.py`; read `/content/comfy_url.txt`.
3. On the **local CLI host**, use the printed connection command, then:

   ```bash
   comfy-agent doctor --json
   comfy-agent import scripts/colab/ming_image/ming_image_design_t2i.json --name ming_image_design_t2i
   comfy-agent run ming_image_design_t2i --seed 42 --timeout-seconds 1800
   ```

The PNG is downloaded to the local
`.comfy-agent/outputs/ming_image_design_t2i/<timestamp>/`.
Use `comfy-agent verify <run-dir> --expect-kind image --expect-count 1 --json`,
then inspect the original image and verification sheet. Record setup completion,
tunnel reachability, local import/run, downloaded output and visual inspection
before marking a runtime verified. This kit remains Partial because the
1024 transparent-output cases have not passed.

## Prompt and sampling controls

The API graph follows the official template with the enhancer disabled:
`CLIPTextEncode` / `BasicGuider` (CFG 1) / Euler / simple / 12 steps,
resolution-dependent `ModelSamplingFlux`, `VAEDecode` and PNG `SaveImage`.
Shared width/height primitives update both the sampling shift and latent canvas.

After import, `--prompt`, `--steps`, `--width`, `--height` and `--seed` work.
There is no negative prompt or adjustable CFG in this single-conditioning path.
Start at 1024. Only after a successful inspected run, try 2048x2048 or a
2K-level aspect bucket such as 2560x1440, with batch 1. Other dimensions do not
automatically reproduce the bucket selection/resizing of inclusionAI's CLI.

`--prompt` takes the **literal prompt text**, not a JSON filename. Pass JSON file
contents as a string argument using a process API such as `subprocess.run([...])`
or `execFile`, rather than interpolating them into shell code. No separate LLM
or remote prompt-rewriting service is called. The recommended structure has
`canvas_settings` (`aspect_ratio`, `ambient_lighting`, `image_style`) and
back-to-front `layers` (`description`, string `coordinates`,
`hierarchy_and_relation`, `color_specs`). Use string coordinates such as
`cx: 0.500, cy: 0.500, w: 0.650, h: 0.680` and arrays of hex colors for
`color_specs`. Quote each visible text string exactly once in its owning
layer description. Layout coordinates guide generation;
they are not deterministic positioning instructions.

## Transparent output

Prepend one official RGBA phrase, for example
`RGBA, 4-channel, transparent background`, to the prompt. Do not combine
prefixes. For JSON comparisons, prepend the phrase to the serialized JSON and
record that exact input; the combined prompt is text, not a parseable JSON object.

`SaveImage` and the CLI output download preserve the PNG bytes. The existing
`verify` command does not check alpha. Inspect the **original output**, not a
flattened contact sheet, with:

```bash
python3 scripts/colab/ming_image/check_alpha.py <original-output.png>
```

Both 1024 RGBA trials had effectively opaque backgrounds despite the official
prefixes. The 2048 retry with `抠图素材，背景alpha=0` passed with 68.09%
effectively transparent pixels. Start transparent-output experiments at 2048,
batch 1, and run the alpha check for every output. One successful cutout does
not guarantee other prompts, seeds or styles. A four-channel PNG alone is not
a successful cutout.

This standard-library helper supports non-interlaced 8-bit RGB/RGBA PNG,
checks chunk CRCs and pixel filters, and reports dimensions, alpha range,
transparent fraction (alpha <= 4), opaque fraction (alpha >= 251), and visible
pixel count. Exit 0 requires RGBA, at least 1% effectively transparent pixels,
and visible content. Exit 3 means those checks failed; exit 2 means invalid or
unsupported input. Fractions do not prove the requested cutout is correct:
inspect edges and composite the result on light and dark backgrounds.

## Evaluation and stop conditions

For an initial small set, compare a young adult woman illustration and an
exhibition poster with English/Japanese headings; keep layout, seed and sampling
fixed. Compare natural-language and structured-JSON prompts, then selected
1024/2K pairs and an RGBA cutout. Agree on exact text, illustration style,
composition and unacceptable artifacts before running. The tested Japanese headings were inaccurate; check every rendered string
manually. INT8/BF16 quality differences remain unverified.

Stop on resource-guard failures, checksum/version mismatch, budget exhaustion,
repeated OOM, or repeated setup/tunnel failure. Do not silently switch GPU,
precision, account or model. A successful image alone does not verify every
resolution, language or transparency case.

## Colab verification record (2026-10-01 JST)

The complete path passed in one session: kit setup, shared launcher,
cloudflared URL, local `comfy-agent doctor` with connection OK, local import
with server object info, local run, PNG download, metadata verification and
inspection of originals and sheets. No CLI was installed in Colab and no
manual ComfyUI prompt submission replaced the CLI.

- GPU: NVIDIA A100-SXM4-40GB; system RAM 83.47 GiB; initial free disk 188.3 GiB.
- Python 3.13.15, PyTorch 2.11.0+cu128, ComfyUI 0.38.0,
  comfy-kitchen 0.2.36 and comfy-aimdo 0.5.5; pinned revisions above.
- Setup cell: about 10 minutes, including weight integrity checks.
- All nine runs: seed 42, Euler/simple, 12 steps, CFG 1, batch 1.
- Observed VRAM maximum: 29,134 MiB, sampled every 500 ms during later
  JSON/cutout runs including 2048. This does not include initial model loading
  and is not a proven hardware minimum or an exhaustive peak measurement.
- The cu128 runtime warned that optimized CUDA kernels were disabled;
  generation completed with the available operations. No torch/CUDA upgrade
  was required in this session.

| Case | Size | Local CLI wall time | Observed result |
|---|---:|---:|---|
| Anime woman and sunflower | 1024 | 52.05 s | Subject, palette and illustration style matched |
| English poster | 1024 | 42.31 s | Exact main heading, but extra unwanted small text |
| Japanese natural-language poster | 1024 | 42.89 s | Heading errors and extra text |
| Initial JSON poster | 1024 | 43.05 s | No extra text; missing katakana in heading |
| Same initial JSON poster | 2048 | 111.54 s | Completed without OOM; heading still inaccurate |
| JSON with official coordinate/color schema and explicit glyph instruction | 1024 | 43.19 s | Heading still inaccurate |
| English RGBA prefix | 1024 | 40.78 s | Alpha check failed; alpha 236–255, no transparent pixels |
| Chinese cutout prefix | 1024 | 41.14 s | Alpha check failed; alpha 231–255, no transparent pixels |
| Same Chinese cutout prefix | 2048 | 104.19 s | Alpha 0–255, 68.09% effectively transparent; light/dark composites passed |

Wall time includes local preflight, transport and download; it is not just
GPU sampling time. The first JSON comparison used readable color names and
`width`/`height` in string coordinates. A separate retry used the official
`w`/`h` strings, hex-color arrays and one quoted heading owner; it did not
correct the Japanese lettering. Layout instructions are approximate and the
model may change pose or framing as resolution changes.

The 2048 cutout shows the woman and sunflower without a background rectangle;
fine hair details and edge antialiasing were visible on light and dark
backgrounds. The two 1024 failures are retained as failures, not flattened
or repaired with background removal. All nine PNGs passed file count, image
format and dimension checks. This record does not establish Japanese exact-text
accuracy, UI-layout quality, other seeds, BF16 parity, or performance on other
GPUs.

## Sources and license

- [Original model and BF16 settings](https://huggingface.co/inclusionAI/Ming-Image-0.1-Design)
- [MIT license](https://github.com/inclusionAI/Ming-Image/blob/main/LICENSE)
- [Comfy-Org model files](https://huggingface.co/Comfy-Org/Ming-Image/tree/53654871e47a5d2daed7b3a986cbf1010ef81c78)
- [ComfyUI v0.38.0](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.38.0)
- [Official template at the reviewed revision](https://github.com/Comfy-Org/workflow_templates/blob/99e3d43745926b78466d99f937c0cd2bb622423a/templates/image_ming_image_01_design_t2i.json)
- [JSON prompting and RGBA guidance](https://github.com/inclusionAI/Ming-Image)

The original model and Comfy-Org repack declare MIT. Weights are downloaded at
runtime and are not redistributed with this package.
