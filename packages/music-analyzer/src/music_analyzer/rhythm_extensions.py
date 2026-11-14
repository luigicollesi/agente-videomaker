"""Independent tempo evidence, without modifying the validated beat grid."""
from __future__ import annotations
import numpy as np


def enrich_rhythm(result: dict) -> dict:
    beats = np.asarray([b["time_seconds"] for b in result["rhythm"]["beats"]], dtype=float)
    points = result["curves"]["points"]
    duration = float(result["source"]["decoded_duration_seconds"])
    intervals = np.diff(beats)
    intervals = intervals[(intervals > 0.15) & (intervals < 3)]
    candidates = []
    if len(intervals) >= 4:
        base = 60.0 / float(np.median(intervals))
        for label, multiplier in (("half_time", 0.5), ("beat_grid", 1.0), ("double_time", 2.0)):
            value = base * multiplier
            if 30 <= value <= 300:
                candidates.append({"bpm": round(value, 3), "interpretation": label,
                                   "source_method": "median_interbeat_interval"})
    windows = []
    for start in np.arange(0, duration, 8.0):
        chosen = beats[(beats >= start) & (beats < min(start + 8, duration))]
        d = np.diff(chosen)
        d = d[(d > 0.15) & (d < 3)]
        windows.append({"start_seconds": round(float(start), 3),
                        "end_seconds": round(float(min(start + 8, duration)), 3),
                        "bpm_estimate": round(float(60 / np.median(d)), 3) if len(d) >= 3 else None,
                        "beat_interval_cv": round(float(np.std(d) / np.mean(d)), 5)
                        if len(d) >= 3 else None})
    result["rhythm"]["alternatives"] = {
        "tempo_candidates": candidates, "local_tempo": windows,
        "method": "beat_grid_interval_statistics",
        "limitations": ["Half/double tempo are metric alternatives, not independent confirmations",
                        "Downbeats and meter not inferred"]}
    return result
