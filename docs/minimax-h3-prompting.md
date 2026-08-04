# MiniMax H3 prompt construction guide (for orchestrating agents)

How an AI agent (Claude Code, Codex, or any orchestrator driving the
`comfy-agent` CLI) should turn a user's request into an optimized prompt
for the `minimax_h3` Colab kit (`minimax_h3_t2v` / `minimax_h3_i2v`
presets, ComfyUI `MiniMaxH3ImageToVideo` node).

This is an original synthesis written for the single-prompt-block ComfyUI
path. It reinterprets ideas from the upstream MiniMax prompt guide, fal.ai's
H3 guide, and the ComfyUI tutorial (links at the bottom) — it is not a copy
of any of them, and hosted-API-only features (multi-reference, video/audio
references) are intentionally out of scope.

## Mental model

Three facts drive everything below:

1. **H3 renders picture and stereo audio in one pass.** The prompt is a
   complete audiovisual script, not an image caption. Any channel you stay
   silent about (ambience, music, dialogue) the model fills in on its own —
   so direct the audio as deliberately as the visuals.
2. **H3 responds to production-style descriptions.** Concrete film
   language — shot sizes, camera verbs, cut phrasing, physical events on a
   timeline — steers it far better than abstract mood adjectives.
   "Melancholic atmosphere" is weak; "slow push-in on an empty chair while
   rain streaks the window" is strong.
3. **The ComfyUI node takes one text block.** Compose that block in four
   layers, always in this order.

## The four layers

Decide the content in four layers, in this order, then render them into the
final block (next section):

### 1. Style and opening composition (1 sentence)

The first sentence locks the rendering style and what is in frame at t=0:
style keyword (cinematic live-action, 2D anime, 3D CG, claymation,
watercolor, vintage film, ...), shot size (wide / medium / close-up),
subject, and setting. Style drift is nearly impossible to fix later, so it
goes first.

### 2. Timeline: action + camera (the body)

Describe events in chronological order. Each beat pairs a subject action
with a camera behavior. For multi-shot videos, mark every cut explicitly
("the shot cuts to ...") — otherwise H3 tends to hold one continuous shot.

Camera vocabulary H3 reads directly:

| Category | Verbs |
|---|---|
| Depth | push in, pull out, zoom in, zoom out |
| Lateral | pan left/right, truck left/right, arc around |
| Vertical | tilt up/down, pedestal up/down |
| Follow | tracking shot, POV |
| Character | static shot, handheld shake (slight/strong), roll |

Modifiers: amplitude (`with small/large amplitude`) and speed
(`at slow/fast speed`). Example: "the camera pushes in with small amplitude
at slow speed toward her hands." One camera instruction per shot; stacking
three moves into one shot degrades control over all of them.

### 3. Diegetic soundscape (1–4 sentences)

Everything the characters could hear: ambience, action sounds, non-verbal
human sounds. Name concrete sources — "rain on a tin awning, oil sizzling in
a wok, footsteps on wet asphalt" — never "atmospheric sound design". Do not
put dialogue here; dialogue lives in the timeline where it happens.

### 4. Non-diegetic music (1–3 sentences, or `N/A`)

