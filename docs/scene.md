# Scenes

`comfy-agent scene` turns a shot list into keyframes, video clips, an optional
music track, and a final edit. It records the inputs and outputs of each stage
and reuses completed work when those inputs have not changed. Planning and
validation do not contact ComfyUI.

## Start with existing files

Create a directory containing this `scene.yaml` and the listed assets:

```yaml
version: 1
name: morning
shots:
  - id: front
    dialogue: "Good morning!"
    keyframe: { file: assets/front.png }
    video: { file: assets/front.mp4 }
    cut: { start: 0.5, duration: 3.5 }
  - id: side
    keyframe: { file: assets/side.png }
    video: { file: assets/side.mp4 }
    cut: { start: 0.25, duration: 2.75 }
bgm:
  file: assets/music.wav
  start: 0
edit:
  fps_look: 12
  saturation: 0.96
  grain: 7
  voice_gain: 2.2
  bgm_gain: 0.32
  duck: { threshold: 0.05, ratio: 5, attack_ms: 15, release_ms: 280 }
  fade_out: 1
  limiter: 0.95
  crf: 15
  output: final.mp4
```

```bash
comfy-agent scene validate ./morning --json
comfy-agent scene plan ./morning --json
comfy-agent scene run ./morning --json
```

This uses local ffmpeg and ffprobe; it does not need a ComfyUI connection.
The final file is `morning/out/final/final.mp4`. A second run skips every stage.
Changing only `cut.duration` reruns only `edit`.

All `file` paths are relative to the scene directory. A file stage bypasses
generation defaults and never calls ComfyUI. `file` and `prompt` cannot appear
together. Keep source assets separate from `out/`, which contains managed outputs.
The source extension is preserved for imported and generated media.

## Generate keyframes and clips

```bash
comfy-agent scene init morning --character hero --form uniform --shots 2 --json
```

This writes `.comfy-agent/scenes/morning/scene.yaml`. Edit its placeholder
prompts and import the required presets before validating. `--force` replaces
only `scene.yaml`; it preserves state and outputs.
When `--character` is supplied, the character and form must already exist;
validation happens before anything is written. The template uses `{ref}` and
`{appearance}` for that character.

Generated stages require a local preset and an explicit integer `seed`.
The default template uses `p_h3_image_edit` and `minimax_h3_i2v`:

```yaml
version: 1
name: morning
character: hero
form: uniform
vars:
  style: "Flat two-tone cel shading, clean outlines."
defaults:
  keyframe:
    preset: p_h3_image_edit
    candidates: 2
    params: { width: 2592, height: 1440 }
    inputs: { image: "{ref}" }
    timeout_seconds: 300
  video:
    preset: minimax_h3_i2v
    input_size: [864, 480]
    params: { length: 124 }
    inputs: { image: "{keyframe}" }
    timeout_seconds: 1200
shots:
  - id: front
    keyframe:
      prompt: "A front view of the character running to school. Keep {appearance}. {style}"
      seed: 101
    video:
      # Replace with an H3 prompt following docs/minimax-h3-prompting.md.
      prompt: "Describe the motion, dialogue, soundscape and music here."
      seed: 41
    cut: { start: 0.5, duration: 3.5 }
```

Stage fields override `defaults`; `params` and `inputs` merge by key. Candidate
generation uses `run --n <count> --seed <seed> --seed-step 1`. A single keyframe
is selected automatically. Multiple candidates require an explicit pick:

```bash
comfy-agent scene plan morning --json
comfy-agent scene run morning --dry-run --json
comfy-agent scene run morning --json
# Inspect out/front/keyframe/candidates.png, then choose candidate 1:
comfy-agent scene pick morning front 1 --json
comfy-agent scene run morning --json
```

Follow `next_action` in the response. A shot waiting for a pick does not prevent
independent shots from running. The edit waits for all clips and any BGM to be
fresh. `--fail-fast` stops at the first failure or required pick.

Prompts for H3 must follow the [H3 prompt guide](minimax-h3-prompting.md),
including its three fields for the visual action, soundscape, and music.
The scene runner passes prompt text through; it does not write or improve it.

`bgm` can also use `preset`, `prompt`, `params`, `inputs`, `seed` and
`timeout_seconds` instead of `file`. Its `start` affects only the edit.

## Placeholders and presets

| Placeholder    | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| `{appearance}` | Selected form appearance, falling back to the character appearance  |
| `{ref}`        | First form reference, then a shared reference allowed for that form |
| `{keyframe}`   | Selected keyframe of this shot; only in `video.inputs`              |
| `{name}`       | Value of `vars.name`                                                |
| `{{` and `}}`  | Literal braces                                                      |

Variables expand in `prompt`, string values within `params`, and `inputs`.
Expansions are not recursive. Built-in names cannot be overridden in `vars`.
Character placeholders require a character and an available value. Unknown
placeholders produce `SCENE_INVALID` with the field in `error.details.path`.
`{keyframe}` must occupy the whole input value. With `input_size`, the runner
resizes it to those exact pixel dimensions before upload.

