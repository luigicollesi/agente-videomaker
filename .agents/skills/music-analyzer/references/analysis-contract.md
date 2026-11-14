# Music analysis JSON contract — draft v1

The analyzer must publish a versioned JSON schema. Example fields:

```json
{
  "schema_version": "1.0.0",
  "analyzer": {"name": "music-analyzer", "version": "0.1.0", "profile": "standard"},
  "source": {"sha256": "<64-hex-audio-hash>", "duration_seconds": 332.0, "sample_rate_hz": 44100, "timeline_offset_seconds": 0.0},
  "capabilities": {"transcription": false, "source_separation": false, "neural_models": false},
  "rhythm": {
    "bpm_estimate": null,
    "tempo_candidates": [],
    "beats": [],
    "downbeats": [],
    "tempo_curve": []
  },
  "curves": {
    "hop_seconds": 0.5,
    "points": []
  },
  "segments": [],
  "events": [],
  "global_style_descriptors": [],
  "warnings": []
}
```

This is a **schema sketch**, not a complete real output.

## Details
- Beat entries: `{time_seconds, strength, reliability_flag, source_method}`. Downbeats are empty unless positively supported by a downbeat detector.
- Curves: aligned `time_seconds` with named acoustic measures and explicitly named heuristic `activation`, `tension_cues`. Every field has normalization metadata (method, reference). No forced `valence`.
- Segments: `{start_seconds,end_seconds,acoustic_character:[...],evidence:[...],interpretation_status:"heuristic"|"unknown"}`; adjacent intervals may meet without overlapping.
- Events: `{type,time_seconds,strength,source_method}` with vocabulary `beat,onset,energy_rise,energy_drop,transient_peak,silence_start,silence_end,timbre_change,change_point`; other events require an explicit vocabulary revision.
- All scores use 0..1 with documented normalization (except actual physical/tempo measurements); null means unmeasured, NOT zero.
- Never emit calibrated `confidence` without calibration. Use descriptive quality flags and evidence instead.
- Provide a separate compact interval query output with `start_seconds,end_seconds,summary_features,beat_events,change_events,acoustic_character`.
- Validate finite numbers, ascending timestamps, valid intervals, hash, duration, hop monotonicity and schema version; reject NaNs and infinities.
- Timeline joins with externally supplied lyrics must align via source audio time/offset; no lyric extraction in this skill.
