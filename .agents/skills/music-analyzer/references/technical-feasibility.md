# Technical feasibility — transcription-free temporal music characterization

Status: researched design, **not implemented**.

## Confirmed methods and tools
- librosa `beat.beat_track` implements onset-strength extraction, tempo estimation and dynamic-programming beat selection. Rhythm is estimated and can fail with weak/ambiguous beats: https://librosa.org/doc/main/api/generated/librosa.beat.beat_track.html
- librosa supports RMS, onset strength, spectral descriptors, chroma, tempograms, HPSS-like signal representations. Use spectral/harmonic/percussive **features only**; do not output isolated audio tracks: https://librosa.org/doc/main/
- Essentia RhythmExtractor2013 offers multiple approaches and outputs beats, tempo and (for multi-feature) beat confidence. Optional comparison, not mandatory: https://essentia.upf.edu/tutorial_rhythm_beatdetection.html
- Essentia Music Extractor offers onsets, beat loudness, chroma, key/scale strength and spectral descriptors: https://essentia.upf.edu/streaming_extractor_music.html
- ruptures PELT uses a penalized objective; configure `min_size`, `jump` and penalty to reduce false boundaries: https://centre-borelli.github.io/ruptures-docs/code-reference/detection/pelt-reference/

## Licensing and operational implications
Use FFmpeg/ffprobe, NumPy, SciPy, librosa and a schema library as core dependencies after license verification and version pinning. Essentia is AGPLv3 / commercial-license offered: **do not silently vendor or require it** for distributed proprietary software; review obligations before integration. Source: https://essentia.upf.edu/documentation.html

## Scientific boundaries
DSP outputs measurable acoustic descriptors. The mapping from acoustics to emotion or genre is underdetermined and listener/context-dependent. Music emotion research documents subjectivity, cultural variation, dataset limitations and the difference between static and time-varying representations: https://link.springer.com/article/10.1007/s42452-025-07178-9

### Recommended expressive metrics
- Acoustic activation proxy: robustly normalized log-energy, onset density, rhythmic activity and spectral flux; predefine transparent weights and version; calibrate against a diverse test collection.
- Tension-related cues: dissonance/roughness proxy, chroma instability, sudden spectral changes, loudness trajectories. These are cues, not an emotion diagnosis.
- Valence: disabled by default. Major/minor alone is insufficient. If experimentally enabled, name it `valence_heuristic`, include evidence and `confidence: null` when no calibration exists.
- Local genre: do **not** emit labels such as metal, jazz, or dubstep based on hand-crafted rules. Emit `style_descriptors` such as `percussive`, `bright`, `sparse`, `rhythmically_stable`, `rough_texture`.

## Temporal strategy
1. Analyze features on signal frames with precise sample offsets and optional downsampling.
2. Construct locally normalized curves at multiple resolutions. Avoid full-song min/max alone: one extreme peak can distort the entire song.
3. Use edge-preserving smoothing for expressive curves; keep raw transient events at original positions.
4. Segment with change-point detection over a jointly standardized feature matrix. Preserve minimum expressive segment duration, but permit instantaneous event markers.
5. Run consistency checks on every event and segment boundary; require `0 <= time <= duration`.
6. Preserve a global context so local texture changes do not become fake genre changes or visual hard cuts.

## CPU / GPU feasibility
No neural model, speech recognizer or cloud API is required for v1. CPU-only analysis is the primary target and is suitable for the user hardware class (GTX 1050 Ti does not need to be used). Memory and runtime must be **benchmarked**, not assumed, on 332s WAV. Avoid unnecessary dense recurrence matrices with O(N²) memory; stream features or retain reduced-resolution summaries.
