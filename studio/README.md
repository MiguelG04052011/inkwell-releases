# Inkwell video studio

Makes Inkwell's short vertical videos (1080×1920, 30 fps, H.264 + AAC) from the real app, with code-driven motion
design and synthesised sound. No stock footage, no samples, no generated imagery.

**Engine 2 (default since 31 Oct 2026)** cuts on the beat: a shot every 0.5–1.5 s, real app footage (recorded
clips with the real pointer and clicks), kinetic type that slams in, counters, pills, whip/zoom/flash transitions,
camera shake on impacts and a beat-synced soundtrack. Engine 1 (`make.sh`, below) stays as a fallback.

## Engine 2

```
cd studio
./make2.sh storyboards/<id>.json [drive|dark|bright]     # → ../videos/<id>.mp4 + out/<id>-sheet.jpg (12 frames)
./variant.sh storyboards/<id>.json bio '{"cta":"Link in bio · free to start"}'   # → ../videos/<id>-bio.mp4
node render2/capture.js storyboards/<id>.json /tmp/pv 2 0,45,90,135              # single frames while writing
```

About 3.5 minutes for a 12 s video on 2 CPUs. `variant.sh` re-renders only the end card (TikTok and Instagram get
"Link in bio"; Shorts has no bio link, so YouTube gets the base file).

**Footage** lives in `studio/footage/<date>/` (not committed; recorded fresh by the studio's capture step, whose
tooling is kept in the private project docs under `claude/marketing/capture/`):
`stills/s-<screen>.jpg` and `clips/c-<name>/f00000.jpg…` + `clip.json` (frame list with the pointer position and
click/key events). Everything is 2× of the app window (1360×880 points → 2720×1760 px), dark theme unless the
name ends in `-paper`. If there's no fresh footage, `"src": "kit:<name>"` uses the old screenshots in
`assets/shots/` (2720×1702).

### Storyboard (engine 2)

```json
{
  "id": "2026-11-01-a-short-name", "engine": 2, "fps": 30, "bpm": 128,
  "footage": "../footage/2026-10-31",
  "music": { "style": "drive", "dropouts": [[5.5, 6]], "risers": [18], "hits": [] },
  "shots": [
    { "b": 2, "kind": "still", "src": "s-lineup", "in": "cut", "look": "full",
      "cam": [[x0, y0, x1, y1], [x0, y0, x1, y1]], "camEase": "outQuint", "dim": 0.4,
      "text": [ { "style": "slam", "text": "YOUR VILLAIN IS *TOO SHORT.*", "at": 0, "y": 600, "size": 148 } ] },
    { "b": 3, "kind": "clip", "src": "c-lineup-pan", "from": 0.2, "speed": 1.9, "look": "card",
      "box": [30, 560, 1020, 900], "tilt": [12, -14, 6, 10], "in": "zoom", "text": [] }
  ],
  "end": { "b": 5, "line": "Your whole story, in one place.", "cta": "Free to start in your browser", "sub": "On a Mac or in any browser" }
}
```

- Timing is in **beats** (`b`, `at`, `until`, `dur`, `stagger`): 128 BPM → one beat = 0.469 s. Every cut lands on the
  beat, and the soundtrack is built on the same grid.
- `kind`: `still`, `clip` (recorded footage; `from` = seconds into the clip, `speed` = number or `[start, end]` ramp),
  `type` (a text card; `bg`: `ink`, `hot`, `violet`, a CSS colour, or `still:<name>` for a blurred screen behind).
- `cam`: the part of the app to show, in app points (1360×880), as one rect (slow push-in, `drift` sets how much) or
  several (eased through with `camEase`: `inOutCubic`, `outQuint`, `outExpo`, `inOutExpo`, `linear`). For `look:
  "full"` pick rects about 0.56 wide:tall so they fill the phone screen; `look: "card"` floats a rounded card at
  `box` [x, y, w, h] on the stage, with optional 3D `tilt` [rx, ry, rx2, ry2].
