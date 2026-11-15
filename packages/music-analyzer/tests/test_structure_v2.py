"""Synthetic sequence validation for acoustic repeated-region detection."""
from music_analyzer.structure_v2 import detect_repeated_regions


def _make_data(sequence):
    points = []
    for index, (pitch, rms, centroid, flux) in enumerate(sequence):
        chroma = [0.0] * 12
        chroma[pitch] = 1.0
        points.append({
            "time_seconds": index * 2.0,
            "chroma_energy": chroma,
            "rms_dbfs": rms,
            "spectral_centroid_hz": centroid,
            "normalized_spectral_flux": flux,
        })
    return {"source": {"decoded_duration_seconds": len(sequence) * 2.0},
            "curves": {"points": points}}


def test_aba_sequence_detects_continuous_repetition():
    a = [(i % 12, -20.0 + i, 1000.0 + i * 180, 0.01 + i * 0.01)
         for i in range(8)]
    b = [((i + 5) % 12, -45.0, 4000.0, 0.30) for i in range(8)]
    result = detect_repeated_regions(_make_data(a + b + a), min_duration_seconds=8)
    assert result["repeated_regions"]
    assert any(r["duration_seconds"] >= 12 for r in result["repeated_regions"])


def test_constant_chroma_but_distinct_timbre_is_not_a_repeated_section():
    a = [(0, -20.0, 450.0, 0.01)] * 8
    b = [(0, -42.0, 7000.0, 0.4)] * 8
    result = detect_repeated_regions(_make_data(a + b), min_duration_seconds=8)
    assert result["repeated_regions"] == []


def test_silence_abstains():
    quiet = [(0, -100.0, 0.0, 0.0)] * 20
    result = detect_repeated_regions(_make_data(quiet))
    assert result["status"] == "insufficient_data"
    assert not result["repeated_regions"]
