---
name: music-analyzer
description: "Use for time-varying, transcription-free music analysis for video editing: tempo, beats, onsets, acoustic dynamics, spectral timbre, tonal cues, musical change points, expressive/arousal heuristics, and local style descriptions. Read music-analysis.json and query time ranges before planning clips, VFX, transitions, or camera motion."
license: MIT
---

# Music Analyzer — system skill (design contract)

## Purpose
Provide **measured acoustic evidence** for music-video editing. Analyze the *entire original music timeline*, then allow the editing agent to query any interval for local tempo, activity, dynamics, texture, rhythmic events, changes, and limited interpretive estimates. Run deterministically on CPU without API credentials or neural models.

This skill defines the **integration and technical specification**. The Python package under `packages/music-analyzer/` provides CLI `inspect`, `decode`, and an **experimental** `analyze` command computing beats, onset events, RMS, centroid, rolloff, and flatness, writing a partial `music-analysis.json`. Verified source/editor-time mapping, downbeats, calibrated expressive heuristics, strict schema validation, caching and agent runtime tool registration remain **unimplemented**. Experimental acoustic segmentation and CLI `context` interval queries have now been added. Do not treat unverified decoded-time events as source-aligned timestamps.

## Mandatory boundaries
- NEVER transcribe, infer lyrics, align words, detect named instruments, separate sources, or label formal verse/chorus sections.
- Do NOT claim genres or emotions are objective observations. Report local **acoustic style descriptors** and heuristic expressive scores; optionally expose a tentative interpretation with explicit uncertainty.
- Never treat onset timestamps as beat timestamps, beat as downbeat, energy peak as a musical drop, or chroma-major/minor as happiness/sadness.
- Do not produce invented timings, bpm, confidence probabilities, or human-perceived valence from silence or unreliable evidence.
- Keep all timestamps in seconds relative to the unmodified source audio; preserve source duration, offset and hash.
- Never automatically map every beat into a video cut. Use the analysis as context while preserving visual continuity and the user's brief.

## How the agent should use the skill
1. Verify source audio and obtain a cached analysis matching its SHA-256 and analyzer/config versions.
2. If missing, request/execute the planned `analyze_music` tool only when a capable runtime is installed. Otherwise explicitly report that analysis has not run.
3. For every planned scene or timeline interval, request `get_music_context(start, end)`. Use measured beat/onset events for synchronization and medium-scale expressive segments for visual pacing.
4. Consider event `strength` as relative acoustic salience, **not** a statistical model confidence.
5. Make transitions primarily at supported events/change points, taking narrative symbolism and footage into account. Keep a global visual direction; local texture/mood does not force scene-wide style changes.
6. If optional lyrics timing JSON is supplied by the user, join on the **source audio timeline** without modifying or generating lyric timestamps.

## Processing pipeline (partially implemented; additional DSP planned)
- WAV, MP3 and MP4 supported: FFprobe stream inspection and FFmpeg audio decoding, explicit audio-stream selection, timing/codec-delay mapping; mono analysis signal; keep original sample offsets.
- DSP features: RMS/loudness proxy, spectral centroid, bandwidth, rolloff, contrast, flatness, ZCR, onset strength, tempo candidates, beat positions, beat strength, chroma/tonal stability, harmonic-percussive *feature decomposition* (no source separation outputs).
- Multi-resolution: 10–50ms event-level extraction (STFT-dependent), 3s / 0.5s hop local profile, 10–20s / 2s hop contextual profile; defaults adjustable and documented.
- Segmentation: normalized feature matrix, robust smoothing, change-point detection with configurable penalties and minimum duration, preserving important high-salience transients as events.
- Expressive heuristics: estimate acoustic activation (arousal proxy) and tension-related features; valence only as an uncertain optional inference, never as ground truth; output transparent component values and heuristic version.
- Global profile from robust aggregation; local profiles and boundaries must remain distinct. Provide `unknown` when evidence is ambiguous.
- JSON schema validation, deterministic caching, interval queries; optional future benchmarks.

## Planned tools
- `analyze_music(audio_path, output_path, profile="standard")` -> `music-analysis.json`.
- `get_music_context(analysis_path, start_seconds, end_seconds)` -> compact, grounded interval summary.
- `validate_music_analysis(analysis_path, audio_path)` -> schema, chronology, reproducibility and hash checks.

## References
- [Feasibility and method selections](references/technical-feasibility.md)
- [WAV/MP3/MP4 input pipeline, timestamp mapping and DSP algorithms](references/input-formats-and-algorithms.md)
- [Machine-readable output contract](references/analysis-contract.md)
- [Evaluation and phased implementation](references/validation-plan.md)
