"""Objective waveform diagnostics, without neural models or audio inference."""
from __future__ import annotations

import numpy as np


def measure_signal(pcm_path: str, sample_rate: int) -> dict:
    y = np.memmap(pcm_path, dtype="<f4", mode="r")
    if not len(y):
        raise ValueError("Empty PCM")
    peak = float(np.max(np.abs(y)))
    square_sum = 0.0
    dc_sum = 0.0
    clipped = 0
    for start in range(0, len(y), 262144):
        block = np.asarray(y[start:start+262144], dtype=np.float64)
        square_sum += float(np.dot(block, block))
        dc_sum += float(np.sum(block))
        clipped += int(np.count_nonzero(np.abs(block) >= 0.999))
    rms = float(np.sqrt(square_sum / len(y)))
    return {
        "sample_peak_dbfs": round(float(20*np.log10(peak)), 4) if peak > 0 else None,
        "global_rms_dbfs": round(float(20*np.log10(rms)), 4) if rms > 0 else None,
        "crest_factor_db": round(float(20*np.log10(peak/rms)), 4) if rms > 0 else None,
        "dc_offset": round(dc_sum / len(y), 9),
        "near_full_scale_sample_fraction": round(clipped / len(y), 9),
        "decoded_sample_count": int(len(y)),
        "sample_rate_hz": int(sample_rate),
        "limitations": ["Near-full-scale samples do not prove audible clipping",
                        "Sample peak is not oversampled true peak",
                        "Mono decoded waveform is not stereo-channel analysis"]
    }
