# ACE-Step 1.5 on Colab

This starter kit generates complete music with optional lyrics and vocals via
ComfyUI's native ACE-Step 1.5 support. The bundled default is a 30-second
Japanese vocal song using the official Turbo AIO checkpoint.

Status: **Partial — verified E2E on Colab A100; T4 and L4 remain unverified.**

## Pinned components

- ComfyUI: `7bf8bfcd078c7f4ae50ca5149c9ff7d8613e1fb1`
- Comfy-Org model revision: `54b2ef4d8af5582f54c7e6b84c22b679a194bc4b`
- `ace_step_1.5_turbo_aio.safetensors`: 10,025,478,736 bytes,
  SHA-256 `67b0f43aa5c51c840bd0228e6a935d8ff416ec87e5df2fc0637da17a561252bc`
- cloudflared deb: `2026.7.2`, SHA-256
  `88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a`

The setup cell verifies the model checksum. Set `UPDATE_COMFYUI = True` only
when intentionally testing the latest ComfyUI; rerun `/object_info` and the
full E2E before treating an updated runtime as verified.

## Flow

1. Select a Colab GPU runtime. T4 is the provisional minimum; use L4 if the
   runtime cannot load the AIO checkpoint.
2. Run `01_setup.py` in a Colab code cell.
3. Run `../02_start_comfyui.py` in another cell.
4. Read the trycloudflare URL from `/content/comfy_url.txt`.
5. On the local machine:

   ```bash
   comfy-agent import ./scripts/colab/ace_step_1_5/ace_step_1_5_t2a.json \
     --name ace_step_1_5_t2a
   export COMFY_AGENT_BASE_URL=https://<id>.trycloudflare.com
   comfy-agent run ace_step_1_5_t2a \
     --2_tags "Japanese city pop, warm female vocals, bright electric piano" \
     --2_lyrics $'[Verse]\n夏の風が頬をなでる\n\n[Chorus]\n明日の空へ歌おう' \
     --2_language ja \
     --2_duration 30 \
     --4_seconds 30 \
     --timeout-seconds 1800
   ```

The MP3 is downloaded below `.comfy-agent/outputs/ace_step_1_5_t2a/`.

For an instrumental, pass an empty lyrics value and remove vocal wording from
the tags:

```bash
comfy-agent run ace_step_1_5_t2a \
  --2_tags "instrumental Japanese city pop, electric piano, melodic bass" \
  --2_lyrics "" \
  --2_duration 30 \
  --4_seconds 30 \
  --timeout-seconds 1800
```

## Parameters and limits

- `--2_tags`: style, instrumentation, mood, and vocal description.
- `--2_lyrics`: structured lyrics. Use section tags such as `[Verse]` and
  `[Chorus]`; an empty value requests an instrumental.
- `--2_language`: lyric language (`ja`, `en`, and other native node options).
- `--2_bpm`, `--2_timesignature`, `--2_keyscale`: musical metadata.
- `--2_duration` and `--4_seconds`: keep both values equal.
- `--2_seed` and `--6_seed`: set both when exact reproducibility matters.
- Start at 30 seconds and batch 1. Longer songs increase runtime and memory
  pressure even though upstream supports longer durations.

## License and upstream references

- ACE-Step 1.5 project and original model card: MIT.
- The Comfy-Org repack currently declares Apache-2.0 metadata. This differs
  from the original MIT declaration; review both sources before redistribution.
- Generated music can still raise copyright, voice, or style-similarity issues.
  The model license is not a guarantee that every output is clear for use.

Upstream:

- https://github.com/ace-step/ACE-Step-1.5
- https://huggingface.co/ACE-Step/Ace-Step1.5
- https://huggingface.co/Comfy-Org/ace_step_1.5_ComfyUI_files
- https://github.com/Comfy-Org/workflow_templates/blob/93f3058d5ad87d83c5eab7c0eabd734738376816/templates/audio_ace_step_1_5_checkpoint.json

## Verification record

Verified on 2026-07-22 with a Colab A100 40 GB runtime, ComfyUI 0.28.0 at the
pinned revision, and local `comfy-agent`:

- Cold setup completed and the AIO checkpoint passed SHA-256 verification.
- The final setup script was rerun successfully with the pinned cloudflared deb
  and all existing downloads revalidated by checksum.
- `/object_info` contained all seven required native node classes.
- Live-node-aware `comfy-agent import` succeeded through the cloudflared URL.
- A cache-busting run with text-encoder and sampler seed 43 completed all nodes
  (LM 150/150, sampler 8/8, VAE decode, and `SaveAudioAdvanced`) and downloaded
  one MP3 through Comfy Agent.
- Output: 30.000 seconds, 48 kHz stereo, 935,434 bytes, mean volume -14.0 dB;
  the only >=0.5-second interval below -45 dB was a 1.05-second ending fade.
- A full local `afplay` invocation exited successfully. Spectrogram inspection
  showed structured broadband and harmonic content across the non-fade region.

The first A100 run exposed the current Dynamic Combo API representation for
`SaveAudioAdvanced`; the workflow now sends `format` plus `format.quality`, and
the cache-busting verification above was performed after that fix. Keep the kit
at Partial until T4/L4 behavior and an instrumental run are recorded.
