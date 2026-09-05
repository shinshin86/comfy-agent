# H3 environment selection and compatibility

Ordinary H3 is the default. An installed extension is not permission to apply it.
The original `minimax_h3` and `minimax_h3_fast` setups, model revisions, workflows,
required uploads, and CLI calls remain unchanged. New kits are **Starter**, not
Verified E2E. They use separate checkouts and require a fresh runtime because
Python dependencies and GPU memory are still shared within a Colab runtime.

## Agent decision procedure

1. Identify intent and actual inputs, then call `comfy-agent colab suggest "H3 <intent>" --json`.
   The CLI provides a deterministic suggestion; the agent must reconcile it with
   references, explicit exclusions, and combinations. It is not a semantic parser.
   Read `comfy-agent colab kit <kit> --json` and the kit README for the required
   profile/toggles; a suggestion does not itself install or activate anything.
2. With no special request, use `minimax_h3_t2v`; with a first image use I2V;
   with identity/voice references use R2V. Do not infer style from destination alone:
   "publish on TikTok" does not mean "apply the TikTok aesthetics LoRA".
3. Explain the selected feature and purpose briefly before execution. Do not ask
   for a model name if the creative intent already determines the choice.
4. Run `doctor --preset <name> --json` for an existing preset. If not imported,
   select/setup the kit, connect, import the matching workflow, then doctor.
   A running ComfyUI without the selected preset is not proof of compatibility.
5. Reuse a compatible, already configured runtime. If the new setup is needed,
   present GPU, model download, node/license conditions, and human actions first.
   These kits have `composable: false`: do not paste setup into an ordinary H3 or
   FastH3 session, update its ComfyUI, or silently replace its environment.
6. Preserve ordinary H3 as the fallback. If an extension fails, do not silently
   drop the requested continuation/reference/style; explain the missing capability.

| Intent | Kit / workflow | Setup choice |
| --- | --- | --- |
| General H3 video | `minimax_h3` / `minimax_h3_t2v` | Existing defaults |
| Animate first image | `minimax_h3` / `minimax_h3_i2v` | Existing defaults |
| Image + voice reference | `minimax_h3` / `minimax_h3_r2v` | Existing Ref2VA toggle |
| SNS-like aesthetics | `minimax_h3_extensions` / `minimax_h3_sns_t2v` or `_i2v` | `PROFILE="sns"` |
| Anchor an intermediate/end image | `minimax_h3_extensions` / `minimax_h3_guide` | `PROFILE="guide"` |
| Anchor audio, or image + audio | `minimax_h3_extensions` / `minimax_h3_guide_audio` or `_av` | `PROFILE="guide"` |
| Continue motion and sound | `minimax_h3_extensions` / `minimax_h3_motion_t2v` | `PROFILE="motion"` |
| Continue with image + audio references | `minimax_h3_extensions` / `minimax_h3_motion_r2v` | `PROFILE="motion"`, `REF2VA=True` |
| Fast T2V draft | Existing `minimax_h3_fast` | Existing dedicated setup |
| Explicit VDN experiment | `minimax_h3_vdn` / `minimax_h3_vdn_t2v` | Dedicated setup |

VDN must be named explicitly until comparative A100 evidence justifies changing
this policy. It is an efficiency experiment, not a quality upgrade. FastH3 is
T2V-only; a speed request never discards an image/audio reference.

Combined requests need a matching graph. The bundled graphs do not yet combine
SNS LoRA + Guide + Motion Context, or VDN + any of them. Do not claim a combination
works merely because its individual nodes exist. Keep the user's requirements
visible, prepare a separate experimental graph if needed, and label it unverified.

## Cost and state

All new profiles target A100 high-RAM; no T4/L4 verification is claimed.
A fresh guide or motion runtime downloads about 42.47 GB of base assets. SNS
adds 0.310 GB; VDN adds 5.465 GB. Motion R2V uses Ref2VA instead of FL2VA (same
base download volume), not both. The extension catalog's asset total is the SNS
profile's estimate; guide/motion omit that LoRA. Nodes add small source downloads.
Allow installation/working disk beyond the weights (60 GB for extensions, 65 GB
for VDN are starting allowances, not measured peak usage).

Normal startup: setup cell + shared launcher cell + paste one connect command.
Motion stores AV latents under the runtime's `ComfyUI/output/h3_context/<chain-id>/`.
No Google Drive access is requested. Reconnecting or restarting ComfyUI on the
same runtime can resume with the local state file. A Colab runtime reset deletes
these latents, so the chain cannot resume after that reset. A missing latent is
an error, not permission to restart from an MP4 or silently use no context.

See [the measured Colab smoke tests](h3-colab-validation.md) for the tested
profiles and remaining limits.

## Verification gates

Before promoting any new kit, follow [CLAUDE.md](../CLAUDE.md): Colab setup,
cloudflared, local doctor, local import/run, and local output retrieval. Inspect
frames and audio using [the agent playbook](agent-playbook.md).

- Regression: run existing T2V/I2V/R2V on their original kit, including required
  upload aliases, model filenames and fixed revisions. Local tests alone are not
  an E2E guarantee.
- SNS: compare strength 0 and 0.75 with identical prompt/seed/settings; inspect
  effect, identity, artifacts, motion and audio. Check unloaded/unmatched LoRA keys.
- Guide: supply a visibly distinctive anchor, test last and intermediate positions.
- Motion: inspect three clips, trimmed boundaries and untrimmed audio if probing;
  check 24 fps / 32 kHz stereo and accumulated duration. Restart and persistence
  checks are outside the generation smoke test.
  At 124 frames, clip 1 delivers 124 frames; later clips deliver 102 after trimming
  22. Three clips therefore total 328/24 = 13.667 seconds, not 15.5 seconds.
- VDN: verify one standalone 8-step T2V, record setup/load/sampling/decode/total
  time and peak VRAM separately. Do not infer performance from official B200 results.

## Upstream pins and licenses

Both installers verify a pinned, published copy of the original H3 setup by
SHA-256, keeping the original ComfyUI/model pins. Third-party node source is pinned
by commit; weights and small VDN configuration files are pinned by revision, size
and SHA-256. No third-party source is vendored into this repository.

- [Motion Context](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context):
  `a12a50ce7b34922198ec51665936da9220c67768`, GPL-3.0.
- [VDN ComfyUI port](https://github.com/Saganaki22/ComfyUI-VDN-H3):
  `b49130c26a70d12c542601c5bc4f7ee0f112ee2e`, Apache-2.0.
- [SNS LoRA](https://huggingface.co/vpakarinen/insta-tiktok-aesthetics-h3-lora):
  `0152857b305ff23691bb749321bd23567cf770c2`, Apache-2.0 for the adapter.
- [VDN weights](https://huggingface.co/OpenVDN/vdn-minimax-h3):
  `18be6bcc4ee72585eee322ba28b5ccac2cf85ef0`.

All H3-derived weights remain subject to the
[MiniMax H3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE),
including territory and commercial-use conditions. Review the runtime's download
and use location as well as the user's location; adapter/code licenses do not
replace the base license.
