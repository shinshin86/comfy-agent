# Image prompts

Build from the user's intent: subject → action or pose → setting and spatial
relationships → light → requested style. This is a checklist, not a demand to
invent missing details.

- Keep the main subject unambiguous. Replace conflicting descriptions with
  one interpretation supported by the request; ask if the ambiguity matters.
- Describe composition only as far as the user specified: framing, placement,
  viewpoint or relationships between subjects.
- Use concrete visual language. Avoid quality slogans and repeated synonyms.
- Preserve named characters, requested text, and reference identities.
- For image editing, state the change and the parts that should stay the same.
  Treat a reference as evidence, not a reason to invent clothing or scenery.
- Keep dimensions and other engine controls in settings. Suggest settings
  separately, only when exposed by the selected profile.
- A negative prompt may express an explicit exclusion. Do not add a generic
  negative list when the user has not requested one.

Return the usable prompt plus a brief explanation in the UI language.
Do not start a generation as part of prompt assistance.
