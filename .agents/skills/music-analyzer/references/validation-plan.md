# Implementation and validation plan

Status: design only, no executable analyzer yet.

## Phased implementation
1. **Skeleton / contracts**: Python package, CLI, JSON Schema, FFprobe + FFmpeg WAV/MP3/MP4 stream-selection and decoding with timestamp mapping, SHA-256 cache key, tests on empty/silent and synthetic audio.
2. **Deterministic DSP**: librosa/SciPy rhythms, onset and beat timestamps, energy, spectral descriptors, robust normalized local curves. Reproducible feature metadata.
3. **Temporal context**: multi-resolution windows, smoothing, change-point segmentation (ruptures optional), event de-duplication, per-interval query API.
4. **Expressive heuristics**: transparent activation and tension indicators; abstain from fixed genre and confident valence claims; visual suggestions only in agent layer.
5. **Editor integration**: register tools, make output available to music video planning and effects workflows, join optional external word-timing JSON by audio offset.
6. **Evaluation**: benchmark full-length 332s audio CPU peak RSS, duration, accuracy of rhythmic timestamps versus manually annotated reference and synthetic known-tempo signals; compare effects scene choices with/without context.

## Tests required
- Silence / non-musical audio: refrain from manufacturing BPM, beats or emotion.
- Click track tempo known and changing BPM: report ambiguity in half/double-time and local variation.
- WAV (PCM16/float), MP3 (VBR, delay/priming), MP4 (AAC, multi-stream, start timestamps and edit lists), video-only and malformed media: correct stream selection, rejection, timing alignment and decoded-reference consistency.
- Stereo and non-44.1kHz sources: consistent timestamps after resampling.
- Gradual crescendos vs isolated transients: separate `energy_rise` from `transient_peak`.
- Ambiguous harmony, distorted timbre and major/minor edge cases: avoid emotion certainty.
- Short abrupt events within long smooth spans: preserve events, avoid forced segment proliferation.
- Stable JSON schema, event ordering, finite scores, no end-of-track overruns.
- Cached analysis invalidates with changed audio hash or algorithm/parameter version.
- Structural output never includes word/transcript/phoneme fields; no named-instrument labels, section-type labels or source-separated audio.

## Release gates
- First run in strict CPU mode with no PyTorch/TensorFlow dependency.
- Record runtime and maximum RSS on reference hardware; do not assume performance.
- Human review of at least three disparate tracks before trusting expressive mappings.
- Agent makes no more than necessary scene/style transitions; beat events are advisory, not mandatory edits.
- CI unit tests pass; integration with the actual editor and rendered timeline remains separate work.
