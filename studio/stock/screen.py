#!/usr/bin/env python3
"""Put real Inkwell footage on the green laptop screen of stock clip 100321 (hands typing).

Usage:
  python3 stock/screen.py --app <footage>/clips/c-search --out <footage>/clips/c-gs-search \
      [--start 0.4] [--dur 3.2] [--speed 1.0] [--mode wide|tall] [--still <footage>/stills/s-lineup.jpg]

wide: the whole desk scene, 1920x1080 frames (use it as a card, or crop with the camera).
tall: a 9:16 crop around the screen and the left hand, 1080x1920 frames (full-bleed).
Writes f00000.jpg… and clip.json (fps 30, size, dip = size/2) so engine 2/3 treat it like an app clip.

How it works: the green area is found in every frame; its bottom edge, its right edge and its left edge
are real screen edges (the frame cuts the top of the lid). The two hidden top corners are rebuilt from
those edges (top edge parallel to the bottom edge, left edge 1340 source px long in 4K), so the app
sits on the lid with the right perspective. Corners are smoothed over 7 frames. The app frame is
warped into that quad, softened to read like a lit screen, and keyed in with a feathered edge.
"""
import argparse, json, os, glob
import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--src', default=os.path.join(os.path.dirname(__file__), '..', 'footage', 'stock', '100321.mp4'))
ap.add_argument('--app', help='app clip folder (clip.json + frames)')
ap.add_argument('--still', help='a still instead of a clip')
ap.add_argument('--out', required=True)
ap.add_argument('--start', type=float, default=0.3)
ap.add_argument('--dur', type=float, default=3.0)
ap.add_argument('--speed', type=float, default=1.0, help='app clip speed')
ap.add_argument('--appfrom', type=float, default=0.0, help='seconds into the app clip')
ap.add_argument('--mode', default='tall', choices=['wide', 'tall'])
ap.add_argument('--cx', type=int, default=1150, help='tall mode: crop centre x in 4K source px')
a = ap.parse_args()

cap = cv2.VideoCapture(a.src)
sfps = cap.get(cv2.CAP_PROP_FPS)
SW, SH = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
K = SW / 3840.0  # geometry below is tuned on the 4K file
n_out = int(round(a.dur * 30))

# app frames
if a.app:
    cj = json.load(open(os.path.join(a.app, 'clip.json')))
    app_files = [os.path.join(a.app, f['file']) for f in cj['frames']]
else:
    app_files = [a.still]

def app_frame(k):
    i = int(round((a.appfrom + k / 30.0 * a.speed) * 30)) if a.app else 0
    i = max(0, min(len(app_files) - 1, i))
    return cv2.imread(app_files[i])

def detect(f):
    hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (35, 70, 50), (90, 255, 255))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)
    hull = cv2.convexHull(c)
    pts = cv2.approxPolyDP(hull, 0.02 * cv2.arcLength(hull, True), True).reshape(-1, 2).astype(float)
    inner = pts[pts[:, 1] > 40 * K]
    br = inner[np.argmax(inner[:, 0])]          # bottom-right corner
    bl = pts[np.argmax(pts[:, 1])]              # bottom-left corner (lowest point)
    top = pts[pts[:, 1] <= 40 * K]
    tr_vis = top[np.argmax(top[:, 0])]          # where the right edge leaves the frame
    left_top = pts[np.argmin(pts[:, 0] + pts[:, 1])]  # where the left edge leaves the frame
    return np.array([bl, br, tr_vis, left_top]), m

def corners(d):
    bl, br, trv, ltv = d
    ul = (ltv - bl); ul /= np.linalg.norm(ul)
    tl = bl + ul * 1340 * K
    ub = (br - bl); ub /= np.linalg.norm(ub)
    ur = (trv - br); ur /= np.linalg.norm(ur)
    # intersect the right edge (br + s*ur) with the top edge (tl + t*ub)
    A = np.array([ur, -ub]).T
    s, t = np.linalg.solve(A, tl - br)
    tr = br + s * ur
    return np.array([tl, tr, br, bl], dtype=np.float32)

# read source frames for the time range (source is 23.976 fps: map output frames by time)
frames, raw = [], []
for k in range(n_out):
    ts = a.start + k / 30.0
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(ts * sfps)))
    ok, f = cap.read()
    if not ok:
        break
    frames.append(f)
    raw.append(detect(f)[0])
raw = np.array(raw)
# smooth detected points over 7 frames
sm = np.copy(raw)
for i in range(len(raw)):
    lo, hi = max(0, i - 3), min(len(raw), i + 4)
    sm[i] = raw[lo:hi].mean(axis=0)

# faint reflection: a soft diagonal sheen over the screen (computed once)
_yy, _xx = np.mgrid[0:SH, 0:SW]
SHEEN = (np.clip(1 - np.abs((_xx * 0.35 + _yy) - 900 * K) / (700 * K), 0, 1)[..., None] * 0.07).astype(np.float32)
del _yy, _xx
os.makedirs(a.out, exist_ok=True)
for old in glob.glob(os.path.join(a.out, 'f*.jpg')):
    os.remove(old)
out_frames = []
for k, f in enumerate(frames):
    q = corners(sm[k])
    app = app_frame(k)
    ah, aw = app.shape[:2]
    # a lit laptop screen in daylight: slightly lifted blacks, a touch less contrast
    app = cv2.convertScaleAbs(app, alpha=0.9, beta=14)
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [aw, 0], [aw, ah], [0, ah]]), q)
    warped = cv2.warpPerspective(app, M, (f.shape[1], f.shape[0]), flags=cv2.INTER_CUBIC)
    # key: the whole screen quad (nothing covers the lid; this also removes the tracking markers), feathered
    poly = np.zeros(f.shape[:2], np.uint8)
    cv2.fillConvexPoly(poly, np.round(q).astype(np.int32), 255, lineType=cv2.LINE_AA)
    m = cv2.GaussianBlur(poly, (0, 0), 1.6 * K + 0.5).astype(np.float32)[..., None] / 255.0
    comp = warped.astype(np.float32) * (1 - SHEEN) + 255 * SHEEN
    # spill: pull green out of the edge pixels that stay
    f2 = f.astype(np.float32)
    g = f2[..., 1]; rb = np.maximum(f2[..., 0], f2[..., 2])
    f2[..., 1] = np.where(g > rb, rb + (g - rb) * 0.25, g)
    outf = comp * m + f2 * (1 - m)
    outf = np.clip(outf, 0, 255).astype(np.uint8)
    if a.mode == 'tall':
        cw = int(round(f.shape[0] * 9 / 16))
        x0 = int(np.clip(a.cx * K - cw / 2, 0, f.shape[1] - cw))
        outf = cv2.resize(outf[:, x0:x0 + cw], (1080, 1920), interpolation=cv2.INTER_AREA)
    else:
        outf = cv2.resize(outf, (1920, 1080), interpolation=cv2.INTER_AREA)
    name = 'f%05d.jpg' % k
    cv2.imwrite(os.path.join(a.out, name), outf, [cv2.IMWRITE_JPEG_QUALITY, 92])
    out_frames.append({'file': name})
h, w = outf.shape[:2]
json.dump({'name': os.path.basename(a.out.rstrip('/')), 'fps': 30, 'size': {'width': w, 'height': h},
           'dip': [w // 2, h // 2], 'frames': out_frames, 'source': 'Mixkit 100321 (Stock Video Free License) + Inkwell footage'},
          open(os.path.join(a.out, 'clip.json'), 'w'))
print('wrote', len(out_frames), 'frames', w, 'x', h, '->', a.out)
