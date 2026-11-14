"""Stereo channel-level energy, correlation and mid/side energy diagnostics."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import numpy as np
from music_analyzer.decoder import MediaError, _binary


def measure_stereo(source: str | Path, stream_index: int,
                   source_channels: int, sample_rate: int = 22050) -> dict:
    if source_channels != 2:
        return {"status": "not_applicable", "reason": "Source is not exactly two-channel stereo"}
    with tempfile.TemporaryDirectory(prefix="music-stereo-") as temp:
        dest = Path(temp) / "stereo.f32le"
        command = [_binary("ffmpeg"), "-nostdin", "-hide_banner", "-v", "error",
                   "-i", str(source), "-map", f"0:{stream_index}", "-vn",
                   "-ac", "2", "-ar", str(sample_rate), "-f", "f32le",
                   "-acodec", "pcm_f32le", "-y", str(dest)]
        try:
            subprocess.run(command, capture_output=True, check=True, timeout=3600)
        except (OSError, subprocess.SubprocessError) as exc:
            raise MediaError(f"Stereo diagnostics decoding failed: {exc}") from exc
        y = np.memmap(dest, dtype="<f4", mode="r")
        if len(y) < 2 or len(y) % 2:
            raise MediaError("Invalid decoded stereo buffer")
        stereo = y.reshape(-1, 2)
        sums = np.zeros(2, dtype=np.float64)
        cross = 0.0
        mid2 = side2 = 0.0
        for i in range(0, len(stereo), 131072):
            block = np.asarray(stereo[i:i+131072], dtype=np.float64)
            sums += np.square(block).sum(axis=0)
            cross += float(np.dot(block[:, 0], block[:, 1]))
            mid2 += float(np.square((block[:, 0] + block[:, 1]) / 2).sum())
            side2 += float(np.square((block[:, 0] - block[:, 1]) / 2).sum())
        total = len(stereo)
        rms = np.sqrt(sums / total)
        denom = float(np.sqrt(np.prod(sums)))
        corr = cross / denom if denom > 1e-16 else None
        return {
            "status": "measured",
            "left_rms_dbfs": round(float(20*np.log10(rms[0])), 4) if rms[0] > 0 else None,
            "right_rms_dbfs": round(float(20*np.log10(rms[1])), 4) if rms[1] > 0 else None,
            "channel_correlation": round(float(np.clip(corr, -1, 1)), 6) if corr is not None else None,
            "mid_to_side_energy_ratio_db": round(float(10*np.log10(mid2/side2)), 4)
            if mid2 > 0 and side2 > 0 else None,
            "sample_rate_hz": sample_rate,
            "method": "whole-stream channel RMS, Pearson correlation and Mid/Side power",
            "limitations": ["Whole-track aggregate; does not localize panning over time",
                            "Two-channel decoded output may not reproduce editor channel layout"]
        }
