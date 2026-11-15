"""Non-neural tonal descriptors and acoustic recurrence over existing chroma curves.

All values describe pitch-class energy, NOT detected chords, keys, or emotions.
Downsampled self-similarity limits quadratic memory use on long tracks.
"""
from __future__ import annotations

import numpy as np
import librosa


def enrich_harmony_structure(data: dict, recurrence_step_seconds: float = 2.0) -> dict:
    points = data["curves"]["points"]
    if not points:
        data["harmony"] = {"status": "insufficient_data"}
        data["structure"] = {"status": "insufficient_data", "repetitions": []}
        return data
    t = np.asarray([p["time_seconds"] for p in points], dtype=float)
    raw = np.asarray([p["chroma_energy"] for p in points], dtype=float)
    if raw.ndim != 2 or raw.shape[1] != 12:
        raise ValueError("Expected twelve chroma values per point")
    amp = np.clip(raw, 0, None)
    total = np.sum(amp, axis=1)
    norm = np.divide(amp, total[:, None], out=np.zeros_like(amp), where=total[:, None] > 1e-9)
    valid = total > 1e-6
    concentration = np.max(norm, axis=1)
    entropy = -np.sum(np.where(norm > 0, norm * np.log2(np.maximum(norm, 1e-12)), 0), axis=1)
    novelty = np.zeros(len(t))
    if len(t) > 1:
        novelty[1:] = np.linalg.norm(np.diff(norm, axis=0), axis=1)
    for i, point in enumerate(points):
        point["chroma_entropy_bits"] = round(float(entropy[i]), 5) if valid[i] else None
        point["chroma_novelty"] = round(float(novelty[i]), 6) if valid[i] else None
    # CENS is computed on the 0.5s chroma trajectory, not per FFT batch.
    # It is a smoothed/quantized representation for structural comparison.
    cens = librosa.feature.chroma_cens(
        C=amp.T, sr=22050, hop_length=11025, win_len_smooth=9)
    for i, point in enumerate(points):
        point["chroma_cens"] = [round(float(v), 6) for v in cens[:, i]]
    global_chroma = np.mean(norm[valid], axis=0) if np.any(valid) else np.zeros(12)
    data["harmony"] = {
        "status": "estimated" if np.any(valid) else "insufficient_data",
        "global_pitch_class_profile": [round(float(x), 6) for x in global_chroma],
        "mean_chroma_entropy_bits": round(float(np.mean(entropy[valid])), 5) if np.any(valid) else None,
        "mean_pitch_class_concentration": round(float(np.mean(concentration[valid])), 5) if np.any(valid) else None,
        "method": "normalized STFT chroma, librosa CENS smoothing, entropy and pitch-class distance",
        "cens_hop_seconds": 0.5,
        "limitations": ["Not a key or chord estimator", "Mixtures can contain multiple simultaneous pitches"]
    }
    # One vector per ~2 seconds; <= 5400x5400 for the supported 3h limit.
    # Cap to 1200 summaries (for longer sources, adapt the step).
    hop = max(recurrence_step_seconds, data["source"]["decoded_duration_seconds"] / 1200)
    vectors, windows = [], []
    for start in np.arange(0, float(data["source"]["decoded_duration_seconds"]), hop):
        pick = (t >= start) & (t < start + hop) & valid
        if not np.any(pick):
            continue
        vec = np.mean(norm[pick], axis=0)
        mag = np.linalg.norm(vec)
        if mag > 1e-9:
            vectors.append(vec / mag)
            windows.append((float(start), min(float(start + hop), float(data["source"]["decoded_duration_seconds"]))))
    repeats = []
    if len(vectors) >= 4:
        z = np.asarray(vectors, dtype=float)
        similarity = z @ z.T
        min_separation = max(4.0, 2 * hop)
        # Candidate pairs are only acoustic similarity, not guaranteed repeated sections.
        for i in range(len(z)):
            for j in range(i + 1, len(z)):
                if windows[j][0] - windows[i][0] < min_separation:
                    continue
                score = float(similarity[i, j])
                if score >= 0.97:
                    repeats.append({"first_start_seconds": round(windows[i][0], 3),
                                    "second_start_seconds": round(windows[j][0], 3),
                                    "window_seconds": round(hop, 3),
                                    "chroma_cosine_similarity": round(score, 5)})
        repeats.sort(key=lambda e: (-e["chroma_cosine_similarity"], e["first_start_seconds"], e["second_start_seconds"]))
    data["structure"] = {
        "status": "heuristic",
        "repetitions": repeats[:100],
        "candidate_count": len(repeats),
        "analysis_step_seconds": round(hop, 3),
        "method": "downsampled cosine similarity of normalized chroma summaries",
        "limitations": ["Single-window similarity does not prove structural repetition",
                        "Not a verse/chorus detector"]
    }
    return data
