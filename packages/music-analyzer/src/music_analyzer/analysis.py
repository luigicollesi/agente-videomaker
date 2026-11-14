"""Analyze media using the existing FFmpeg decoder and CPU DSP."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from music_analyzer import __version__
from music_analyzer.decoder import decode_audio
from music_analyzer.dsp import measure_pcm
from music_analyzer.temporal import characterize
from music_analyzer.advanced import add_advanced_features
from music_analyzer.signal_metrics import measure_signal


def analyze_music(audio_path: str, output_path: str,
                  audio_stream: int | None = None) -> dict:
    output = Path(output_path).expanduser().resolve()
    source = Path(audio_path).expanduser().resolve()
    if output == source:
        raise ValueError("Analysis JSON must not overwrite source media")
    with tempfile.TemporaryDirectory(prefix="music-analyzer-") as temp:
        info = decode_audio(source, Path(temp) / "audio.f32le", audio_stream)
        measured = measure_pcm(info.pcm_path, info.analysis_sample_rate_hz,
                               info.decoded_duration_seconds)
        source_meta = info.to_dict()
        source_meta.pop("pcm_path")
        result = {
            "schema_version": "1.0.0",
            "analyzer": {"name": "music-analyzer", "version": __version__,
                         "profile": "standard"},
            "source": source_meta,
            "capabilities": {"transcription": False, "source_separation": False,
                             "neural_models": False},
            **measured,
            "segments": [],
            "global_style_descriptors": []
        }
        result = add_advanced_features(characterize(result))
        result["signal_diagnostics"] = measure_signal(info.pcm_path, info.analysis_sample_rate_hz)
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(output.suffix + ".tmp")
        temporary.write_text(json.dumps(result, sort_keys=True, indent=2, allow_nan=False) + "\n",
                             encoding="utf-8")
        temporary.replace(output)
        return result
