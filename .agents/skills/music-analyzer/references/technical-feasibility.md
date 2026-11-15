# Technical feasibility — CPU-first acoustic analysis

The implemented analyzer uses FFmpeg/FFprobe and Python DSP (NumPy, SciPy, librosa). WAV/MP3/MP4 decoding, rhythm, onsets, spectral/timbre and CENS curves, global EBU R128 loudness, stereo diagnostics, local dynamics, acoustic change points, structural candidates, interval comparison and bounded editing cues require no GPU, neural model or paid service.

| Feature | Method | Decision |
|---|---|---|
| BPM, beats, attacks | Mel onset envelope + librosa beat tracking | Keep existing validated tracker |
| Acoustic dynamics and cues | RMS, onset strength and local changes | Available; not semantic emotion |
| Tonal/timbral comparison | CENS, MFCC, constrained DTW | Available; costs are not probabilities |
| Repeated-region candidates | Structural V2 | Default, heuristic |
| Multi-angle recurrence | Structural V3 | Opt-in experiment only |
| Formal chorus/verse, genre, emotion, lyrics, isolated instruments | Not robustly established by current DSP | Outside scope |
| Source/editor synchronization | Needs explicit verified mapping | Do not assume |

Primary technical sources: [librosa beat tracking](https://librosa.org/doc/latest/generated/librosa.beat.beat_track.html), [librosa recurrence](https://librosa.org/doc/latest/generated/librosa.segment.recurrence_matrix.html), [librosa DTW](https://librosa.org/doc/latest/generated/librosa.sequence.dtw.html), [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html).

A skill document explains use; it does not register tools inside the desktop editor. Preserve measured evidence, uncertainty and source integrity.
