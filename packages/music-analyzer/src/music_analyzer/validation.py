"""Read-only consistency checks for analysis JSON; no genre or emotion inference."""
from __future__ import annotations

import json
import math
from pathlib import Path


def validate_analysis(path: str | Path) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    errors = []
    warnings = []
    try:
        duration = float(data["source"]["decoded_duration_seconds"])
        if not math.isfinite(duration) or duration <= 0:
            errors.append("Nonpositive or nonfinite duration")
        if data.get("schema_version") != "1.0.0":
            warnings.append("Unexpected schema version")
        if data.get("source", {}).get("timestamp_mapping") != "verified":
            warnings.append("Source/editor timeline alignment is not verified")
        for name, values, accessor in [
            ("beats", data["rhythm"]["beats"], lambda e: e["time_seconds"]),
            ("events", data["events"], lambda e: e["time_seconds"]),
            ("curves", data["curves"]["points"], lambda e: e["time_seconds"]),
        ]:
            prev = float("-inf")
            for i, value in enumerate(values):
                t = float(accessor(value))
                if not math.isfinite(t) or t < 0 or t > duration or t < prev:
                    errors.append(f"Invalid or out-of-order {name} timestamp at index {i}")
                    break
                prev = t
        prev_end = 0.0
        for i, segment in enumerate(data.get("segments", [])):
            start, end = float(segment["start_seconds"]), float(segment["end_seconds"])
            if not all(map(math.isfinite, (start, end))) or start < prev_end - 1e-5 or end <= start or end > duration + 1e-5:
                errors.append(f"Invalid or overlapping segment at index {i}")
                break
            prev_end = end
        if data.get("segments") and abs(prev_end - duration) > 0.002:
            warnings.append("Segments do not cover the full duration")
        def check_finite(obj, location="root"):
            if isinstance(obj, dict):
                for key, value in obj.items():
                    check_finite(value, location + "." + str(key))
            elif isinstance(obj, list):
                for index, value in enumerate(obj):
                    check_finite(value, f"{location}[{index}]")
            elif isinstance(obj, float) and not math.isfinite(obj):
                errors.append("Nonfinite number at " + location)
        check_finite(data)
    except (KeyError, ValueError, TypeError, IndexError) as exc:
        errors.append(f"Malformed analysis structure: {exc}")
    return {"valid": not errors, "errors": errors[:20], "warnings": warnings,
            "checked_schema_version": data.get("schema_version")}
