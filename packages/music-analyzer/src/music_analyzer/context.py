"""Compact, bounded interval queries over measured music analysis JSON."""
from __future__ import annotations

import json
from pathlib import Path


def get_music_context(analysis_path: str, start_seconds: float, end_seconds: float) -> dict:
    data = json.loads(Path(analysis_path).read_text(encoding="utf-8"))
    duration = float(data["source"]["decoded_duration_seconds"])
    if not 0 <= start_seconds < end_seconds <= duration:
        raise ValueError("Expected 0 <= start < end <= source duration")
    points = [p for p in data["curves"]["points"]
              if start_seconds <= p["time_seconds"] < end_seconds]
    beats = [b for b in data["rhythm"]["beats"]
             if start_seconds <= b["time_seconds"] < end_seconds]
    events = [e for e in data["events"]
              if start_seconds <= e["time_seconds"] < end_seconds]
    segments = [s for s in data["segments"]
                if s["start_seconds"] < end_seconds and s["end_seconds"] > start_seconds]
    levels = [p["rms_dbfs"] for p in points if p.get("rms_dbfs") is not None]
    return {
        "start_seconds": start_seconds,
        "end_seconds": end_seconds,
        "time_reference": data.get("features", {}).get("time_reference", "unknown"),
        "summary_features": {
            "bpm_estimate_global": data["rhythm"]["bpm_estimate"],
            "average_rms_dbfs": round(sum(levels)/len(levels), 3) if levels else None,
            "curve_points": len(points)
        },
        "beat_events": beats[:256],
        "change_events": [e for e in events if e["type"] != "onset"][:128],
        "onset_count": sum(1 for e in events if e["type"] == "onset"),
        "acoustic_character": segments,
        "truncated": len(beats) > 256 or len([e for e in events if e["type"] != "onset"]) > 128,
        "warnings": data.get("warnings", [])
    }