`prompt` maps to the preset parameter named or aliased `prompt`. `params` accepts
parameter names and aliases; `inputs` accepts upload slot names, flags, and
aliases. Validation checks these and required fields before generation. Put
seeds in `seed`, not in `params`. Presets and workflow JSON come from the selected
local/global work directory. Base URLs and timeouts do not invalidate outputs.
Only values specified by the scene are passed as generation arguments. The
`run` command applies the preset defaults, which also satisfy required parameters.

## Planning and selecting work

The scene argument accepts a YAML path, a directory containing `scene.yaml`, or
a name under `.comfy-agent/scenes/`. Names resolve locally, then globally;
`--global` selects global scene/preset storage. All subcommands support `--json`
and `--lang en|ja`.

| Status       | Meaning                                            |
| ------------ | -------------------------------------------------- |
| `fresh`      | Inputs and stored output hashes match              |
| `stale`      | Inputs, dependencies, or output contents changed   |
| `missing`    | No completed record or output is missing           |
| `needs_pick` | Keyframes are ready; select a candidate            |
| `blocked`    | A required upstream result or pick is unavailable  |
| `failed`     | The last attempt failed; inspect `error` and retry |

`reasons` identifies changed fields such as `video.prompt`, `edit.cut`, or
`upstream:front/keyframe`. `estimate_ms` is the last successful duration, the
median successful duration for that preset in this scene, or `null`.

```bash
comfy-agent scene run morning --shot front --shot side --only video --json
comfy-agent scene run morning --force front/keyframe --json
comfy-agent scene run morning --only edit --json
```

`--shot` selects only those shots; it excludes BGM and edit. `--only` selects a
stage kind and does not run its prerequisites. `--force` accepts exact stage IDs
and applies within those selections. Changing a pick or regenerating a keyframe
invalidates its generated video and the edit, even if the new image has identical
bytes. Regeneration clears the previous pick; one-candidate stages select their
sole result again. File-only videos remain independent of keyframe generation.

Dry runs write nothing and never launch generation. Runnable stages have an exact
`argv` array for `comfy-agent run` (or ffmpeg for the edit). Dependent stages are
`blocked`, with `waiting_for` and an `argv_template` containing placeholders such
as `<pending:front/keyframe>`. These templates are not executable commands.
`action` identifies work performed by a run: `generated`, `copied`, `edited`,
`skipped`, `failed`, or `dry_run`. A generation/edit failure exits with code 3;
waiting for a pick is not an error. `final` appears only when the edit is fresh.

## Edit and state details

Cuts snap to each clip's frame boundaries. An omitted cut starts at zero and uses
the whole clip; omit only `duration` to use the remaining clip. Invalid cuts name
the shot. Clips must have equal dimensions. Frame rates are normalized to the
first clip's rate. `fps_look` drops frames to the requested visual rate and restores
the output rate; set it to `null` to skip this effect.

Audio uses the same cut times, stereo 48 kHz output, and up to 20 ms fades at each
cut. Clips without audio contribute silence. BGM is ducked under the clip audio;
a short track is padded with silence. Without BGM, only clip audio is used. A final
fade and limiter apply to both cases. Output is H.264/AAC MP4, and the result is
probed for dimensions, duration and frame count. Set `COMFY_AGENT_FFMPEG` and
`COMFY_AGENT_FFPROBE` to override tool locations.

`.scene/state.json` stores schema-versioned canonical inputs, fingerprints,
relative output paths and hashes, job IDs, timings, failures, and selections.
It is written atomically after every stage. Original generation records remain
available through `jobs` and `history`. Keep the scene directory to retain the
incremental cache. Runs and picks use `.scene/write.lock` to prevent concurrent
writes. If a process is killed, verify that it has stopped before removing that
lock and retrying.

## Review a scene

```bash
comfy-agent scene report morning --json
# Read out/report/report.html and out/report/report.json.
# Adjust cut.start, cut.duration, or a prompt in scene.yaml, then:
comfy-agent scene plan morning --json
comfy-agent scene run morning --json
comfy-agent scene report morning --json
```

`report` always prints JSON and writes a static HTML report with local images and
no external assets. It works with partial scenes: missing outputs and stale stages
are identified, while existing media can still be inspected. Reports are snapshots;
regenerate the report after changing a scene or running new stages. `plan` and
`run` include a `report` path when the HTML file exists.

The report contains:

- Keyframe candidates beside the selected character reference, with dimensions
  checked against the preset width/height values when available.
- Three frames per clip (start, middle, end), the selected cut, detected speech-like
  intervals, a suggested cut start, expected dialogue and optional transcription.
- Final frames immediately before and after cut boundaries, duration versus the
  sum of frame-snapped cuts, distinct-frame ratios, mean/peak audio levels and a
  speech timeline. Source-shot intervals are mapped through the cuts; the final
  mix is analyzed separately because it can include music.

