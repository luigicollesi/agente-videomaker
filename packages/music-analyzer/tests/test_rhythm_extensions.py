from music_analyzer.rhythm_extensions import enrich_rhythm


def test_tempo_alternatives_preserve_primary():
    data = {
        "source": {"decoded_duration_seconds": 10},
        "curves": {"points": []},
        "rhythm": {"bpm_estimate": 90, "beats": [
            {"time_seconds": i * (2 / 3)} for i in range(15)]}
    }
    result = enrich_rhythm(data)["rhythm"]
    assert result["bpm_estimate"] == 90
    assert len(result["alternatives"]["tempo_candidates"]) == 3
    assert result["alternatives"]["local_tempo"][0]["bpm_estimate"] == 90
