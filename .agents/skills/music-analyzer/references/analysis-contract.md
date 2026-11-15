# Output and query contract — Music Analyzer

`music-analyzer analyze AUDIO --output analysis.json` emits schema `1.0.0` with `source`, `rhythm`, `events`, `curves`, `segments`, `features`, `loudness`, `stereo`, `signal_diagnostics`, `temporal_dynamics`, `harmony`, `structure`, `structure_v3`, `quality`, `warnings` and `cache_revision`.

- `source.decoded_duration_seconds`, `source.source_sha256`: identity and decoded duration.
- `rhythm.bpm_estimate`, `rhythm.beats[]`: estimated global tempo and beat timestamps; `events[]` has `type: onset` with `time_seconds`, `strength` and method.
- `curves.points[]`: half-second acoustic features, including RMS, chroma/CENS and MFCC. `loudness` is a separate global EBU R128 measurement.
- `structure.repeated_regions[]`: interval pairs with duration, similarity and evidence, **not** confirmed chorus/verse. `structure_v3.status: not_requested` by default.
- All temporal coordinates are decoded-PCM-relative until source/editor mapping is verified. Unknown measures remain null or explicitly unavailable.

## CLI queries

```bash
music-analyzer validate analysis.json
music-analyzer overview analysis.json
music-analyzer context analysis.json --start 10 --end 25
music-analyzer compare analysis.json --start-a 10 --end-a 25 --start-b 60 --end-b 75
music-analyzer cues analysis.json --start 10 --end 25 --limit 30 \
  --categories beat onset energy harmonic_change structure_boundary \
  --selection representative --merge-coincident --merge-window-ms 30
```

`strong_onset` is a legacy alias for the `onset` query category, **not** a request to return only high-strength events. `kind` distinguishes onset strength classifications. `--min-relative-strength` excludes events with missing strengths for positive limits. `--selection chronological` yields earliest matches.

For `cues`: `count` = raw matching events, `merged_count` = events absorbed by optional fusion, `returned_count` = output size; `truncated` is computed **before** representative sampling. Combined cues retain original timestamps in `evidence[]`.

`compare.sequence_comparison` reports bounded DTW alignment cost, path ratio and feature coverage; scores are not calibrated probabilities. Validate source hash/configuration before reuse.
