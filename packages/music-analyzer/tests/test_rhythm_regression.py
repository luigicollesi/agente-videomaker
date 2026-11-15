"""Protect the validated Mel onset tracker from accidental flux substitution."""
import numpy as np
import librosa

from music_analyzer.dsp import measure_pcm, HOP


def test_onset_method_matches_librosa_reference(tmp_path):
    sr = 22050
    rng = np.random.default_rng(42)
    y = np.zeros(sr * 12, dtype="<f4")
    for i in range(0, len(y), sr // 2):
        length = min(80, len(y) - i)
        y[i:i+length] += np.hanning(length).astype("float32") * 0.8
    y += rng.standard_normal(len(y)).astype("float32") * 1e-5
    path = tmp_path / "clicks.f32le"
    y.tofile(path)

    result = measure_pcm(path, sr, 12)
    reference = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    detected = librosa.onset.onset_detect(onset_envelope=reference, sr=sr, hop_length=HOP)
    expected = [round(float(librosa.frames_to_time(frame, sr=sr, hop_length=HOP)), 6)
                for frame in detected
                if float(librosa.frames_to_time(frame, sr=sr, hop_length=HOP)) < 12]
    actual = [event["time_seconds"] for event in result["events"]]
    assert actual == expected
    assert result["features"]["onset_method"] == "librosa_mel_onset_strength"
    assert "normalized_spectral_flux" in result["curves"]["points"][0]
