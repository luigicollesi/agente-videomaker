"""Secure FFprobe inspection and bounded FFmpeg PCM decoding.

Timestamps from the decoded stream are NOT assumed equivalent to editor source time
when the container contains offsets/edit lists. Such sources remain unverified.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

ALLOWED_SUFFIXES = {".wav", ".mp3", ".mp4"}
SAMPLE_RATE_HZ = 22050
MAX_INPUT_BYTES = 2 * 1024**3
MAX_DECODED_SECONDS = 3 * 60 * 60


class MediaError(ValueError):
    """Invalid or unsupported media input."""


@dataclass(frozen=True)
class AudioInfo:
    source_path: str
    source_sha256: str
    format: str
    audio_stream_index: int
    stream_selection: str
    source_sample_rate_hz: int
    source_channels: int
    stream_start_time_seconds: float | None
    container_duration_seconds: float | None
    analysis_sample_rate_hz: int
    decoded_sample_count: int
    decoded_duration_seconds: float
    timestamp_mapping: str
    timeline_offset_seconds: float | None
    ffmpeg_version: str
    pcm_path: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _binary(name: str) -> str:
    location = shutil.which(name)
    if location is None:
        raise MediaError(f"Missing required executable: {name}")
    return location


def _run_json(args: list[str]) -> dict[str, Any]:
    try:
        completed = subprocess.run(args, capture_output=True, text=True, timeout=60, check=True)
        payload = json.loads(completed.stdout)
    except (subprocess.SubprocessError, json.JSONDecodeError) as exc:
        raise MediaError(f"Could not inspect media: {exc}") from exc
    if not isinstance(payload, dict):
        raise MediaError("Invalid ffprobe response")
    return payload


def _number(value: Any) -> float | None:
    try:
        result = float(value)
        if result != result or abs(result) == float("inf"):
            return None
        return result
    except (ValueError, TypeError):
        return None


def inspect_audio(path: str | Path, audio_stream: int | None = None) -> dict[str, Any]:
    source = Path(path).expanduser().resolve(strict=True)
    if not source.is_file() or source.suffix.lower() not in ALLOWED_SUFFIXES:
        raise MediaError("Expected a local WAV, MP3 or MP4 file")
    if source.stat().st_size > MAX_INPUT_BYTES:
        raise MediaError("Media exceeds configured size limit")
    probe = _run_json([_binary("ffprobe"), "-v", "error", "-show_format",
                       "-show_streams", "-of", "json", str(source)])
    streams = [s for s in probe.get("streams", []) if s.get("codec_type") == "audio"]
    if not streams:
        raise MediaError("Media contains no audio stream")
    if audio_stream is None:
        selected = next((s for s in streams if s.get("disposition", {}).get("default") == 1), streams[0])
        selection = "default" if selected.get("disposition", {}).get("default") == 1 else "first_audio"
    else:
        selected = next((s for s in streams if s.get("index") == audio_stream), None)
        if selected is None:
            raise MediaError(f"Audio stream index {audio_stream} not found")
        selection = "explicit"
    duration = _number(probe.get("format", {}).get("duration"))
    if duration is not None and duration > MAX_DECODED_SECONDS + 60:
        raise MediaError("Media exceeds configured duration limit")
    return {"source": source, "probe": probe, "stream": selected,
            "selection": selection, "duration": duration}


def decode_audio(path: str | Path, destination: str | Path,
                 audio_stream: int | None = None,
                 sample_rate: int = SAMPLE_RATE_HZ) -> AudioInfo:
    if not 8000 <= sample_rate <= 96000:
        raise MediaError("Sample rate must be between 8000 and 96000")
    inspected = inspect_audio(path, audio_stream)
    source: Path = inspected["source"]
    stream = inspected["stream"]
    dest = Path(destination).expanduser().resolve()
    if dest == source:
        raise MediaError("PCM output must not overwrite source")
    dest.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with source.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    ffmpeg = _binary("ffmpeg")
    version = subprocess.run([ffmpeg, "-version"], capture_output=True, text=True,
                             timeout=15, check=True).stdout.splitlines()[0]
    command = [ffmpeg, "-nostdin", "-hide_banner", "-v", "error", "-i", str(source),
               "-map", f"0:{stream['index']}", "-vn", "-ac", "1", "-ar", str(sample_rate),
               "-f", "f32le", "-acodec", "pcm_f32le", "-y", str(dest)]
    try:
        subprocess.run(command, capture_output=True, timeout=MAX_DECODED_SECONDS,
                       check=True)
        count_bytes = dest.stat().st_size
        if count_bytes == 0 or count_bytes % 4:
            raise MediaError("Invalid or empty decoded PCM")
        count = count_bytes // 4
        duration = count / sample_rate
        if duration > MAX_DECODED_SECONDS:
            raise MediaError("Decoded duration exceeds configured limit")
        start = _number(stream.get("start_time"))
        # FFmpeg may apply encoder skip samples/edit lists; source-timeline
        # alignment must be checked against the actual editor playback.
        mapping = "unverified"
        return AudioInfo(
            source_path=str(source), source_sha256=digest.hexdigest(),
            format=source.suffix.lower().lstrip("."),
            audio_stream_index=int(stream["index"]),
            stream_selection=inspected["selection"],
            source_sample_rate_hz=int(stream.get("sample_rate") or 0),
            source_channels=int(stream.get("channels") or 0),
            stream_start_time_seconds=start,
            container_duration_seconds=inspected["duration"],
            analysis_sample_rate_hz=sample_rate,
            decoded_sample_count=count,
            decoded_duration_seconds=duration,
            timestamp_mapping=mapping,
            timeline_offset_seconds=None,
            ffmpeg_version=version,
            pcm_path=str(dest))
    except (subprocess.SubprocessError, OSError, MediaError) as exc:
        dest.unlink(missing_ok=True)
        if isinstance(exc, MediaError):
            raise
        raise MediaError(f"FFmpeg failed to decode audio: {exc}") from exc
