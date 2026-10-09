# Inkwell video studio

Makes Inkwell's short vertical videos (1080×1920, 30 fps, H.264 + AAC) from real screenshots of the app,
with code-driven motion graphics and synthesised sound design. No stock footage, no samples, no generated imagery.

## Make a video

```
cd studio
./make.sh storyboards/<id>.json [warm|bright|tense]
```

That renders every frame in headless Chromium (`render/capture.js` + `render/compose.html` + `render/engine.js`),
builds the soundtrack (`audio/sfx.py`), encodes `../videos/<id>.mp4` and writes a contact sheet
`out/<id>-sheet.jpg` (8 frames) to check by eye before anything is published. About 1.5 frames per second on
2 CPUs, so a 20 s video takes about 7 minutes.

Quick look at single frames while writing a storyboard:

```
node render/preview.js storyboards/<id>.json /tmp/pv 1.5,4,8,12
```

## Storyboard format

```json
{
  "id": "2026-10-10-a-short-name",
  "fps": 30,
  "windowCenterY": 1120,
  "hook":   { "text": "Hook line, read in under 3 s", "dur": 3.0, "top": 560, "size": 84, "bgShots": ["web-who-knows-who", "lineup"] },
  "scenes": [
    { "shot": "versus", "text": "Headline for this beat.", "dur": 2.5,
      "camA": [x0, y0, x1, y1], "camB": [x0, y0, x1, y1],
      "maskTop": 690, "cont": false, "size": 76,
      "cursor": { "from": [x, y], "to": [x, y], "t": [0.9, 1.8], "click": 2.0 } }
  ],
  "end": { "line": ["Your whole comic,", "in one place."], "cta": "Start free in your browser", "sub": "Link in bio", "dur": 3.6 }
}
```

- `shot`: a file in `assets/shots/` without `.png` (dark theme) or `light/<name>` (light theme). Screens are 2720×1702.
- `camA` → `camB`: the part of the screen the camera shows, as fractions of the screenshot (0–1), eased over the scene.
  Narrow regions (about 0.3 of the width) read well on a phone; whole-window shots are for establishing.
- `maskTop`: fades the window out above this y (px), so it never sits behind the headline. Use about 690 when the camera is zoomed in.
- `cont: true`: same screenshot as the previous scene, no transition; the camera keeps moving and only the headline changes.
  Set this scene's `camA` to the previous scene's `camB` for a seamless move.
- `cursor`: a pointer that moves (fractions of the screenshot) and clicks, in scene-local seconds.
- End card: the second `line` is drawn in the brand gradient (one gradient phrase per video).

Safe zone on the 1080×1920 canvas: keep words inside x 96–960 and y 250–1250. Nothing important in the bottom 30%
or the right 150 px (the apps' buttons and captions sit there).

## Sound

`audio/sfx.py` builds a pad bed (mood: warm, bright or tense) and syncs to the storyboard: an ink-drop "plip" and a
sub hit on the hook's impact, whooshes on scene changes, clicks on cursor clicks, and a shimmer and sting on the
end card. Everything is synthesised from sine waves and noise, so there's nothing to license.

## Assets

- `assets/shots/` (dark) and `assets/shots/light/`: the real app screens from the marketing kit (Afterburn, the example comic, version 0.1.6 era).
- `assets/brand/`: icon, lockups, profile picture, YouTube banner, the two tier-list pictures in both themes.
- `assets/fonts/`: Inkwell Display (SIL Open Font License, keep `OFL.txt`).
- `assets/video/`: the website's demo loop, vertical, both themes.
