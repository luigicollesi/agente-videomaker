import numpy as np
import librosa

from music_analyzer.spectral_chunks import chunked_spectral_features


def test_chunk_invariance_and_boundary_frames():
    sr = 22050
    rng = np.random.default_rng(7)
    audio = rng.normal(0, 0.03, sr * 3 + 137).astype("float32")
    small = chunked_spectral_features(audio, sr, batch_frames=13)
    large = chunked_spectral_features(audio, sr, batch_frames=257)
    for key in small:
        assert small[key].shape == large[key].shape
        assert np.allclose(small[key], large[key], atol=1e-4, rtol=1e-4), key
    assert len(small["rms"]) == 1 + len(audio)//512


def test_silent_chunk_has_finite_features():
    outputs = chunked_spectral_features(np.zeros(22050, dtype="float32"), 22050,
                                       batch_frames=5)
    for name, values in outputs.items():
        assert np.isfinite(values).all(), name
    assert np.all(outputs["spectral_flux"] == 0)
