"""Command-line entry point for the first implementation milestone."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from music_analyzer import __version__
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
    arguments = parser.parse_args()
    try:
        if arguments.command == "inspect":
            data = inspect_audio(arguments.audio_path, arguments.audio_stream)
            output = {"audio_stream_index": data["stream"]["index"],
                      "selection": data["selection"],
                      "codec": data["stream"].get("codec_name"),
                      "container_duration_seconds": data["duration"]}
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
