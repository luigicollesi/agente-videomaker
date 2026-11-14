"""Bounded, deterministic read-only agent queries over music analysis JSON."""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np
from music_analyzer.context import get_music_context


def _load(path: str) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if "source" not in data or "rhythm" not in data:
        raise ValueError("Not a music analysis document")
    return data


def get_music_overview(path: str) -> dict:
    d = _load(path)
    return {"source": {k: d["source"].get(k) for k in
                       ("source_sha256", "format", "decoded_duration_seconds",
                        "audio_stream_index", "timestamp_mapping")},
            "rhythm": {"bpm_estimate": d["rhythm"].get("bpm_estimate"),
                       "beat_count": len(d["rhythm"].get("beats", [])),
                       "onset_count": sum(e.get("type") == "onset" for e in d.get("events", []))},
            "harmony": d.get("harmony", {}),
            "structure": {"method": d.get("structure", {}).get("method"),
                          "repeated_regions": d.get("structure", {}).get("repeated_regions", [])[:20]},
            "loudness": d.get("loudness", {}),
            "warnings": d.get("warnings", [])}


def compare_music_intervals(path: str, start_a: float, end_a: float,
                            start_b: float, end_b: float) -> dict:
    a = get_music_context(path, start_a, end_a)
    b = get_music_context(path, start_b, end_b)
    d = _load(path)
    def mean_vector(start, end, key, n):
        rows = [p[key] for p in d["curves"]["points"]
                if start <= p["time_seconds"] < end and len(p.get(key, [])) == n]
        return np.mean(rows, axis=0) if rows else None
    def cosine(x, y):
        if x is None or y is None:
            return None
        denom = float(np.linalg.norm(x) * np.linalg.norm(y))
        return round(float(np.dot(x, y) / denom), 5) if denom > 1e-12 else None
    c1 = mean_vector(start_a, end_a, "chroma_cens", 12)
    c2 = mean_vector(start_b, end_b, "chroma_cens", 12)
    m1 = mean_vector(start_a, end_a, "mfcc", 13)
    m2 = mean_vector(start_b, end_b, "mfcc", 13)
    return {"first_interval": [start_a, end_a], "second_interval": [start_b, end_b],
            "chroma_cens_cosine_similarity": cosine(c1, c2),
            "mfcc_cosine_similarity": cosine(m1, m2),
            "mean_rms_dbfs_difference": (
                round(a["summary_features"]["average_rms_dbfs"] -
                      b["summary_features"]["average_rms_dbfs"], 3)
                if a["summary_features"]["average_rms_dbfs"] is not None and
                b["summary_features"]["average_rms_dbfs"] is not None else None),
            "limitations": ["Similarity is not a calibrated probability",
                            "Interval aggregation loses temporal order"]}


def get_music_editing_cues(path: str, start: float, end: float, limit: int = 30) -> dict:
    if not 1 <= limit <= 200:
        raise ValueError("limit must be 1..200")
    context = get_music_context(path, start, end)
    d = _load(path)
    change_events = [e for e in d.get("events", [])
                     if start <= e["time_seconds"] < end and e.get("type") != "onset"]
    dynamics = [e for e in d.get("temporal_dynamics", {}).get("events", [])
                if start <= e["time_seconds"] < end]
    cues = [{"time_seconds": e["time_seconds"], "kind": e["type"],
             "evidence": e.get("source_method", "measured_acoustic_event")}
            for e in change_events]
    cues.extend({"time_seconds": e["time_seconds"], "kind": e["type"],
                 "evidence": e.get("method")} for e in dynamics)
    cues.sort(key=lambda x: (x["time_seconds"], x["kind"]))
    return {"start_seconds": start, "end_seconds": end, "cues": cues[:limit],
            "count": len(cues), "truncated": len(cues) > limit,
            "time_reference": context["time_reference"],
            "warning": "Candidates for creative decisions, not mandatory edits"}
