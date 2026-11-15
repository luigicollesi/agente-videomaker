import pytest
from music_analyzer.timebase import sample_to_pcm_seconds, map_decoded_to_editor


def test_sample_mapping_and_editor_offset():
    assert sample_to_pcm_seconds(22050,22050)==1.
    assert map_decoded_to_editor(12,trim_start_seconds=2,editor_start_seconds=30,
                                playback_rate=2,verified=True)["editor_time_seconds"]==35.


def test_unverified_mapping_does_not_invent_alignment():
    r=map_decoded_to_editor(12,trim_start_seconds=2,editor_start_seconds=30,
                            playback_rate=2,verified=False)
    assert r["editor_time_seconds"] is None
    with pytest.raises(ValueError):
        map_decoded_to_editor(-1,trim_start_seconds=0,editor_start_seconds=0,
                              playback_rate=1,verified=True)
