"""Presentation-only cue fusion must never modify acoustic events."""
from copy import deepcopy
from music_analyzer.cues_v2 import extract_cues


def fixture():
    return {"source":{"decoded_duration_seconds":8},
            "rhythm":{"beats":[{"time_seconds":1.0},{"time_seconds":2.0}]},
            "events":[{"type":"onset","time_seconds":1.02,"strength":0.235},
                      {"type":"onset","time_seconds":2.10,"strength":0.8}],
            "curves":{"points":[]},"structure":{}}


def test_optional_fusion_and_legacy_default():
    d=fixture()
    before=deepcopy(d)
    unmerged=extract_cues(d,0,8,categories=["beat","strong_onset"],selection="chronological")
    merged=extract_cues(d,0,8,categories=["beat","onset"],selection="chronological",
                        merge_coincident=True,merge_window_ms=30)
    assert unmerged["count"]==4 and unmerged["returned_count"]==4
    assert unmerged["merged_count"]==0
    assert merged["count"]==4 and merged["returned_count"]==3
    assert merged["merged_count"]==1
    assert merged["cues"][0]["kind"]=="combined"
    assert merged["cues"][0]["categories"]==["beat","onset"]
    assert [e["time_seconds"] for e in merged["cues"][0]["evidence"]]==[1.0,1.02]
    assert d==before


def test_no_cross_category_chain_and_finite_window():
    d=fixture()
    d["events"].append({"type":"onset","time_seconds":1.025,"strength":0.4})
    r=extract_cues(d,0,8,categories=["beat","onset"],merge_coincident=True,
                   merge_window_ms=30,selection="chronological")
    assert r["merged_count"]==1
    assert r["returned_count"]==4


def test_new_category_and_strong_classification():
    d=fixture()
    a=extract_cues(d,0,8,categories=["onset"])
    b=extract_cues(d,0,8,categories=["strong_onset"])
    assert [e["time_seconds"] for e in a["cues"]]==[e["time_seconds"] for e in b["cues"]]
    assert [e["kind"] for e in a["cues"]]==["onset","strong_onset"]


def test_merging_preserves_result_limit():
    d=fixture()
    r=extract_cues(d,0,8,limit=2,categories=["beat","onset"],
                   merge_coincident=True,selection="chronological")
    assert r["count"]==4 and r["returned_count"]==2
    assert r["truncated"]


def test_representative_truncation_uses_preselection_count():
    d={"source":{"decoded_duration_seconds":20},
       "rhythm":{"beats":[{"time_seconds":i*0.25} for i in range(68)]},
       "events":[],"curves":{"points":[]},"structure":{}}
    r=extract_cues(d,0,20,limit=30,merge_coincident=True,
                   selection="representative",categories=["beat"])
    assert r["count"]==68
    assert r["merged_count"]==0
    assert r["returned_count"]==30
    assert r["truncated"] is True
