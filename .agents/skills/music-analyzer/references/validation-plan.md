# Validation and release boundaries

## Current validation
The decoder, DSP, CLI queries, cue grouping and optional structural V3 have dedicated synthetic tests. The 332-second reference track previously returned 89.103 BPM, 477 beats and 1,195 onsets; these are **regression references**, not universal accuracy guarantees.

## Run checks

```bash
cd packages/music-analyzer
python -m pip install -e '.[test]'
python -m pytest -v
music-analyzer analyze music.wav --output analysis.json
music-analyzer validate analysis.json
music-analyzer cues analysis.json --start 0 --end 20 --merge-coincident
```

Verify consistent timestamps, distinct cache keys for opt-in V3, nonmutating fusion, correct `truncated`, finite metrics and silent/no-audio handling. Compare WAV, MP3 and MP4 independently.

## Unverified / excluded
- Source-to-editor timestamps, codec delays and clip-speed mapping still require validation with the actual editor.
- Structural V3 stays opt-in until a multi-track annotated benchmark demonstrates improvement over V2.
- No claim of annotated ground-truth beat accuracy or native desktop-agent tool registration.
- No speech transcription, lyrics alignment, genre/emotion inference, instrument identification, stem separation, key/chord/downbeat classification.

Do not tune detectors to hardcoded song timestamps. Favor the proven Mel onset tracker and minimal, measured regression fixes.
