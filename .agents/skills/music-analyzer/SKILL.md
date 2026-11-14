---
name: music-analyzer
description: "Use for time-varying, transcription-free music analysis for video editing: tempo, beats, onsets, acoustic dynamics, spectral timbre, tonal cues, musical change points, expressive/arousal heuristics, and local style descriptions. Read music-analysis.json and query time ranges before planning clips, VFX, transitions, or camera motion."
license: MIT
---

# Music Analyzer — system skill (implemented CLI and evolving analysis contract)

## Purpose
Provide **measured acoustic evidence** for music-video editing. Analyze the *entire original music timeline*, then allow the editing agent to query any interval for local tempo, activity, dynamics, texture, rhythmic events, changes, and limited interpretive estimates. Run deterministically on CPU without API credentials or neural models.

This skill defines the **integration and technical specification**. The Python package under `packages/music-analyzer/` provides CLI `inspect`, `decode`, and an **experimental** `analyze` command computing beats, onset events, RMS, centroid, rolloff, and flatness, writing a partial `music-analysis.json`. Verified source/editor-time mapping, downbeats, calibrated expressive heuristics, strict schema validation, caching and agent runtime tool registration remain **unimplemented**. Experimental acoustic segmentation and CLI `context` interval queries have now been added. Objective signal peak, crest factor, DC offset, STFT chroma, bandwidth, contrast and zero-crossing metrics are present, with no emotional or genre classification. Do not treat unverified decoded-time events as source-aligned timestamps.

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

## Current agent-facing workflow (implemented)

The system skill can use the executable `music-analyzer` from the locally
installed `packages/music-analyzer` Python package:

```bash
music-analyzer inspect /path/to/audio.wav
music-analyzer analyze /path/to/audio.wav --output /path/to/music-analysis.json
music-analyzer validate /path/to/music-analysis.json
music-analyzer context /path/to/music-analysis.json --start 80 --end 105
```

The current analyzer additionally includes `harmony` (pitch-class profile,
chroma entropy, local chroma novelty) and `structure` (bounded chroma
similarity candidates), calculated from the current sampled chroma curve.
These are **objective/heuristic acoustic descriptors**, not chords, detected
keys, genres, emotions, or chorus/verse annotations.

Agent procedure:
1. Never claim analysis executed unless a locally available runtime returns a result.
2. Validate the JSON before requesting interval context.
3. Verify the JSON source SHA-256 matches the selected audio before use.
4. Do not use its decoded-PCM-relative timestamps as verified editor clip
   timestamps; establish editor offset/priming mapping first.
5. Use `get_music_context` only for the selected source and interval.
6. The rhythm tracker remains the previously validated Mel onset implementation;
   alternate flux is a separate descriptor and must not silently replace it.
7. Keep source media private; commands above are local and require no API keys.

The skill metadata is a guide for the local editing agent; no native
desktop skill-tool registration is implied merely by adding this document.

## Structural Analysis V2 (experimental)

`music-analyzer analyze` includes `structure.repeated_regions` from
`structure_v2.detect_repeated_regions`: a conservative diagonal sequence
matcher using chroma, RMS, spectral centroid and normalized spectral flux.
Each candidate includes two continuous intervals, duration, score, evidence,
and an explicit acoustic-only interpretation status.

Use `structure.repeated_regions` for proposed structural correspondence.
The old `structure.repetitions` field contains legacy two-second chroma-only
similarity pairs and MUST NOT be interpreted as musical sections.
`music-analyzer context` returns repeated regions overlapping the requested
interval. Scores are similarity measures, not calibrated probabilities.
Neither method labels chorus, verse, emotion, or genre.

Do not treat any candidate as proven until synthetic tests and real recording
evaluation have passed. The sequence matcher is fixed-tempo (diagonal),
cannot yet accommodate tempo-warped repetitions, and uses current sampled
chroma rather than true CENS. No editor-native tool registration is claimed.

## Structural/timbre extraction milestone

`music-analyzer analyze` now adds 13 MFCC coefficients (log-Mel DCT)
per curve point using the existing bounded STFT batches and computes
librosa CENS on the time series of sampled chroma. Structural V2 matching
prefers CENS and includes MFCC as independent timbre evidence; if the
features are absent, it uses the previous data fields. Interval
`music-analyzer context` output reports average MFCC/CENS vectors.

These are fixed-rate, heuristic descriptors; the implementation is not
a source of calibrated musical repetition probabilities. Do not present
repeat candidates as confirmed chorus, verse, lyrics, chords, or emotions.
The existing Mel-onset beat tracker MUST remain unchanged.

Remaining V1.0 requirements: CQT, local LUFS, downbeats and local
tempo hypotheses, robust sequence alignments with tempo variation,
feature cache/store, native agent tool registration, source/editor
timebase verification, full real-audio regression and benchmark suite.

## Incremental dynamics and reusable analyses

The standard `analyze` result now contains `temporal_dynamics`, with
smoothed RMS dBFS and acoustic swell/fall candidates. The context tool
returns those curves and events restricted to the requested time range.

When the user has approved on-disk caching, invoke:
`music-analyzer analyze <audio> --output <json> --cache-dir <private-cache-path>`.
The same source SHA, selected audio stream, analyzer and pipeline revision
are required for cache reuse. The cache is not a trusted provenance
attestation and should not be shared among untrusted users. Do not claim
rms_dBFS measurements are LUFS, and never describe energy changes as proven
chorus entries or drops.

This milestone does not establish exact source/editor timestamp alignment.
