# MiniMax Music 3 on Colab

This starter kit generates complete songs with lyrics and expressive vocals
using ComfyUI's native MiniMax Music 3 support. The bundled workflow uses the
official INT8 DiT and pruned INT8 text encoder repacks plus the audio VAE.

Status: **Starter — static checks only; Colab E2E verification is pending.**

## Pinned components

- ComfyUI: `7fe8a6138504f90ff7be82f3babf416da32876b1`
- Comfy-Org model revision: `6444666eb6edfb2c7fcab5f8b81da8b84b4b17b6`
- `minimax_music3_dit_int8_convrot.safetensors`: 2,502,161,682 bytes,
  SHA-256 `d6b959633e69899f99f3a92d6741c0fe79f26958a30811e50e372ef978b24d5f`
- `minimax_music3_text_encoder_pruned_int8_convrot.safetensors`:
  9,196,611,886 bytes,
  SHA-256 `010b7416d2336a08c711bc22ee65849c9623069ddb7d89bec011a75699e52014`
- `minimax_music3_dav.safetensors`: 216,696,128 bytes,
  SHA-256 `2a32155b769be01445fcc2a8663b910fc9e1751e18dc1c3ec528064512d9ef0c`
- cloudflared deb: `2026.7.2`, SHA-256
  `88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a`

The setup downloads about 11.9 GB. It verifies every model and cloudflared
download by SHA-256. Set `UPDATE_COMFYUI = True` only when intentionally
testing a newer ComfyUI revision, then rerun the full E2E flow before updating
the verification status.

## Flow

1. Select an A100 Colab runtime for the first verification. L4 with the INT8
   models is the provisional minimum but remains unverified.
2. Run `01_setup.py` in a Colab code cell.
3. Run `../02_start_comfyui.py` in another cell.
4. Read the trycloudflare URL from `/content/comfy_url.txt`.
5. On the local machine:

   ```bash
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent import ./scripts/colab/minimax_music3/minimax_music3_t2a.json \
     --name minimax_music3_t2a
   comfy-agent doctor --preset minimax_music3_t2a --json
   comfy-agent run minimax_music3_t2a \
     --4_caption "Global Metadata: ... Vocal Details: ... Arrangement: ..." \
     --4_lyrics $'[Verse]\nMorning light filters through the trees\n\n[Chorus]\nCarry this melody into the sky' \
     --4_max_duration 30 \
     --timeout-seconds 1800
   ```

The MP3 is downloaded below
`.comfy-agent/outputs/minimax_music3_t2a/<timestamp>/`.

## Parameters and limits

- `--4_caption`: music description. For precise control, structure it as
  `Global Metadata`, `Vocal Details`, and `Arrangement`.
- `--4_lyrics`: lyrics with section tags such as `[Intro]`, `[Verse]`,
  `[Chorus]`, `[Bridge]`, `[Instrumental]`, and `[Outro]`.
- `--4_max_duration`: maximum song length in seconds. The model may emit an
  end-of-audio token and finish earlier. Upstream supports up to 300 seconds.
- `--4_seed` and `--7_seed`: set both to the same value when exact
  reproducibility matters.
- `--4_cfg_scale` and `--7_cfg`: keep both values aligned. The official
  workflow defaults to `1.7`.
- `--4_top_k`: controls autoregressive token sampling; the official default is
  `50`.
- Start at 30 seconds for validation. Longer songs increase autoregressive,
  diffusion, and audio-decoding time.

The workflow uses tiled VAE decoding to reduce peak VRAM. The model itself
produces 32 kHz, 16-bit stereo audio; the workflow saves an MP3 for convenient
transfer through comfy-agent.

## License and upstream references

MiniMax Music 3 uses the **MiniMax-Music3 Community License**, not a standard
Apache-2.0 model license. Notable terms include:

- Commercial products or services must prominently display
  `MiniMax-Music3` in their UI.
- Prior written authorization from MiniMax is required when aggregate yearly
  revenue from covered products and services exceeds USD 20 million.
- Hosted generation services must maintain safeguards against prohibited and
  infringing uses.
- Publicly distributed generated content must clearly disclose that it is
  machine-generated.

Review the complete upstream license and acceptable-use policy before
commercial or hosted use. Generated music can still raise copyright, voice,
or style-similarity issues.

Upstream:

- https://huggingface.co/MiniMaxAI/MiniMax-Music3
- https://huggingface.co/MiniMaxAI/MiniMax-Music3/blob/main/LICENSE
- https://huggingface.co/Comfy-Org/MiniMax-Music-3
- https://docs.comfy.org/tutorials/audio/minimax/minimax-music-3
- https://github.com/Comfy-Org/ComfyUI/pull/15570
- https://github.com/Comfy-Org/workflow_templates/blob/main/templates/audio_minimax_music_3.json

## Verification checklist

- [ ] `01_setup.py` completes on the target Colab GPU.
- [ ] `02_start_comfyui.py` produces a usable trycloudflare URL.
- [ ] Local `comfy-agent doctor` reports a healthy connection.
- [ ] Local `comfy-agent import` creates the preset.
- [ ] `doctor --preset` finds every model and native node.
- [ ] Local `comfy-agent run` downloads the generated MP3.
- [ ] Duration, sample rate, channels, level, and ending are probed.
- [ ] The generated song is played and checked against caption and lyrics.

Keep the kit at Starter until every item is observed in one canonical local
Mac -> cloudflared -> Colab run.
