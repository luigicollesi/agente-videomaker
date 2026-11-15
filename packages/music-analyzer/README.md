# Music Analyzer

Offline, CPU-first acoustic analysis for music-video editing. Requires **Python 3.12+**, **FFmpeg** and **FFprobe**. Supports local WAV, MP3 and MP4 audio streams.

## Install and test

```bash
cd packages/music-analyzer
python -m pip install -e '.[test]'
python -m pytest -v
```

## Analyze and query

```bash
music-analyzer inspect song.mp4                      # inspect streams
music-analyzer analyze song.wav --output analysis.json
music-analyzer validate analysis.json
music-analyzer overview analysis.json
music-analyzer context analysis.json --start 30 --end 50
music-analyzer compare analysis.json --start-a 30 --end-a 50 --start-b 90 --end-b 110
music-analyzer cues analysis.json --start 30 --end 50 --limit 30 \
  --categories beat onset energy harmonic_change structure_boundary \
  --selection representative --merge-coincident --merge-window-ms 30
```

`analyze` accepts `--audio-stream N` and optional `--cache-dir DIR`.
`--experimental-structure-v3` enables the experimental recurrence detector;
default analysis uses Structural V2 and marks V3 `not_requested`. `decode`
exports PCM with `--pcm-output FILE --metadata-output FILE`.

The JSON contains estimated BPM, beats, onsets and strengths; RMS/spectral,
MFCC/CENS and harmonic features; local dynamics; global LUFS/LRA/true peak;
stereo metrics; structural repetition candidates and query metadata.

Cues: `strong_onset` remains a legacy alias for query category `onset`;
event `kind` distinguishes ordinary/strong/unranked onsets.
`--min-relative-strength` filters measured strengths.
Without `--merge-coincident`, events remain separate. Fusion preserves original
timestamps and evidence; `count` reports raw events, `merged_count` absorbed
entries, `returned_count` returned cues and `truncated` omitted post-fusion cues.
`representative` balances temporal coverage; `chronological` preserves earliest-first.

**Limitations:** temporal coordinates follow decoded PCM, not verified editor
time. Beats, acoustic changes, similarity and DTW are estimates, not ground
truth. No ASR, lyric alignment, named instruments, stems, genre/emotion or
formal chorus/verse identification. This Markdown skill alone does not install
native editing-agent tools.

See [agent skill](../../.agents/skills/music-analyzer/SKILL.md) for usage rules.
