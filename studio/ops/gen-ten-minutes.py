#!/usr/bin/env python3
"""Storyboard generator for 2026-11-17-a-ten-minutes (written 17 Nov 2026; kept for re-cuts)."""
import json, sys

ID = '2026-11-17-a-ten-minutes'
INK = '#1d3fb8'
ORANGE = '#FF7A2F'
CREAM = '#FFF3DF'

def cap(text, y=230, at=None, until=None, size=104, w=940):
    """Handwritten caption (Caveat) in cream with a soft shadow, for words over footage or a blurred desk."""
    L = {"html": f"<div style='width:{w}px;text-align:center;font:700 {size}px Hand;color:{CREAM};line-height:1.0;"
                 "text-shadow:0 3px 0 rgba(40,20,0,.55),0 0 26px rgba(0,0,0,.6),0 8px 30px rgba(0,0,0,.45)'>"
                 f"{text}</div>",
         "box": [70, y, w], "kf": []}
    if at is None:
        L['kf'] += [[-1, {"o": 1}], [0, {"o": 1}]]
    else:
        L['kf'] += [[at, {"o": 0, "y": 16}], [at + 0.25, {"o": 1, "y": 0}, "outCubic"]]
    if until is not None:
        L['kf'] += [[until, {"o": 1}], [until + 0.2, {"o": 0}]]
    return L

def shade_top(h=640, a=.62):
    return {"html": f"<div style='width:1080px;height:{h}px;background:linear-gradient(rgba(24,12,4,{a}),rgba(24,12,4,0))'></div>",
            "box": [0, 0, 1080], "kf": [[0, {"o": 1}]]}

# The checklist written on the notepad's page (Caveat in blue ink, tilted with the page).
LINES = ["who knows what", "how strong", "which page"]
LX, LY0, LDY, ROT = 250, 1010, 118, 14
def line_html(i, done):
    box = (f"<span style='display:inline-block;width:46px;height:46px;border:4px solid {INK};border-radius:6px;"
           "vertical-align:-6px;margin-right:22px;position:relative'>"
           + (f"<b style='position:absolute;left:-4px;top:-38px;font:700 92px Hand;color:{ORANGE}'>&#10003;</b>" if done else "")
           + "</span>")
    strike = f"text-decoration:line-through;text-decoration-color:{ORANGE};text-decoration-thickness:6px;" if done else ""
    return (f"<div style='width:640px;font:700 76px Hand;color:{INK};mix-blend-mode:multiply;white-space:nowrap;{strike}'>"
            f"{box}{LINES[i]}</div>")

def line_layer(i, done, at=None, gone=None):
    L = {"html": line_html(i, done), "box": [LX, LY0 + LDY * i, 640], "kf": []}
    if at is None:
        L['kf'] += [[-1, {"o": 1, "r": ROT}], [0, {"o": 1, "r": ROT}]]
    else:
        L['sfx'] = 'pencil'
        L['kf'] += [[at, {"o": 0, "x": -26, "r": ROT}], [at + 0.45, {"o": 1, "x": 0, "r": ROT}, "outCubic"]]
    if gone is not None:
        L['kf'] += [[gone, {"o": 1}], [gone + 0.05, {"o": 0}]]
    return L

def tick_layer(i, at):
    """A marker tick and strike landing on line i (orange, with a pop)."""
    return {"html": f"<svg viewBox='0 0 640 90' style='width:640px;height:90px;overflow:visible'>"
                    f"<path d='M84 44 L470 40' stroke='{ORANGE}' stroke-width='9' stroke-linecap='round' fill='none'/>"
                    f"<path d='M2 40 L20 66 L58 6' stroke='{ORANGE}' stroke-width='11' stroke-linecap='round' stroke-linejoin='round' fill='none'/></svg>",
            "box": [LX, LY0 + LDY * i + 4, 640], **({"sfx": "pencil"} if at >= 0 else {}),
            "kf": [[at, {"o": 1, "dash": 0, "r": ROT}], [at + 0.5, {"dash": 1}, "outCubic"]]}

