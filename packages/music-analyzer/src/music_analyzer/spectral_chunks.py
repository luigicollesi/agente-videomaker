"""Bounded-memory spectral frame extraction with exact STFT frame anchoring.

Global time origin remains the decoded PCM. Every frame has its center at
frame_index * hop_length; overlapping sample context avoids boundary artifacts.
"""
from __future__ import annotations

import numpy as np
import librosa


def chunked_spectral_features(y, sr: int, n_fft: int = 2048,
                              hop: int = 512, batch_frames: int = 512):
    if batch_frames < 1 or n_fft < 2 or hop < 1:
        raise ValueError("Invalid STFT frame parameters")
    n = len(y)
    if n == 0:
        raise ValueError("Empty audio")
    n_frames = 1 + n // hop
    names = ("rms", "centroid", "rolloff", "flatness", "bandwidth", "zcr",
             "contrast", "chroma", "spectral_flux")
    outputs = {k: [] for k in names}
    prior = None
    for first in range(0, n_frames, batch_frames):
        size = min(batch_frames, n_frames - first)
        # frame i covers [i*hop - n_fft//2, i*hop + n_fft//2).
        left = first * hop - n_fft // 2
        right = (first + size - 1) * hop + n_fft // 2
        a, b = max(left, 0), min(right, n)
        block = np.asarray(y[a:b], dtype=np.float32)
        block = np.pad(block, (a-left, right-b), mode="constant")
        stft = librosa.stft(block, n_fft=n_fft, hop_length=hop, center=False)
        mag = np.abs(stft[:, :size])
        energy = np.square(mag)
        outputs["rms"].append(np.sqrt(np.mean(np.square(
            librosa.util.frame(block, frame_length=n_fft, hop_length=hop)[:, :size]), axis=0)))
        outputs["centroid"].append(librosa.feature.spectral_centroid(S=mag, sr=sr)[0])
        outputs["rolloff"].append(librosa.feature.spectral_rolloff(S=mag, sr=sr)[0])
        outputs["flatness"].append(librosa.feature.spectral_flatness(S=mag)[0])
        outputs["bandwidth"].append(librosa.feature.spectral_bandwidth(S=mag, sr=sr)[0])
        outputs["contrast"].append(librosa.feature.spectral_contrast(S=mag, sr=sr))
        outputs["chroma"].append(librosa.feature.chroma_stft(S=energy, sr=sr, n_fft=n_fft, hop_length=hop, tuning=0.0))
        frames = librosa.util.frame(block, frame_length=n_fft, hop_length=hop)
        outputs["zcr"].append(np.mean(np.diff(np.signbit(frames[:, :size]), axis=0), axis=0))
        # Spectral flux is normalized per frame and preserves continuity across blocks.
        norm = mag / np.maximum(np.sum(mag, axis=0, keepdims=True), 1e-9)
        adjacent = np.concatenate((prior if prior is not None else norm[:, :1], norm), axis=1)
        flux = np.maximum(np.diff(adjacent, axis=1), 0.0).sum(axis=0)
        outputs["spectral_flux"].append(flux)
        prior = norm[:, -1:]
    return {key: np.concatenate(value, axis=1 if key in ("contrast", "chroma") else 0)
            for key, value in outputs.items()}
