from music_analyzer.advanced import add_advanced_features


def test_rhythm_counts_and_silence():
    result = {
        "source": {"decoded_duration_seconds": 10.0},
        "curves": {"hop_seconds": 0.5, "points": [
            {"time_seconds": i / 2, "rms_dbfs": None} for i in range(20)]},
        "rhythm": {"beats": [], "bpm_estimate": None},
        "events": [],
    }
    out = add_advanced_features(result)
    assert out["rhythm"]["advanced"]["beat_interval_cv"] is None
    assert all(p["onsets_per_second"] == 0 for p in out["rhythm"]["advanced"]["onset_density_curve"])
    assert out["dynamics"]["median_rms_dbfs"] == -120


def test_known_beat_spacing_and_onset_density():
    result = {
        "source": {"decoded_duration_seconds": 8.0},
        "curves": {"hop_seconds": 0.5, "points": [
            {"time_seconds": i / 2, "rms_dbfs": -20.0} for i in range(16)]},
        "rhythm": {"beats": [{"time_seconds": float(i)} for i in range(8)]},
        "events": [{"type": "onset", "time_seconds": float(i)} for i in range(8)],
    }
    out = add_advanced_features(result)
    assert out["rhythm"]["advanced"]["bpm_from_median_beat_interval"] == 60
    assert out["rhythm"]["advanced"]["beat_interval_cv"] == 0
