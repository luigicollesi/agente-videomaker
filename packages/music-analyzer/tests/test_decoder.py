"""Foundation tests; require FFmpeg/FFprobe only for media integration checks."""

import math
import shutil
import struct
import wave

import pytest

from music_analyzer.decoder import MediaError, decode_audio, inspect_audio


def _write_clicks(path, duration=2, rate=44100):
    samples = [0.0] * (rate * duration)
    for second in range(duration):
        samples[second * rate] = 0.8
    with wave.open(str(path), "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(rate)
        writer.writeframes(b"".join(struct.pack("<h", int(x * 32767)) for x in samples))


@pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
                    reason="Requires ffmpeg binaries")
def test_wav_decoding(tmp_path):
    audio = tmp_path / "click.wav"
    _write_clicks(audio)
    result = decode_audio(audio, tmp_path / "decoded.pcm")
    assert result.decoded_sample_count == 44100
    assert math.isclose(result.decoded_duration_seconds, 2.0, abs_tol=0.001)
    assert len(result.source_sha256) == 64
    assert result.timestamp_mapping == "unverified"
    assert result.timeline_offset_seconds is None


@pytest.mark.skipif(not shutil.which("ffprobe"), reason="Requires ffprobe")
def test_no_audio_rejected(tmp_path):
    audio = tmp_path / "bad.mp4"
    audio.write_bytes(b"not an mp4")
    with pytest.raises(MediaError):
        inspect_audio(audio)


def test_wrong_extension_rejected(tmp_path):
    audio = tmp_path / "fake.txt"
    audio.write_bytes(b"nothing")
    with pytest.raises(MediaError):
        inspect_audio(audio)
