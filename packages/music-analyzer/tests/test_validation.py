import json

from music_analyzer.validation import validate_analysis


def analysis():
    return {
        "schema_version": "1.0.0",
        "source": {"decoded_duration_seconds": 10.0, "timestamp_mapping": "unverified"},
        "rhythm": {"beats": [{"time_seconds": 1.0}, {"time_seconds": 2.0}]},
        "events": [{"time_seconds": 3.0, "type": "onset"}],
        "curves": {"points": [{"time_seconds": 0.0}, {"time_seconds": 0.5}]},
        "segments": [{"start_seconds": 0.0, "end_seconds": 10.0}]
    }


def test_valid_input_warns_unverified(tmp_path):
    path = tmp_path / "analysis.json"
    path.write_text(json.dumps(analysis()))
    result = validate_analysis(path)
    assert result["valid"]
    assert result["warnings"]


def test_detects_overlaps_and_out_of_order_events(tmp_path):
    data = analysis()
    data["events"].append({"time_seconds": 2.0, "type": "onset"})
    data["segments"].append({"start_seconds": 9.0, "end_seconds": 10.0})
    path = tmp_path / "invalid.json"
    path.write_text(json.dumps(data))
    result = validate_analysis(path)
    assert not result["valid"]
    assert len(result["errors"]) >= 2