- `in`: how the shot arrives: `cut`, `punch` (scale settle), `flash`, `whip-l`/`whip-r`/`whip-u`/`whip-d`, `zoom`,
  `drop`, `rise`, `leak`. `shake` (0–1) shakes the frame on arrival.
- `pops`: `[{ "r": [x0, y0, x1, y1], "at": 0.5, "s": 1.18, "lift": 40 }]` lifts a part of the screen toward the viewer
  and dims the rest (UI close-ups).
- `cursor`: on clips, the recorded pointer and clicks are drawn automatically (`false` hides them); on stills, author
  one with `{ "path": [[x, y, beat], …], "clicks": [beat] }`.
- Text styles: `slam` (huge uppercase, slams in with a hit and shake; `*words*` get the pink box, `^words^` the
  gradient), `cap` (caption in a dark pill, words pop in), `tag` (one line in a solid pill, for montage labels; `cls`
  `hot` or `violet`), `count` (`from`→`to` with `unit`, ticks in the sound), `small`, and `label` (a pill pinned to an
  app point: `anchor` [x, y], `offset` [dx, dy]).
- Safe zone: words inside x 70–960 and y 200–1350. The bottom ~28% and the right 140 px are under the apps' buttons
  and captions.

### Sound (engine 2)

`audio/music.py` synthesises a track on the storyboard's grid (four-on-the-floor kick with a knock that phone speakers
can play, claps, hats, a ducking 808-style bass, a plucked arpeggio and a pad over a minor progression; styles
`drive`, `dark`, `bright`) and adds the edit's sounds: an impact on frame one, whooshes on whips, hits on slams,
pops, clicks and keys from the recording, counter ticks, risers, drop-outs that come back with a hit, and the end
card's impact, chord and shimmer. Loudness is normalised to −14 LUFS.

## Engine 1 (fallback)

### Make a video

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

### Storyboard format

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
- `cursor`: a pointer that moves (fractions of the screenshot) and clicks, in scene-local seconds. `click` is optional: leave it out for a pointer that only points (no click sound; fixed 19 Oct 2026).
- Cold open (default since 11 Oct 2026): `"hook": {"cold": true, "text": "", "dur": 0.1}`. No text card, ink drop or reveal; the first scene is on screen and moving from frame 0 and its `text` is the hook.
- `crop: [x0, y0, x1, y1]` on a scene shows only that part of the screenshot as a card with no window bar (used to keep the 0.1.6 lineup's ruler out of frame). Repeat it on every `cont` scene.
- `maxW` / `maxH` (px, default 960 / 760) limit how large the camera region is drawn.
- End card: the second `line` is drawn in the brand gradient (one gradient phrase per video). Since 12 Oct 2026 the whole end card sits 130 px higher so the CTA and subline stay above y 1250, and a cold-open hook is fully on screen at frame 0. Keep each end line under about 20 characters so it stays inside x 960.

Safe zone on the 1080×1920 canvas: keep words inside x 96–960 and y 250–1250. Nothing important in the bottom 30%
or the right 150 px (the apps' buttons and captions sit there).

### Sound

`audio/sfx.py` builds a pad bed (mood: warm, bright or tense) and syncs to the storyboard: an ink-drop "plip" and a
sub hit on the hook's impact, whooshes on scene changes, clicks on cursor clicks, and a shimmer and sting on the
end card. Everything is synthesised from sine waves and noise, so there's nothing to license.

## Assets

- `assets/shots/` (dark) and `assets/shots/light/`: the real app screens from the marketing kit (Afterburn, the example comic, version 0.1.6 era).
- `assets/brand/`: icon, lockups, profile picture, YouTube banner, the two tier-list pictures in both themes.
- `assets/fonts/`: Inkwell Display (SIL Open Font License, keep `OFL.txt`).
- `assets/video/`: the website's demo loop, vertical, both themes.
- `assets/shots/strongest-in-brightwater.png`: the brand tier-list picture (dark) centred on a 2720×1702 canvas so the engine can film it; use `crop: [0.271, 0, 0.729, 1]` (added 14 Oct 2026).
