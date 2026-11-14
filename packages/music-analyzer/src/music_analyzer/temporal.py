"""Acoustic trend events and conservative segmentation over 0.5s DSP curves.

Thresholds describe relative acoustic changes, not emotions or formal song sections.
All timestamps remain decoded-PCM-relative pending verified editor mapping.
"""
from __future__ import annotations

import math
import numpy as np


def _features(points):
    # Convert physical descriptors to stable scalars. Silence is a legitimate floor.
    energy = np.array([p["rms_dbfs"] if p["rms_dbfs"] is not None else -100.0 for p in points], dtype=float)
    centroid = np.array([p["spectral_centroid_hz"] for p in points], dtype=float)
    flatness = np.array([p["spectral_flatness"] for p in points], dtype=float)
    matrix = np.column_stack((np.clip(energy, -100, 0), centroid, flatness))
    center = np.median(matrix, axis=0)
    spread = np.percentile(matrix, 75, axis=0) - np.percentile(matrix, 25, axis=0)
    spread = np.maximum(spread, [6.0, 300.0, 0.03])
    return energy, (matrix - center) / spread


def characterize(result: dict) -> dict:
    points = result["curves"]["points"]
    duration = float(result["source"]["decoded_duration_seconds"])
    hop = float(result["curves"]["hop_seconds"])
    if not points:
        return result
    energy, matrix = _features(points)
    timestamps = np.array([p["time_seconds"] for p in points], dtype=float)
    # 3-second medians protect boundaries from individual loud transients.
    radius = max(1, int(round(1.5 / hop)))
    smoothed = np.array([
        np.median(matrix[max(0, i-radius):min(len(matrix), i+radius+1)], axis=0)
        for i in range(len(matrix))
    ])
    # Compare 3-second neighborhoods rather than individual adjacent frames.
    lag = max(1, int(round(3.0 / hop)))
    novelty = np.zeros(len(points))
    for i in range(lag, len(points)-lag):
        novelty[i] = float(np.linalg.norm(
            np.median(smoothed[i:i+lag], axis=0) -
            np.median(smoothed[i-lag:i], axis=0)))
    # Robust threshold; sparse or constant signals should abstain.
    threshold = max(1.75, float(np.median(novelty) + 2.5 * np.median(np.abs(novelty-np.median(novelty)))))
    candidates = [int(i) for i in range(lag, len(points)-lag) if novelty[i] >= threshold
                  and novelty[i] >= novelty[max(0,i-1)] and novelty[i] > novelty[min(len(points)-1,i+1)]]
    boundaries = [0]
    min_gap = max(1, round(6.0 / hop))
    for index in sorted(candidates, key=lambda i: (-novelty[i], i)):
        if all(abs(index-j) >= min_gap for j in boundaries):
            boundaries.append(index)
    boundaries.sort()
    # Avoid a trailing micro-segment.
    if len(boundaries) > 1 and len(points)-boundaries[-1] < min_gap:
        boundaries.pop()
    events = list(result["events"])
    for index in boundaries[1:]:
        events.append({"type": "change_point", "time_seconds": round(float(timestamps[index]),3),
                       "strength": round(float(min(1.0, novelty[index]/max(threshold, 1e-8))),6),
                       "source_method": "robust_multifeature_novelty"})
    # Detect sustained 3-second energy trends, with a minimum 5dB displacement.
    trend_span = max(2, round(3.0 / hop))
    last_event = -math.inf
    for i in range(0, max(0, len(points)-trend_span), trend_span):
        j = i + trend_span
        delta = float(np.median(energy[j-2:j+1]) - np.median(energy[i:i+3]))
        if abs(delta) >= 5.0 and timestamps[i]-last_event >= 3:
            typ = "energy_rise" if delta > 0 else "energy_drop"
            events.append({"type": typ, "time_seconds": round(float(timestamps[i]),3),
                           "strength": round(min(1.0, abs(delta)/18.0),6),
                           "source_method": "three_second_energy_trend"})
            last_event = timestamps[i]
    boundaries.append(len(points))
    segments = []
    for left,right in zip(boundaries, boundaries[1:]):
        t0 = float(timestamps[left])
        t1 = duration if right == len(points) else float(timestamps[right])
        local_energy = energy[left:right]
        if t1 <= t0:
            continue
        if np.max(local_energy) < -65:
            character = ["quiet"]
        else:
            character = ["dense" if float(np.median(local_energy)) >= -15 else "soft"]
            if float(np.median(matrix[left:right,1])) > 0.5:
                character.append("bright")
            if float(np.median(matrix[left:right,2])) > 0.5:
                character.append("noisy")
        segments.append({"start_seconds": round(t0,3), "end_seconds": round(t1,3),
                         "acoustic_character": character,
                         "evidence": ["rms_dbfs", "spectral_centroid_hz", "spectral_flatness"],
                         "interpretation_status": "heuristic"})
    result["segments"] = segments
    result["events"] = sorted(events, key=lambda e: (e["time_seconds"], e["type"]))
    return result
