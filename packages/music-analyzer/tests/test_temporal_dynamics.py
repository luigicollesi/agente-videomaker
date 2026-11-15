from music_analyzer.temporal_dynamics import enrich_temporal_dynamics


def test_rms_trend_detects_change_without_claiming_lufs():
    points = [{"time_seconds": i * 0.5, "rms_dbfs": -35.0 if i < 12 else -10.0}
              for i in range(32)]
    result = enrich_temporal_dynamics({"curves": {"hop_seconds": 0.5, "points": points}})
    assert result["temporal_dynamics"]["status"] == "measured"
    assert len(result["temporal_dynamics"]["curve"]) == 32
    assert any(e["type"] == "rms_swell" for e in result["temporal_dynamics"]["events"])
    assert result["temporal_dynamics"]["unit"] == "dBFS"
