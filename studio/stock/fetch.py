#!/usr/bin/env python3
"""Download the studio's licensed stock clips (Mixkit, Stock Video Free License) into footage/stock/.

Usage: python3 stock/fetch.py [id ...]      (no ids = every clip in stock/library.json)
Raw files are never committed (footage/ is git-ignored): the licence forbids redistributing them as they are.
Each clip lands as footage/stock/<id>.mp4 (4K when Mixkit has it, else 1080p or 720p; vertical crops of landscape clips need the 4K).
"""
import json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
LIB = json.load(open(os.path.join(HERE, 'library.json')))
OUT = os.path.join(HERE, '..', 'footage', 'stock')
os.makedirs(OUT, exist_ok=True)

def curl(args):
    return subprocess.run(['curl', '-s', '-L', '-m', '120'] + args, capture_output=True)

def ok(url):
    r = subprocess.run(['curl', '-s', '-o', '/dev/null', '-I', '-m', '20', '-w', '%{http_code}', url], capture_output=True, text=True)
    return r.stdout.strip() == '200'

def candidates(item):
    i = str(item['id'])
    urls = [f'https://assets.mixkit.co/videos/{i}/{i}-{r}.mp4' for r in ('2160', '1080', '720')]
    page = curl(['https://mixkit.co' + item['page']]).stdout.decode('utf-8', 'ignore')
    if 'Mixkit Restricted License' in page and 'data-license="videoFree"' not in page:
        raise SystemExit(f'{i}: Restricted License (personal use only) - not usable')
    for u in sorted(set(re.findall(r'https://assets\.mixkit\.co/active_storage/video_items/%s/\d+/%s-video-\d+\.mp4' % (i, i), page))):
        urls[0:0] = [re.sub(r'-video-\d+\.mp4', f'-video-{r}.mp4', u) for r in ('2160', '1080', '720')]
    return urls

ids = set(sys.argv[1:])
for item in LIB['clips']:
    if ids and str(item['id']) not in ids:
        continue
    dst = os.path.join(OUT, f"{item['id']}.mp4")
    if os.path.exists(dst) and os.path.getsize(dst) > 100000:
        print('have', item['id']); continue
    for u in candidates(item):
        if ok(u):
            curl(['-o', dst, u])
            print('got', item['id'], u.rsplit('/', 1)[-1], os.path.getsize(dst) // 1024, 'KB')
            break
    else:
        print('MISSING', item['id'])
