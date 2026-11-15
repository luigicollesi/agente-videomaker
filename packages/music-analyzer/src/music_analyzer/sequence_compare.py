"""Constrained multifeature DTW for short acoustic intervals; CPU only."""
from __future__ import annotations
import numpy as np
import librosa


def compare_sequences(points: list, a: tuple, b: tuple, max_frames: int = 500) -> dict:
    def extract(bounds):
        rows = [p for p in points if bounds[0] <= p["time_seconds"] < bounds[1]
                and len(p.get("chroma_cens", [])) == 12 and len(p.get("mfcc", [])) == 13
                and p.get("rms_dbfs") is not None and p["rms_dbfs"] > -55]
        if len(rows) < 4:
            return None
        if len(rows) > max_frames:
            # Deterministic bounded resampling in long intervals.
            rows = [rows[i] for i in np.linspace(0, len(rows)-1, max_frames).astype(int)]
        return np.asarray([[*p["chroma_cens"], *p["mfcc"], p["rms_dbfs"],
                            p.get("normalized_spectral_flux", 0.)] for p in rows], dtype=float)
    x, y = extract(a), extract(b)
    if x is None or y is None:
        return {"status": "insufficient_evidence", "method": "constrained_multifeature_dtw_v1"}
    # Shared robust feature scaling, never independently normalize each interval.
    joined = np.vstack((x, y))
    center = np.median(joined[:,12:], axis=0)
    scale = np.maximum(np.percentile(joined[:,12:],75,axis=0) -
                       np.percentile(joined[:,12:],25,axis=0), 1e-3)
    def transform(v):
        c = v[:,:12]
        c = c / np.maximum(np.linalg.norm(c, axis=1, keepdims=True),1e-9)
        other = np.clip((v[:,12:]-center)/scale,-4,4)
        return np.column_stack((c*2, other*.6))
    left, right = transform(x),transform(y)
    # Constrain both the path and the relative lengths.
    ratio = len(left)/len(right)
    if not .70 <= ratio <= 1.43:
        return {"status":"incompatible_duration", "method":"constrained_multifeature_dtw_v1"}
    D, wp = librosa.sequence.dtw(X=left.T,Y=right.T,metric="euclidean",
                                global_constraints=True,band_rad=.30)
    cost = float(D[-1,-1])/max(len(wp),1)
    return {"status":"estimated", "method":"constrained_multifeature_dtw_v1",
            "mean_alignment_cost":round(cost,6),
            "path_length_ratio":round(len(wp)/max(len(left),len(right)),6),
            "feature_coverage": {"first":round(len(x)/max(1,sum(a[0] <= p["time_seconds"] < a[1] for p in points)),6),
                                 "second":round(len(y)/max(1,sum(b[0] <= p["time_seconds"] < b[1] for p in points)),6)},
            "normalized_alignment_cost":round(cost,6),
            "path_length_frames":len(wp), "matched_frames_a":len(left),
            "matched_frames_b":len(right),
            "duration_ratio":round(float((b[1]-b[0])/(a[1]-a[0])),5),
            "limitations":["DTW cost is not a probability","No source/editor time mapping inferred"]}
