import math
import shutil
import struct
import wave

import pytest
from music_analyzer.loudness import measure_loudness


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg required")
def test_loudness_valid_sine(tmp_path):
    path = tmp_path / "tone.wav"
    rate = 48000
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        samples = [int(0.1 * 32767 * math.sin(2 * math.pi * 440 * i / rate))
                   for i in range(rate * 4)]
        f.writeframes(struct.pack("<" + "h" * len(samples), *samples))
    result = measure_loudness(path, 0)
    assert result["integrated_lufs"] is not None
    assert -40 < result["integrated_lufs"] < -10
    assert result["measurement_only"] is True
