# Video prompts (LTX / Wan / Hunyuan and general video)

Use subject → action over time → camera → light → style. Preserve the user's
intent; fill only the structure needed to express it clearly.

- Give the subject one readable sequence of actions that fits the clip length.
  Avoid packing unrelated events into a short clip.
- Describe change over time: an initial state, movement and an ending state
  if these are present in the request.
- Distinguish subject motion from camera motion. Keep camera direction
  consistent and avoid contradictory moves.
- For image-to-video, the input already establishes appearance. Focus on the
  requested motion and preserve the reference subject and composition.
- For first/last-frame workflows, describe a plausible transition between the
  supplied frames without inventing intermediate events.
- State light or style only when requested or established by supplied material.
- Audio support varies by workflow. Do not promise sound on a silent profile
  and do not invent music or dialogue. MiniMax H3 uses its dedicated guide.
- Match actions to the selected duration. Suggest a duration change separately
  when necessary, using supported settings; never apply it automatically.

Return a usable prompt and a brief explanation in the UI language, including
camera or timing changes only when they were actually made.
