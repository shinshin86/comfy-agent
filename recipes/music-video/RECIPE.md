# Recipe: one prompt → music video (v2)

Agent-oriented pipeline: turn a natural-language concept ("a nostalgic
synthwave song about summer rain, anime visuals") into a finished MV,
using the [`music_video` combo kit](../../scripts/colab/music_video/) and
local `ffmpeg`.

Read [docs/agent-playbook.md](../../docs/agent-playbook.md) first — blueprint,
approval, and error handling all follow the playbook.

**v2 lesson, learned the hard way:** generating good clips and concatenating
them at fixed intervals produces "random anime footage over a song", not an
MV. What makes it an MV is the **direction layer** — a storyboard with one
protagonist and a narrative arc, cuts landing on the beat grid, pacing that
follows song sections, and recurring visual motifs. Steps 1 and 5 are where
MVs are made or lost; the generation steps in between are the easy part.

## Prerequisites

- `music_video` kit runtime connected (`comfy-agent doctor` → OK;
  `doctor --preset mv_song` etc. pass).
- Presets imported as in the kit README: `mv_song`, `mv_keyframe`, `mv_clip`.
- Local `ffmpeg` and `ffprobe` on PATH. Beat analysis needs `librosa`
  (a throwaway venv is fine); fallback is computing the grid from the BPM
  you passed to the song generator.
- Flags below are illustrative — **always check the real generated flag names
  with `comfy-agent preset <name>`** (they follow `--<node_id>_<input>`).

## Pipeline

### 1. Storyboard (mandatory — no generation before this exists)

Produce a storyboard document containing ALL of the following:

1. **Lyrics** (or instrumental description) and the target cut length
   (first target: 30-45 s; full-song only after a short cut works).
2. **Character sheet**: ONE fixed appearance string for the protagonist,
   specific enough to survive re-rolls — age range, hair length/color/style,
   one distinctive accessory, exact outfit with colors, shoes. Example:
   `"17-year-old girl, chin-length dark bob hair, small red hairpin,
   plain white short-sleeve shirt, navy pleated skirt, red sneakers"`.
   This exact string is pasted verbatim into EVERY keyframe prompt that
   contains the protagonist. Never paraphrase it per scene.
3. **Narrative arc**: 3-5 sentences — what changes between the first and
   last shot. If nothing changes, the storyboard is not done.
4. **Shot list**: one row per scene with
   (a) the lyric line / song moment it belongs to,
   (b) the on-screen subject (protagonist? which motif?),
   (c) shot size (wide / medium / close) — vary them; three wides in a row
   reads as wallpaper,
   (d) camera/subject motion for i2v,
   (e) connection to the previous scene (same location? motif recurrence?
   chained last-frame?).
5. **Motif plan**: at least one visual element that appears early and
   returns transformed near the end (e.g. red traffic light → green).
6. **Shared style suffix** appended to every keyframe prompt.

### 2. Song (ACE-Step 1.5) + beat grid

```bash
comfy-agent run mv_song --<tags_flag> "..." --<lyrics_flag> "$(cat lyrics.txt)" \
  --<bpm_flag> 118 --json
```

- Check duration with `ffprobe`; regenerate (new seed) if unusable.
- **Extract the beat grid from the actual audio** (generated BPM can drift
  from the requested value):

```python
import librosa
y, sr = librosa.load("song.mp3")
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
# bar length = 4 beats; grid offset = first downbeat estimate
```

- Derive: bar duration, first-downbeat offset, and section boundaries
  (intro/verse/chorus — from lyric structure plus an energy/novelty curve,
  or by ear via short sample exports). Write the resulting **cut plan**:
  every cut time is `offset + k * bar`, scene changes sit on section
  boundaries, and the chorus gets shorter cuts (1 bar) than verses (2 bars).

### 3. Keyframes (Z-Image turbo) — consistency rules

- Size flags: **1280x704** (must match the video workflow).
- Protagonist scenes: prompt = scene description + **verbatim character
  sheet string** + shared style suffix.
- Generate **2 candidates** (different seeds) for every protagonist scene;
  view them and keep the one closer to the sheet. Environment-only shots
  usually need 1 take.
- Inspect every keyframe side by side (contact sheet) before animating:
  same person? same outfit? consistent palette? Fix now — a wrong keyframe
  wastes ~5 A100-minutes per clip downstream.

### 4. Clips (Wan 2.2 TI2V 5B, image-to-video)

```bash
comfy-agent run mv_clip --image sceneN.png \
  --<prompt_flag> "<motion from the shot list>" --<length_flag> 121 --json
```

- 121 frames @ 24 fps ≈ 5 s of raw material per scene; the edit will trim
  each to its planned bar count, so generate at least one bar more than the
  cut plan needs.
- **Last-frame chaining** (optional, for adjacent scenes sharing a
  location): extract the final frame of clip N and use it as `--image` for
  clip N+1 instead of a fresh keyframe.
- **Retake loop**: after each clip, extract first/middle/last frames and
  check against the shot list (subject correct? motion as planned? no
  morphing?). One retake with adjusted motion prompt or seed; keep the
  better take. Cap retakes (~1 per clip) to bound cost.
- Output is animated WEBP. ffmpeg often cannot decode it — use PIL:
  frames out (`ImageSequence`), then `ffmpeg -framerate 24 -i f_%04d.png`.

### 5. Beat-synced assembly (local ffmpeg)

This step follows the **cut plan from step 2**, not fixed clip lengths:

```bash
# trim each clip to its planned number of bars, cutting on the grid
ffmpeg -i clip1.mp4 -t <bars*bar_sec> -c:v libx264 -pix_fmt yuv420p t1.mp4
...
ffmpeg -f concat -safe 0 -i list.txt -c copy visual.mp4
ffmpeg -i visual.mp4 -i song.mp3 -map 0:v -map 1:a -c:v copy -c:a aac \
  -ss <song_in> -shortest -af "afade=t=out:st=<end-2>:d=2" mv_final.mp4
```

- Every cut lands on `offset + k * bar`. Verify by extracting the frame at
  each cut time and confirming the scene actually changes there.
- Scene changes on section boundaries; chorus = 1-bar cuts, verse = 2-bar.
- Start the video on the song's first downbeat (trim song head or add a
  1-bar title/black lead-in).
- Hard cuts on the grid by default; reserve crossfades for section
  boundaries at most.

### 6. MV quality gate (before reporting ANYTHING)

Score the assembled MV against this checklist by actually inspecting it
(frames at every cut point + spaced frames + `ffprobe`):

- [ ] **Story**: a stranger can say what happened (arc start → end)
- [ ] **Protagonist**: same person (hair/outfit) in every appearance
- [ ] **Beat sync**: sampled cut points land on the grid; chorus pacing
      is visibly faster than verse
- [ ] **Motif**: the planned motif appears and returns
- [ ] **Technical**: target duration ±1 bar, audio track present, fade out,
      no black/frozen frames at joins

Anything unchecked → fix or retake before delivering. Report the checklist
result, per-scene seeds/params, and deviations honestly. Never deliver an
MV you have not frame-checked.

## Cost expectations (A100)

- Song ~1-2 min; keyframes seconds each (×2 candidates for protagonist
  shots); clips dominate at ~5 min per 121-frame clip — budget retakes
  (~1.5× clip count). A 35-45 s cut lands around 60-90 min of runtime.

## Failure notes

- `MISSING_MODEL_ON_SERVER` mid-pipeline → wrong/partial runtime; see the
  playbook decision table.
- Colab disconnect mid-pipeline → local outputs are safe; `connect` the new
  URL and resume from the failed step using the storyboard as the state
  checklist.
