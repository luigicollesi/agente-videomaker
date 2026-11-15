"""Regression: MFCC curves are finite and the validated onset reference is unchanged."""
import numpy as np
import librosa
from music_analyzer.dsp import measure_pcm, HOP


def test_mfcc_shape_and_mel_onset_reference(tmp_path):
    sr = 22050
    y = np.zeros(sr * 6, dtype="<f4")
    for i in range(0, len(y), sr // 2):
        y[i:i+100] = np.hanning(100)
    path = tmp_path / "click.f32le"
    y.tofile(path)
    actual = measure_pcm(path, sr, 6)
    assert all(len(p["mfcc"]) == 13 for p in actual["curves"]["points"])
    assert all(np.isfinite(p["mfcc"]).all() for p in actual["curves"]["points"])
    assert actual["features"]["onset_method"] == "librosa_mel_onset_strength"
    envelope = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    frames = librosa.onset.onset_detect(onset_envelope=envelope, sr=sr, hop_length=HOP)
    expected = [round(float(librosa.frames_to_time(i, sr=sr, hop_length=HOP)), 6)
                for i in frames
                if float(librosa.frames_to_time(i, sr=sr, hop_length=HOP)) < 6]
    observed = [e["time_seconds"] for e in actual["events"]]
    assert observed == expected
