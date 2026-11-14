"""Deterministic CPU-only acoustic measurements on decoded mono PCM.

This module intentionally does not infer lyrics, genre, named instruments or emotion.
Frame times are decoded-audio-relative until an editor source mapping is verified.
"""
from __future__ import annotations

import math
from pathlib import Path

import librosa
import numpy as np
from music_analyzer.spectral_chunks import chunked_spectral_features

HOP = 512
FFT = 2048
CURVE_STEP_SECONDS = 0.5


def _round(value: float | np.floating, digits: int = 6) -> float:
    return round(float(value), digits)


def measure_pcm(pcm_path: str | Path, sample_rate: int, duration_seconds: float) -> dict:
    path = Path(pcm_path)
    y = np.memmap(path, mode="r", dtype="<f4")
    if y.size == 0 or not np.all(np.isfinite(y)):
        raise ValueError("PCM is empty or contains non-finite samples")
    # FFT matrix is bounded by input duration limits enforced at decoding.
    waveform = np.asarray(y)
    silent = bool(np.max(np.abs(waveform)) < 1e-7)
    spectral = chunked_spectral_features(waveform, sample_rate, FFT, HOP)
    rms = spectral["rms"]
    centroid = spectral["centroid"]
    flatness = spectral["flatness"]
    rolloff = spectral["rolloff"]
    bandwidth = spectral["bandwidth"]
    contrast = spectral["contrast"]
    chroma = spectral["chroma"]
    zcr = spectral["zcr"]
    duration = min(float(duration_seconds), waveform.size / sample_rate)
    # Preserve the validated V0.3 Mel onset envelope for beat tracking.
    # The normalized spectral flux remains an independent descriptor.
    onset_envelope = librosa.onset.onset_strength(y=waveform, sr=sample_rate,
                                                  hop_length=HOP)
    count = min(len(rms), len(centroid), len(flatness), len(rolloff), len(bandwidth), len(zcr), chroma.shape[1], contrast.shape[1])
    frame_times = librosa.frames_to_time(np.arange(count), sr=sample_rate, hop_length=HOP)
    points = []
    for t in np.arange(0, duration, CURVE_STEP_SECONDS):
        idx = int(np.searchsorted(frame_times, t))
        lo = max(0, idx - max(1, round(CURVE_STEP_SECONDS * sample_rate / HOP / 2)))
        hi = min(count, idx + max(1, round(CURVE_STEP_SECONDS * sample_rate / HOP / 2)) + 1)
        if hi <= lo:
            continue
        level = float(np.sqrt(np.mean(np.square(rms[lo:hi]))))
        points.append({
            "time_seconds": _round(t, 3),
            "rms_dbfs": _round(20 * math.log10(level), 3) if level > 0 else None,
            "spectral_centroid_hz": _round(np.mean(centroid[lo:hi]), 2),
            "spectral_rolloff_hz": _round(np.mean(rolloff[lo:hi]), 2),
            "spectral_flatness": _round(np.mean(flatness[lo:hi])),
            "spectral_bandwidth_hz": _round(np.mean(bandwidth[lo:hi]), 2),
            "zero_crossing_rate": _round(np.mean(zcr[lo:hi])),
            "spectral_contrast_mean_db": _round(np.mean(contrast[:,lo:hi]), 3),
            "chroma_energy": [_round(v) for v in np.mean(chroma[:,lo:hi], axis=1)],
            "normalized_spectral_flux": _round(np.mean(spectral["spectral_flux"][lo:hi]))
        })
    beats, onsets = [], []
    bpm = None
    if not silent and len(onset_envelope) and float(np.max(onset_envelope)) > 1e-7:
        onset_frames = librosa.onset.onset_detect(onset_envelope=onset_envelope,
                                                 sr=sample_rate, hop_length=HOP)
        scale = float(np.max(onset_envelope))
        for frame in onset_frames:
            t = float(librosa.frames_to_time(frame, sr=sample_rate, hop_length=HOP))
            if t < duration:
                onsets.append({"time_seconds": _round(t), "strength": _round(onset_envelope[frame] / scale)})
        tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_envelope,
                                                     sr=sample_rate, hop_length=HOP,
                                                     trim=True)
        candidate = float(np.asarray(tempo).reshape(-1)[0])
        if len(beat_frames) >= 3 and np.isfinite(candidate) and candidate > 0:
            bpm = _round(candidate, 3)
            for frame in beat_frames:
                t = float(librosa.frames_to_time(frame, sr=sample_rate, hop_length=HOP))
                if t < duration:
                    strength = float(onset_envelope[min(int(frame), len(onset_envelope) - 1)] / scale)
                    beats.append({"time_seconds": _round(t), "strength": _round(strength),
                                  "reliability_flag": "estimated", "source_method": "librosa.beat.beat_track + mel_onset_strength"})
    return {
        "rhythm": {
            "bpm_estimate": bpm, "tempo_candidates": [bpm] if bpm is not None else [],
            "beats": beats, "downbeats": [], "tempo_curve": []
        },
        "curves": {"hop_seconds": CURVE_STEP_SECONDS, "points": points},
        "events": [
            {"type": "onset", "time_seconds": item["time_seconds"],
             "strength": item["strength"], "source_method": "librosa.onset.onset_detect + mel_onset_strength"}
            for item in onsets
        ],
        "features": {
            "sample_rate_hz": sample_rate, "hop_length": HOP,
            "n_fft": FFT, "rms_unit": "dBFS",
            "spectral_centroid_unit": "Hz", "spectral_rolloff_unit": "Hz",
            "spectral_flatness_unit": "unitless",
            "spectral_bandwidth_unit": "Hz",
            "zero_crossing_rate_unit": "fraction",
            "spectral_contrast_unit": "dB",
            "chroma_energy_unit": "relative_spectral_energy",
            "chroma_representation": "STFT chroma with fixed tuning; not key or chord estimates",
            "spectral_processing": "bounded_512_frame_batches",
            "onset_method": "librosa_mel_onset_strength",
            "spectral_flux_method": "normalized_positive_spectral_flux_independent",
            "curve_window_seconds": CURVE_STEP_SECONDS,
            "time_reference": "decoded_pcm_unverified_source_mapping"
        },
        "warnings": (["Silence detected; no tempo estimated"] if silent else []) +
                    ["Source-timeline alignment has not been verified"]
    }
