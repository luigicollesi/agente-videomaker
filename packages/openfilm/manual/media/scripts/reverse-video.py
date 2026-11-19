#!/usr/bin/env python3
"""Reverse local video to a new MP4 with bounded FFmpeg buffering."""
import argparse
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile


def run(args):
    subprocess.run([str(x) for x in args], check=True, stdout=subprocess.DEVNULL)


def probe(path):
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)],
        check=True, capture_output=True, text=True,
    )
    data = json.loads(result.stdout)
    videos = [s for s in data.get('streams', []) if s.get('codec_type') == 'video']
    if not videos:
        raise ValueError('Input has no video stream')
    video = videos[0]
    duration = float(video.get('duration') or data['format']['duration'])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Invalid video duration')
    return video, duration, any(s.get('codec_type') == 'audio' for s in data.get('streams', []))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path)
    p.add_argument('output', type=Path)
    p.add_argument('--audio', choices=['mute', 'reverse', 'keep'], default='mute')
    p.add_argument('--start', type=float, default=0)
    p.add_argument('--end', type=float)
    a = p.parse_args()
    source, dest = a.input.resolve(), a.output.absolute()
    if not source.is_file() or source == dest:
        p.error('Input must exist and output must be a different file')
    try:
        video, duration, has_audio = probe(source)
        end = duration if a.end is None else a.end
        if not all(map(math.isfinite, [a.start, end])) or not 0 <= a.start < end <= duration + 0.001:
            p.error('Expected 0 <= start < end <= input duration')
        end = min(end, duration)
        fps = video.get('avg_frame_rate', '30/1')
        n, d = (int(x) for x in fps.split('/'))
        fps_value = n / d if d and n else 30
        # reverse and areverse buffer their inputs: constrain each chunk to ~160 MiB.
        seconds = min(8.0, max(0.3, 160 * 1024 * 1024 /
                               (max(1, int(video['width'])) * max(1, int(video['height'])) * 4 * max(1, fps_value))))
        with tempfile.TemporaryDirectory(prefix='reverse-video-', dir=dest.parent) as tmp:
            folder = Path(tmp)
            cuts = []
            cursor = a.start
            while cursor < end - 0.0001:
                next_cursor = min(end, cursor + seconds)
                cuts.append((cursor, next_cursor))
                cursor = next_cursor
            parts = []
            for i, (start, stop) in enumerate(reversed(cuts)):
                part = folder / f'part-{i:05d}.mp4'
                command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
                           '-ss', f'{start:.6f}', '-i', source, '-t', f'{stop-start:.6f}',
                           '-map', '0:v:0', '-vf', 'reverse', '-c:v', 'libx264', '-preset', 'veryfast',
                           '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
                if a.audio == 'reverse' and has_audio:
                    command += ['-map', '0:a:0', '-af', 'areverse', '-c:a', 'aac', '-b:a', '192k']
                else:
                    command += ['-an']
                run(command + [part])
                parts.append(part)
            combined = folder / 'combined.mp4'
            playlist = folder / 'parts.txt'
            playlist.write_text(''.join(f"file '{part.name}'\n" for part in parts), encoding='utf-8')
            run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat',
                 '-safe', '0', '-i', playlist, '-c', 'copy', combined])
            if a.audio == 'keep' and has_audio:
                staged = folder / 'output.mp4'
                run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
                     '-i', combined, '-ss', f'{a.start:.6f}', '-t', f'{end-a.start:.6f}',
                     '-i', source, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
                     '-c:a', 'aac', '-b:a', '192k', '-shortest', staged])
            else:
                staged = combined
            _, actual, _ = probe(staged)
            tolerance = max(0.2, 3 / max(fps_value, 1))
            if abs(actual - (end-a.start)) > tolerance:
                raise ValueError(f'Output duration mismatch: {actual:.3f}s vs {end-a.start:.3f}s')
            # Atomically publish only when destination is still absent. Hard-linking\n            # a staged file prevents replacing a concurrently created asset.\n            os.link(staged, dest)
        print(dest)
    except (OSError, subprocess.CalledProcessError, ValueError, KeyError, ZeroDivisionError) as error:
        p.exit(1, f'reverse-video: {error}\n')


if __name__ == '__main__':
    main()
