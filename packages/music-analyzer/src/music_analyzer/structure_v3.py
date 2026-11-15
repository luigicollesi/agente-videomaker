"""Candidate structural matches with multi-angle recurrence enhancement.

V2 remains available as a fallback and reference comparator.
"""
from __future__ import annotations
import numpy as np
import librosa


def detect_repeats_v3(data: dict, max_frames=800, max_results=30):
    points = data.get("curves", {}).get("points", [])
    duration = float(data["source"]["decoded_duration_seconds"])
    valid = [p for p in points if len(p.get("chroma_cens", [])) == 12 and
             len(p.get("mfcc", [])) == 13 and p.get("rms_dbfs") is not None]
    if len(valid) < 32:
        return {"status":"insufficient_data","method":"recurrence_path_enhance_v3",
                "repeated_regions":[]}
    step = max(1.0, duration / max_frames)
    samples = []
    for start in np.arange(0, duration, step):
        rows = [p for p in valid if start <= p["time_seconds"] < start + step]
        if not rows:
            samples.append(None)
        else:
            samples.append(np.mean([[*(p["chroma_cens"]), *(p["mfcc"]),
                                     p["rms_dbfs"]] for p in rows],axis=0))
    ok = np.asarray([s is not None and s[-1] > -55 for s in samples])
    if ok.sum() < 16:
        return {"status":"insufficient_data","method":"recurrence_path_enhance_v3",
                "repeated_regions":[]}
    x = np.asarray([s if s is not None else np.zeros(26) for s in samples])
    chroma = x[:,:12] / np.maximum(np.linalg.norm(x[:,:12],axis=1,keepdims=True),1e-9)
    med = np.median(x[ok,12:],axis=0)
    iqr = np.maximum(np.percentile(x[ok,12:],75,axis=0) -
                     np.percentile(x[ok,12:],25,axis=0),1e-3)
    features = np.column_stack((chroma*2,np.clip((x[:,12:]-med)/iqr,-4,4)*.5)).T
    n = len(x)
    width = max(2, int(np.ceil(12/step)))
    rec = librosa.segment.recurrence_matrix(features,k=max(3,min(12,n//15)),
             width=width,mode="affinity",metric="euclidean",sym=True,self=True)
    enhanced = librosa.segment.path_enhance(np.asarray(rec), n=max(3,round(8/step)),
                min_ratio=.8,max_ratio=1.25,n_filters=5)
    enhanced[~ok,:] = 0; enhanced[:,~ok] = 0
    # Threshold relative to strongest nontrivial affinity, avoiding an
    # arbitrary absolute scale for the recurrence affinity kernel.
    off = enhanced[np.triu_indices(n,width)]
    positive = off[off>0]
    if len(positive)<4:
        return {"status":"estimated","method":"recurrence_path_enhance_v3",
                "repeated_regions":[]}
    threshold = max(float(np.quantile(positive,.85)), float(np.max(positive))*.60)
    regions=[]
    for offset in range(width,n):
        diag=np.diagonal(enhanced,offset)
        active=diag>=threshold
        begin=None
        for k in range(len(diag)+1):
            if k<len(diag) and active[k] and begin is None: begin=k
            if (k==len(diag) or not active[k]) and begin is not None:
                count=k-begin
                if count*step>=8:
                    a=round(begin*step,3);b=round((begin+offset)*step,3)
                    length=min(count*step,duration-b)
                    regions.append({"first_start_seconds":a,"first_end_seconds":round(a+length,3),
                       "second_start_seconds":b,"second_end_seconds":round(b+length,3),
                       "duration_seconds":round(length,3),
                       "similarity_score":round(float(np.mean(diag[begin:k])),5),
                       "interpretation_status":"structural_candidate_unvalidated",
                       "evidence":["cens","mfcc","rms","multi_angle_path_enhance"]})
                begin=None
    regions.sort(key=lambda v:(-v["duration_seconds"],-v["similarity_score"]))
    selected=[]
    for r in regions:
        if any(abs(r["first_start_seconds"]-p["first_start_seconds"])<2*step and
               abs(r["second_start_seconds"]-p["second_start_seconds"])<2*step
               for p in selected):continue
        selected.append(r)
        if len(selected)>=max_results:break
    return {"status":"experimental","method":"recurrence_path_enhance_v3",
            "analysis_step_seconds":round(step,3),"repeated_regions":selected,
            "candidate_count":len(regions),
            "limitations":["No ground truth validation","Path enhancement supports modest tempo deviations",
                           "Affinity is not a calibrated probability"]}
