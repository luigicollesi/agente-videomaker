#!/usr/bin/env python3
"""Read-only image/video frame preparation for an image-capable agent."""
import argparse
import json
import math
from pathlib import Path
import subprocess
import tempfile
import shutil

IMAGES={'.jpg','.jpeg','.png','.webp','.gif','.bmp'}
VIDEOS={'.mp4','.mov','.mkv','.webm','.avi','.m4v'}

def source_path(raw, project, extensions):
    root=(project.resolve()/'assets').resolve(strict=True)
    path=Path(raw)
    file=(project/path).resolve(strict=True) if not path.is_absolute() else path.resolve(strict=True)
    if not file.is_file() or not file.is_relative_to(root) or file.suffix.lower() not in extensions:
        raise ValueError('Input must be a supported file within project/assets/')
    return file

def run(args,timeout=60):
    return subprocess.run(args,check=True,capture_output=True,text=True,timeout=timeout)

def main():
    p=argparse.ArgumentParser(description='Prepare Media images and video frames for visual inspection')
    p.add_argument('kind',choices=['image','video'])
    p.add_argument('path')
    p.add_argument('--project',type=Path,required=True)
    p.add_argument('--start',type=float,default=0)
    p.add_argument('--end',type=float)
    p.add_argument('--max-frames',type=int,default=12)
    p.add_argument('--width',type=int,default=960)
    a=p.parse_args()
    try:
        source=source_path(a.path,a.project,IMAGES if a.kind=='image' else VIDEOS)
        if a.kind=='image':
            print(json.dumps({'kind':'image','path':str(source),'read_with':'agent image-reading tool'}))
            return
        if not 1<=a.max_frames<=24 or not 160<=a.width<=1920:
            raise ValueError('max-frames must be 1..24 and width 160..1920')
        info=run(['ffprobe','-v','error','-show_entries','format=duration',
                  '-of','default=noprint_wrappers=1:nokey=1',str(source)],30)
        duration=float(info.stdout.strip())
        end=duration if a.end is None else a.end
        if not math.isfinite(duration) or duration<=0 or not all(map(math.isfinite,[a.start,end])) or a.start<0 or end<=a.start or end>duration+.01:
            raise ValueError('Invalid video duration or requested interval')
        end=min(end,duration)
        folder=Path(tempfile.mkdtemp(prefix='videomaker-inspect-'))
        frames=[]
        try:
            for i in range(a.max_frames):
                t=a.start+(end-a.start)*(i+.5)/a.max_frames
                dest=folder/f'frame-{i:03d}.jpg'
                run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y',
                     '-ss',f'{t:.6f}','-i',str(source),'-frames:v','1',
                     '-vf',f'scale=min({a.width}\\\\,iw):-2','-q:v','3',str(dest)])
                if not dest.is_file():raise ValueError('Frame extraction failed')
                frames.append({'time_seconds':round(t,3),'path':str(dest)})
        except BaseException:
            shutil.rmtree(folder)
            raise
        print(json.dumps({'kind':'video','source':str(source),'duration_seconds':duration,
                          'frames':frames,'temporary_directory':str(folder),
                          'read_with':'agent image-reading tool',
                          'cleanup':'Remove temporary_directory after inspecting frames'}))
    except (OSError,ValueError,subprocess.CalledProcessError,subprocess.TimeoutExpired) as e:
        p.exit(1,f'inspect-media: {e}\n')

if __name__=='__main__':
    main()
