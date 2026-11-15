from music_analyzer.sequence_compare import compare_sequences


def _frame(i, t):
    c=[0.01]*12;c[i%12]=1.
    return {"time_seconds":t,"chroma_cens":c,"mfcc":[float(i%5)]*13,
            "rms_dbfs":-20.,"normalized_spectral_flux":float(i%3)}


def test_sequence_identical_vs_reversed():
    points=[_frame(i,i*.5) for i in range(20)]
    points.extend(_frame(i,20+i*.5) for i in range(20))
    points.extend(_frame(19-i,40+i*.5) for i in range(20))
    same=compare_sequences(points,(0,10),(20,30))
    reverse=compare_sequences(points,(0,10),(40,50))
    assert same["status"]=="estimated"
    assert same["normalized_alignment_cost"] <= reverse["normalized_alignment_cost"]
