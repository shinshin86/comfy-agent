# Colab × comfy-agent

Run ComfyUI on Google Colab and drive it from local `comfy-agent` over a
cloudflared tunnel. Automatable via the `colab-mcp` MCP server declared
in `.mcp.json` at the repo root.

## Per-model starter kits

| Kit | Status | GPU | Notes |
|---|---|---|---|
| [`./z_image/`](./z_image/) | Verified E2E | T4+ | Z-Image turbo, fastest |
| [`./sdxl/`](./sdxl/) | Verified E2E | T4+ | Stable Diffusion XL base 1.0, OpenRAIL++ |
| [`./sdxl_turbo/`](./sdxl_turbo/) | Verified E2E | T4+ | SDXL Turbo, 1-step distilled (non-commercial) |
| [`./anima/`](./anima/) | Starter | T4+ | Anima Preview 3, anime-style Qwen-Image finetune |
| [`./qwen_image/`](./qwen_image/) | Starter | L4+ | Qwen-Image 2512, text-to-image |
| [`./qwen_image_edit/`](./qwen_image_edit/) | Starter | A100 (L4 for fp8) | Qwen-Image-Edit 2511, image editing |
| [`./flux1/`](./flux1/) | Verified E2E | L4+ / A100 | Flux 1 dev fp8 (Comfy-Org repack, no HF token) |
| [`./flux2/`](./flux2/) | Verified E2E | A100 | Flux 2 dev, fp8mixed repack |
| [`./wan21/`](./wan21/) | 1.3B verified E2E; 14B starter | T4 (1.3B) / L4+ (14B) | Wan 2.1 T2V (1.3B fp16, 14B fp8_scaled) |
| [`./wan22/`](./wan22/) | TI2V 5B verified E2E; T2V 14B starter | A100 | Wan 2.2 video |
| [`./ltx23/`](./ltx23/) | Starter | A100 | LTX-2.3 22B i2v video |

Each subdir has its own `01_setup.py` + workflow JSON(s) + README. The
launcher `02_start_comfyui.py` at this level is **shared by all kits**.

## Common flow

1. Open a Colab notebook with the GPU runtime recommended by the kit.
2. Paste the kit's `01_setup.py` into a cell and run (installs ComfyUI +
   deps, downloads model weights + cloudflared).
3. Paste `./02_start_comfyui.py` into the next cell and run. Returns
   immediately; ComfyUI and cloudflared run in background.
4. Poll `/content/comfy_url.txt` for the tunnel URL:

   ```python
   !cat /content/comfy_url.txt
   ```

5. Locally, import the kit's bundled workflow and run:

   ```bash
   comfy-agent import ./scripts/colab/<kit>/<workflow>.json --name <preset>
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run <preset> --<node_id>_<input> "value" ...
   ```

   Parameter flags follow `--<node_id>_<input>` matching the
   auto-generated preset. Rename keys in the generated YAML if you prefer
   friendlier flags like `--prompt`.

## MCP automation

`.mcp.json` registers `colab-mcp`. An MCP-aware client can:

- Create a Colab notebook, add the two cells, execute them.
- Read `/content/comfy_url.txt` to get the public URL.
- Export `COMFY_AGENT_BASE_URL` and invoke `comfy-agent` locally.

## Notes

- trycloudflare URLs change every session — re-export
  `COMFY_AGENT_BASE_URL` each time.
- `--source remote` requires saving workflows via the ComfyUI browser UI
  first. On Colab, prefer `comfy-agent import` + `--source local`.
- Colab disconnects idle sessions; long jobs may be cut.
- To persist model weights across sessions, set `USE_GOOGLE_DRIVE = True`
  in the kit's `01_setup.py` (where supported).
- Logs: ComfyUI `/content/comfy.log`, cloudflared `/content/cloudflared.log`.

## Credits

- The Colab setup pattern in each kit's `01_setup.py` was inspired by the
  Colab notebooks shipped with [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
  and [ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager).
  The scripts here are independently rewritten for this project (MIT)
  around the publicly documented install procedure; thanks to the
  upstream maintainers for establishing the workflow.
- Workflow JSONs in each kit are derived from the official ComfyUI
  examples (https://comfyanonymous.github.io/ComfyUI_examples/) or from
  the corresponding model repository's reference workflow (Anima's kit
  mirrors the example embedded in `example.png` on circlestone-labs/Anima).
- Model weights are downloaded from their respective upstream
  repositories at runtime and are **not** redistributed by this project.
  Check each model's license before use — in particular, **Flux 2 [dev]
  is released under a non-commercial license**.
