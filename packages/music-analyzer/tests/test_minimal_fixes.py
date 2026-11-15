"""Minimal fixes: strength, bounded cues, DTW and separate cache keys."""
from music_analyzer.cues_v2 import extract_cues
from music_analyzer.cache import cache_key
from music_analyzer.sequence_compare import compare_sequences


def test_onset_strength_and_threshold():
    data={"source":{"decoded_duration_seconds":4},
          "events":[{"type":"onset","time_seconds":1,"strength":0.8},
                    {"type":"onset","time_seconds":2,"strength":0.2}],
          "rhythm":{"beats":[]},"curves":{"points":[]},"structure":{}}
    result=extract_cues(data,0,4,categories=["strong_onset"],min_relative_strength=0.6)
    assert result["count"]==1
    assert result["cues"][0]["kind"]=="strong_onset"
    assert result["cues"][0]["relative_strength"]==0.8


def test_missing_strength_is_not_pretended_strong():
    data={"source":{"decoded_duration_seconds":4},
          "events":[{"type":"onset","time_seconds":1}],
          "rhythm":{"beats":[]},"curves":{"points":[]},"structure":{}}
    assert extract_cues(data,0,4,categories=["strong_onset"])["cues"][0]["kind"]=="onset_unranked"
    assert extract_cues(data,0,4,categories=["strong_onset"],min_relative_strength=0.5)["count"]==0


def test_representative_keeps_category_diversity():
    data={"source":{"decoded_duration_seconds":8},
          "events":[{"type":"change_point","time_seconds":2}],
          "rhythm":{"beats":[{"time_seconds":i*.25} for i in range(28)]},
          "curves":{"points":[]},"structure":{}}
    result=extract_cues(data,0,8,categories=["beat","structure_boundary"],limit=3)
    assert {e["category"] for e in result["cues"]} == {"beat","structure_boundary"}
    assert result["truncated"]


def test_cache_separates_structural_options():
    assert cache_key("a"*64,None,"0.1.0") != cache_key("a"*64,None,"0.1.0",True)


def test_dtw_diagnostic_fields_without_changing_cost():
    points=[]
    for k in range(8):
        c=[0.0]*12;c[k%12]=1.0
        points.append({"time_seconds":k*0.5,"chroma_cens":c,"mfcc":[float(k)]*13,"rms_dbfs":-20,
                       "normalized_spectral_flux":0.1})
        points.append({"time_seconds":10+k*0.5,"chroma_cens":c,"mfcc":[float(k)]*13,"rms_dbfs":-20,
                       "normalized_spectral_flux":0.1})
    result=compare_sequences(points,(0,4),(10,14))
    assert result["status"]=="estimated"
    assert result["mean_alignment_cost"]==result["normalized_alignment_cost"]
    assert result["path_length_ratio"]>=1
    assert result["feature_coverage"]=={"first":1.0,"second":1.0}
