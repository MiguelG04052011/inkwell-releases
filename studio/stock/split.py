#!/usr/bin/env python3
"""A split screen as an engine clip: real footage on top, a real app clip below, with a moving divider.

Usage:
  python3 stock/split.py --top <clip dir> --bottom <clip dir> --out <clip dir> --dur 3.0
      [--topcy 0.3] [--toph 1.0] [--rect 150,60,690,670] [--rect2 180,90,720,700] [--speed 1] [--from 0]
      [--div 0:760,0.4:700,3:720] [--color 240,106,156]

--top      a clip folder made by stock/prep.py (1080x1920 frames)
--bottom   an app clip folder from the capture step (2720x1760 frames, DIP 1360x880)
--topcy    which part of the top frame stays centred (0 top, 1 bottom)
--rect     the part of the app to show at the start, in app points (x0,y0,x1,y1); --rect2 where to end (a slow push)
--div      the divider's y in px, as t:y pairs eased between them; y 0 hides the top panel (a wipe up)
Output: 1080x1920 frames and clip.json, so a storyboard treats it like any clip (cursor: false; cam [0,0,540,960]).
The app's pointer is drawn into the panel by the storyboard only if you ask; leave it off.
"""
import argparse, json, os, glob
import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--top', required=True); ap.add_argument('--bottom', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--dur', type=float, required=True)
ap.add_argument('--topcy', type=float, default=0.3)
ap.add_argument('--rect', default='150,60,690,670'); ap.add_argument('--rect2', default='')
ap.add_argument('--speed', type=float, default=1.0); ap.add_argument('--appfrom', type=float, default=0.0)
ap.add_argument('--grey', type=float, default=0.55, help='how much colour to drain from the top panel (0..1)')
ap.add_argument('--div', default='0:760'); ap.add_argument('--color', default='240,106,156')
a = ap.parse_args()

W, H, FPS = 1080, 1920, 30
N = int(round(a.dur * FPS))
tj = json.load(open(os.path.join(a.top, 'clip.json')))
bj = json.load(open(os.path.join(a.bottom, 'clip.json')))
rect = [float(v) for v in a.rect.split(',')]
rect2 = [float(v) for v in a.rect2.split(',')] if a.rect2 else rect
keys = [tuple(float(v) for v in p.split(':')) for p in a.div.split(',')]
col = tuple(int(v) for v in a.color.split(','))[::-1]  # BGR
os.makedirs(a.out, exist_ok=True)
for f in glob.glob(os.path.join(a.out, 'f*.jpg')):
    os.remove(f)

def ease(k):
    return k * k * k * (k * (6 * k - 15) + 10)

def div_at(t):
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, y0), (t1, y1) in zip(keys, keys[1:]):
        if t <= t1:
            return y0 + (y1 - y0) * ease((t - t0) / max(t1 - t0, 1e-6))
    return keys[-1][1]

def cover(img, w, h, cy):
    """Scale to width, crop height around cy (or scale to height when the panel is taller than the frame)."""
    s = max(w / img.shape[1], h / img.shape[0])
    r = cv2.resize(img, (int(round(img.shape[1] * s)) + 1, int(round(img.shape[0] * s)) + 1), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    x0 = (r.shape[1] - w) // 2
    y0 = int(np.clip(cy * r.shape[0] - h / 2, 0, r.shape[0] - h))
    return r[y0:y0 + h, x0:x0 + w]

frames = []
for i in range(N):
    t = i / FPS
    D = int(round(div_at(t)))
    k = ease(min(i / max(N - 1, 1), 1))
    canvas = np.zeros((H, W, 3), np.uint8)
    # bottom panel: the app, sharp, filling everything below the divider
    q = bj['frames'][min(int((a.appfrom + t * a.speed) * bj.get('fps', 30)), len(bj['frames']) - 1)]
    app = cv2.imread(os.path.join(a.bottom, q['file']))
    sc = app.shape[1] / bj['dip'][0]
    r = [rect[j] + (rect2[j] - rect[j]) * k for j in range(4)]
    x0, y0, x1, y1 = [int(v * sc) for v in r]
    crop = app[y0:y1, x0:x1]
    ph = H - D
    if ph > 0:
        # keep the crop's top edge at the divider: the words that matter sit high in the panel
        aspect = (x1 - x0) / (y1 - y0)
        need_h = int(round(W / aspect))
        panel = cv2.resize(crop, (W, need_h), interpolation=cv2.INTER_AREA if W < (x1 - x0) else cv2.INTER_CUBIC)
        if need_h >= ph:
            canvas[D:H] = panel[:ph]
        else:
            canvas[D:D + need_h] = panel
    # top panel: footage
    if D > 0:
        p = tj['frames'][min(int(t * tj.get('fps', 30)), len(tj['frames']) - 1)]
        top = cv2.imread(os.path.join(a.top, p['file']))
        tp = cover(top, W, D, a.topcy)
        g = cv2.cvtColor(cv2.cvtColor(tp, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
        canvas[:D] = np.clip((tp * (1 - a.grey) + g * a.grey) * np.array([1.04, 0.98, 0.94]) * 0.86, 0, 255).astype(np.uint8)
        # the divider: a bright line with a soft glow on both sides
        if D < H:
            glow = np.zeros((H, W, 3), np.float32)
            glow[max(D - 3, 0):D + 3] = col
            glow = cv2.GaussianBlur(glow, (0, 0), 16) * 2.2
            canvas = np.clip(canvas.astype(np.float32) + glow, 0, 255).astype(np.uint8)
            canvas[max(D - 3, 0):D + 3] = (255, 255, 255)
    name = f'f{i:05d}.jpg'
    cv2.imwrite(os.path.join(a.out, name), canvas, [cv2.IMWRITE_JPEG_QUALITY, 93])
    frames.append({'file': name, 'x': 0, 'y': 0})
json.dump({'name': os.path.basename(a.out), 'fps': FPS, 'size': [W, H], 'dip': [W // 2, H // 2], 'frames': frames}, open(os.path.join(a.out, 'clip.json'), 'w'))
print('split', a.out, N, 'frames')
