# VDN H3 8-step T2V on Colab A100

**Starter — not Verified E2E.** An explicit experiment in generation efficiency,
not a quality upgrade or a replacement for ordinary H3/FastH3. No A100 speed or
VRAM result has been measured. See [selection policy](../../../docs/h3-environment-selection.md).

Use a fresh A100 high-RAM runtime. Run `01_setup.py`, then
[the shared launcher](../02_start_comfyui.py), and connect locally using the
printed command. This kit uses a separate checkout and does not install into
an existing H3 or FastH3 environment. It still shares the runtime's Python
packages: a fresh runtime is required, not just a different folder.

Downloads: 42.47 GB original base assets plus 5.465 GB VDN stage assets. The
72 GB Diffusers-format base in OpenVDN's repository is not downloaded.
All model/config files are revision-, size-, and SHA-256-pinned; the custom node
commit is pinned. The shared base setup is itself revision/hash-verified.

```bash
comfy-agent import scripts/colab/minimax_h3_vdn/minimax_h3_vdn_t2v.json --name minimax_h3_vdn_t2v
comfy-agent doctor --preset minimax_h3_vdn_t2v --json
comfy-agent run minimax_h3_vdn_t2v --104_prompt "<your H3 three-field prompt>" --seed 42 --timeout-seconds 3600
```

Initial graph: 864x480, 124 frames, 24 fps, native stereo audio; eight Euler/simple
steps, VDN Turbo adapter enabled, `lora_mode=merge`, streamed branch weights,
grouped attention, retained buffers off. Do not stack FastH3, Scheduled Sol
Attention, community Turbo LoRAs, SNS LoRA or Motion Context on this starter.
No I2V/R2V claims are made by this kit.

At short lengths VDN may use dense attention fallback because its local window
covers the whole clip. The initial 124-frame smoke test establishes execution,
not the longer-clip speed benefit. Compare longer clips only after the initial
E2E path is verified, recording total time and peak VRAM as well as sampling time.

Upstream:
- [ComfyUI port](https://github.com/Saganaki22/ComfyUI-VDN-H3), Apache-2.0 code.
- [VDN weights](https://huggingface.co/OpenVDN/vdn-minimax-h3).
- [MiniMax H3 license](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE).
  The weights inherit its territory/commercial/attribution/output-use conditions;
  check download/use location including the Colab runtime region before setup.
