#!/usr/bin/env python3
"""Build a "comic page" clip: two panels split by a slanted gutter that can slide, each filled with footage.
A side with "ink": true is printed as black halftone on newsprint; the other stays in full colour.

Usage: python3 stock/panels.py <footage dir> <spec.json>     (spec: one object or a list)
  {"name": "c-panel-x", "frames": 120, "slant": 70, "gutter": [[0, 960], [60, 960, "io"], [100, 420]],
   "top":    {"video": "4953", "start": 1.0, "speed": 1, "ink": true, "region": [0,0,1080,1200], "crop": [[0,[x0,y0,w]],[120,[x0,y0,w]]]},
   "bottom": {"clip": "c-identities", "from": 0, "speed": 1, "region": [0,700,1080,1220], "crop": [[0,[x0,y0,w]]]}}
crop = source px (height follows the region's shape). Gutter keys: frame, y at the page centre.
Output: clips/<name>/f*.jpg + clip.json (1080x1920, dip 540x960): use as src with cam [[0,0,540,960]], cursor false.
"""
import json, math, os, subprocess, sys, shutil
import numpy as np
from PIL import Image, ImageDraw
W, H, M, GW, LINE = 1080, 1920, 26, 30, 9
PAPER = np.array([246, 239, 222], float); INK = np.array([18, 16, 26], float)
HERE = os.path.dirname(os.path.abspath(__file__))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
def screen(cell, ang=45):
    a = math.radians(ang); u = (xx * math.cos(a) + yy * math.sin(a)) * 2 * math.pi / cell; v = (-xx * math.sin(a) + yy * math.cos(a)) * 2 * math.pi / cell
    return 0.5 + 0.25 * (np.cos(u) + np.cos(v))
SCR = screen(6)
def kf(keys, f):
    if f <= keys[0][0]: return keys[0][1]
    for a, b in zip(keys, keys[1:]):
        if f <= b[0]:
            k = (f - a[0]) / max(1e-6, b[0] - a[0]); k = k * k * (3 - 2 * k)
            if isinstance(a[1], list): return [p + (q - p) * k for p, q in zip(a[1], b[1])]
            return a[1] + (b[1] - a[1]) * k
    return keys[-1][1]
def frames_for(side, footage, n, tmp):
    if 'clip' in side:
        d = os.path.join(footage, 'clips', side['clip']); c = json.load(open(os.path.join(d, 'clip.json')))['frames']
        s0 = int(side.get('from', 0) * 30); sp = side.get('speed', 1)
        return [os.path.join(d, c[min(len(c) - 1, s0 + int(i * sp))]['file']) for i in range(n)]
    out = os.path.join(tmp, f"{side['video']}-{side.get('start', 0)}-{side.get('speed', 1)}"); os.makedirs(out, exist_ok=True)
    sp = side.get('speed', 1); src = os.path.join(HERE, '..', 'footage', 'stock', f"{side['video']}.mp4")
    if len(os.listdir(out)) < n:
        vf = (f'setpts={1 / sp:.5f}*(PTS-STARTPTS),' if sp != 1 else '') + 'fps=30'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(side.get('start', 0)), '-t', f'{(n + 2) / 30 * sp:.3f}', '-i', src, '-vf', vf, '-q:v', '2', os.path.join(out, 'f%05d.jpg')], check=True)
    have = sorted(os.listdir(out))
    return [os.path.join(out, have[min(i, len(have) - 1)]) for i in range(n)]
def render(side, path, f):
    x, y, w, h = side['region']; x0, y0, cw = kf(side['crop'], f); ch = cw * h / w
    im = Image.open(path).convert('RGB').crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((w, h), Image.LANCZOS)
    a = np.asarray(im, float)
    canvas = np.zeros((H, W, 3), float); canvas[:] = PAPER
    if side.get('ink'):
        lum = (a * [0.3, 0.59, 0.11]).sum(2) / 255
        lum = np.clip((lum - 0.06) * 1.3, 0, 1) ** 0.85
        s = SCR[y:y + h, x:x + w]; dots = np.clip((lum - s) * 6 + 0.5, 0, 1)
        m = (0.55 * dots + 0.45 * lum)[..., None]
        a = INK + (PAPER - INK) * m
    canvas[y:y + h, x:x + w] = a
    return canvas
def build(spec, footage):
    n = spec['frames']; out = os.path.join(footage, 'clips', spec['name']); shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    tmp = '/tmp/pnl'; os.makedirs(tmp, exist_ok=True)
    ft = frames_for(spec['top'], footage, n, tmp); fb = frames_for(spec['bottom'], footage, n, tmp)
    sl = spec.get('slant', 70); ls = []
    for f in range(n):
        g = kf(spec['gutter'], f); yl, yr = g + sl, g - sl
        ma = Image.new('L', (W, H), 0); mb = Image.new('L', (W, H), 0)
        pa = [(M, M), (W - M, M), (W - M, yr - GW / 2), (M, yl - GW / 2)]; pb = [(M, yl + GW / 2), (W - M, yr + GW / 2), (W - M, H - M), (M, H - M)]
        ImageDraw.Draw(ma).polygon(pa, fill=255); ImageDraw.Draw(mb).polygon(pb, fill=255)
        a = render(spec['top'], ft[f], f); b = render(spec['bottom'], fb[f], f)
        page = np.zeros((H, W, 3), float); page[:] = PAPER
        for layer, m in ((a, ma), (b, mb)):
            k = (np.asarray(m, np.float32) / 255)[..., None]; page = page * (1 - k) + layer * k
        im = Image.fromarray(page.astype(np.uint8)); d = ImageDraw.Draw(im)
        for p in (pa, pb):
            if max(q[1] for q in p) > min(q[1] for q in p) + 4: d.line(p + [p[0]], fill=(18, 16, 26), width=LINE, joint='curve')
        fn = 'f%05d.jpg' % f; im.save(os.path.join(out, fn), quality=93); ls.append({'file': fn})
    json.dump({'name': spec['name'], 'fps': 30, 'size': {'width': W, 'height': H}, 'dip': [W // 2, H // 2], 'frames': ls, 'source': 'stock/panels.py'}, open(os.path.join(out, 'clip.json'), 'w'))
    print(spec['name'], n)
specs = json.load(open(sys.argv[2])); specs = specs if isinstance(specs, list) else [specs]
for s in specs:
    if len(sys.argv) < 4 or s['name'] in sys.argv[3:]: build(s, sys.argv[1])
