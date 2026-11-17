#!/usr/bin/env python3
"""Storyboard generator for 2026-11-18-b-tier-fills-itself (written 17 Nov 2026; v2 after the critic's re-cut)."""
import json
ID = '2026-11-18-b-tier-fills-itself'
GOLD = '#FFC857'

def head(text, y=250, at=None, until=None, size=96, color='#F6F1E7', w=940):
    L = {"html": f"<div style='width:{w}px;text-align:center;font:800 {size}px Sans;color:{color};line-height:1.04;letter-spacing:-.03em;text-shadow:0 4px 30px rgba(0,0,0,.6)'>{text}</div>",
         "box": [70, y, w], "kf": []}
    L['kf'] += [[-1, {"o": 1}], [0, {"o": 1}]] if at is None else [[at, {"o": 0, "y": 18, "blur": 6}], [at + 0.3, {"o": 1, "y": 0, "blur": 0}, "outCubic"]]
    if until is not None:
        L['kf'] += [[until, {"o": 1}], [until + 0.25, {"o": 0, "y": -10}]]
    return L

def ring(box, at, color=GOLD):
    x, y, w, h = box
    return {"html": f"<div style='width:{w}px;height:{h}px;box-sizing:border-box;border-radius:{h//2}px;border:6px solid {color};box-shadow:0 0 34px rgba(255,200,87,.6),inset 0 0 24px rgba(255,200,87,.25)'></div>",
            "box": [x, y, w], "sfx": "pop", "kf": [[at, {"o": 0, "s": 1.12}], [at + 0.3, {"o": 1, "s": 1}, "outBack"]]}

STAGE = ("<div style='width:1080px;height:1920px;background:"
         "radial-gradient(ellipse 60% 38% at 50% 50%,rgba(255,214,150,.30),rgba(255,214,150,0) 70%),"
         "radial-gradient(ellipse at 50% 120%,#3a2a1c 0%,#16120f 55%,#0b0a09 100%)'></div>")
FLOOR = ("<div style='width:1400px;height:1400px;background:repeating-linear-gradient(90deg,#4a3422 0 120px,#4f3925 120px 122px,#46301f 122px 260px,#513a26 260px 262px);"
         "box-shadow:inset 0 0 300px 120px rgba(0,0,0,.85)'></div>")
TIERS = [('S', '#E8505B'), ('A', '#F08A3C'), ('B', '#F2C14E'), ('C', '#4CC27A'), ('D', '#33B5D6')]
rows = ''.join(f"<div style='display:flex;height:76px;border-bottom:3px solid #1b1a22'><div style='width:90px;background:{c};border-right:3px solid #1b1a22;font:400 58px Marker;color:#1b1a22;text-align:center;line-height:76px'>{t}</div><div style='flex:1'></div></div>" for t, c in TIERS)
SHEET = (f"<div style='width:600px;height:480px;box-sizing:border-box;padding:24px 30px;background:#FBF7EC;'>"
         "<div style='font:700 44px Hand;color:#1b1a22;margin-bottom:10px'>my cast, ranked??</div>"
         f"<div style='border:3px solid #1b1a22;border-bottom:none'>{rows}</div></div>")
CAM0 = [272, 180, 1220, 802]      # empty tiers + the Fill from power grids button (DIP)
CAM1 = [272, 290, 900, 702]
CAM2 = [276, 292, 864, 677]
BOX = [60, 560, 960, round(960 * (CAM0[3] - CAM0[1]) / (CAM0[2] - CAM0[0]))]
PW = [182, 276, 702, 596]         # Power rankings, top five rows, Afterburn fifth
PWBOX = [60, 600, 960, round(960 * (PW[3] - PW[1]) / (PW[2] - PW[0]))]
# Afterburn's chip in the B row of the filled list (DIP), and where it sits on stage at CAM2
CHIP = [380, 354, 532, 386]
sc = 960 / (CAM2[2] - CAM2[0])
CHIPBOX = [round(60 + (CHIP[0] - CAM2[0]) * sc), round(BOX[1] + (CHIP[1] - CAM2[1]) * sc), round((CHIP[2] - CHIP[0]) * sc)]
CHIPBOX.append(round((CHIP[3] - CHIP[1]) * sc))

