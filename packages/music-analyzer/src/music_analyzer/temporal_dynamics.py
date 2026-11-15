"""Time-local energy dynamics. RMS dBFS is not perceptual LUFS.

Deterministic, bounded post-processing of the existing half-second curve.
"""
from __future__ import annotations

import numpy as np


def enrich_temporal_dynamics(result: dict) -> dict:
    points = result["curves"]["points"]
    times = np.asarray([p["time_seconds"] for p in points], dtype=float)
    levels = np.asarray([p.get("rms_dbfs") if p.get("rms_dbfs") is not None else -120.0 for p in points], dtype=float)
    if len(times) == 0:
        result["temporal_dynamics"] = {"status": "insufficient_data", "events": [], "curve": []}
        return result
    # Robust three-second local profile and changes over a three-second baseline.
    step = float(result["curves"]["hop_seconds"])
    radius = max(1, round(1.5 / step))
    smooth = np.asarray([np.median(levels[max(0, i-radius):min(len(levels), i+radius+1)])
                         for i in range(len(levels))])
    lag = max(1, round(3.0 / step))
    trends = np.zeros_like(smooth)
    trends[lag:] = smooth[lag:] - smooth[:-lag]
    curve = [{"time_seconds": round(float(t), 3),
              "local_rms_dbfs": round(float(v), 3),
              "change_3s_db": round(float(d), 3)}
             for t, v, d in zip(times, smooth, trends)]
    events = []
    last = -1e10
    for i in range(lag, len(times)):
        magnitude = abs(float(trends[i]))
        if magnitude < 5 or times[i] - last < 4:
            continue
        if i + 1 < len(trends) and magnitude < abs(float(trends[i + 1])):
            continue
        events.append({"time_seconds": round(float(times[i]), 3),
                       "type": "rms_swell" if trends[i] > 0 else "rms_fall",
                       "change_db": round(float(trends[i]), 3),
                       "method": "3s_robust_rms_difference"})
        last = float(times[i])
    result["temporal_dynamics"] = {
        "status": "measured", "method": "three_second_median_rms_dbfs",
        "unit": "dBFS", "curve": curve, "events": events,
        "limitations": ["RMS is not K-weighted loudness or LUFS",
                        "Change events are energy trends, not musical drops"]}
    return result
