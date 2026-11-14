import math
import shutil
import struct
import wave

import pytest
from music_analyzer.stereo import measure_stereo


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg required")
def test_mono_is_not_applicable(tmp_path):
    assert measure_stereo(tmp_path / "unused.wav", 0, 1)["status"] == "not_applicable"


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg required")
def test_perfectly_correlated_stereo(tmp_path):
    sr = 22050
    path = tmp_path / "stereo.wav"
    samples = [int(0.25 * 32767 * math.sin(2 * math.pi * 440 * i / sr))
               for i in range(sr)]
    packed = [v for x in samples for v in (x, x)]
    with wave.open(str(path), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes(struct.pack("<" + "h"*len(packed), *packed))
    result = measure_stereo(path, 0, 2, sample_rate=sr)
    assert result["status"] == "measured"
    assert abs(result["channel_correlation"] - 1) < 1e-6
    assert result["mid_to_side_energy_ratio_db"] is None
    assert abs(result["left_rms_dbfs"] - result["right_rms_dbfs"]) < 1e-6
