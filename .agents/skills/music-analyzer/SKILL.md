---
name: music-analyzer
description: "Analyze WAV, MP3 or MP4 music locally for video editing: beats, onsets, loudness, dynamics, timbre, harmony, repeated regions and bounded editing cues. Use CLI interval queries before timing cuts or VFX."
license: MIT
---

# Music Analyzer

CPU-only, offline acoustic analysis for audiovisual planning. Requires Python 3.12+, FFmpeg and FFprobe. Implementation: `packages/music-analyzer/`. Install: `pip install -e '.[test]'` from that directory.

## Workflow

```bash
music-analyzer inspect music.mp4                         # audio streams; --audio-stream N if needed
music-analyzer analyze music.wav --output analysis.json  # WAV, MP3, MP4
music-analyzer validate analysis.json
music-analyzer overview analysis.json                    # compact global overview
music-analyzer context analysis.json --start 30 --end 50 # local acoustic evidence
music-analyzer compare analysis.json --start-a 30 --end-a 50 --start-b 90 --end-b 110
music-analyzer cues analysis.json --start 30 --end 50 --limit 30
```

Optional analysis flags: `--audio-stream N`, `--cache-dir PRIVATE_DIR`; `--experimental-structure-v3` runs the experimental recurrence detector. Default analysis uses structural V2 and marks V3 `not_requested`. Cache keys distinguish these modes. `decode` is available for raw PCM export (`--pcm-output`, `--metadata-output`).

## Using cues and comparisons

```bash
music-analyzer cues analysis.json --start 30 --end 50 --limit 30 \
  --categories beat onset energy harmonic_change structure_boundary \
  --selection representative --merge-coincident --merge-window-ms 30
music-analyzer cues analysis.json --start 30 --end 50 \
  --categories onset --min-relative-strength 0.2 --selection chronological
```

- `onset` is the preferred query category; `strong_onset` remains an accepted alias. Event `kind` can be `onset`, `strong_onset` or `onset_unranked`. Strength is relative to the **whole recording's** Mel onset envelope, not confidence or dB.
- `--merge-coincident` groups near-simultaneous cues of different categories **only in the response**; evidence retains each original time. `count` counts raw events, `merged_count` counts absorbed entries, `returned_count` counts returned cues, and `truncated` indicates omitted post-merge cues.
- `--selection representative` spreads cues over the interval and preserves available categories; `chronological` returns earliest cues. Both respect `--limit`.
- `compare` reports aggregate CENS/MFCC cosine scores, RMS differences and bounded multifeature DTW diagnostics. Similarity and DTW cost are **not** probabilities.
- `overview` summarizes rhythm, harmony, loudness and repetitions; `context` reports evidence confined to the requested interval.

## Available analysis fields

`rhythm` (BPM hypothesis, beats, onsets/tempo alternatives), `events` (onsets, acoustic changes, energy events), `curves.points` (RMS, spectral descriptors, chroma/CENS and 13 MFCCs), `loudness` (integrated LUFS, LRA, true peak), `stereo`, `signal_diagnostics`, `temporal_dynamics`, `harmony`, `structure.repeated_regions` (V2 acoustic candidates), `structure_v3` (opt-in experimental candidates), `quality`, and source metadata.

## Rules for the editing agent

1. Run and validate analysis against the intended source; prefer cached results only for matching source hash, stream and configuration. Never claim a command ran without its result.
2. Use interval queries instead of loading or copying the entire JSON into the agent context. Treat beat, onset, energy and structural cues as **suggestions**, not mandatory cuts.
3. Timestamps refer to **decoded PCM**, not verified source/editor timeline. Confirm editor mapping, trimming, offsets and playback rate before placing exact edits.
4. Do not infer lyrics, word timestamps, named instruments, isolated stems, emotions, genre, chords, key, downbeats or formal verse/chorus labels. Do not treat repetitions or change points as verified musical sections.
5. Never hardcode song-specific times or force visual cuts on every beat. Respect imagery, narrative, continuity and user instructions.

## Supporting references

- [Input and methods](references/input-formats-and-algorithms.md)
- [JSON and query contract](references/analysis-contract.md)
- [Validation and limitations](references/validation-plan.md)
- [Technical feasibility](references/technical-feasibility.md)

Adding this Markdown skill does **not** by itself register native editor tools; CLI execution requires an available local runtime.
