# Colab × comfy-agent

Run ComfyUI on Google Colab and drive it from local `comfy-agent` over a
cloudflared tunnel. Automatable via the `colab-mcp` MCP server declared
in `.mcp.json` at the repo root.

## Per-model starter kits

| Kit | Status | GPU | Notes |
|---|---|---|---|
| [`./z_image/`](./z_image/) | Verified E2E | T4+ | Z-Image turbo, fastest |
| [`./flux2/`](./flux2/) | Verified E2E | A100 | Flux 2 dev, fp8mixed repack |
| [`./wan22/`](./wan22/) | TI2V 5B verified E2E; T2V 14B starter | A100 | Wan 2.2 video |

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
