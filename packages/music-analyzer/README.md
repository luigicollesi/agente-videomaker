# Music Analyzer — implementation milestone 1

CPU-first decoder foundation for the Music Analyzer system skill.

## Setup

Requires Python 3.12+, FFmpeg and FFprobe on PATH.

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e '.[test]'
pytest -q
music-analyzer inspect /path/to/music.mp3
music-analyzer decode /path/to/music.mp3 --pcm-output /tmp/music.f32le --metadata-output /tmp/music-decoded.json
```

The CLI currently implements only stream inspection and PCM decoding.
It does **not** yet produce `music-analysis.json` or expose `analyze_music`,
`get_music_context`, or `validate_music_analysis`.

## Temporal integrity

The metadata marks `timestamp_mapping=unverified` and
`timeline_offset_seconds=null` until alignment with the desktop editor
is established. Do not interpret decoded PCM timestamps as verified
source-timeline event positions.

Next milestones: timebase verification, schema v1, DSP, segmentation,
expressive heuristics and desktop tool registration.

## DSP milestone (experimental)

The analyzer now supports a preliminary `analyze` command:

```bash
music-analyzer analyze /path/to/audio.wav --output /tmp/music-analysis.json
```

Output includes estimated BPM/beats, onset events, RMS dBFS, spectral
centroid, rolloff and flatness curves every 0.5s. The source timeline mapping
is still **unverified**. Downbeats, segmentation, chroma, expressive heuristics,
strict schema validation, caching, and editor integration are not available yet.

Do not mistake estimated BPM or acoustic attack strength for calibrated confidence.
