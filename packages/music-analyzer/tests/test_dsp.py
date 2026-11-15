import numpy as np

from music_analyzer.dsp import measure_pcm


def test_silence_does_not_invent_tempo(tmp_path):
    pcm = tmp_path / "silence.f32le"
    np.zeros(22050 * 2, dtype="<f4").tofile(pcm)
    result = measure_pcm(pcm, 22050, 2.0)
    assert result["rhythm"]["bpm_estimate"] is None
    assert result["rhythm"]["beats"] == []
    assert result["events"] == []
    assert len(result["curves"]["points"]) == 4


def test_click_track_detects_onsets(tmp_path):
    sr = 22050
    y = np.zeros(sr * 8, dtype="<f4")
    for n in range(0, len(y), sr // 2):
        y[n:n+100] = np.hanning(100).astype("float32")
    pcm = tmp_path / "click.f32le"
    y.tofile(pcm)
    result = measure_pcm(pcm, sr, 8.0)
    assert len(result["events"]) > 3
    assert all(0 <= event["time_seconds"] < 8 for event in result["events"])
