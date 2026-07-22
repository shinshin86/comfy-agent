# Stable Audio 3 Small Music on Colab

This starter kit generates lightweight instrumental music with ComfyUI's
native Stable Audio 3 support. It is intended for BGM and instrumental clips,
not controllable lyrics or vocals.

Status: **Partial — verified E2E on Colab A100; T4 remains unverified.**

## Pinned components

- ComfyUI: `7bf8bfcd078c7f4ae50ca5149c9ff7d8613e1fb1`
- Comfy-Org model revision: `a02cbcdcd07426b0150557d0145bc894795823af`
- `stable_audio_3_small_music.safetensors`: 2,270,384,940 bytes,
  SHA-256 `da85866b11b01d0694d990785f6abbd79c8064df1b0e6f8aea52935e0ef84b64`
- `t5gemma_b_b_ul2.safetensors`: 1,187,264,003 bytes,
  SHA-256 `1e1eba25be8872edb0d3c6335c6658fd6388e7b14b60da6e454e404cfcd8150e`
- cloudflared deb: `2026.7.2`, SHA-256
  `88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a`

The setup cell verifies both checksums. Set `UPDATE_COMFYUI = True` only when
intentionally retesting against the latest ComfyUI.

## Flow

1. Select a T4 or better Colab GPU runtime.
2. Run `01_setup.py` in a Colab code cell.
3. Run `../02_start_comfyui.py` in another cell.
4. Read the trycloudflare URL from `/content/comfy_url.txt`.
5. On the local machine:

   ```bash
   comfy-agent import \
     ./scripts/colab/stable_audio3_small_music/stable_audio3_small_music_t2a.json \
     --name stable_audio3_small_music_t2a
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run stable_audio3_small_music_t2a \
     --3_text "Warm instrumental city pop, electric piano, melodic bass, 118 BPM" \
     --5_seconds 30 \
     --timeout-seconds 1200
   ```

The MP3 is downloaded below
`.comfy-agent/outputs/stable_audio3_small_music_t2a/`.

## Parameters and limits

- `--3_text`: describe genre, instruments, mood, tempo, and arrangement.
- `--5_seconds`: requested latent duration. Start with 10 or 30 seconds.
- `--6_seed`: reproducibility.
- The bundled post-trained checkpoint uses 8 steps, CFG 1, and the LCM
  sampler, matching the current official Stable Audio 3 workflow family.
- Upstream documents generation up to 120 seconds. The 120-second Colab case
  remains unverified until recorded below.
- This kit does not provide explicit lyric or vocal controls. Use ACE-Step 1.5
  when lyrics or singing are required.

## License and upstream references

- Stable Audio 3 weights: Stability AI Community License. Review the current
  commercial-use terms at https://stability.ai/license before use.
- T5Gemma text encoder: Gemma Terms of Use, last checked 2026-07-22.
- Model outputs can still require rights review depending on the prompt and use.

Upstream:

- https://huggingface.co/stabilityai/stable-audio-3-small-music
- https://huggingface.co/Comfy-Org/stable-audio-3
- https://ai.google.dev/gemma/terms
- https://github.com/Comfy-Org/workflow_templates/blob/93f3058d5ad87d83c5eab7c0eabd734738376816/templates/audio_stable_audio_3_medium.json

## Verification record

Verified on 2026-07-22 with a Colab A100 40 GB runtime, ComfyUI 0.28.0 at the
pinned revision, and local `comfy-agent`:

- Both model files passed SHA-256 verification.
- The final setup script was rerun successfully with the pinned cloudflared deb
  and all existing downloads revalidated by checksum.
- Live-node-aware `comfy-agent import` succeeded through the cloudflared URL.
- One uncached `comfy-agent run` completed all nodes, including sampler 8/8,
  VAE decode, and `SaveAudioAdvanced`, then downloaded one MP3.
- Output: 30.093 seconds, 44.1 kHz stereo, 928,229 bytes, mean volume -17.4 dB;
  the only >=0.5-second interval below -45 dB was the 0.54-second ending fade.
- A full local `afplay` invocation exited successfully. Spectrogram inspection
  showed structured tonal and transient content across the non-fade region.

Keep the kit at Partial until the documented T4 minimum is exercised. The
10-second and 120-second cases also remain unverified.
