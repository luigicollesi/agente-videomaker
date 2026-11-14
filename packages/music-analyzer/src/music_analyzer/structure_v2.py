"""Conservative sequence-level repetition detection from acoustic time series.

No machine learning, genre, chorus/verse labels, or ground-truth confidence.
Outputs are candidate continuous repeated regions with interpretable evidence.
"""
from __future__ import annotations

import numpy as np


def detect_repeated_regions(data: dict, step_seconds: float = 2.0,
                            min_duration_seconds: float = 8.0,
                            min_separation_seconds: float = 12.0,
                            max_results: int = 40) -> dict:
    points = data["curves"]["points"]
    duration = float(data["source"]["decoded_duration_seconds"])
    step = max(step_seconds, duration / 1000)
    if not points or duration < 2 * min_duration_seconds:
        return {"status": "insufficient_data", "repeated_regions": [], "method": "sequence_multifeature_v1"}
    times = np.asarray([p["time_seconds"] for p in points], dtype=float)
    chroma = np.asarray([p["chroma_energy"] for p in points], dtype=float)
    rms = np.asarray([p["rms_dbfs"] if p.get("rms_dbfs") is not None else -100 for p in points], dtype=float)
    centroid = np.asarray([p["spectral_centroid_hz"] for p in points], dtype=float)
    flux = np.asarray([p.get("normalized_spectral_flux", 0.0) for p in points], dtype=float)

    # Relative scaling prevents any single physical unit dominating distances.
    def robust(x):
        center = np.median(x)
        spread = max(float(np.percentile(x, 75) - np.percentile(x, 25)), 1e-6)
        return np.clip((x - center) / spread, -4, 4)

    starts = np.arange(0, duration, step)
    feature, valid = [], []
    for t in starts:
        sel = (times >= t) & (times < min(duration, t + step))
        if not np.any(sel):
            feature.append(np.zeros(15))
            valid.append(False)
            continue
        c = np.maximum(np.mean(chroma[sel], axis=0), 0)
        c = c / max(float(np.sum(c)), 1e-9)
        feature.append(np.r_[c, np.mean(rms[sel]), np.mean(centroid[sel]), np.mean(flux[sel])])
        valid.append(bool(np.mean(rms[sel]) > -55))
    f = np.asarray(feature)
    good = np.asarray(valid)
    if np.count_nonzero(good) < 8:
        return {"status": "insufficient_data", "repeated_regions": [], "method": "sequence_multifeature_v1"}
    extra = np.column_stack([robust(f[:, k]) for k in range(12, 15)])
    # Pitch-class similarity is one source of evidence, not the whole score.
    ch = f[:, :12]
    ch = ch / np.maximum(np.linalg.norm(ch, axis=1, keepdims=True), 1e-9)
    sim_ch = np.clip(ch @ ch.T, 0, 1)
    delta = extra[:, None, :] - extra[None, :, :]
    sim_extra = np.exp(-np.mean(delta * delta, axis=2))
    similarity = 0.55 * sim_ch + 0.45 * sim_extra
    similarity[~good, :] = 0
    similarity[:, ~good] = 0
    n = len(starts)
    min_frames = int(np.ceil(min_duration_seconds / step))
    separation_frames = int(np.ceil(min_separation_seconds / step))
    candidates = []
    # Continuous diagonal sequences, requiring sufficient multi-feature agreement.
    for offset in range(separation_frames, n):
        diagonal = np.diagonal(similarity, offset=offset)
        strong = diagonal >= 0.90
        begin = None
        for i in range(len(strong) + 1):
            active = i < len(strong) and bool(strong[i])
            if active and begin is None:
                begin = i
            if not active and begin is not None:
                length = i - begin
                if length >= min_frames:
                    scores = diagonal[begin:i]
                    avg = float(np.mean(scores))
                    if avg >= 0.92:
                        first = float(starts[begin])
                        second = float(starts[begin + offset])
                        length_seconds = min(length * step, duration - second)
                        candidates.append({
                            "first_start_seconds": round(first, 3),
                            "first_end_seconds": round(min(first + length_seconds, duration), 3),
                            "second_start_seconds": round(second, 3),
                            "second_end_seconds": round(second + length_seconds, 3),
                            "duration_seconds": round(length_seconds, 3),
                            "similarity_score": round(avg, 5),
                            "evidence": ["chroma", "rms_dbfs", "spectral_centroid_hz", "spectral_flux"],
                            "interpretation_status": "acoustic_repetition_candidate"
                        })
                begin = None
    candidates.sort(key=lambda r: (-r["duration_seconds"], -r["similarity_score"]))
    # Eliminate near-duplicate pairs representing essentially the same passage.
    selected = []
    for item in candidates:
        if any(abs(item["first_start_seconds"] - prev["first_start_seconds"]) < step * 2
               and abs(item["second_start_seconds"] - prev["second_start_seconds"]) < step * 2
               for prev in selected):
            continue
        selected.append(item)
        if len(selected) >= max_results:
            break
    return {
        "status": "heuristic",
        "method": "sequence_multifeature_v1",
        "analysis_step_seconds": round(step, 3),
        "repeated_regions": selected,
        "candidate_count": len(candidates),
        "limitations": ["Heuristic similarity, not a probability",
                        "Does not identify verse, chorus or named musical sections",
                        "Fixed-tempo diagonal comparison may miss time-stretched repetitions"]
    }