JSON media paths are relative to the scene directory. Image artifact paths are
relative to `artifact_base` (`out/report`), so the HTML can use local relative URLs.
Reports do not change generation state or fingerprints.

The HTML starts with a summary of every warning and links to the affected section.
JSON includes `warning_count` and `all_warnings: [{scope, code, message}]`.
Scopes are `scene`, `final`, or `shot:<id>`; this prefix distinguishes a shot named
`final` from the final edit. The existing per-section `warnings` arrays remain
available. Timeline labels stay at 12 CSS pixels on narrow screens.

### Speech-like intervals and cut warnings

Detection uses ffmpeg, with mono 16 kHz audio, a 300–3500 Hz pass band and
0.25-second RMS windows. The implementation uses
[ffmpeg's astats metadata](https://ffmpeg.org/ffmpeg-filters.html#astats)
after grouping samples into windows. It requires no speech model or network.

The 20th-percentile level is calculated from the window RMS levels and remains
named `noise_floor_db` in JSON for compatibility. It is not a measured noise floor:
in speech-dominated clips, it may include speech. The threshold is that level plus
10 dB, capped at the 90th percentile minus 6 dB to handle clips without a quiet
interval, and bounded below by −60 dBFS. This cap can put the threshold below the
20th-percentile level. Adjacent active windows
form an interval. `suggested_cut_start` is the first interval's start minus 0.25
seconds, clamped to zero. A clip with no detected interval has no suggestion.

This measures speech-like energy, not the presence or meaning of words. Music,
tones and noise can activate it; quiet speech may be missed. Window boundaries
are approximate. Inspect the media and, when useful, the transcript before
accepting a suggested cut.

| Warning               | Meaning                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `no_speech`           | No speech-like interval was detected, or the clip has no audio                       |
| `speech_cut_at_end`   | An interval overlaps the last 0.25 seconds of the selected cut                       |
| `cut_outside_speech`  | The cut excludes more than 0.5 seconds of detected speech in total                   |
| `transcript_mismatch` | Normalized character similarity is below 0.6                                         |
| `duration_mismatch`   | Final duration differs from the sum of cuts by more than one output frame plus 10 ms |
| `audio_peak_high`     | Final peak level exceeds −0.1 dBFS                                                   |

An analysis failure is marked `failed`, with a warning; it is not treated as
proof that the clip has no speech. Missing clips are `unavailable`.

The motion-frame ratio uses ffmpeg `mpdecimate` on 160-pixel-wide grayscale
frames to tolerate compression and grain. The exact decoded-frame hash ratio
is also included. Compare the motion ratio with approximately `fps_look / fps`;
static shots can lower it, and noise can raise it. These are inspection aids,
not an automatic quality verdict.

### Optional transcription

```bash
comfy-agent scene report morning --transcribe-cmd 'my-transcriber --file={audio}' --json
```

Or store the command in `scene.yaml`:

```yaml
checks:
  transcribe_cmd: "my-transcriber --file={audio}"
```

The flag takes precedence over `checks.transcribe_cmd`. `checks` has no effect
on generation fingerprints. Without a command, `transcript.status` is `skipped`.
The report exports each valid cut to a mono 16 kHz PCM WAV, replaces `{audio}`
inside each argument, and reads the command's trimmed standard output as text.
Commands run with the scene directory as their working directory.

Arguments support single/double quotes, whitespace and backslash escaping. No
shell is invoked: pipes, redirection, environment expansion and command
substitution are not supported. Wrap such operations in your own script.
Use `{audio}` even when it is part of an argument such as `--file={audio}`;
paths containing spaces remain one argument. Programs must print only the
transcript to stdout and put logs on stderr.

Each command has a 300-second timeout and a 1 MiB output limit. Non-zero exits,
timeouts and excessive output produce a `transcription_failed` warning while
the rest of the report continues. Clips without audio or with invalid cuts
skip transcription.

An optional shot-level `dialogue` string supplies the expected dialogue, including
for file-based videos that have no prompt:

```yaml
shots:
  - id: front
    dialogue: "Good morning!"
    keyframe: { file: assets/front.png }
    video: { file: assets/front.mp4 }
```

When set, `dialogue` overrides extraction from `<d>[language] text</d>` in the
video prompt; an empty string explicitly disables comparison. It is literal text
(no placeholder expansion) and does not affect any generation or edit fingerprint.
When omitted, tagged dialogue is extracted from the video prompt as before.
The comparison applies Unicode NFKC normalization, lowercasing, removal of
punctuation/whitespace/symbols, the elongation characters `ー`, `〜`, `っ`, `ッ`,
and small vowels `ぁぃぅぇぉァィゥェォ` plus `ゎヮ` on both sides,
then computes `1 - edit_distance / max_character_length`. Without expected
dialogue, the transcript is still shown but its similarity is `null`.
