import numpy as np

from music_analyzer.harmonic_structure import enrich_harmony_structure
from music_analyzer.structure_v2 import detect_repeated_regions


def test_cens_and_mfcc_structure_are_finite():
    points = []
    for i in range(48):
        vector = [0.01] * 12
        vector[i % 12] = 1.0
        points.append({
            "time_seconds": i * 0.5,
            "chroma_energy": vector,
            "rms_dbfs": -20.0 + i % 4,
            "spectral_centroid_hz": 500.0 + i % 5 * 20,
            "normalized_spectral_flux": 0.03,
            "mfcc": [float(i % 4)] * 13
        })
    data = {"source": {"decoded_duration_seconds": 24.0},
            "curves": {"points": points}}
    enriched = enrich_harmony_structure(data)
    assert len(enriched["curves"]["points"][0]["chroma_cens"]) == 12
    assert all(np.isfinite(p["chroma_cens"]).all() for p in enriched["curves"]["points"])
    structure = detect_repeated_regions(enriched)
    assert structure["method"] == "sequence_multifeature_mfcc_v2"
    assert isinstance(structure["repeated_regions"], list)