def marker_ring(box, at, color=ORANGE):
    x, y, w, h = box
    d = (f"M{w*0.08:.0f} {h*0.30:.0f} C{w*0.20:.0f} {-h*0.06:.0f} {w*0.86:.0f} {-h*0.04:.0f} {w*0.97:.0f} {h*0.42:.0f} "
         f"C{w*1.04:.0f} {h*0.86:.0f} {w*0.40:.0f} {h*1.08:.0f} {w*0.08:.0f} {h*0.80:.0f} "
         f"C{-w*0.04:.0f} {h*0.62:.0f} {w*0.02:.0f} {h*0.22:.0f} {w*0.22:.0f} {h*0.10:.0f}")
    return {"html": f"<svg viewBox='0 0 {w} {h}' style='width:{w}px;height:{h}px;overflow:visible'>"
                    f"<path d='{d}' stroke='{color}' stroke-width='10' stroke-linecap='round' fill='none' "
                    "style='filter:drop-shadow(0 0 10px rgba(255,122,47,.55))'/></svg>",
            "box": [x, y, w], "sfx": "pencil", "kf": [[at, {"o": 1, "dash": 0}], [at + 0.6, {"dash": 1}, "outCubic"]]}

def notebook(b, frm, lines, ticks, morph_line, morph_to, morph_at, extra=None, tag=None):
    layers = [shade_top(560, .5)]
    for i, (st, at, gone) in enumerate(lines):
        if st is None:
            continue
        layers.append(line_layer(i, st, at, gone))
    for i, at in ticks:
        layers.append(tick_layer(i, at))
    if morph_line is not None:
        i = morph_line
        layers.append({"morph": {"at": morph_at, "dur": 1.15,
                                 "from": {"box": [LX - 20, LY0 + LDY * i - 10, 640, 104], "radius": 10, "bg": "#FFFDF4", "r": ROT,
                                          "html": line_html(i, False)},
                                 "to": morph_to, "trailColor": ORANGE},
                       "kf": [[morph_at, {"o": 1}]]})
    layers += extra or []
    sh = {"b": b, "kind": "clip", "src": "c-stock-99909-todo", "look": "full", "grade": "warm", "from": frm,
          "speed": 0.9, "cursor": False, "cam": [[0, 0, 540, 960], [26, 40, 514, 908]], "camEase": "inOutSine",
          "in": "cut", "layers": layers, "text": []}
    if tag:
        sh['text'] = [tag]
    return sh

def card_still(src, crop):
    return {"img": src, "crop": crop}

# ------------------------------------------------------------------ boxes of the three app screens
ID_CAM = [272, 172, 632, 404]          # Afterburn's card on Secret identities (DIP)
ID_BOX = [60, 560, 960, round(960 * (ID_CAM[3] - ID_CAM[1]) / (ID_CAM[2] - ID_CAM[0]))]
PW_CAM = [182, 276, 702, 596]          # the top five rows of Power rankings, Afterburn fifth
PW_BOX = [60, 600, 960, round(960 * (PW_CAM[3] - PW_CAM[1]) / (PW_CAM[2] - PW_CAM[0]))]
PL_CAM = [572, 316, 780, 690]          # issue 4, page 1 (a splash) in the page planner
PL_BOX = [318, 540, 445, round(445 * (PL_CAM[3] - PL_CAM[1]) / (PL_CAM[2] - PL_CAM[0]))]

shots = []
# 1 · the hook over the real notepad; the checklist writes itself on the page; line 1 morphs into the real card
shots.append(notebook(
    5.4, 0.0,
    lines=[(False, 0.9, 4.25), (False, 1.6, None), (False, 2.3, None)],
    ticks=[], morph_line=0, morph_at=4.25,
    morph_to={"box": ID_BOX, "radius": 22, "bg": "#FFFFFF", "img": "id-hover-end", "crop": ID_CAM},
    extra=[cap("10 minutes<br>before you <span style='color:%s'>draw.</span>" % '#FFB36B', y=250, size=128, until=4.0)]))
# 2 · Secret identities (real hover clip), lands on "3 people know"
shots.append({"b": 4.0, "kind": "clip", "src": "c-identity-hover-paper", "look": "card", "box": ID_BOX,
              "from": 1.2, "speed": 1.0, "clipEnd": 3.6, "cursor": True, "cam": [ID_CAM, ID_CAM], "bgFrame": "desk-todo",
              "bgFilter": "blur(7px) brightness(0.68) saturate(1.1) sepia(.15)", "in": "cut", "tilt": [0, 0, 2, -3],
              "layers": [shade_top(),
                         cap("Who knows she's Afterburn?", y=250, size=96, until=1.9),
                         cap("<span style='color:#FFB36B'>3 people.</span> Checked.", y=250, size=104, at=2.0),
                         marker_ring([70, 878, 720, 180], 1.9)],
              "text": []})