shots = [
  # 1 · a paper tier sheet under a warm desk lamp; the camera dollies in; the sheet morphs into the real app
  {"kind": "blank", "bg": "black", "theme": "night", "b": 4.8, "persp": 1200,
   "cam3d": [[0, {"z": -260, "ry": -9, "rx": 10, "y": 40}], [4.8, {"z": 40, "ry": 0, "rx": 2, "y": 0}]],
   "layers": [
     {"html": STAGE, "box": [0, 0, 1080], "kf": [[0, {"o": 1, "z": -400, "s": 2.4}]]},
     {"html": FLOOR, "box": [-160, 420, 1400], "kf": [[0, {"o": .55, "z": -120, "rx": 62, "y": 380}]]},
     {"html": "<div style='width:600px;height:480px;box-shadow:0 60px 90px rgba(0,0,0,.65),0 10px 20px rgba(0,0,0,.4)'></div>", "box": [240, 900, 600],
      "kf": [[0, {"o": 1, "r": -6, "rx": 18}], [2.6, {"r": -2, "rx": 8}], [2.65, {"o": 0}]]},
     {"html": SHEET, "box": [240, 900, 600], "sfx": "paper", "kf": [[0, {"o": 1, "r": -6, "rx": 18}], [2.6, {"r": -2, "rx": 8}], [2.65, {"o": 0}]]},
     {"morph": {"at": 2.6, "dur": 1.6, "from": {"box": [240, 900, 600, 480], "radius": 4, "bg": "#FBF7EC", "r": -2, "html": SHEET},
                "to": {"box": BOX, "radius": 26, "bg": "#101018", "img": "tier-empty", "crop": CAM0}, "trailColor": GOLD},
      "kf": [[2.6, {"o": 1}]]},
     head("This tier list<br><span style='color:%s'>fills itself.</span>" % GOLD, y=240, size=118),
   ], "text": []},
  # 2 · the real tier list: the pointer reaches Fill from power grids, one click, everyone lands; the camera pushes in
  {"kind": "clip", "src": "c-tier-fill", "look": "card", "box": BOX, "from": 1.0, "speed": 0.6, "clipEnd": 2.95, "b": 9.2,
   "cursor": True, "in": "cut", "tilt": [3, -4, 1, 2], "bgFrame": "stage-lamp", "bgFilter": "none",
   "cam": [CAM0, CAM0, CAM0, CAM1, CAM2, CAM2], "camEase": "inOutCubic",
   "layers": [
     head("This tier list<br><span style='color:%s'>fills itself.</span>" % GOLD, y=240, size=118, until=1.9),
     head("One click.", y=280, size=124, at=2.0, until=5.0),
     {"html": "<div style='width:960px;height:640px;border-radius:26px;background:radial-gradient(ellipse at 70% 30%,rgba(255,235,190,.75),rgba(255,235,190,0) 70%)'></div>",
      "box": BOX[:3], "kf": [[2.55, {"o": 0}], [2.7, {"o": 1}, "outCubic"], [3.3, {"o": 0}]]},
     head("Everyone lands<br>where their <span style='color:%s'>powers</span> put them." % GOLD, y=230, size=84, at=5.3, until=8.6),
     ring([CHIPBOX[0] - 16, CHIPBOX[1] - 12, CHIPBOX[2] + 32, CHIPBOX[3] + 24], 7.0),
     {"morph": {"at": 8.3, "dur": 1.0, "from": {"box": [CHIPBOX[0], CHIPBOX[1], CHIPBOX[2], CHIPBOX[3]], "radius": 30, "bg": "#26283A",
                 "img": "s-tier-filled", "crop": CHIP},
                "to": {"box": PWBOX, "radius": 24, "bg": "#101018", "img": "s-power", "crop": PW}, "trailColor": GOLD},
      "kf": [[8.3, {"o": 1}]]},
   ], "text": []},
  # 3 · why B: her row in Power rankings (real screen)
  {"kind": "still", "src": "s-power", "look": "card", "box": PWBOX, "cam": [[192, 290, 692, 596], [196, 292, 688, 593]], "camEase": "inOutCubic",
   "in": "cut", "tilt": [0, 0, 2, -3], "bgFrame": "stage-lamp", "bgFilter": "none", "b": 4.6,
   "layers": [
     head("The Hollow King.<br>Why S?", y=240, size=104, until=1.9),
     head("1st in<br><span style='color:%s'>Power rankings.</span>" % GOLD, y=240, size=104, at=2.0),
     ring([40, 640, 700, 118], 1.0),
   ], "text": []},
]
sb = {"id": ID, "engine": 3, "look": "night", "fps": 30, "bpm": 128, "footage": "../footage/2026-11-17",
      "music": {"sections": [{"at": 0, "style": "ambient"}], "opener": "soft", "hits": [7.35], "risers": [5.6]},
      "end": {"b": 3.2, "theme": "night", "line": "Next: your hero is too strong.",
              "cta": "Free to start in your browser", "sub": "",
              "css": "body #endLine{font:800 60px Sans !important;color:#F6F1E7 !important;letter-spacing:-.03em !important;top:950px !important} body #endCta{top:1130px !important;background:#FFC857 !important;color:#16120f !important;box-shadow:0 20px 70px rgba(255,200,87,.35) !important} body #end{background:radial-gradient(ellipse 60% 40% at 50% 45%,#3a2a1c,#0b0a09) !important}"},
      "shots": shots}
json.dump(sb, open(f'storyboards/{ID}.json', 'w'), indent=1)
tot = sum(s['b'] for s in shots) + sb['end']['b']
print(ID, round(tot, 2), 'beats', round(tot * 60 / 128, 2), 's', 'chip', CHIPBOX)
