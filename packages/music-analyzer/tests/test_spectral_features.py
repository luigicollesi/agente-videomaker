import numpy as np
from music_analyzer.dsp import measure_pcm


def test_extended_spectral_features_have_consistent_shape(tmp_path):
    sr = 22050
    t = np.arange(sr * 2) / sr
    wave = (0.3 * np.sin(2 * np.pi * 440 * t)).astype("<f4")
    path = tmp_path / "tone.f32le"
    wave.tofile(path)
    result = measure_pcm(path, sr, 2.0)
    points = result["curves"]["points"]
    assert len(points) == 4
    for p in points:
        assert len(p["chroma_energy"]) == 12
        assert 0 <= p["zero_crossing_rate"] <= 1
        assert p["spectral_bandwidth_hz"] >= 0
        assert np.isfinite(p["spectral_contrast_mean_db"])
    assert result["features"]["chroma_representation"].startswith("STFT")


def test_silent_chroma_is_finite(tmp_path):
    path = tmp_path / "silent.f32le"
    np.zeros(22050, dtype="<f4").tofile(path)
    result = measure_pcm(path, 22050, 1.0)
    assert result["rhythm"]["bpm_estimate"] is None
    assert all(np.isfinite(v) for p in result["curves"]["points"] for v in p["chroma_energy"])
