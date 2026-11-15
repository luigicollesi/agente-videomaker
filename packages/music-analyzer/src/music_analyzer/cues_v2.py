"""Time-aware, bounded agent cues. All events remain acoustic hypotheses."""
from __future__ import annotations
import numpy as np

CATEGORIES = {"beat", "onset", "strong_onset", "energy", "harmonic_change", "structure_boundary"}

def extract_cues(d, start, end, *, categories=None, limit=30, min_relative_strength=0.0,
                 selection="representative", merge_coincident=False, merge_window_ms=30):
    duration = float(d["source"]["decoded_duration_seconds"])
    if not 0 <= start < end <= duration:
        raise ValueError("Invalid time interval")
    if not 1 <= limit <= 200 or not 0 <= min_relative_strength <= 1:
        raise ValueError("Invalid result limit or strength threshold")
    if selection not in {"representative", "chronological"}:
        raise ValueError("Invalid selection mode")
    if not 0 <= merge_window_ms <= 1000:
        raise ValueError("merge_window_ms must be 0..1000")
    selected = set(categories) if categories is not None else CATEGORIES
    if not selected <= CATEGORIES:
        raise ValueError("Unknown cue category")
    events = []
    def add(t, kind, category, method, strength=None):
        t = float(t)
        if start <= t < end and (min_relative_strength == 0 or (strength is not None and strength >= min_relative_strength)):
            events.append({"time_seconds": round(t, 5), "kind": kind, "category": category,
                           "relative_strength": strength, "evidence": method,
                           "time_reference": "decoded_pcm"})
    if "beat" in selected:
        for b in d.get("rhythm", {}).get("beats", []):
            add(b["time_seconds"], "beat", "beat", "beat_grid")
    if "strong_onset" in selected or "onset" in selected:
        for e in d.get("events", []):
            if e.get("type") != "onset":
                continue
            strength = e.get("strength", e.get("relative_strength"))
            if strength is None:
                add(e["time_seconds"], "onset_unranked", "onset",
                    "onset_detect_no_strength")
            else:
                strength = float(strength)
                add(e["time_seconds"], "strong_onset" if strength >= 0.65 else "onset",
                    "onset", "librosa_mel_onset_strength", strength)
    if "energy" in selected:
        for e in d.get("events", []):
            if e.get("type") in {"energy_rise", "energy_drop"}:
                add(e["time_seconds"], e["type"], "energy", "energy_change")
        for e in d.get("temporal_dynamics", {}).get("events", []):
            add(e["time_seconds"], e["type"], "energy", e.get("method", "rms_trend"))
    if "structure_boundary" in selected:
        for e in d.get("events", []):
            if e.get("type") == "change_point":
                add(e["time_seconds"], "structure_boundary_candidate", "structure_boundary", "acoustic_change")
        for r in d.get("structure", {}).get("repeated_regions", []):
            for field in ("first_start_seconds", "second_start_seconds"):
                add(r[field], "repeated_region_start", "structure_boundary", "multifeature_recurrence")
    if "harmonic_change" in selected:
        points = [p for p in d.get("curves", {}).get("points", [])
                  if len(p.get("chroma_cens", [])) == 12 and p.get("rms_dbfs", -100) is not None]
        for prev, curr in zip(points, points[1:]):
            if curr["time_seconds"] < start or curr["time_seconds"] >= end:
                continue
            if min(prev.get("rms_dbfs") or -100, curr.get("rms_dbfs") or -100) < -55:
                continue
            a, b = np.asarray(prev["chroma_cens"]), np.asarray(curr["chroma_cens"])
            norm = np.linalg.norm(a)*np.linalg.norm(b)
            novelty = float(1 - np.dot(a, b)/norm) if norm > 1e-12 else 0
            if novelty >= 0.08:
                add(curr["time_seconds"], "harmonic_change_candidate", "harmonic_change",
                    "successive_cens_cosine_distance", round(min(1., novelty), 5))
    events.sort(key=lambda x:(x["time_seconds"], x["category"], x["kind"]))
    total = len(events)
    # Optional presentation-only fusion, restricted to different event categories.
    merged_count = 0
    if merge_coincident:
        groups = []
        window = merge_window_ms / 1000.0
        for event in events:
            target = next((group for group in reversed(groups)
                           if event["time_seconds"] - group[0]["time_seconds"] <= window
                           and all(abs(event["time_seconds"] - member["time_seconds"]) <= window
                                   and event["category"] != member["category"] for member in group)), None)
            if target is None:
                groups.append([event])
            else:
                target.append(event)
                merged_count += 1
        combined = []
        for group in groups:
            if len(group) == 1:
                combined.append(group[0])
            else:
                combined.append({"time_seconds": group[0]["time_seconds"], "kind": "combined",
                                 "category": "combined",
                                 "categories": sorted({e["category"] for e in group}),
                                 "relative_strength": None,
                                 "evidence": [{"time_seconds": e["time_seconds"], "kind": e["kind"],
                                               "category": e["category"], "method": e["evidence"],
                                               "relative_strength": e["relative_strength"]} for e in group],
                                 "time_reference": "decoded_pcm"})
        events = combined
    total_after_merge = len(events)
    if selection == "representative" and len(events) > limit:
        # Reserve one slot per available category when capacity allows.
        bins = np.linspace(start, end, limit + 1)
        chosen = []
        used = set()
        for category in sorted({e["category"] for e in events}):
            if len(chosen) >= limit:
                break
            pool = [(i, e) for i, e in enumerate(events) if e["category"] == category]
            if pool:
                i, e = min(pool, key=lambda pair: abs(pair[1]["time_seconds"] - (start + end)/2))
                chosen.append(e)
                used.add(i)
        for j in range(limit):
            if len(chosen) >= limit:
                break
            pool = [(i, e) for i,e in enumerate(events) if i not in used and
                    bins[j] <= e["time_seconds"] < bins[j+1]]
            if pool:
                i,e = min(pool, key=lambda pair:(abs(pair[1]["time_seconds"]-(bins[j]+bins[j+1])/2),pair[0]))
                chosen.append(e); used.add(i)
        for i,e in enumerate(events):
            if len(chosen) >= limit: break
            if i not in used: chosen.append(e)
        events = sorted(chosen, key=lambda e:(e["time_seconds"],e["category"]))
    return {"start_seconds": start, "end_seconds": end, "cues": events[:limit],
            "count": total, "returned_count": min(len(events), limit),
            "merged_count": merged_count, "truncated": total_after_merge > limit,
            "available_categories": sorted(selected),
            "time_reference": "decoded_pcm_unverified_source_mapping",
            "warning": "Acoustic candidates, not mandatory editing decisions"}
