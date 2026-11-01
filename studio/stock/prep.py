#!/usr/bin/env python3
"""Turn a stretch of a stock clip into an engine clip folder (frames at 30 fps + clip.json).

Usage:
  python3 stock/prep.py <stock id> <footage dir> <name> --start S --dur D [--cx 0.5] [--wide] [--speed 1]
    name     becomes clips/c-stock-<id>-<name>/ inside the footage dir (src "c-stock-<id>-<name>")
    --cx     vertical crop centre as a fraction of the width (landscape sources); default 0.5
    --wide   keep the whole 16:9 frame (1920x1080) instead of a 9:16 crop (use it as a card)
    --speed  0.5 = slow motion (reads D*speed seconds of source), 2 = twice as fast
Vertical sources (1080x1920) are kept whole. Frames: 1080x1920 (or 1920x1080), dip = size/2.
Needs stock/fetch.py <id> first (footage/stock/<id>.mp4).
"""
import argparse, json, os, subprocess, glob
ap = argparse.ArgumentParser()
ap.add_argument('id'); ap.add_argument('footage'); ap.add_argument('name')
ap.add_argument('--start', type=float, required=True); ap.add_argument('--dur', type=float, required=True)
ap.add_argument('--cx', type=float, default=0.5); ap.add_argument('--wide', action='store_true')
ap.add_argument('--speed', type=float, default=1.0)
a = ap.parse_args()
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, '..', 'footage', 'stock', f'{a.id}.mp4')
w, h = map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout.strip().split(','))
out = os.path.join(a.footage, 'clips', f'c-stock-{a.id}-{a.name}')
os.makedirs(out, exist_ok=True)
for f in glob.glob(os.path.join(out, 'f*.jpg')):
    os.remove(f)
if h > w:  # vertical source
    vf, size = 'scale=1080:1920', (1080, 1920)
elif a.wide:
    vf, size = 'scale=1920:1080', (1920, 1080)
else:
    cw = int(round(h * 9 / 16)); x0 = int(max(0, min(w - cw, a.cx * w - cw / 2)))
    vf, size = f'crop={cw}:{h}:{x0}:0,scale=1080:1920', (1080, 1920)
src_dur = a.dur * a.speed
setpts = f'setpts={1 / a.speed:.6f}*(PTS-STARTPTS),' if a.speed != 1 else ''
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{a.start:.3f}', '-t', f'{src_dur:.3f}', '-i', src,
                '-vf', f'{setpts}fps=30,{vf}:flags=lanczos', '-q:v', '2', os.path.join(out, 'f%05d.jpg')], check=True)
files = sorted(os.path.basename(f) for f in glob.glob(os.path.join(out, 'f*.jpg')))
# ffmpeg numbers from 1; engine expects f00000…
frames = []
for k, f in enumerate(files):
    dst = 'f%05d.jpg' % k
    if f != dst:
        os.rename(os.path.join(out, f), os.path.join(out, dst))
    frames.append({'file': dst})
json.dump({'name': os.path.basename(out), 'fps': 30, 'size': {'width': size[0], 'height': size[1]}, 'dip': [size[0] // 2, size[1] // 2],
           'frames': frames, 'source': f'Mixkit {a.id} (Stock Video Free License)'}, open(os.path.join(out, 'clip.json'), 'w'))
print(os.path.basename(out), len(frames), 'frames', size)
