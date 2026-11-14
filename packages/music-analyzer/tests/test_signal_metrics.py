import numpy as np
from music_analyzer.signal_metrics import measure_signal


def test_sine_wave_peak_rms_and_crest(tmp_path):
    sr = 22050
    t = np.arange(sr * 2, dtype=np.float64) / sr
    wave = (0.5 * np.sin(2 * np.pi * 440 * t)).astype("<f4")
    path = tmp_path / "sine.f32le"
    wave.tofile(path)
    metrics = measure_signal(str(path), sr)
    assert abs(metrics["sample_peak_dbfs"] - (-6.0206)) < 0.02
    assert abs(metrics["global_rms_dbfs"] - (-9.0309)) < 0.02
    assert abs(metrics["crest_factor_db"] - 3.0103) < 0.02
    assert abs(metrics["dc_offset"]) < 1e-6
    assert metrics["near_full_scale_sample_fraction"] == 0


def test_silence_has_null_dbfs(tmp_path):
    path = tmp_path / "silence.f32le"
    np.zeros(1000, dtype="<f4").tofile(path)
    metrics = measure_signal(str(path), 22050)
    assert metrics["sample_peak_dbfs"] is None
    assert metrics["global_rms_dbfs"] is None
    assert metrics["crest_factor_db"] is None