Describe the score as a musician would: instrumentation, tempo, rhythm,
dynamics, and where it changes ("a sparse upright-bass line under soft
brushed drums, swelling in the final two seconds"). Pure mood words
("emotional music") produce generic results. If you want silence apart from
ambience, write `non_diegetic_music: N/A`.

## Rendering the final block: official field format

The MiniMax official prompt guide specifies a three-named-field layout, and
ComfyUI's encoder passes your text to the model **verbatim** — no chat
template, no field structure is added for you (confirmed in the pinned
ComfyUI revision's `comfy/text_encoders/minimax.py`: "the H3 presentation is
NOT chat-templated"). We cannot verify what the training data looked like,
but this is the format the model's authors tell prompt writers to use, so
default to it and write the field names yourself:

```text
integrated_multimodal_description: [Shot 1] <layers 1–2: style, opening frame, timeline with camera language, dialogue where it happens>

overall_soundscape: <layer 3>

non_diegetic_music: <layer 4, or N/A for no score>
```

The description opens at `[Shot 1]` (Shot 1 carries no timestamp; each later
shot is marked `[Shot N, MM:SS.SSS]` with its cut time).

For I2V runs, ComfyUI splices a `<Picture 1>` label (with the encoded image)
ahead of your prompt. Put the official alignment sentence on the first line,
then a blank line, then the three fields:

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] ...

overall_soundscape: ...

non_diegetic_music: ...
```

When a preset also wires `last_frame` (FL2V), do not append a second
sentence to the I2V line — use the dedicated FL2VA alignment sentence, which
names both pictures in one sentence, in the same first-line position:

```text
How the reference pictures align with the target video — <Picture 1> (from [Shot 1]) aligns with the 0.00-second mark of the target video; <Picture 2> (from [Shot N]) aligns with the S.SS-second mark of the target video.
```

Compute `S.SS` from the **aligned** frame count, not the raw `length` input:
ComfyUI snaps any `length` up to the 17k+5 grid, so the last frame sits at
`(aligned_length − 1) / 24` seconds (e.g. `length` 124 → 123 / 24 = 5.13).

Plainer prose blocks with `Audio:` / `Music:` labels also generate coherent
results — the bundled workflows' default prompts are plain prose and passed
the kit's E2E verification — but no side-by-side comparison against the
field format has been run. Default to the field format; treat prose as the
fallback for quick drafts.

## Match structure to duration

`length` is a frame count on H3's 17k+5 grid at 24 fps. Budget narrative
beats to the frames you actually have:

| `--104_length` | Duration | Structure that fits |
|---|---|---|
| 124 | ~5.2 s | One shot, one action beat. 2–5 sentences total. |
| 243 | ~10.1 s | Two or three beats, at most one cut. |
| 362 | ~15.1 s | A timecoded shot list: `[0–4 s] ... [4–9 s] ... [9–15 s] ...` |

Overstuffing is the most common failure: ten events in five seconds means
the model rushes, drops instructions, or slideshows. When a user asks for
more story than the duration holds, either raise `length` or split into
multiple runs — say so instead of cramming.

## T2V vs I2V

**T2V** (`minimax_h3_t2v`): you own everything; the more completely the four
layers are filled in, the more predictable the result.

**I2V** (`minimax_h3_i2v`, first frame supplied): the image already answers
"what does t=0 look like", so the prompt's job changes:

1. **Anchor** — state what must be preserved from the input image. For
   characters, enumerate concrete features (hair style/color, clothing,
   accessories, palette) rather than saying "keep the character consistent";
   named details give the model something specific to hold.
2. **Onset** — the first motion that breaks the stillness.
3. **Development** — how action and camera evolve.
4. **Settle** — the state or reaction the clip lands on.

Do not re-describe scene content the image already shows unless you are
locking it; spend the words on what *changes*.

**First + last frame (FL2V):** the ComfyUI node also accepts an optional
`last_frame` (not wired in the bundled kit workflows). When a preset exposes
it, write the prompt as a convergence: starting state → the observable
intermediate changes → differences narrowing → landing exactly on the final
frame. Prefer one continuous shot; cuts between two fixed endpoints tend to
break the interpolation.

## Dialogue and on-screen text

The official guide defines explicit speaker and dialogue markup — use it
rather than plain quotation:

- **Speaker IDs.** On a speaker's first appearance, cast the voice (apparent
  age, gender, vocal quality) and assign a stable ID: "a woman in her 20s
  with a bright, clear voice (S1)". Reuse `(S1)` for every later line; use
  `(S1,S2)` when they vocalize together.
- **Dialogue tags.** Wrap each line in `<d>` tags with the language named,
  preserving the original punctuation:
  `(S1) smiles and says: <d>[Japanese] いらっしゃい！</d>`
  Budget roughly one short line per ~3 seconds of video.
- **Voiceover.** Write "says in an off-screen voiceover" and add that the
  on-screen character's lips remain completely closed, or H3 may lip-sync
  them.
- **Across cuts.** If a line continues over a cut, close the first fragment
  with `<scenetrans>` and open the continuation with `<scenetrans>` — the
  marker goes on **both sides** of the cut — and state in the timeline that
  the voice continues uninterrupted. If speech is deliberately cut short at
  the end of the video, end it with `<cutoff>`.

Three minimal examples:

Normal dialogue —

```text
A woman in her 20s with a bright, clear voice (S1) waves and says: <d>[Japanese] いらっしゃい！今日はいいのが入ってるよ。</d>
```

Voiceover (note the closed-lips clause) —

```text
The same woman (S1) says in an off-screen voiceover, while her lips remain completely closed: <d>[Japanese] あの日のことは、今でもよく覚えている。</d>
```

Dialogue continuing across a cut (both `<scenetrans>` markers, audio
continuity stated, ending truncated with `<cutoff>`) —

```text
[Shot 1] A man in his 40s with a low, gravelly voice (S1) looks out the window and says: <d>[Japanese] 雨はまだ止まないな。だが<scenetrans></d> [Shot 2, 00:03.000] The shot cuts to the empty doorway while his voice continues without interruption: <d>[Japanese] <scenetrans>そろそろ行く時間だ<cutoff></d>
```

**On-screen text** (titles, signs, UI): put the exact string in double
quotes, state its language, ask for verbatim reproduction, and describe its
entrance/exit as a physical animation ("resolves from soft blur into sharp
focus", not "appears elegantly"). Long text at small sizes invites garbled
glyphs — keep overlay text short and large.

## Negative direction

H3 follows explicit prohibitions unusually well. End the block with one or
two concrete `No ...` sentences targeting the failure you actually fear for
this shot: `No subtitles, watermarks, or on-screen text.` / `No additional
people enter the frame.` / `No camera movement other than the specified
push-in.` Generic negative walls waste tokens; specific ones steer.

## Transitions as physical events

Describe cuts and transitions as motion the camera or scene performs, with
timing — "cut at the peak of the splash, then the next shot settles from
motion blur into focus" — rather than naming editor effects. If you truly
want a dissolve or fade, request it explicitly; otherwise H3 defaults to
hard cuts.

## Parameter mapping (`comfy-agent run`)

| Flag | Meaning | Notes |
|---|---|---|
| `--104_prompt` | the prompt block | the four layers above |
| `--104_length` | frame count | 17k+5 grid: 124 / 243 / 362 |
| `--104_width` / `--104_height` | canvas | multiples of 32. The model's native canvas is a **768 px short edge with total area capped at 768×1344 px** (~1.03 MP) — a pixel-area budget, not per-axis limits, so extreme ratios can run the long edge past 1344. Start from the bundled 864x480. |
| `--15_noise_seed` | seed | fix it while iterating the prompt |
| `--image` | first frame (I2V only) | enables the anchor pattern |
| `--timeout-seconds` | e.g. 1800 | A100 runs are minutes-long |

## Iteration protocol

1. **One variable at a time.** Keep the seed fixed while editing the prompt.
   Reroll the seed only when the prompt reads right but the composition got
   unlucky.
2. **Verify both channels.** Extract frames (`ffmpeg`) for the picture and
   probe the audio (`ffprobe`, level check) against the soundscape/music
   direction before judging a run — audio drift is invisible in frames.
3. **Promote ignored instructions.** If H3 dropped something, move it
   earlier in the block, restate it as a physical event, or back it with a
   matching `No ...` line — don't just repeat the same sentence.

## Worked examples (original)

Both examples echo the project's mascot (an anime-style young woman with cat
ears at a terminal) and its live-action counterpart, covering one animated
and one photoreal case.

**T2V, 124 frames (one beat), official field format:**

```text
integrated_multimodal_description: [Shot 1] 2D-animated medium shot of a young woman with white cat ears and long silver hair, seated in a dim room lit by a large monitor showing a node-graph interface. She types a short command, pauses, and presses Enter; the node graph lights up node by node as a progress bar fills, and a soft cyan glow rises on her face while she leans in. On the monitor, a rounded terminal window shows the text "RUN", reproduced verbatim. The camera pushes in with small amplitude at slow speed toward her face and the screen. No other characters appear. No subtitles or watermarks.

overall_soundscape: Quiet room tone with the soft patter of keyboard keys, one decisive key press, the low hum of a workstation fan, and a gentle rising chime as the progress bar completes.

non_diegetic_music: A minimal synth arpeggio at a relaxed tempo, low in the mix, adding one warm pad layer in the final two seconds.
```

**I2V, 243 frames (anchor → onset → development → settle):**

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] Cinematic live-action. Preserve the woman from <Picture 1> exactly: tied-back black hair, round glasses, gray hoodie, and the dual-monitor workstation lit by a warm desk lamp. She clicks once and a render completes on the left monitor; she leans closer to inspect it, then sits back and smiles with quiet satisfaction, pulling one earphone out. The camera holds a static shot, then pulls out with small amplitude at slow speed. No new characters enter; the room stays unchanged.

overall_soundscape: Mouse clicks, the whir of a desktop fan, faint city ambience through a window, fabric rustle as she leans back, and a soft satisfied exhale.

non_diegetic_music: A sparse piano motif over a quiet ambient pad, unhurried, fading out in the final second.
```

## Sources (reinterpreted, not reproduced)

- MiniMax official prompt writing guide:
  <https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md>
- fal.ai MiniMax H3 prompting guide:
  <https://fal.ai/learn/devs/minimax-h3-prompting-guide>
- ComfyUI MiniMax H3 tutorial:
  <https://docs.comfy.org/tutorials/video/minimax/minimax-h3>

License reminder: the H3 weights carry territory and use restrictions — see
[`scripts/colab/minimax_h3/README.md`](../scripts/colab/minimax_h3/README.md).
