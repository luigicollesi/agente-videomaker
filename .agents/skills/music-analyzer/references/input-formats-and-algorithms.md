# Inputs and algorithms — Music Analyzer

## Inputs
Accept local WAV, MP3 and MP4; use FFprobe to select an audio stream (`--audio-stream N` if necessary). FFmpeg decodes mono float PCM for DSP. Do not normalize the signal before analysis. Input metadata and SHA-256 are preserved. Stream/encoder priming and editor offsets are **not automatically verified**; analysis timestamps refer to decoded PCM.

## Algorithms
- **Rhythm:** librosa Mel onset strength, `onset_detect` and `beat_track`; original beat tracker preserved. Onset `strength` is normalized against the track-wide envelope maximum; no calibrated beat probability or downbeat detection.
- **Spectral:** bounded-frame STFT for RMS dBFS, centroid, rolloff, bandwidth, flatness, contrast, zero-crossing rate, spectral flux, chroma, 13 MFCCs and sampled CENS.
- **Dynamics:** local RMS trends, acoustic rises/drops and conservative change-point segmentation. RMS dBFS is **not** LUFS.
- **Loudness/stereo:** FFmpeg loudnorm EBU R128 input measurement (LUFS, LRA, true peak); source stereo diagnostics.
- **Harmony/structure:** chroma profile and novelty; Structural V2 finds candidate repeated sequences using CENS, MFCC and acoustic features. V3 multi-angle recurrence is **optional and experimental**.
- **Queries:** aggregate cosine comparison plus bounded constrained DTW; beat/onset/dynamics/structural cues, optional time-neighbor fusion without rewriting source events.

No neural networks, source separation, ASR, word alignment or instrument classifiers. Repetition scores, local expressive descriptors and alignment costs are not verified musical labels or probabilities.

References: [librosa](https://librosa.org/doc/latest/), [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html), [FFprobe](https://ffmpeg.org/ffprobe.html).
