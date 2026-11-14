"""Additional non-neural, deterministic descriptors from measured beats and RMS.

All local metrics are decoded-PCM-relative and remain unverified for editor time.
No genre, emotion, instrument, or formal-section predictions are generated.
"""
from __future__ import annotations

import math
import numpy as np


def add_advanced_features(result: dict) -> dict:
    points = result["curves"]["points"]
    beats = result["rhythm"]["beats"]
    onsets = [e for e in result["events"] if e["type"] == "onset"]
    beat_times = np.asarray([b["time_seconds"] for b in beats], dtype=float)
    intervals = np.diff(beat_times)
    intervals = intervals[(intervals > 0.18) & (intervals < 3.0)]
    rhythm_stats = {
        "median_beat_interval_seconds": round(float(np.median(intervals)), 6) if len(intervals) else None,
        "beat_interval_cv": round(float(np.std(intervals) / np.mean(intervals)), 6) if len(intervals) >= 3 else None,
        "bpm_from_median_beat_interval": round(float(60 / np.median(intervals)), 3) if len(intervals) else None,
        "onset_density_curve": [],
        "local_bpm_curve": []
    }
    hop = float(result["curves"]["hop_seconds"])
    for point in points:
        t = float(point["time_seconds"])
        start = max(0.0, t - 4.0)
        end = min(float(result["source"]["decoded_duration_seconds"]), t + 4.0)
        width = end - start
        density = sum(start <= e["time_seconds"] < end for e in onsets) / width if width > 0 else 0
        rhythm_stats["onset_density_curve"].append({
            "time_seconds": t, "onsets_per_second": round(density, 4)})
        local_intervals = np.diff(beat_times[(beat_times >= start) & (beat_times < end)])
        local_intervals = local_intervals[(local_intervals > 0.18) & (local_intervals < 3)]
        rhythm_stats["local_bpm_curve"].append({
            "time_seconds": t,
            "bpm_estimate": round(float(60 / np.median(local_intervals)), 3)
            if len(local_intervals) >= 3 else None})
    result["rhythm"]["advanced"] = rhythm_stats
    levels = np.array([p["rms_dbfs"] if p["rms_dbfs"] is not None else -120.0 for p in points])
    result["dynamics"] = {
        "min_rms_dbfs": round(float(np.min(levels)), 3) if len(levels) else None,
        "median_rms_dbfs": round(float(np.median(levels)), 3) if len(levels) else None,
        "max_rms_dbfs": round(float(np.max(levels)), 3) if len(levels) else None,
        "rms_dbfs_p10_p90_spread": round(float(np.percentile(levels, 90) - np.percentile(levels, 10)), 3)
        if len(levels) else None,
        "measurement": "RMS frame dBFS, not LUFS or integrated loudness"
    }
    result["feature_versions"] = {"rhythm_advanced": "0.1", "dynamics_summary": "0.1"}
    return result
