"""EBU R128 loudness measurements using FFmpeg loudnorm's measurement pass.

This is measurement only: no normalized audio is written or used by DSP.
Integrated LUFS and LRA are independent of mono RMS descriptors.
"""
from __future__ import annotations

import json
import math
import re
import subprocess
from pathlib import Path

from music_analyzer.decoder import MediaError, _binary


def measure_loudness(audio_path: str | Path, stream_index: int) -> dict:
    command = [_binary("ffmpeg"), "-nostdin", "-hide_banner", "-v", "info",
               "-i", str(audio_path), "-map", f"0:{stream_index}", "-vn",
               "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
               "-f", "null", "-"]
    try:
        result = subprocess.run(command, capture_output=True, text=True,
                                timeout=3600, check=True)
    except (OSError, subprocess.SubprocessError) as exc:
        raise MediaError(f"FFmpeg loudness measurement failed: {exc}") from exc
    matches = re.findall(r'\{\s*"input_i"\s*:.*?\}', result.stderr, flags=re.DOTALL)
    if not matches:
        raise MediaError("FFmpeg did not return loudnorm measurement JSON")
    data = json.loads(matches[-1])

    def value(key: str) -> float | None:
        try:
            number = float(data[key])
        except (ValueError, TypeError, KeyError):
            return None
        return round(number, 3) if math.isfinite(number) and abs(number) < 1000 else None

    return {
        "integrated_lufs": value("input_i"),
        "loudness_range_lu": value("input_lra"),
        "true_peak_dbtp": value("input_tp"),
        "loudness_threshold_lufs": value("input_thresh"),
        "method": "FFmpeg loudnorm measurement pass (EBU R128)",
        "measurement_only": True,
        "warnings": ([] if value("input_i") is not None else
                     ["Integrated loudness unavailable for this source"])
    }
