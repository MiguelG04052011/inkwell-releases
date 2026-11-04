# Inkwell video studio

Makes Inkwell's short vertical videos (1080×1920, 30 fps, H.264 + AAC) from the real app, licensed real-world
footage and code-driven motion design, with synthesised sound. No AI-generated images, video, voices or music.

**Engine 3 (default since 1 Nov 2026)** is engine 2 plus: looks (art directions), real people and places from
licensed stock footage, the real app composited onto a real laptop, keyframed layers (sticky notes, generic UI
cards, glowing search bars, light trails, Inkwell UI cards floating in 3D with depth of field), new transitions
(ink, fade, blurin, page, glitch), freeze-stops, and a soundtrack with several palettes that can switch mid-video.
Engine 2 storyboards render unchanged in engine 3. Engine 1 (`make.sh`) stays as a last-resort fallback.

## Engine 3

```
./make3.sh storyboards/<id>.json [default-style] [workers]      # ../videos/<id>.mp4 + out/<id>-sheet.jpg
./variant.sh storyboards/<id>.json bio '{"cta":"Link in bio · free to start"}'   # ../videos/<id>-bio.mp4
node render3/capture.js storyboards/<id>.json /tmp/pv 2 0,45,90                    # check single frames
```

Storyboard: engine 2's format (shots in beats, `kind` still/clip/type/blank, `cam`, `look: card`, `tilt`, texts)
with `"engine": 3` and these additions:

- `"look"`: the video's art direction: `ink` (dark violet, engine 2), `paper` (cream paper, ink-black type, a
  yellow marker, photos with a white border), `night` (deep navy, cyan/violet glow, glass), `clean` (white, serif
  headlines, soft product shadows), `comic` (yellow halftone, black outlines, Bangers). A shot's `"theme"` switches
  the look while it is on screen (a dark chaos can cut to a paper calm); `"end": {"theme": …}` for the end card.
  Type/blank cards take `"bg"`: paper, night, clean, comic, cream, white, black, red, yellow, ink, or still:<name>.
- Text styles (all looks): `serif` (Instrument Serif; `*word*` = italic accent), `hand` (Permanent Marker, written on
  left to right over `dur` beats), `caption` (TikTok-native white with a black stroke; for text over footage, not over plain paper or white), `note` (a sticky note slapped
  on), `comic`, plus engine 2's slam, cap, tag, count (`"cls": "serifcount"` for a serif counter), small, label.
  `"align"`, `"rot"`, `"until"` work on every style; `"cls": "light"` makes serif or hand words light with a shadow, for words over real footage.
- Real footage: `"src": "c-stock-<id>-<name>"` (made by `stock/prep.py`) or `"c-gs-…"` (the app on a laptop, made
  by `stock/screen.py`) behave like app clips (cam rects in the clip's DIP = source px / 2). `"grade"`: warm, film,
  cold, tense, mono, pop, night. `"stop": beats` freezes the last beats of a shot, drains the colour and puts a
  tape stop in the sound. `"frame": "laptop"` puts a card clip in a laptop.
- `"layers"`: keyframed elements over the shot. Each: `"html"` (any markup; classes in render3/compose.html:
  `sticky` [pink|blue|green|white|orange], `scrap`, `ui` (+`bar`, `body`, `tabs`; `ui dark`), `search`
  (+`.q` for typing), `trail` (an SVG path drawn by `dash`), `bigword`) or `"img": "<still>", "crop": [x0,y0,x1,y1]`
  (DIP of a 1360×880 still; `"dims"` for other sizes) with `"cls": "card glow"` / `"card lightc"`; `"box": [x, y, w, h?]`
  in stage px (h follows the crop); `"kf": [[beat, {x, y, z, s, r, rx, ry, o, blur, dash}, "ease"?], …]` (values
  accumulate; the layer is hidden before its first key); `"type": {"text", "at", "dur", "sel"}` types text with a
  caret and key sounds; `"sfx"`: slap, paper, pencil, chime, thump, soft, pop, click, whip; `"until"`.
  3D: a shot with `"persp": 1100` puts its layers in perspective; `"cam3d": [[beat, {z, x, y, rx, ry}], …]` flies the
  camera through them; `"dof": 0.011` blurs by distance from `"focus"`; layers fade before they reach the camera.
- Transitions (`"in"`): engine 2's cut, punch, flash, whip-l/r/u/d, zoom, drop, rise, leak, plus `fade`
  (`fadeDur`), `blurin`, `page` (a page turn), `ink` (an ink blot grows from `inkAt`), `glitch`. Soft transitions keep
  the previous shot under the new one for half a second.
- `"music"`: `{"sections": [{"at": beat, "style": "frantic"}, {"at": 13, "style": "lofi", "half": true,
  "switch": "tapestop|scratch|cut"}], "opener": "impact|slap|soft|none", "risers": [beat], "hits": [beat]}`.
  Styles (audio/music3.py): drive, dark, bright (engine 2), lofi (swung drums, electric piano, vinyl), frantic
  (ticking hats, stabs, a clock), cinematic (pulses, taiko, braams, bells), pluck (plucked guitar, shaker, warm),
  ambient (pads and bells, for satisfying videos). Foley comes from the edit: slaps, paper, pencil, chimes, page
  flips, ink blooms, glitches, typing.

Split screen: `python3 stock/split.py --top <stock clip> --bottom <app clip> --out <footage>/clips/c-split-x --dur 2.8 --rect x0,y0,x1,y1 --div 0:700,0.5:760` makes a clip with footage on top (colour drained, `--grey`), the real app below and a glowing divider that can move or wipe away (`y` 0 hides the top). Use it as a full-frame clip (`cursor: false`, `cam [[0,0,540,960]]`); keep what matters in the app above y 1350. Added 4 Nov 2026.

Real footage (licensed, never committed): `python3 stock/fetch.py [ids]` downloads clips listed in
`stock/library.json` (Mixkit, Stock Video Free License: commercial use including social media marketing, no
attribution; the script refuses Restricted-licence clips) into `footage/stock/`; `python3 stock/prep.py <id>
<footage dir> <name> --start S --dur D [--cx 0.4] [--wide] [--speed 0.8]` cuts a 9:16 (or 16:9) clip; `python3
stock/screen.py --app <footage>/clips/c-search --out <footage>/clips/c-gs-search-tall --mode tall` puts any app
clip on the green laptop of clip 100321 (hands typing). People in stock footage are actors: never present them as
Inkwell users, never put words in their mouths as testimonials. Add new clips to library.json after checking
the clip page says "Stock Video Free License".


Comic-page panels (added 4 Nov 2026): `python3 stock/panels.py <footage dir> ops/panels/<id>.json` composites two footage panels split by a slanted, sliding gutter into a clip folder (`c-panel-…`): `"ink": true` prints a side as black halftone on newsprint, the other stays in colour (spec format in the script's header). Use as a full clip with `"cam": [[0,0,540,960]]`, `"cursor": false`, in the `comic` look (no vignette since 4 Nov). The `clean` look's serif now has a white glow so it reads over floating cards. One-take flights: put hero cards at increasing z in one `blank` shot and stack `img` layers of real app frames (copied from a clip into `stills/`) to change their state on arrival.

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
