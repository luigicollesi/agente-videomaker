import json

from music_analyzer.temporal import characterize
from music_analyzer.context import get_music_context


def sample(duration=20.0, step=0.5):
    points = []
    for i in range(int(duration/step)):
        t = i*step
        points.append({"time_seconds":t, "rms_dbfs":-35.0 if t < 10 else -10.0,
                       "spectral_centroid_hz":400.0 if t < 10 else 3000.0,
                       "spectral_flatness":0.01 if t < 10 else 0.2})
    return {"source":{"decoded_duration_seconds":duration},
            "curves":{"hop_seconds":step,"points":points},
            "rhythm":{"bpm_estimate":None,"beats":[]},
            "events":[],"warnings":[],
            "features":{"time_reference":"decoded_pcm_unverified_source_mapping"}}


def test_segments_organized_and_events_chronological():
    result = characterize(sample())
    assert result["segments"]
    assert all(a["end_seconds"] <= b["start_seconds"] for a,b in zip(result["segments"],result["segments"][1:]))
    assert all(a["time_seconds"] <= b["time_seconds"] for a,b in zip(result["events"],result["events"][1:]))


def test_context_queries(tmp_path):
    data = characterize(sample())
    path = tmp_path / "analysis.json"
    path.write_text(json.dumps(data))
    result = get_music_context(str(path), 8, 12)
    assert result["start_seconds"] == 8
    assert result["summary_features"]["curve_points"] == 8
    assert result["acoustic_character"]
