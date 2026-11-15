from music_analyzer.cues_v2 import extract_cues


def test_beat_cues_without_change_points():
    d = {"source":{"decoded_duration_seconds":20},
         "rhythm":{"beats":[{"time_seconds":t} for t in (2,4,6,8,10,12)]},
         "events":[],"curves":{"points":[]},"structure":{}}
    r=extract_cues(d,2,12,categories=["beat"],limit=3)
    assert r["count"] == 5
    assert r["truncated"]
    assert len(r["cues"]) == 3
    assert all(2 <= e["time_seconds"] < 12 for e in r["cues"])


def test_invalid_categories_and_intervals():
    import pytest
    d={"source":{"decoded_duration_seconds":8}}
    with pytest.raises(ValueError):
        extract_cues(d,0,9)
    with pytest.raises(ValueError):
        extract_cues(d,0,8,categories=["unsupported"])
