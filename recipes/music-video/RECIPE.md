# Recipe: one prompt → music video

Agent-oriented pipeline: turn a natural-language concept ("a nostalgic
synthwave song about summer rain, anime visuals") into a finished MV file,
using the [`music_video` combo kit](../../scripts/colab/music_video/) and
local `ffmpeg`.

Read [docs/agent-playbook.md](../../docs/agent-playbook.md) first — blueprint,
approval, and error handling all follow the playbook. This file only adds the
pipeline itself.

## Prerequisites

- `music_video` kit runtime connected (`comfy-agent doctor` → OK;
  `doctor --preset mv_song` etc. pass).
- Presets imported as in the kit README: `mv_song`, `mv_keyframe`, `mv_clip`.
- Local `ffmpeg` and `ffprobe` on PATH.
- Flags below are illustrative — **always check the real generated flag names
  with `comfy-agent preset <name>`** (they follow `--<node_id>_<input>`).

## Pipeline

### 1. Concept → plan (no server needed; do this while Colab boots)

- Write lyrics (or instrumental description) matching the requested mood.
- Decide the cut: recommended first target is a **30-45 s MV** —
  6-9 scenes × ~5 s clips. A full-song MV multiplies clip count and A100
  minutes; propose it only after the short cut works.
- Write a shot list: one line per scene — visual subject, camera motion,
  shared style suffix for consistency (e.g. "anime style, dusk palette,
  film grain" appended to every scene prompt).

### 2. Song (ACE-Step 1.5)

```bash
comfy-agent run mv_song --<tags_flag> "synthwave, nostalgic, female vocal" \
  --<lyrics_flag> "$(cat lyrics.txt)" --json
```

- Check the output duration with `ffprobe`; regenerate (new seed) if the
  structure is unusable. Keep the chosen take's file path.

### 3. Keyframes (Z-Image turbo, one per scene)

```bash
comfy-agent run mv_keyframe --<prompt_flag> "<scene 1 prompt + style suffix>" --json
```

- Set the keyframe size flags to **1280x704** (the video workflow's frame
  size; the z_image preset defaults to 1024x1024, which does not match).
- Inspect every keyframe image before animating. Regenerate weak ones now —
  a bad keyframe wastes minutes of A100 time in step 4.

### 4. Clips (Wan 2.2 TI2V 5B, image-to-video)

```bash
comfy-agent run mv_clip --image scene1.png \
  --<prompt_flag> "<scene 1 motion description>" --json
```

- Default `length` 41 @ 24 fps ≈ 1.7 s; raise the length flag for ~5 s
  (121 frames) per scene, VRAM permitting.
- Output is animated WEBP (`SaveAnimatedWEBP`). Convert each to mp4:

```bash
ffmpeg -i clip1.webp -c:v libx264 -pix_fmt yuv420p -r 24 clip1.mp4
# If your ffmpeg cannot decode animated WEBP, fall back to:
# python3 -c "from PIL import Image; im=Image.open('clip1.webp'); ...extract frames..."
# then assemble the PNG frames with ffmpeg -framerate 24 -i f_%03d.png
```

### 5. Assemble (local ffmpeg)

```bash
printf "file 'clip%d.mp4'\n" 1 2 3 4 5 6 > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy visual.mp4
ffmpeg -i visual.mp4 -i song.flac -map 0:v -map 1:a \
  -c:v copy -c:a aac -shortest -af "afade=t=out:st=<end-2>:d=2" mv_final.mp4
```

- Trim/loop the visual track to the chosen cut length; fade audio out.

### 6. Verify before reporting (mandatory)

- `ffprobe mv_final.mp4` — duration, resolution, audio stream present.
- Extract spaced frames and view them:
  `ffmpeg -i mv_final.mp4 -vf fps=1/5 check_%02d.png`
- Play back audio sync at least once if the environment allows.
- Report per the playbook: what was verified, what deviates from the
  request, per-scene seeds/params so any scene can be regenerated.

## Cost expectations (A100)

- Song: ~1-2 min. Keyframes: seconds each. Clips: the dominant cost —
  budget several minutes per 5 s clip; a 40 s cut is typically well under
  an hour of runtime including retries.

## Failure notes

- `MISSING_MODEL_ON_SERVER` mid-pipeline → the runtime is not the
  `music_video` kit (or a partial setup); see the playbook decision table.
- Colab disconnect mid-pipeline → outputs already downloaded are safe
  locally; `connect` the new URL and resume from the failed step. Track
  progress in a scene checklist so resumption is exact.
