"""Command-line entry point for the first implementation milestone."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from music_analyzer import __version__
from music_analyzer.analysis import analyze_music
from music_analyzer.context import get_music_context
from music_analyzer.agent_tools import get_music_overview, compare_music_intervals, get_music_editing_cues
from music_analyzer.validation import validate_analysis
from music_analyzer.decoder import MediaError, decode_audio, inspect_audio


def main() -> int:
    parser = argparse.ArgumentParser(prog="music-analyzer")
    commands = parser.add_subparsers(dest="command", required=True)
    probe = commands.add_parser("inspect", help="Inspect audio streams without decoding")
    probe.add_argument("audio_path")
    probe.add_argument("--audio-stream", type=int)
    decode = commands.add_parser("decode", help="Decode to mono f32le PCM and record metadata")
    decode.add_argument("audio_path")
    decode.add_argument("--pcm-output", required=True)
    decode.add_argument("--metadata-output", required=True)
    decode.add_argument("--audio-stream", type=int)
    decode.add_argument("--sample-rate", type=int, default=22050)
    analyze = commands.add_parser("analyze", help="Compute rhythm, energy and spectral descriptors")
    analyze.add_argument("audio_path")
    analyze.add_argument("--output", required=True)
    analyze.add_argument("--audio-stream", type=int)
    analyze.add_argument("--cache-dir", help="Optional content-addressed analysis cache")
    context = commands.add_parser("context", help="Query analyzed acoustic context in a time range")
    context.add_argument("analysis_path")
    context.add_argument("--start", type=float, required=True)
    context.add_argument("--end", type=float, required=True)
    overview = commands.add_parser("overview", help="Concise overview for an editing agent")
    overview.add_argument("analysis_path")
    compare = commands.add_parser("compare", help="Compare acoustic characteristics of two intervals")
    compare.add_argument("analysis_path")
    for flag in ("start-a", "end-a", "start-b", "end-b"):
        compare.add_argument("--" + flag, type=float, required=True)
    cues = commands.add_parser("cues", help="Candidate acoustic editing cues")
    cues.add_argument("analysis_path")
    cues.add_argument("--start", type=float, required=True)
    cues.add_argument("--end", type=float, required=True)
    cues.add_argument("--limit", type=int, default=30)
    cues.add_argument("--categories", nargs="+", help="beat strong_onset energy harmonic_change structure_boundary")
    cues.add_argument("--selection", choices=("representative", "chronological"), default="representative")
    cues.add_argument("--min-relative-strength", type=float, default=0.0)
    validate = commands.add_parser("validate", help="Check analysis JSON timestamps and structural integrity")
    validate.add_argument("analysis_path")
    arguments = parser.parse_args()
    try:
        if arguments.command == "inspect":
            data = inspect_audio(arguments.audio_path, arguments.audio_stream)
            output = {"audio_stream_index": data["stream"]["index"],
                      "selection": data["selection"],
                      "codec": data["stream"].get("codec_name"),
                      "container_duration_seconds": data["duration"]}
        elif arguments.command == "validate":
            output = validate_analysis(arguments.analysis_path)
            print(json.dumps(output, sort_keys=True))
            return 0 if output["valid"] else 2
        elif arguments.command == "overview":
            output = get_music_overview(arguments.analysis_path)
        elif arguments.command == "compare":
            output = compare_music_intervals(arguments.analysis_path, arguments.start_a,
                                             arguments.end_a, arguments.start_b, arguments.end_b)
        elif arguments.command == "cues":
            output = get_music_editing_cues(arguments.analysis_path, arguments.start,
                                            arguments.end, arguments.limit, arguments.categories,
                                            arguments.selection, arguments.min_relative_strength)
        elif arguments.command == "context":
            output = get_music_context(arguments.analysis_path, arguments.start, arguments.end)
        elif arguments.command == "analyze":
            result = analyze_music(arguments.audio_path, arguments.output, arguments.audio_stream, arguments.cache_dir)
            output = {"status": "analyzed", "output_path": str(Path(arguments.output).resolve()),
                      "duration_seconds": result["source"]["decoded_duration_seconds"],
                      "bpm_estimate": result["rhythm"]["bpm_estimate"],
                      "beat_count": len(result["rhythm"]["beats"]),
                      "onset_count": sum(e["type"] == "onset" for e in result["events"]),
                      "change_point_count": sum(e["type"] == "change_point" for e in result["events"]),
                      "energy_event_count": sum(e["type"] in ("energy_rise", "energy_drop") for e in result["events"]),
                      "curve_points": len(result["curves"]["points"]),
                      "warnings": result["warnings"]}
        else:
            info = decode_audio(arguments.audio_path, arguments.pcm_output,
                                arguments.audio_stream, arguments.sample_rate)
            output = {"schema_version": "0.1.0-foundation",
                      "analyzer_version": __version__, "source": info.to_dict(),
                      "status": "decoded_only",
                      "warnings": ["Source-timeline alignment has not been verified",
                                   "DSP music analysis is not implemented yet"]}
            metadata = Path(arguments.metadata_output).expanduser().resolve()
            metadata.parent.mkdir(parents=True, exist_ok=True)
            metadata.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n",
                                encoding="utf-8")
        print(json.dumps(output, sort_keys=True))
        return 0
    except (MediaError, OSError, ValueError) as exc:
        print(json.dumps({"error": type(exc).__name__, "message": str(exc)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
