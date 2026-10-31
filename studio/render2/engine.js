// Inkwell studio, engine 2: fast, beat-cut, shot-based motion design.
// window.SB (storyboard, engine 2) and window.CLIPS (clip.json of each clip used) are injected
// before load. window.renderAt(t) draws the frame at t seconds and resolves once every image
// on screen is decoded. window.SB_EVENTS lists what the sound builder needs (cuts, slams, clicks…).
//
// Coordinates: every rect/point that refers to the app is in app-window DIPs (1360x880);
// footage is captured at 2x, so 1 DIP = 2 source px. Stage is 1080x1920.
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
    if (name.startsWith('c-')) return `${FOOT}/clips/${name}/${file}`;
    return `${FOOT}/stills/${name}.jpg`;
  }

  // ---------------- timeline ----------------
  const events = { bpm: SB.bpm || 124, cuts: [], slams: [], pops: [], clicks: [], keys: [], counts: [], flashes: [], whips: [], zooms: [], drops: [], labels: [] };
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

    // ----- DOM -----
    const root = el('div', 'shot', stage); root.style.visibility = 'hidden'; root.style.zIndex = String(10 + i);
    S.root = root;
    if (s.kind === 'type' || s.kind === 'blank') {
      // a type card: its own background (ink, colour, or a still blurred behind)
      const bg = el('div', 'layer', root);
      const c = s.bg || 'ink';
      if (c === 'ink') bg.style.background = 'radial-gradient(ellipse 120% 80% at 50% 40%, #15131F 0%, #07070B 70%)';
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
      else box.style.fontSize = ({ slam: 150, cap: 66, count: 300, small: 38, tag: 92 })[style] + 'px';
      if (tx.color) box.style.color = tx.color;
      let words = [];
      if (style === 'count') {
        const num = el('span', 'num', box); const unit = el('span', 'unit', box); unit.textContent = tx.unit || '';
        words = [num];
        S.texts.push({ tx, box, num, t0, t1, style });
        events.counts.push([t0, t0 + (tx.dur || 1) * BEAT]);
        continue;
      }
      const host = style === 'cap' ? el('span', 'box', box) : style === 'tag' ? el('span', 'pill', box) : box;
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
      S.texts.push({ tx, box, words, t0, t1, style, stagger: style === 'tag' ? 0 : stagger, pill: style === 'tag' ? host : null });
    }
    return S;
  });

  // clip time (seconds into the clip) for output time u seconds into the shot, with optional ramp
  function clipAt(S, u) {
    const s = S.s; const from = s.from || 0; const sp = s.speed || 1;
    if (Array.isArray(sp)) { const [a, b] = sp; const k = clamp(u / S.dur); return from + S.dur * (a * k + (b - a) * k * k / 2); }
    return from + u * sp;
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
    shots: shots.map((S) => ({ start: S.start, end: S.end, kind: S.s.kind, in: S.s.in || 'cut' })),
  });

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
    shots.forEach((S, i) => {
      const s = S.s; const next = shots[i + 1];
      const tin = s.in || 'cut';
      const nin = next ? (next.s.in || 'cut') : 'cut';
      const post = next ? (nin.startsWith('whip') ? 0.06 : 0) : (END ? 0.2 : 0);
      const textCut = next && nin.startsWith('whip') ? S.end - 0.04 : Infinity;
      const visible = t >= S.start - S.pre && t < S.end + post;
      S.root.style.visibility = visible ? 'visible' : 'hidden';
      S.texts.forEach((T) => { T.box.style.visibility = visible && t >= T.t0 - 0.001 && t < Math.min(T.t1, textCut) ? 'visible' : 'hidden'; });
      S.labels.forEach((L) => { L.lab.style.visibility = 'hidden'; });
      if (!visible) return;
      const u = (t - S.start) / S.dur;

      // ---- shot transform: entrance + exit ----
      let tx = 0, ty = 0, sc = 1, op = 1, blur = 0, rot = 0;
      const din = t - S.start;
      if (tin === 'punch' || tin === 'flash') { const p = clamp(din / 0.22); sc *= lerp(s.punch || 1.16, 1, E.outExpo(p)); }
      else if (tin.startsWith('whip')) {
        const dir = { 'whip-l': [-1, 0], 'whip-r': [1, 0], 'whip-u': [0, -1], 'whip-d': [0, 1] }[tin] || [-1, 0];
        const p = clamp((din + S.pre) / 0.22); const e = E.outExpo(p);
        tx += -dir[0] * (1 - e) * 1150; ty += -dir[1] * (1 - e) * 1900; blur = Math.max(blur, (1 - e) * 26);
      } else if (tin === 'zoom') { const p = clamp(din / 0.3); sc *= lerp(0.72, 1, E.outExpo(p)); op *= clamp(din / 0.06); blur = Math.max(blur, (1 - E.outExpo(p)) * 18); }
      else if (tin === 'drop') { const p = clamp(din / 0.34); ty += -(1 - E.outBack(p)) * 1900; }
      else if (tin === 'rise') { const p = clamp(din / 0.4); ty += (1 - E.outExpo(p)) * 600; op *= clamp(din / 0.12); }
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
      S.root.style.transform = `translate(${tx}px, ${ty}px) scale(${sc}) rotate(${rot}deg)`;
      S.root.style.opacity = op;
      S.root.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none';

      // ---- media + camera ----
      let X = null;
      if (S.media) {
        const r = camRect(S, u);
        X = fit(S, r);
        S.img.style.transform = `translate(${X.x}px, ${X.y}px) scale(${X.s})`;
        if (S.clip) {
          const ct = clipAt(S, t - S.start);
          const n = S.clip.frames.length;
          const k = clamp(Math.floor(ct * 30), 0, n - 1);
          const want = srcOf(s.src, S.clip.frames[k].file);
          if (!S.img.src.endsWith(want.replace(/^\.\.\//, ''))) { S.img.src = want; }
          waits.push(S.img.decode().catch(() => {}));
          // cursor from the recording
          if (s.cursor !== false) {
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
