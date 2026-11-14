import json
from music_analyzer.cache import cache_key, load_cached, write_cached, PIPELINE_REVISION


def test_cache_roundtrip_and_source_guard(tmp_path):
    key = cache_key("a" * 64, None, "0.1.0")
    result = {"source": {"source_sha256": "a" * 64},
              "cache_revision": PIPELINE_REVISION, "rhythm": {"bpm_estimate": 90}}
    write_cached(tmp_path, key, result)
    assert load_cached(tmp_path, key, "a" * 64) == result
    assert load_cached(tmp_path, key, "b" * 64) is None
    assert load_cached(tmp_path, "unknown", "a" * 64) is None
    assert cache_key("a" * 64, 0, "0.1.0") != key


def test_bad_cache_is_ignored(tmp_path):
    key = cache_key("a" * 64, None, "0.1.0")
    (tmp_path / (key + ".json")).write_text("{invalid")
    assert load_cached(tmp_path, key, "a" * 64) is None
