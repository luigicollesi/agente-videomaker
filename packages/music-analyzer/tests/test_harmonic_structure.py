import numpy as np
from music_analyzer.harmonic_structure import enrich_harmony_structure


def test_tonal_analysis_and_recurrence():
    points = []
    for i in range(40):
        v = [0.0] * 12
        v[(i // 4) % 3] = 1.0
        points.append({"time_seconds": i * 0.5, "chroma_energy": v})
    data = {"source": {"decoded_duration_seconds": 20.0},
            "curves": {"points": points}}
    result = enrich_harmony_structure(data)
    assert result["harmony"]["status"] == "estimated"
    assert len(result["harmony"]["global_pitch_class_profile"]) == 12
    assert result["structure"]["candidate_count"] > 0
    assert result["structure"]["repetitions"][0]["chroma_cosine_similarity"] <= 1.0


def test_silent_chroma_abstains():
    data = {"source": {"decoded_duration_seconds": 2.0},
            "curves": {"points": [
                {"time_seconds": i * 0.5, "chroma_energy": [0] * 12} for i in range(4)]}}
    result = enrich_harmony_structure(data)
    assert result["harmony"]["status"] == "insufficient_data"
    assert result["harmony"]["mean_chroma_entropy_bits"] is None
