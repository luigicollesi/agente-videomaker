"""Optional content-addressed JSON analysis cache.

Cache keys include content hash, analyzer version, selected stream, and
pipeline revision. Never trust a cache entry without validating metadata.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

PIPELINE_REVISION = "dynamics-structure-cens-mfcc-2026-11"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def cache_key(source_sha256: str, stream: int | None, version: str) -> str:
    payload = json.dumps([source_sha256, stream, version, PIPELINE_REVISION],
                         separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def load_cached(cache_dir: Path, key: str, source_sha256: str) -> dict | None:
    path = cache_dir / (key + ".json")
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("source", {}).get("source_sha256") != source_sha256:
        return None
    if data.get("cache_revision") != PIPELINE_REVISION:
        return None
    return data


def write_cached(cache_dir: Path, key: str, result: dict) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / (key + ".json")
    tmp = cache_dir / (key + ".tmp." + str(os.getpid()))
    try:
        tmp.write_text(json.dumps(result, indent=2, sort_keys=True, allow_nan=False) + "\n",
                       encoding="utf-8")
        tmp.replace(target)
    finally:
        tmp.unlink(missing_ok=True)
