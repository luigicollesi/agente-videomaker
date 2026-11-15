"""Explicit sample/editor time maps; no inferred mapping from MP3/MP4 metadata."""
from __future__ import annotations
import math


def sample_to_pcm_seconds(sample_index: int, sample_rate_hz: int) -> float:
    if not isinstance(sample_index,int) or sample_index<0 or sample_rate_hz <= 0:
        raise ValueError("Invalid sample position or rate")
    return sample_index/sample_rate_hz


def map_decoded_to_editor(seconds: float, *, trim_start_seconds: float,
                          editor_start_seconds: float, playback_rate: float,
                          verified: bool = False) -> dict:
    values=(seconds,trim_start_seconds,editor_start_seconds,playback_rate)
    if not all(math.isfinite(float(v)) for v in values):
        raise ValueError("Nonfinite time mapping parameter")
    if seconds<0 or trim_start_seconds<0 or editor_start_seconds<0 or playback_rate<=0:
        raise ValueError("Invalid time mapping parameter")
    if not verified:
        return {"status":"unverified","editor_time_seconds":None,
                "reason":"Source-to-editor correspondence must be explicitly verified"}
    if seconds < trim_start_seconds:
        return {"status":"outside_trim","editor_time_seconds":None}
    return {"status":"verified",
            "editor_time_seconds":round(editor_start_seconds+
                                         (seconds-trim_start_seconds)/playback_rate,6)}
