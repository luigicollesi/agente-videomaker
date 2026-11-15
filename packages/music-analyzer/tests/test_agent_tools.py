import json
from music_analyzer.agent_tools import get_music_overview, compare_music_intervals, get_music_editing_cues


def _write(tmp_path):
    data = {
        "source": {"decoded_duration_seconds": 8, "source_sha256": "x",
                   "timestamp_mapping": "unverified"},
        "rhythm": {"bpm_estimate": 90, "beats": [{"time_seconds": 1}]},
        "events": [{"type": "change_point", "time_seconds": 2,
                    "source_method": "test"}],
        "segments": [],
        "curves": {"hop_seconds": 0.5, "points": [
            {"time_seconds": t, "rms_dbfs": -20,
             "chroma_cens": [1.0] + [0.0] * 11,
             "mfcc": [1.0] * 13}
            for t in (0.0, 0.5, 4.0, 4.5)]},
        "temporal_dynamics": {"events": [
            {"time_seconds": 3, "type": "rms_swell", "method": "test"}]},
        "warnings": []
    }
    target = tmp_path / "result.json"
    target.write_text(json.dumps(data))
    return str(target)


def test_overview_and_interval_comparison(tmp_path):
    path = _write(tmp_path)
    assert get_music_overview(path)["rhythm"]["beat_count"] == 1
    pair = compare_music_intervals(path, 0, 2, 4, 6)
    assert pair["chroma_cens_cosine_similarity"] == 1.0
    assert pair["mfcc_cosine_similarity"] == 1.0


def test_editing_cues_are_bounded_and_explainable(tmp_path):
    path = _write(tmp_path)
    cues = get_music_editing_cues(path, 0, 8, 1)
    assert cues["count"] == 3
    assert len(cues["cues"]) == 1
    assert cues["truncated"]