shots[-1]["layers"].append(cap("Inkwell &middot; <span style='color:#FFB36B'>free in your browser</span>", y=1215, size=74))
# 3 · back to the page: line 1 ticked, line 2 morphs into Power rankings
shots.append(notebook(
    1.8, 1.9,
    lines=[(False, None, None), (False, None, 0.6), (False, None, None)],
    ticks=[(0, 0.0)], morph_line=1, morph_at=0.6,
    morph_to={"box": PW_BOX, "radius": 22, "bg": "#FFFFFF", "img": "s-power-paper", "crop": PW_CAM}))
# 4 · Power rankings (real screen), Afterburn's row lifts and gets ringed
shots.append({"b": 3.8, "kind": "still", "src": "s-power-paper", "look": "card", "box": PW_BOX,
              "cam": [PW_CAM, [192, 290, 692, 596]], "camEase": "inOutCubic", "bgFrame": "desk-todo",
              "bgFilter": "blur(7px) brightness(0.68) saturate(1.1) sepia(.15)", "in": "cut", "tilt": [0, 0, -2, 3],
              "layers": [shade_top(), marker_ring([40, 1080, 700, 132], 1.2),
                         cap("How strong is she?", y=250, size=104, until=1.7),
                         cap("<span style='color:#FFB36B'>5th</span> in her cast.", y=250, size=110, at=1.8)],
              "text": []})
# 5 · back to the page: lines 1–2 ticked, line 3 morphs into the page planner
shots.append(notebook(
    1.8, 2.9,
    lines=[(False, None, None), (False, None, None), (False, None, 0.6)],
    ticks=[(0, -1), (1, 0.0)], morph_line=2, morph_at=0.6,
    morph_to={"box": PL_BOX, "radius": 18, "bg": "#FFFFFF", "img": "s-planner-paper", "crop": PL_CAM}))
# 6 · the page planner (real screen): issue 4, page 1 is a splash
shots.append({"b": 3.9, "kind": "still", "src": "s-planner-paper", "look": "card", "box": PL_BOX,
              "cam": [PL_CAM, [578, 330, 774, 682]], "camEase": "inOutCubic", "bgFrame": "desk-todo",
              "bgFilter": "blur(7px) brightness(0.68) saturate(1.1) sepia(.15)", "in": "cut", "tilt": [0, 0, 2, 2],
              "layers": [shade_top(),
                         cap("Which page is it?", y=250, size=104, until=1.7),
                         cap("Page 1.<br><span style='color:#FFB36B'>A splash.</span>", y=230, size=110, at=1.8)],
              "text": []})
# 7 · real hands drawing: the fun part
shots.append({"b": 2.8, "kind": "clip", "src": "c-stock-785-tablet", "look": "full", "grade": "warm", "from": 0.3,
              "speed": 0.95, "cursor": False, "cam": [[0, 40, 540, 1000], [30, 70, 500, 905]], "camEase": "inOutSine",
              "in": "whip-l",
              "layers": [shade_top(600, .55),
                         cap("&#10003; &#10003; &#10003;", y=230, size=96),
                         cap("Now draw.", y=340, size=150)],
              "text": []})

sb = {"id": ID, "engine": 3, "look": "paper", "fps": 30, "bpm": 128, "footage": "../footage/2026-11-17",
      "music": {"sections": [{"at": 0, "style": "lofi"}], "opener": "soft", "hits": [5.4, 9.4, 15.0, 20.7]},
      "end": {"b": 3.2, "theme": "paper", "line": "Thursday: Saltgrave, part 4.",
              "cta": "Free to start in your browser", "sub": "",
              "css": "body #endLine{font:700 92px Hand !important;color:#1d3fb8 !important;letter-spacing:0 !important;top:945px !important} body #endCta{background:#FF7A2F !important;color:#fff !important;box-shadow:0 20px 60px rgba(255,122,47,.45) !important}"},
      "shots": shots}
json.dump(sb, open(f'storyboards/{ID}.json', 'w'), indent=1)
tot = sum(s['b'] for s in shots) + sb['end']['b']
print(ID, 'beats', round(tot, 2), 'seconds', round(tot * 60 / 128, 2))
