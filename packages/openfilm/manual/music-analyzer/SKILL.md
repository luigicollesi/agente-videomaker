---
name: music-analyzer
description: Analyze WAV, MP3 and MP4 music locally to guide video edits using beats, onsets, loudness, energy, timbre, harmony and repeated regions. Use before beat-synced cuts, music-driven effects and timing decisions.
license: MIT
---

# Music Analyzer (system skill)

Use the existing local analyzer in `packages/music-analyzer/`. This skill is provided to the editing agent by default; it is not a transcript or lyrics aligner.

## Native MCP tools

When the local `videomaker-media` MCP is available, prefer `music_analyze` (WAV/MP3/MP4 input and new JSON output in `assets/`), `music_overview`, `music_context` and `music_cues` (queries of that JSON). These tools run the same Python analyzer, not a second implementation. Install the Python dependencies first; missing dependencies are reported as errors. Use short time ranges, validate timeline alignment before editing, and do not interpret acoustic cues as lyrics or verified song sections. Fall back to the CLI below only if these tools are unavailable.

## Runtime

Python 3.12+, FFmpeg and FFprobe are required. The `music-analyzer` executable becomes available after installing the package:

```bash
cd packages/music-analyzer
python -m pip install -e .
```

Run commands from a shell that has that executable on PATH. Resolve paths relative to the actual repository checkout; projects opened by the desktop app are normally elsewhere. If the package or runtime is missing, report the missing dependency rather than claiming analysis ran. Do not install dependencies without user permission.

## Workflow

```bash
music-analyzer inspect path/to/music.mp4
music-analyzer analyze path/to/music.wav --output path/to/analysis.json
music-analyzer validate path/to/analysis.json
music-analyzer overview path/to/analysis.json
music-analyzer context path/to/analysis.json --start 30 --end 50
music-analyzer cues path/to/analysis.json --start 30 --end 50 --limit 30
music-analyzer compare path/to/analysis.json --start-a 30 --end-a 50 --start-b 90 --end-b 110
```

Optional `--audio-stream N` selects an audio stream; `--cache-dir PRIVATE_DIR` scopes analysis cache. Use `cues --categories beat onset energy harmonic_change structure_boundary --selection representative --merge-coincident --merge-window-ms 30` when compact timing proposals are needed.

## Agent rules

1. Check the source, run the analyzer and validate the resulting JSON before acting on it. Reuse cached output only when source hash, stream and configuration match.
2. Query short intervals (`overview`, `context`, `cues`, `compare`) instead of loading the entire analysis JSON into the agent context.
3. Beats, onsets, energy changes and repeated regions are editing suggestions, not mandatory cuts or verified song sections. Preserve narrative continuity and the user's directions.
4. Analysis timestamps refer to decoded PCM. Verify mapping to the editor timeline, trim, playback rate and offsets before making exact edits.
5. Do not infer lyrics, word timestamps, named instruments, stems, genre, emotions, chords, key or verified verse/chorus boundaries. Use the separate lyrics/transcription workflow for words.
6. Never fabricate tool results. If the analyzer cannot execute, explain why and avoid audio-based precision claims.

Full CLI documentation and detailed contracts live in `.agents/skills/music-analyzer/` and `packages/music-analyzer/` in the repository. The Python implementation stays there; do not duplicate it in this skill.
