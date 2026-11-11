// Inkwell studio, engine 3: engine 2 (beat-cut, shot-based motion design) plus looks (art
// directions), real-footage clips with grading, keyframed layers (sticky notes, UI cards in 3D,
// search bars, light trails…), new transitions (ink, fade, blurin, page, glitch) and freeze-stops.
// window.SB (storyboard) and window.CLIPS (clip.json of each clip used) are injected before load.
// window.renderAt(t) draws the frame at t seconds and resolves once every image on screen is
// decoded. window.SB_EVENTS lists what the sound builder needs (cuts, slams, clicks, slaps…).
//
// Coordinates: rects/points that refer to a clip or still are in its DIPs (source px / 2): the app
// window is 1360x880 DIP; a 1920x1080 stock clip is 960x540 DIP. Stage is 1080x1920. Layer boxes
// and keyframe offsets are stage px.
(function () {
  const SB = window.SB;
  const CLIPS = window.CLIPS || {};
  const FPS = SB.fps || 30;
  const BEAT = 60 / (SB.bpm || 124);
  const FOOT = SB.footage || '../footage';
  const DPR = 2;
  const W = 1080, H = 1920;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const E = {
    linear: (t) => t,
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    outBack: (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
  };
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), texts = $('texts');
  const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

  function srcOf(name, file) {
    if (name.startsWith('kit:')) return `../assets/shots/${name.slice(4)}.png`;
    if (name.startsWith('brand:')) return `../assets/brand/${name.slice(6)}`;
    if (name.startsWith('asset:')) return `../assets/${name.slice(6)}`;
    if (name.startsWith('c-')) return `${FOOT}/clips/${name}/${file}`;
    return `${FOOT}/stills/${name}.jpg`;
  }
  // colour grades for real footage (CSS filters; cheap and deterministic)
  const GRADES = {
    warm: 'sepia(0.2) saturate(1.12) contrast(1.06) brightness(1.03)',
    film: 'contrast(1.12) saturate(0.86) sepia(0.14) brightness(0.98)',
    cold: 'saturate(0.82) hue-rotate(-10deg) contrast(1.1) brightness(0.95)',
    tense: 'saturate(0.62) contrast(1.28) brightness(0.84)',
    mono: 'grayscale(1) contrast(1.25) brightness(0.95)',
    pop: 'saturate(1.3) contrast(1.08)',
    night: 'saturate(0.9) hue-rotate(8deg) contrast(1.15) brightness(0.8)',
  };
  const LOOK = SB.look || 'ink';
  let bodyLook = '';
  const setLook = (lk) => { if (lk !== bodyLook) { document.body.className = 'look-' + lk; bodyLook = lk; } };
  setLook(LOOK);

  // ---------------- timeline ----------------
  const events = { bpm: SB.bpm || 124, cuts: [], slams: [], pops: [], clicks: [], keys: [], counts: [], flashes: [], whips: [], zooms: [], drops: [], labels: [],
    slaps: [], papers: [], pencils: [], chimes: [], thumps: [], softs: [], inks: [], glitches: [], tapestops: [], scratches: [], swells: [] };
  const shakes = []; // {t, amp}
  const flashes = []; // {t, amp, color}
  const leaks = []; // {t}
  let beatAt = 0;

  const shots = SB.shots.map((s, i) => {
    const start = beatAt * BEAT; beatAt += s.b; const end = beatAt * BEAT;
    const S = { s, i, start, end, dur: end - start, texts: [], pops: [], labels: [] };
    const tin = s.in || 'cut';
    S.pre = tin.startsWith('whip') ? 0.06 : 0;
    events.cuts.push({ t: start, kind: tin, i });
    if (tin.startsWith('whip')) events.whips.push(start);
    if (tin === 'zoom') events.zooms.push(start);
    if (tin === 'drop') events.drops.push(start + 0.3);
    if (tin === 'flash' || s.flash) { flashes.push({ t: start, amp: s.flashAmp || 0.85, color: s.flashColor }); events.flashes.push(start); }
    if (tin === 'leak') leaks.push({ t: start });
    if (s.shake) shakes.push({ t: start + (tin === 'drop' ? 0.3 : 0), amp: s.shake });
    if (tin === 'fade' || tin === 'blurin' || tin === 'page') events.softs.push(start);
    if (tin === 'ink') events.inks.push(start);
    if (tin === 'glitch') { events.glitches.push(start); flashes.push({ t: start, amp: 0.35, color: s.flashColor || '#7DF9FF' }); }
    if (s.scratch) events.scratches.push(start + (typeof s.scratch === 'number' ? s.scratch * BEAT : 0));
    if (s.stop) events.tapestops.push(end - s.stop * BEAT);
    if (s.swell) events.swells.push(start + (typeof s.swell === 'number' ? s.swell * BEAT : 0));
    S.theme = s.theme || LOOK;

    // ----- DOM -----
    const root = el('div', 'shot', stage); root.style.visibility = 'hidden'; root.style.zIndex = String(10 + i);
    S.root = root;
    // a card or layer-only shot carries its look's background, so a soft transition covers the shot before it
    if (s.look === 'card' || (s.layers && !s.src && s.kind !== 'type' && s.kind !== 'blank')) root.classList.add('bg-' + (s.bgLook || S.theme));
    if (s.kind === 'type' || s.kind === 'blank') {
      // a type card: its own background (ink, colour, a look's paper or gradient, or a still blurred behind)
      const bg = el('div', 'layer', root);
      const c = s.bg || 'ink';
      if (['paper', 'night', 'clean', 'comic', 'cream', 'white', 'black', 'red', 'yellow'].includes(c)) bg.className = 'layer bg-' + c;
      else if (c === 'ink') bg.style.background = 'radial-gradient(ellipse 120% 80% at 50% 40%, #15131F 0%, #07070B 70%)';
      else if (c === 'hot') bg.style.background = 'linear-gradient(160deg, #F06A9C 0%, #B65CF0 100%)';
      else if (c === 'violet') bg.style.background = 'linear-gradient(160deg, #6A58F6 0%, #2A1F7A 100%)';
      else if (c === 'none') bg.style.background = 'transparent';
      else if (c.startsWith('still:')) {
        const im = el('img', '', bg); im.src = srcOf(c.slice(6));
        im.style.cssText = 'position:absolute;left:50%;top:50%;width:2720px;height:1760px;transform:translate(-50%,-50%) scale(1.25);filter:blur(28px) brightness(0.35) saturate(1.2);';
      } else bg.style.background = c;
      S.bgEl = bg;
    }
    if (s.src) {
      const cam = el('div', 'cam', root);
      const tilt = el('div', 'tilt', cam);
      const look = s.look || 'full';
      const box = look === 'full' ? [0, 0, W, H] : (s.box || [70, 560, 940, 760]);
      const media = el('div', 'media' + (look === 'card' ? ' card' : ''), tilt);
      Object.assign(media.style, { left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px' });
      const img = el('img', '', media);
      const clip = s.src.startsWith('c-') ? CLIPS[s.src] : null;
      if (s.src.startsWith('c-') && !clip) throw new Error('clip data missing: ' + s.src);
      img.src = clip ? srcOf(s.src, clip.frames[0].file) : srcOf(s.src);
      if (s.grade) img.style.filter = GRADES[s.grade] || s.grade;
      if (s.frame === 'laptop') {
        // the clip sits in a laptop lid; a base and a soft shadow under it
        media.classList.add('laptop');
        const base = el('div', 'laptop-base', tilt);
        Object.assign(base.style, { left: (box[0] - box[2] * 0.09) + 'px', top: (box[1] + box[3] + 2) + 'px', width: (box[2] * 1.18) + 'px' });
      }
      if (s.radius != null) media.style.borderRadius = s.radius + 'px';
      const shade = el('div', 'shade', media);
      Object.assign(S, { cam, tilt, media, img, shade, box, clip, look });
      if (clip) {
        // clicks and keys inside the clip, mapped to output time
        const from = s.from || 0;
        clip.frames.forEach((f, k) => {
          if (!f.ev) return;
          const tt = start + clipInv(S, k / 30);
          if (tt < start || tt > end) return;
          if (f.ev === 'down') events.clicks.push(tt);
          else if (f.ev.startsWith('key:')) events.keys.push(tt);
        });
      }
      // pops: lift a component of the picture out toward the viewer
      for (const p of s.pops || []) {
        const wrap = el('div', 'pop', tilt);
        const pin = el('div', 'pin', wrap);
        const pim = el('img', '', pin); pim.src = img.src;
        S.pops.push({ p, wrap, pin, pim, t: start + (p.at || 0) * BEAT });
        events.pops.push(start + (p.at || 0) * BEAT);
      }
    }
    // keyframed layers: html snippets or still crops, optionally in 3D with a moving camera
    S.layers = [];
    if (s.layers && s.layers.length) {
      const host = el('div', 'layers', root);
      if (s.persp) { host.style.perspective = s.persp + 'px'; host.style.perspectiveOrigin = (s.perspOrigin || '50% 45%'); }
      const l3d = el('div', 'l3d', host);
      S.l3d = l3d;
      for (const L of s.layers) {
        const e = el('div', 'lyr' + (L.cls ? ' ' + L.cls : ''), l3d);
        const box = L.box || [0, 0, W, H];
        let bw = box[2], bh = box[3];
        if (L.img) {
          const dims = L.dims || [1360, 880];
          const cr = L.crop || [0, 0, dims[0], dims[1]];
          const sx = bw / (cr[2] - cr[0]);
          if (bh == null) bh = (cr[3] - cr[1]) * sx;
          const sy = bh / (cr[3] - cr[1]);
          const im = el('div', 'crop', e);
          Object.assign(im.style, { backgroundImage: `url(${srcOf(L.img)})`, backgroundSize: `${dims[0] * sx}px ${dims[1] * sy}px`, backgroundPosition: `${-cr[0] * sx}px ${-cr[1] * sy}px` });
        }
        if (L.html) e.insertAdjacentHTML('beforeend', L.html);
        Object.assign(e.style, { left: box[0] + 'px', top: box[1] + 'px', width: bw + 'px', height: bh != null ? bh + 'px' : 'auto' });
        if (L.css) e.style.cssText += ';' + L.css;
        const kf = (L.kf || [[0, {}]]).map((k) => ({ t: start + k[0] * BEAT, p: k[1] || {}, ease: k[2] }));
        const Ly = { L, e, kf, t0: kf[0].t, paths: [...e.querySelectorAll('path')].map((p) => [p, p.getTotalLength ? p.getTotalLength() : 1000]) };
        if (L.char) charBuild(Ly, start);
        if (L.type) {
          const tg = L.type.sel ? e.querySelector(L.type.sel) : e;
          const tt0 = start + (L.type.at || 0) * BEAT, td = (L.type.dur || 1) * BEAT, txt = L.type.text;
          Object.assign(Ly, { tg, tt0, td, txt });
          for (let k = 0; k < txt.length; k++) if (txt[k] !== ' ') events.keys.push(tt0 + (k / txt.length) * td);
        }
        if (L.sfx) {
          const st = L.sfxAt != null ? start + L.sfxAt * BEAT : Ly.t0;
          const key = { slap: 'slaps', paper: 'papers', pencil: 'pencils', chime: 'chimes', thump: 'thumps', soft: 'softs', pop: 'pops', slam: 'slams', click: 'clicks', whip: 'whips' }[L.sfx];
          if (key) events[key].push(st);
        }
        S.layers.push(Ly);
      }
    }
    // texts
    for (const tx of s.text || []) {
      const t0 = start + (tx.at || 0) * BEAT;
      const t1 = tx.until != null ? start + tx.until * BEAT : end;
      const style = tx.style || 'cap';
      if (style === 'label') {
        const lab = el('div', 'label' + (tx.cls ? ' ' + tx.cls : ''), texts);
        lab.textContent = tx.text;
        if (tx.size) lab.style.fontSize = tx.size + 'px';
        S.labels.push({ tx, lab, t0, t1 });
        events.labels.push(t0);
        continue;
      }
      const box = el('div', 'tx ' + style + (tx.cls ? ' ' + tx.cls : ''), texts);
      box.style.top = (tx.y != null ? tx.y : 760) + 'px';
      if (tx.size) box.style.fontSize = tx.size + 'px';
      else box.style.fontSize = ({ slam: 150, cap: 66, count: 300, small: 38, tag: 92, serif: 112, hand: 92, caption: 66, note: 64, comic: 150 })[style] + 'px';
      if (tx.align) box.style.textAlign = tx.align;
      if (tx.rot) box.style.rotate = tx.rot + 'deg';
      if (tx.color) box.style.color = tx.color;
      let words = [];
      if (style === 'count') {
        const num = el('span', 'num', box); const unit = el('span', 'unit', box); unit.textContent = tx.unit || '';
        words = [num];
        S.texts.push({ tx, box, num, t0, t1, style });
        events.counts.push([t0, t0 + (tx.dur || 1) * BEAT]);
        continue;
      }
      const host = style === 'cap' ? el('span', 'box', box) : style === 'tag' ? el('span', 'pill', box) : style === 'note' ? el('span', 'notecard', box) : box;
      let hl = 0;
      tx.text.split(/\s+/).forEach((raw, k, arr) => {
        let w = raw; let cls = '';
        if (w.startsWith('*')) { hl = 1; w = w.slice(1); }
        if (w.startsWith('^')) { hl = 2; w = w.slice(1); }
        const endHl = w.endsWith('*') || w.endsWith('^');
        if (endHl) w = w.slice(0, -1);
        if (hl === 1) cls = ' hl'; if (hl === 2) cls = ' hl2';
        const span = el('span', 'w' + cls, host);
        span.textContent = w + (k < arr.length - 1 ? ' ' : '');
        words.push(span);
        if (endHl) hl = 0;
      });
      // highlighted runs read as one block: merge consecutive .hl spans' spacing
      const stagger = tx.stagger != null ? tx.stagger * BEAT : (style === 'slam' ? 0 : 0.055);
      words.forEach((w, k) => {
        const tw = t0 + k * stagger;
        if (style === 'slam' || (style === 'tag' && k === 0)) { events.slams.push(tw); shakes.push({ t: tw + 0.07, amp: tx.shake != null ? tx.shake : 0.45 }); if (tx.flash) flashes.push({ t: tw + 0.03, amp: 0.55, color: tx.flashColor }); }
      });
      if (style === 'note') events.slaps.push(t0);
      if (style === 'hand') events.pencils.push(t0);
      S.texts.push({ tx, box, words, t0, t1, style, stagger: (style === 'tag' || style === 'note') ? 0 : stagger, pill: style === 'tag' || style === 'note' ? host : null });
    }
    return S;
  });

  // clip time (seconds into the clip) for output time u seconds into the shot, with optional ramp
  function clipAt(S, u) {
    const s = S.s; const from = s.from || 0; const sp = s.speed || 1;
    const cap = (t) => (s.clipEnd != null ? Math.min(t, s.clipEnd) : t); // clipEnd: hold the clip still from this clip second (added 11 Nov 2026)
    if (Array.isArray(sp)) { const [a, b] = sp; const k = clamp(u / S.dur); return cap(from + S.dur * (a * k + (b - a) * k * k / 2)); }
    return cap(from + u * sp);
  }
  function clipInv(S, ct) { // output seconds into shot when clip reaches ct (constant speed only; ramps approximated)
    const s = S.s; const from = s.from || 0; const sp = Array.isArray(s.speed) ? (s.speed[0] + s.speed[1]) / 2 : (s.speed || 1);
    return (ct - from) / sp;
  }

  const endStart = beatAt * BEAT;
  const END = SB.end || null;
  const total = endStart + (END ? END.b * BEAT : 0);
  window.SB_TOTAL = total;
  if (END) {
    shakes.push({ t: endStart + 0.12, amp: 0.7 });
    $('endLine').textContent = END.line || '';
    $('endCta').textContent = END.cta || '';
    $('endSub').textContent = END.sub || '';
    if (END.word) $('endWord').textContent = END.word;
  }
  const M = SB.music || {};
  window.SB_EVENTS = Object.assign(events, {
    total, endStart, beat: BEAT,
    dropouts: (M.dropouts || []).map(([a, b]) => [a * BEAT, b * BEAT]),
    risers: (M.risers || []).map((b) => b * BEAT),
    hits: (M.hits || []).map((b) => b * BEAT),
    sections: (M.sections || [{ at: 0, style: M.style || 'drive' }]).map((x) => Object.assign({}, x, { t: x.at * BEAT })),
    opener: M.opener || 'impact', endSound: M.end || null, foleyBed: M.bed || null,
    shots: shots.map((S) => ({ start: S.start, end: S.end, kind: S.s.kind, in: S.s.in || 'cut', theme: S.theme })),
  });
  // a noisy circle (an ink blot) as a CSS polygon, radius r around (cx, cy)
  function blot(cx, cy, r, seed) {
    const pts = [];
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const n = 1 + 0.1 * Math.sin(a * 5 + seed) + 0.07 * Math.sin(a * 9 + seed * 2.3) + 0.05 * Math.sin(a * 17 + seed * 0.7);
      pts.push(`${(cx + Math.cos(a) * r * n).toFixed(1)}px ${(cy + Math.sin(a) * r * n).toFixed(1)}px`);
    }
    return `polygon(${pts.join(',')})`;
  }
  // ---- shape characters ("char" layers): a body made of one shape, with eyes, brows and a mouth that act ----
  // Added 8 Nov 2026. Moods blend over ~0.22 s, the eyes blink on their own, pupils follow "look", the body breathes,
  // squashes on every mood change and shakes when frustrated. Everything is drawn by code (SVG), deterministic.
  function CH_S() { return {
    drop: 'M100 6 C 128 58 182 104 182 158 A 82 82 0 0 1 18 158 C 18 104 72 58 100 6 Z',
    blob: 'M100 34 C 150 30 188 70 186 130 C 184 196 150 232 100 232 C 48 232 14 198 14 134 C 14 74 52 38 100 34 Z',
    circle: 'M100 46 A 92 92 0 1 1 99.9 46 Z',
    square: 'M40 48 H160 Q186 48 186 74 V206 Q186 232 160 232 H40 Q14 232 14 206 V74 Q14 48 40 48 Z',
    page: 'M30 40 H140 L180 80 V226 Q180 232 174 232 H30 Q24 232 24 226 V46 Q24 40 30 40 Z',
  }; }
  function CH_M() { return {
    //            eye  brow(deg) browY smile  open pupil blush sweat shake
    calm:       [1.0,   0,   0,   0.30, 0.00, 1.0, 0.0, 0, 0],
    happy:      [0.55, -6,  -6,   1.00, 0.45, 1.0, 1.0, 0, 0],
    proud:      [0.45, -8,  -4,   0.80, 0.00, 1.0, 0.6, 0, 0],
    frustrated: [0.65, 20,   7,  -0.85, 0.18, 0.9, 0.0, 1, 1],
    worried:    [1.0, -16,  -6,  -0.50, 0.10, 0.8, 0.0, 1, 0],
    surprised:  [1.30,-12, -16,   0.00, 0.95, 0.6, 0.0, 0, 0],
    sleepy:     [0.12,  0,   4,   0.05, 0.00, 1.0, 0.0, 0, 0],
    thinking:   [0.90, -4,  -8,  -0.10, 0.00, 1.0, 0.0, 0, 0],
    love:       [0.50, -6,  -6,   0.90, 0.20, 1.0, 1.0, 0, 0],
  }; }
  function chHash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function charBuild(Ly, start) {
    const C = Ly.L.char;
    const col = C.color || '#5B3DF5', ink = C.ink || '#14121C', shape = CH_S()[C.shape || 'drop'] || C.shape;
    const fy = C.faceY || (C.shape === 'drop' || !C.shape ? 152 : 140);
    const ns = 'http://www.w3.org/2000/svg';
    const wrap = document.createElement('div'); wrap.className = 'char';
    Object.assign(wrap.style, { width: '100%', height: '100%', transformOrigin: '50% 100%' });
    wrap.innerHTML = `<svg viewBox="-20 -20 240 280" style="width:100%;height:100%;overflow:visible">
      <ellipse class="ch-sh" cx="100" cy="240" rx="70" ry="9" fill="rgba(20,18,28,.18)"/>
      <g class="ch-b"><path d="${shape}" fill="${col}" stroke="${ink}" stroke-width="${C.outline != null ? C.outline : 5}" stroke-linejoin="round"/>
      <path d="${shape}" fill="url(#chg${Ly.L.box ? Ly.L.box[0] : 0})" opacity=".55"/>
      <ellipse cx="66" cy="${fy - 52}" rx="14" ry="22" fill="#fff" opacity=".35" transform="rotate(-28 66 ${fy - 52})"/>
      <g class="ch-f">
        <ellipse class="ch-bl" cx="${100 - 46}" cy="${fy + 22}" rx="15" ry="8" fill="#FF6B8A"/>
        <ellipse class="ch-bl" cx="${100 + 46}" cy="${fy + 22}" rx="15" ry="8" fill="#FF6B8A"/>
        <g class="ch-e" data-x="${100 - 28}"><ellipse rx="17" ry="20" fill="#fff" stroke="${ink}" stroke-width="3.5"/><circle class="ch-p" r="9" fill="${ink}"/><circle class="ch-g" r="3" fill="#fff"/></g>
        <g class="ch-e" data-x="${100 + 28}"><ellipse rx="17" ry="20" fill="#fff" stroke="${ink}" stroke-width="3.5"/><circle class="ch-p" r="9" fill="${ink}"/><circle class="ch-g" r="3" fill="#fff"/></g>
        <path class="ch-br" d="M-15 0 H15" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>
        <path class="ch-br" d="M-15 0 H15" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>
        <path class="ch-m" fill="${ink}" stroke="${ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <path class="ch-sw" d="M0 -14 C 7 -2 9 4 0 10 C -9 4 -7 -2 0 -14 Z" fill="#7FD3FF" stroke="${ink}" stroke-width="2.5"/></g>
      <defs><radialGradient id="chg${Ly.L.box ? Ly.L.box[0] : 0}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs></svg>`;
    Ly.e.appendChild(wrap);
    const q = (c) => [...wrap.querySelectorAll(c)];
    const moods = (C.mood || [[0, 'calm']]).map((m) => ({ t: start + m[0] * BEAT, v: CH_M()[m[1]] || CH_M().calm, name: m[1] }));
    const looks = (C.look || [[0, [0, 0]]]).map((m) => ({ t: start + m[0] * BEAT, v: m[1] }));
    if (C.sfx !== false) moods.slice(1).forEach((m) => events.pops.push(m.t));
    Ly.ch = { wrap, fy, moods, looks, body: q('.ch-b')[0], eyes: q('.ch-e'), brows: q('.ch-br'), mouth: q('.ch-m')[0], blush: q('.ch-bl'), sweat: q('.ch-sw')[0], seed: (Ly.L.box ? Ly.L.box[0] : 7) * 0.013 };
  }
  function charUpdate(Ly, t) {
    const c = Ly.ch, fy = c.fy;
    // mood blend
    let i = 0; while (i < c.moods.length - 1 && t >= c.moods[i + 1].t) i++;
    const cur = c.moods[i], prev = c.moods[Math.max(0, i - 1)];
    const k = i === 0 ? 1 : E.outCubic(clamp((t - cur.t) / 0.22));
    const m = cur.v.map((v, j) => lerp(prev.v[j], v, k));
    const [eye, brow, browY, smile, open, pupil, blush, sweat, shake] = m;
    // look (pupils), linear blend over 0.18 s
    let li = 0; while (li < c.looks.length - 1 && t >= c.looks[li + 1].t) li++;
    const lc = c.looks[li], lp = c.looks[Math.max(0, li - 1)];
    const lk = li === 0 ? 1 : E.outCubic(clamp((t - lc.t) / 0.18));
    const lx = lerp(lp.v[0], lc.v[0], lk), ly = lerp(lp.v[1], lc.v[1], lk);
    // blink: every 2.2-3.6 s, 0.13 s long
    let bl = 1; const per = 2.2 + chHash(Math.floor(t / 2.9) + c.seed) * 1.4; const ph = (t + c.seed * 10) % per;
    if (ph < 0.13) bl = Math.abs(ph - 0.065) / 0.065;
    // body: breathe, squash on mood change, shake
    const since = t - cur.t;
    const sq = i > 0 && since < 0.45 ? Math.sin(since / 0.45 * Math.PI * 2) * Math.exp(-since * 6) * 0.16 : 0;
    const br = Math.sin(t * 2.6 + c.seed) * 0.018;
    const sx = 1 + sq * 0.8 - br * 0.5, sy = 1 - sq + br;
    const shx = shake * Math.sin(t * 55) * 4;
    c.wrap.style.transform = `translateX(${shx.toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    // eyes
    const ey = fy - 12 - browY * 0.15;
    c.eyes.forEach((g) => {
      const x = +g.dataset.x;
      g.setAttribute('transform', `translate(${x} ${ey.toFixed(1)}) scale(1 ${Math.max(0.06, eye * bl).toFixed(3)})`);
      const pp = g.querySelector('.ch-p'), gl = g.querySelector('.ch-g');
      const px = lx * 7, py = ly * 8;
      pp.setAttribute('cx', px.toFixed(1)); pp.setAttribute('cy', py.toFixed(1)); pp.setAttribute('r', (9 * pupil).toFixed(1));
      gl.setAttribute('cx', (px + 3).toFixed(1)); gl.setAttribute('cy', (py - 3).toFixed(1));
    });
    // brows (inner ends tilt by `brow` degrees; positive = angry/frustrated)
    c.brows.forEach((b, j) => {
      const x = j === 0 ? 100 - 28 : 100 + 28, a = j === 0 ? brow : -brow;
      b.setAttribute('transform', `translate(${x} ${(fy - 40 + browY - (eye - 1) * 10).toFixed(1)}) rotate(${a.toFixed(1)})`);
    });
    // mouth
    const my = fy + 26, w = 22 - open * (1 - Math.abs(smile)) * 8, cy1 = my + smile * 16 - open * (1 - Math.abs(smile)) * 16, cy2 = cy1 + open * 30;
    c.mouth.setAttribute('d', open > 0.04
      ? `M${100 - w} ${my} Q100 ${cy1.toFixed(1)} ${100 + w} ${my} Q100 ${cy2.toFixed(1)} ${100 - w} ${my} Z`
      : `M${100 - w} ${my} Q100 ${cy1.toFixed(1)} ${100 + w} ${my}`);
    c.mouth.setAttribute('fill', open > 0.04 ? '#3A1420' : 'none');
    c.blush.forEach((b) => b.setAttribute('opacity', (blush * 0.75).toFixed(2)));
    const sw = sweat > 0.02 ? ((t * 0.9) % 1) : 0;
    c.sweat.setAttribute('transform', `translate(${100 + 62} ${(fy - 60 + sw * 40).toFixed(1)}) scale(${(sweat * 1.1).toFixed(2)})`);
    c.sweat.setAttribute('opacity', (sweat * (1 - sw * 0.7)).toFixed(2));
  }
  function kfAt(Ly, t) {
    const k = Ly.kf;
    if (!k[0].c) { let acc = {}; k.forEach((x) => { acc = Object.assign({}, acc, x.p); x.c = acc; }); }
    if (t <= k[0].t) return Object.assign({}, k[0].c);
    for (let q = 0; q < k.length - 1; q++) {
      const a = k[q], b = k[q + 1];
      if (t >= a.t && t <= b.t) {
        const e = (E[b.ease] || E.outCubic)(clamp((t - a.t) / Math.max(1e-6, b.t - a.t)));
        const out = Object.assign({}, a.c);
        for (const key of Object.keys(b.c)) { const av = a.c[key] != null ? a.c[key] : DEF[key]; out[key] = lerp(av, b.c[key], e); }
        return out;
      }
    }
    return Object.assign({}, k[k.length - 1].c);
  }
  const DEF = { x: 0, y: 0, z: 0, s: 1, r: 0, rx: 0, ry: 0, o: 1, blur: 0, dash: 1 };

  // ---------------- camera ----------------
  function camRect(S, u) {
    const c = S.s.cam || [[0, 0, 1360, 880]];
    const k = (E[S.s.camEase] || E.inOutCubic)(clamp(u));
    if (c.length === 1) {
      // a single framing still breathes: slow push-in toward its centre
      const r = c[0]; const z = 1 - (S.s.drift != null ? S.s.drift : 0.07) * E.inOutSine(clamp(u));
      const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, hw = (r[2] - r[0]) / 2 * z, hh = (r[3] - r[1]) / 2 * z;
      return [cx - hw, cy - hh, cx + hw, cy + hh];
    }
    const seg = Math.min(c.length - 2, Math.floor(k * (c.length - 1)));
    const kk = k * (c.length - 1) - seg;
    const a = c[seg], b = c[seg + 1];
    return [lerp(a[0], b[0], kk), lerp(a[1], b[1], kk), lerp(a[2], b[2], kk), lerp(a[3], b[3], kk)];
  }
  function fit(S, r) {
    const [bx, by, bw, bh] = S.box;
    const rw = (r[2] - r[0]) * DPR, rh = (r[3] - r[1]) * DPR;
    const sc = S.s.fit === 'contain' ? Math.min(bw / rw, bh / rh) : Math.max(bw / rw, bh / rh);
    const cx = (r[0] + r[2]) / 2 * DPR, cy = (r[1] + r[3]) / 2 * DPR;
    return { s: sc, x: bw / 2 - cx * sc, y: bh / 2 - cy * sc, bx, by };
  }
  // stage position of an app point (DIP) under the shot's camera (ignores 3D tilt)
  const toStage = (X, p) => [X.bx + X.x + p[0] * DPR * X.s, X.by + X.y + p[1] * DPR * X.s];

  // ---------------- per-frame ----------------
  function shakeAt(t) {
    let dx = 0, dy = 0, rot = 0;
    shakes.forEach((h, i) => {
      const d = t - h.t; if (d < 0 || d > 0.5) return;
      const a = h.amp * Math.exp(-d / 0.085);
      dx += a * Math.sin(97 * d + i * 1.7) * 30; dy += a * Math.cos(83 * d + i * 2.3) * 26; rot += a * Math.sin(61 * d + i) * 1.1;
    });
    return { dx, dy, rot };
  }

  window.renderAt = async function (t) {
    const waits = [];
    // background drift
    $('glowA').style.transform = `translate(${Math.sin(t * 0.5) * 70}px, ${Math.cos(t * 0.37) * 60}px)`;
    $('glowB').style.transform = `translate(${Math.cos(t * 0.42) * 80}px, ${Math.sin(t * 0.31) * 70}px)`;
    const g = Math.floor(t * FPS);
    $('grain').style.transform = `translate(${((g * 7919) % 200) - 100}px, ${((g * 104729) % 200) - 100}px)`;
    // beat pulse + shake on the whole world
    const sh = shakeAt(t);
    const bp = SB.pulse != null ? SB.pulse : 0.01;
    const sinceBeat = ((t % BEAT) + BEAT) % BEAT;
    const pulse = t < endStart ? 1 + bp * Math.exp(-sinceBeat / 0.07) : 1;
    $('world').style.transform = `translate(${sh.dx}px, ${sh.dy}px) rotate(${sh.rot}deg) scale(${pulse})`;
    // flash + leak
    let fl = 0, flColor = '#FFFFFF';
    flashes.forEach((f) => { const d = t - f.t; if (d >= -0.034 && d < 0.3) { const a = f.amp * (d < 0 ? 0.5 : Math.exp(-d / 0.07)); if (a > fl) { fl = a; flColor = f.color || '#FFFFFF'; } } });
    $('flash').style.opacity = fl.toFixed(3); $('flash').style.background = flColor;
    let lk = 0, lkx = 0;
    leaks.forEach((l) => { const d = t - l.t; if (d > -0.25 && d < 0.45) { lk = Math.max(lk, Math.sin(Math.PI * clamp((d + 0.25) / 0.7)) * 0.9); lkx = d * 900; } });
    $('leak').style.opacity = lk.toFixed(3); $('leak').style.transform = `translateX(${lkx}px)`;

    let cursorOn = false;
    // the look follows the shot on screen (a video can switch from a dark chaos to a paper calm)
    let act = null; for (const S of shots) if (t >= S.start - S.pre) act = S;
    if (END && t >= endStart - 0.05) setLook(END.theme || (act ? act.theme : LOOK)); else if (act) setLook(act.theme);
    shots.forEach((S, i) => {
      const s = S.s; const next = shots[i + 1];
      const tin = s.in || 'cut';
      const nin = next ? (next.s.in || 'cut') : 'cut';
      const soft = ['fade', 'blurin', 'ink', 'page'].includes(nin);
      const post = next ? (nin.startsWith('whip') ? 0.06 : soft ? 0.5 : 0) : (END ? 0.2 : 0);
      const textCut = next && nin.startsWith('whip') ? S.end - 0.04 : Infinity;
      const visible = t >= S.start - S.pre && t < S.end + post;
      S.root.style.visibility = visible ? 'visible' : 'hidden';
      S.root.style.display = visible ? '' : 'none'; // children with visibility:visible must not leak out of a hidden shot
      S.texts.forEach((T) => { T.box.style.visibility = visible && t >= T.t0 - 0.001 && t < Math.min(T.t1, textCut) ? 'visible' : 'hidden'; });
      S.labels.forEach((L) => { L.lab.style.visibility = 'hidden'; });
      if (!visible) return;
      const u = (t - S.start) / S.dur;

      // ---- shot transform: entrance + exit ----
      let tx = 0, ty = 0, sc = 1, op = 1, blur = 0, rot = 0, rotY = 0, clipP = null, glitch = 0;
      const din = t - S.start;
      if (tin === 'punch' || tin === 'flash') { const p = clamp(din / 0.22); sc *= lerp(s.punch || 1.16, 1, E.outExpo(p)); }
      else if (tin.startsWith('whip')) {
        const dir = { 'whip-l': [-1, 0], 'whip-r': [1, 0], 'whip-u': [0, -1], 'whip-d': [0, 1] }[tin] || [-1, 0];
        const p = clamp((din + S.pre) / 0.22); const e = E.outExpo(p);
        tx += -dir[0] * (1 - e) * 1150; ty += -dir[1] * (1 - e) * 1900; blur = Math.max(blur, (1 - e) * 26);
      } else if (tin === 'zoom') { const p = clamp(din / 0.3); sc *= lerp(0.72, 1, E.outExpo(p)); op *= clamp(din / 0.06); blur = Math.max(blur, (1 - E.outExpo(p)) * 18); }
      else if (tin === 'drop') { const p = clamp(din / 0.34); ty += -(1 - E.outBack(p)) * 1900; }
      else if (tin === 'rise') { const p = clamp(din / 0.4); ty += (1 - E.outExpo(p)) * 600; op *= clamp(din / 0.12); }
      else if (tin === 'fade') { op *= E.inOutSine(clamp(din / (s.fadeDur || 0.4))); }
      else if (tin === 'blurin') { const p = clamp(din / 0.4); const e = E.outCubic(p); blur = Math.max(blur, (1 - e) * 34); sc *= lerp(1.12, 1, e); op *= clamp(din / 0.14); }
      else if (tin === 'page') { const p = clamp(din / 0.45); rotY = lerp(-96, 0, E.outCubic(p)); }
      else if (tin === 'ink') { const p = clamp(din / 0.5); const c = s.inkAt || [540, 900]; if (p < 1) clipP = blot(c[0], c[1], 30 + E.inCubic(p) * 1500, i * 1.7 + 0.4); }
      else if (tin === 'glitch' && din < 0.2) { const g = Math.floor(din * 30); tx += (((g * 37) % 7) - 3) * 16; ty += (((g * 53) % 5) - 2) * 12; glitch = 1 - din / 0.2; }
      // freeze-stop: the last `stop` beats of a shot hold one frame, drained of colour (a tape stop in the sound)
      let stopP = 0;
      if (s.stop) { const ts = S.dur - s.stop * BEAT; if (din > ts) stopP = clamp((din - ts) / 0.22); sc *= 1 + 0.04 * E.outCubic(stopP); }
      // exit, driven by how the next shot comes in
      if (next && t >= S.end - 0.2) {
        const dout = t - S.end;
        if (nin.startsWith('whip')) {
          const dir = { 'whip-l': [-1, 0], 'whip-r': [1, 0], 'whip-u': [0, -1], 'whip-d': [0, 1] }[nin] || [-1, 0];
          const p = clamp((dout + 0.1) / 0.16); const e = E.inExpo(p);
          tx += dir[0] * e * 1150; ty += dir[1] * e * 1900; blur = Math.max(blur, e * 26);
        } else if (nin === 'zoom') {
          const p = clamp((dout + 0.18) / 0.18); const e = E.inCubic(p);
          sc *= 1 + e * 1.2; blur = Math.max(blur, e * 22); op *= 1 - e * 0.9;
        }
      }
      if (!next && END && t >= S.end - 0.15) { const p = clamp((t - (S.end - 0.15)) / 0.3); sc *= 1 + E.inCubic(p) * 0.25; op *= 1 - p; blur = Math.max(blur, p * 20); }
      S.root.style.transformOrigin = rotY ? '0% 50%' : '50% 50%';
      S.root.style.transform = `${rotY ? `perspective(2400px) rotateY(${rotY.toFixed(2)}deg) ` : ''}translate(${tx}px, ${ty}px) scale(${sc}) rotate(${rot}deg)`;
      S.root.style.opacity = op;
      S.root.style.clipPath = clipP || 'none';
      const gl = glitch > 0 ? ` hue-rotate(${Math.round(glitch * 140)}deg) saturate(${(1 + glitch * 2).toFixed(2)}) contrast(${(1 + glitch * 0.5).toFixed(2)})` : '';
      S.root.style.filter = (blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : '') + gl || 'none';

      // ---- media + camera ----
      let X = null;
      if (S.media) {
        const r = camRect(S, u);
        X = fit(S, r);
        S.img.style.transform = `translate(${X.x}px, ${X.y}px) scale(${X.s})`;
        if (s.stop || s.grade) S.img.style.filter = ((s.grade ? (GRADES[s.grade] || s.grade) : '') + (stopP > 0 ? ` grayscale(${(0.9 * stopP).toFixed(2)}) contrast(${(1 + 0.3 * stopP).toFixed(2)}) brightness(${(1 - 0.18 * stopP).toFixed(2)})` : '')) || 'none';
        if (S.clip) {
          const ct = clipAt(S, Math.min(t - S.start, s.stop ? S.dur - s.stop * BEAT : Infinity));
          const n = S.clip.frames.length;
          const k = clamp(Math.floor(ct * 30), 0, n - 1);
          const want = srcOf(s.src, S.clip.frames[k].file);
          if (!S.img.src.endsWith(want.replace(/^\.\.\//, ''))) { S.img.src = want; }
          waits.push(S.img.decode().catch(() => {}));
          // cursor from the recording
          if (s.cursor !== false && t < S.end) {
            const f = S.clip.frames[k];
            const moving = S.clip.frames.some((q) => q.x !== S.clip.frames[0].x || q.y !== S.clip.frames[0].y);
            if (moving || f.ev) {
              const [cx, cy] = toStage(X, [f.x, f.y]);
              const [ox, oy] = [tx + (W / 2) * (1 - sc) + 0, ty + (H / 2) * (1 - sc)];
              const px = ox + cx * sc, py = oy + cy * sc;
              placeCursor(px, py, S, k, op);
              cursorOn = true;
            }
          }
        } else if (s.cursor && s.cursor.path) {
          const path = s.cursor.path; const lb = (t - S.start) / BEAT;
          let a = path[0], b = path[path.length - 1];
          for (let q = 0; q < path.length - 1; q++) if (lb >= path[q][2] && lb <= path[q + 1][2]) { a = path[q]; b = path[q + 1]; }
          const kk = E.inOutCubic(clamp((lb - a[2]) / Math.max(0.001, b[2] - a[2])));
          const [cx, cy] = toStage(X, [lerp(a[0], b[0], kk), lerp(a[1], b[1], kk)]);
          const px = tx + (W / 2) * (1 - sc) + cx * sc, py = ty + (H / 2) * (1 - sc) + cy * sc;
          const clicks = (s.cursor.clicks || []).map((c) => S.start + c * BEAT);
          placeCursorT(px, py, t, clicks, op);
          cursorOn = true;
        }
        // 3D tilt
        const tl = s.tilt || [0, 0, 0, 0];
        const ke = E.inOutSine(clamp(u));
        S.tilt.style.transform = `rotateX(${lerp(tl[0], tl[2] != null ? tl[2] : tl[0], ke)}deg) rotateY(${lerp(tl[1], tl[3] != null ? tl[3] : tl[1], ke)}deg)`;
        // pops
        let dim = 0;
        S.pops.forEach((P) => {
          const p = P.p; const d = t - P.t;
          const k2 = clamp(d / 0.32);
          const e = E.outBack(k2);
          const [x0, y0] = toStage(X, [p.r[0], p.r[1]]);
          const [x1, y1] = toStage(X, [p.r[2], p.r[3]]);
          const w = x1 - x0, h = y1 - y0;
          const ps = d < 0 ? 1 : lerp(1, p.s || 1.16, e);
          const lift = d < 0 ? 0 : (p.lift != null ? p.lift : 40) * E.outCubic(k2);
          P.wrap.style.visibility = d < 0 ? 'hidden' : 'visible';
          P.wrap.style.transform = `translate(${x0 + w / 2}px, ${y0 + h / 2 - lift}px) scale(${ps}) rotate(${(p.rot || 0) * E.outCubic(k2)}deg)`;
          P.pin.style.left = `${-w / 2}px`; P.pin.style.top = `${-h / 2}px`; P.pin.style.width = `${w}px`; P.pin.style.height = `${h}px`;
          P.pim.style.transform = `translate(${-p.r[0] * DPR * X.s}px, ${-p.r[1] * DPR * X.s}px) scale(${X.s})`;
          if (S.clip) P.pim.src = S.img.src;
          if (d >= 0) dim = Math.max(dim, (p.dim != null ? p.dim : 0.6) * E.outCubic(k2));
        });
        S.shade.style.background = `rgba(5,5,9,${dim.toFixed(3)})`;
        if (s.dim) S.shade.style.background = `rgba(5,5,9,${Math.max(dim, s.dim)})`;
      }

      // ---- keyframed layers (and the 3D camera that moves through them) ----
      if (S.layers.length) {
        let camZ = 0;
        if (S.l3d && s.cam3d) {
          S.cam3dK = S.cam3dK || { kf: s.cam3d.map((k) => ({ t: S.start + k[0] * BEAT, p: k[1] || {}, ease: k[2] })) };
          const c = kfAt(S.cam3dK, t);
          camZ = c.z || 0;
          S.l3d.style.transform = `translate3d(${-(c.x || 0)}px, ${-(c.y || 0)}px, ${camZ}px) rotateX(${c.rx || 0}deg) rotateY(${c.ry || 0}deg) rotate(${c.r || 0}deg)`;
        }
        S.layers.forEach((Ly) => {
          const L = Ly.L;
          const gone = L.until != null && t > S.start + L.until * BEAT;
          if ((t < Ly.t0 - 1e-6 && !L.pre) || gone) { Ly.e.style.visibility = 'hidden'; return; }
          Ly.e.style.visibility = 'visible';
          const p = kfAt(Ly, t);
          const z = p.z || 0;
          let bl = p.blur || 0;
          if (s.dof) bl += Math.abs(z + camZ - (s.focus || 0)) * s.dof;
          let nearFade = 1;
          if (s.persp) { const depth = z + camZ; nearFade = clamp((s.persp * 0.8 - depth) / (s.persp * 0.25)); if (nearFade <= 0) { Ly.e.style.visibility = 'hidden'; return; } }
          Ly.e.style.transform = `translate3d(${(p.x || 0).toFixed(1)}px, ${(p.y || 0).toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${(p.rx || 0).toFixed(2)}deg) rotateY(${(p.ry || 0).toFixed(2)}deg) rotate(${(p.r || 0).toFixed(2)}deg) scale(${(p.s != null ? p.s : 1).toFixed(4)})`;
          Ly.e.style.opacity = ((p.o != null ? clamp(p.o) : 1) * nearFade).toFixed(3);
          Ly.e.style.filter = bl > 0.3 ? `blur(${bl.toFixed(1)}px)` : 'none';
          if (Ly.ch) charUpdate(Ly, t);
          if (Ly.paths.length && p.dash != null) Ly.paths.forEach(([pe, len]) => { pe.style.strokeDasharray = `${len}`; pe.style.strokeDashoffset = `${(len * (1 - clamp(p.dash))).toFixed(1)}`; });
          if (Ly.tg) {
            const n = clamp(Math.floor(((t - Ly.tt0) / Ly.td) * Ly.txt.length), 0, Ly.txt.length);
            const typing = t >= Ly.tt0 && t < Ly.tt0 + Ly.td;
            const on = typing || Math.floor(t * 2.4) % 2 === 0;
            const esc = (q) => q.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
            Ly.tg.innerHTML = esc(Ly.txt.slice(0, n)) + (L.type.caret !== false ? `<span class="caret" style="opacity:${on ? 1 : 0}"></span>` : '');
          }
        });
      }

      // ---- texts ----
      S.texts.forEach((T) => {
        if (t < T.t0 - 0.001 || t >= T.t1) return;
        const lt = t - T.t0;
        // texts leave with their shot's own exit transform (keeps the cut tight)
        T.box.style.transform = `translate(${tx}px, ${ty}px)`;
        T.box.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none';
        T.box.style.opacity = op;
        if (T.style === 'count') {
          const p = clamp(lt / ((T.tx.dur || 1) * BEAT));
          const v = lerp(T.tx.from || 0, T.tx.to, E.outExpo(p));
          T.num.textContent = (T.tx.decimals ? v.toFixed(T.tx.decimals) : Math.round(v)).toString();
          const pin = clamp(lt / 0.18);
          T.box.style.transform += ` scale(${lerp(1.5, 1, E.outExpo(pin))})`;
          T.box.style.opacity = op * clamp(lt / 0.05);
          return;
        }
        if (T.style === 'tag') {
          const p = clamp(lt / 0.16); const e = E.outExpo(p);
          T.pill.style.opacity = clamp(lt / 0.04);
          T.pill.style.transform = `scale(${lerp(1.9, 1, e)}) rotate(${lerp(-6, T.tx.rot || -2, E.outBack(clamp(lt / 0.3)))}deg)`;
          T.pill.style.filter = p < 1 ? `blur(${((1 - e) * 12).toFixed(1)}px)` : 'none';
          return;
        }
        if (T.style === 'small') { const p = clamp(lt / 0.25); T.box.style.opacity = op * p; T.box.style.transform += ` translateY(${(1 - E.outCubic(p)) * 24}px)`; return; }
        if (T.style === 'note') {
          // a sticky note slapped on: big, tilted, lands with a small bounce
          const p = clamp(lt / 0.2); const e = E.outBack(p);
          T.pill.style.opacity = clamp(lt / 0.03);
          T.pill.style.transform = `scale(${lerp(1.7, 1, e)}) rotate(${lerp((T.tx.rot || -3) - 9, T.tx.rot || -3, e)}deg)`;
          return;
        }
        if (T.style === 'hand') {
          // written on, left to right
          const p = clamp(lt / ((T.tx.dur || 1.2) * BEAT));
          T.box.style.clipPath = `inset(-20% ${((1 - E.inOutSine(p)) * 100).toFixed(1)}% -20% -5%)`;
          T.words.forEach((w) => { w.style.opacity = 1; w.style.transform = 'none'; w.style.filter = 'none'; });
          return;
        }
        if (T.style === 'serif') {
          // premium: each word rises out of a soft blur
          T.words.forEach((w, k) => {
            const d = lt - k * (T.tx.stagger != null ? T.tx.stagger * BEAT : 0.07);
            const p = clamp(d / 0.5); const e = E.outCubic(p);
            w.style.opacity = d < 0 ? 0 : e.toFixed(3);
            w.style.transform = `translateY(${((1 - e) * 34).toFixed(1)}px)`;
            w.style.filter = p < 1 ? `blur(${((1 - e) * 12).toFixed(1)}px)` : 'none';
          });
          return;
        }
        if (T.style === 'slam' && !T.stagger) {
          // a line that lands all at once moves as one block (no words overlapping mid-scale)
          const p = clamp(lt / 0.16); const e = E.outExpo(p);
          T.box.style.transform += ` scale(${lerp(1.9, 1, e)})`;
          T.box.style.opacity = op * clamp(lt / 0.04);
          T.box.style.filter = p < 1 ? `blur(${((1 - e) * 14).toFixed(1)}px)` : (blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none');
          T.words.forEach((w) => { w.style.opacity = 1; w.style.transform = 'none'; w.style.filter = 'none'; });
          return;
        }
        T.words.forEach((w, k) => {
          const d = lt - k * T.stagger;
          if (T.style === 'slam') {
            const p = clamp(d / 0.16);
            const e = E.outExpo(p);
            w.style.opacity = d < 0 ? 0 : clamp(d / 0.04);
            w.style.transform = `scale(${lerp(2.1, 1, e)})`;
            w.style.filter = p < 1 ? `blur(${((1 - e) * 14).toFixed(1)}px)` : 'none';
          } else {
            const p = clamp(d / 0.24);
            const e = E.outBack(p);
            w.style.opacity = d < 0 ? 0 : clamp(d / 0.06);
            w.style.transform = `translateY(${(1 - E.outCubic(p)) * 26}px) scale(${lerp(0.72, 1, e)})`;
            w.style.filter = 'none';
          }
        });
      });
      // ---- labels pinned to the app ----
      S.labels.forEach((L) => {
        if (!X || t < L.t0 || t >= Math.min(L.t1, textCut)) return;
        const [ax, ay] = toStage(X, L.tx.anchor);
        const px = tx + (W / 2) * (1 - sc) + ax * sc, py = ty + (H / 2) * (1 - sc) + ay * sc;
        const p = clamp((t - L.t0) / 0.26);
        const e = E.outBack(p);
        L.lab.style.visibility = 'visible';
        const off = L.tx.offset || [0, -70];
        L.lab.style.transform = `translate(${px + off[0]}px, ${py + off[1]}px) translate(-50%, -50%) scale(${lerp(0.4, 1, e)})`;
        L.lab.style.opacity = clamp(p * 3) * op;
      });
    });
    if (!cursorOn) { $('cursor').style.opacity = 0; $('ripple').style.opacity = 0; }

    // ---- end card ----
    const endEl = $('end');
    if (END && t >= endStart - 0.05) {
      const lt = t - endStart;
      endEl.style.opacity = clamp((lt + 0.05) / 0.12);
      const pi = clamp(lt / 0.42);
      $('endIcon').style.transform = `scale(${lerp(2.3, 1, E.outExpo(pi))}) rotate(${lerp(-14, 0, E.outBack(pi))}deg)`;
      $('endIcon').style.opacity = clamp(lt / 0.06);
      [['endRing1', 0.1], ['endRing2', 0.2]].forEach(([id, d]) => {
        const pr = clamp((lt - d) / 0.75);
        $(id).style.opacity = pr > 0 && pr < 1 ? (1 - pr) * (1 - pr) * 0.75 : 0;
        $(id).style.transform = `scale(${0.8 + E.outCubic(pr) * 3.0})`;
      });
      const pw = clamp((lt - 0.22) / 0.35);
      $('endWord').style.opacity = pw; $('endWord').style.transform = `translateY(${(1 - E.outExpo(pw)) * 60}px)`;
      const pl = clamp((lt - 0.4) / 0.35);
      $('endLine').style.opacity = pl; $('endLine').style.transform = `translateY(${(1 - E.outCubic(pl)) * 30}px)`;
      const pc = clamp((lt - 0.62) / 0.4);
      const bounce = lt > 1.1 ? Math.max(0, Math.sin((lt - 1.1) * Math.PI * 2 / (BEAT * 2))) * 0.03 : 0;
      $('endCta').style.opacity = pc; $('endCta').style.transform = `translateX(-50%) scale(${lerp(0.6, 1, E.outBack(pc)) + bounce})`;
      const ps = clamp((lt - 0.85) / 0.35);
      $('endSub').style.opacity = ps;
      endEl.style.transform = `scale(${1 + clamp(lt / (END.b * BEAT)) * 0.04})`;
    } else endEl.style.opacity = 0;

    await Promise.all(waits);
    return true;
  };

  let lastDown = -1;
  function placeCursor(px, py, S, k, op) {
    const cur = $('cursor'), rp = $('ripple');
    const fr = S.clip.frames;
    // the most recent click at or before this frame
    let kd = -1; for (let q = k; q >= Math.max(0, k - 20); q--) if (fr[q].ev === 'down') { kd = q; break; }
    const since = kd >= 0 ? (k - kd) / 30 : 9;
    const dip = since < 0.2 ? 1 - Math.sin(clamp(since / 0.2) * Math.PI) * 0.2 : 1;
    cur.style.opacity = op;
    cur.style.transform = `translate(${px - 12}px, ${py - 7}px) scale(${dip})`;
    const pr = clamp(since / 0.45);
    rp.style.opacity = since < 0.45 ? (1 - pr) * 0.95 * op : 0;
    rp.style.transform = `translate(${px - 70}px, ${py - 70}px) scale(${0.15 + E.outCubic(pr) * 1.25})`;
  }
  function placeCursorT(px, py, t, clicks, op) {
    const cur = $('cursor'), rp = $('ripple');
    let since = 9; clicks.forEach((c) => { if (t >= c && t - c < since) since = t - c; });
    const dip = since < 0.2 ? 1 - Math.sin(clamp(since / 0.2) * Math.PI) * 0.2 : 1;
    cur.style.opacity = op;
    cur.style.transform = `translate(${px - 12}px, ${py - 7}px) scale(${dip})`;
    const pr = clamp(since / 0.45);
    rp.style.opacity = since < 0.45 ? (1 - pr) * 0.95 * op : 0;
    rp.style.transform = `translate(${px - 70}px, ${py - 70}px) scale(${0.15 + E.outCubic(pr) * 1.25})`;
  }

  window.SB_READY = true;
})();
