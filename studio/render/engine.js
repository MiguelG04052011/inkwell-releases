// Inkwell studio: a deterministic, storyboard-driven motion-graphics engine.
// window.SB (the storyboard) is injected before load; window.renderAt(t) draws the frame at t seconds.
(function () {
  const SB = window.SB;
  const IMG_W = 2720, IMG_H = 1702, BAR = 74;
  const CX = 540, CY = SB.windowCenterY || 1120;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const E = {
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    inQuad: (t) => t * t,
  };
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');

  // ---------- build DOM ----------
  function words(el, text, gradFrom) {
    el.innerHTML = '';
    const parts = text.split(' ');
    return parts.map((w, i) => {
      const s = document.createElement('span');
      s.className = 'w' + (gradFrom != null && i >= gradFrom ? ' grad' : '');
      s.textContent = w + (i < parts.length - 1 ? ' ' : '');
      el.appendChild(s);
      return s;
    });
  }

  const hook = SB.hook;
  const hookEl = document.createElement('div');
  hookEl.className = 'scene';
  const hookText = document.createElement('div');
  hookText.className = 'headline';
  hookText.style.top = (hook.top || 600) + 'px';
  hookText.style.fontSize = (hook.size || 82) + 'px';
  hookEl.appendChild(hookText);
  const hookWords = words(hookText, hook.text, hook.gradFrom);
  stage.appendChild(hookEl);

  const bgShots = (hook.bgShots || []).map((name, i) => {
    const im = document.createElement('img');
    im.src = `../assets/shots/${name}.png`;
    $('bgShots').appendChild(im);
    return im;
  });

  let t0 = hook.dur - 0.1; // impact time = first scene start
  const scenes = SB.scenes.map((sc) => {
    const el = document.createElement('div');
    el.className = 'scene';
    const cam = document.createElement('div'); cam.className = 'cam';
    const tilt = document.createElement('div'); tilt.className = 'layer'; tilt.style.transformOrigin = `${CX}px ${CY}px`;
    const win = document.createElement('div'); win.className = 'win';
    win.innerHTML = `<div class="bar"><b></b><b></b><b></b></div>`;
    if (sc.shot.startsWith('light/') || sc.theme === 'light') {
      win.style.background = '#FFFFFF';
      win.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.18), 0 90px 260px rgba(0,0,0,0.6), 0 0 300px rgba(106,88,246,0.25)';
      const bar = win.querySelector('.bar'); bar.style.background = '#F7F7F9'; bar.style.borderBottom = '2px solid #E0E0E7';
    }
    const img = document.createElement('img'); img.src = `../assets/shots/${sc.shot}.png`;
    win.appendChild(img);
    tilt.appendChild(win); cam.appendChild(tilt); el.appendChild(cam);
    if (sc.maskTop) { const m = `linear-gradient(to bottom, transparent 0px, transparent ${sc.maskTop - 140}px, black ${sc.maskTop + 40}px)`; cam.style.webkitMaskImage = m; cam.style.maskImage = m; }
    const hl = document.createElement('div'); hl.className = 'headline';
    if (sc.size) hl.style.fontSize = sc.size + 'px';
    el.appendChild(hl);
    let kick = null;
    if (sc.kicker) { kick = document.createElement('div'); kick.className = 'kicker'; kick.innerHTML = `<i style="background:${sc.kicker.color}"></i>${sc.kicker.text}`; el.appendChild(kick); }
    const ws = words(hl, sc.text, sc.gradFrom);
    stage.appendChild(el);
    const start = t0; t0 += sc.dur;
    return { sc, el, tilt, win, ws, kick, start, end: t0 };
  });
  const endStart = t0;
  const total = endStart + SB.end.dur;
  window.SB_TOTAL = total;
  window.SB_TIMES = { hookImpact: hook.dur - 0.1, scenes: scenes.map((s) => [s.start, s.end]), endStart, total };

  // end card
  const endLine = $('endLine');
  endLine.innerHTML = '';
  const el1 = document.createElement('span'); el1.textContent = SB.end.line[0]; el1.className = 'w'; el1.style.display = 'inline-block';
  const el2 = document.createElement('span'); el2.textContent = SB.end.line[1]; el2.className = 'w grad'; el2.style.display = 'inline-block';
  endLine.appendChild(el1); endLine.appendChild(document.createElement('br')); endLine.appendChild(el2);
  $('endCta').textContent = SB.end.cta;
  $('endSub').textContent = SB.end.sub;

  // ---------- helpers ----------
  function camRect(sc, u) {
    const a = sc.camA, b = sc.camB || sc.camA;
    const e = E.inOutSine(clamp(u));
    return [lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e), lerp(a[3], b[3], e)];
  }
  function camXform(f, sc) {
    const fw = (f[2] - f[0]) * IMG_W, fh = (f[3] - f[1]) * IMG_H;
    const maxW = sc.maxW || 960, maxH = sc.maxH || 760;
    const s = Math.min(maxW / fw, maxH / fh);
    const cx = (f[0] + f[2]) / 2 * IMG_W, cy = BAR + (f[1] + f[3]) / 2 * IMG_H;
    return { s, x: CX - cx * s, y: CY - cy * s };
  }
  function wordIn(ws, tStart, t, stagger = 0.045, dur = 0.42) {
    ws.forEach((w, i) => {
      const p = clamp((t - tStart - i * stagger) / dur);
      const e = E.outCubic(p);
      w.style.opacity = p;
      w.style.transform = `translateY(${(1 - e) * 46}px)`;
      w.style.filter = p < 1 ? `blur(${(1 - e) * 12}px)` : 'none';
    });
  }
  let seed = 1;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

  // ---------- frame ----------
  window.renderAt = function (t) {
    // background drift + grain
    $('glowA').style.transform = `translate(${Math.sin(t * 0.35) * 60}px, ${Math.cos(t * 0.27) * 50}px)`;
    $('glowB').style.transform = `translate(${Math.cos(t * 0.3) * 70}px, ${Math.sin(t * 0.22) * 60}px)`;
    seed = Math.floor(t * 30) * 7919 + 13;
    $('grain').style.transform = `translate(${Math.floor(rnd() * 200) - 100}px, ${Math.floor(rnd() * 200) - 100}px)`;

    // hook
    const impact = hook.dur - 0.1;
    wordIn(hookWords, 0.06, t, 0.05, 0.4);
    const hookOut = clamp((t - (impact - 0.05)) / 0.45);
    hookEl.style.opacity = 1 - E.outCubic(hookOut);
    hookEl.style.transform = `translateY(${-E.outCubic(hookOut) * 160}px) scale(${1 + hookOut * 0.05})`;
    hookEl.style.filter = hookOut > 0 && hookOut < 1 ? `blur(${hookOut * 14}px)` : 'none';
    hookEl.style.visibility = hookOut >= 1 ? 'hidden' : 'visible';
    // hook background screens (the scattered story)
    const bgPos = [[-420, 260, -7], [180, 1180, 6], [-760, 1500, -3]];
    bgShots.forEach((im, i) => {
      const p = bgPos[i % bgPos.length];
      const fin = clamp(t / 0.8), fout = clamp((t - (impact - 0.2)) / 0.5);
      im.style.opacity = (0.16 * fin * (1 - fout)).toFixed(3);
      im.style.transform = `translate(${p[0] + t * (i % 2 ? -14 : 12)}px, ${p[1] - t * 10}px) rotate(${p[2] + t * (i % 2 ? 0.6 : -0.5)}deg) scale(${1 + t * 0.012})`;
    });

    // ink drop + rings
    const drop = $('drop');
    const fallStart = impact - 0.42;
    const pf = clamp((t - fallStart) / 0.42);
    const impactY = CY;
    if (t >= fallStart && t < impact + 0.02) {
      drop.style.opacity = 1;
      const y = lerp(-160, impactY - 120, E.inQuad(pf));
      drop.style.transform = `translate(${CX - 42}px, ${y}px) scale(${1 - pf * 0.15}, ${1 + pf * 0.25})`;
    } else drop.style.opacity = 0;
    [['ring1', 0], ['ring2', 0.09]].forEach(([id, d]) => {
      const r = $(id);
      const pr = clamp((t - impact - d) / 0.7);
      r.style.opacity = pr > 0 && pr < 1 ? (1 - pr) * 0.9 : 0;
      r.style.transform = `translate(${CX - 100}px, ${impactY - 100}px) scale(${0.1 + E.outCubic(pr) * 4.2})`;
    });

    // scenes
    let cursorShown = false;
    scenes.forEach((S, i) => {
      const { sc, el, tilt, win, ws, kick, start, end } = S;
      const first = i === 0;
      const contIn = !!sc.cont, contOut = !!(scenes[i + 1] && scenes[i + 1].sc.cont);
      const visible = contOut ? (t >= start - (contIn ? 0 : 0.06) && t < end) : (t >= (contIn ? start : start - 0.06) && t <= end + 0.45);
      el.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) return;
      const u = (t - start) / sc.dur;
      const f = camRect(sc, u);
      const X = camXform(f, sc);
      win.style.transform = `translate(${X.x}px, ${X.y}px) scale(${X.s})`;
      // entrance
      let rx = 0, ry = 0, ty = 0, sc3 = 1, op = 1, blur = 0;
      if (first) {
        const pc = clamp((t - start) / 0.62);
        const r = E.outCubic(pc) * 2300;
        el.style.clipPath = pc < 1 ? `circle(${r}px at ${CX}px ${impactY}px)` : 'none';
        const pe = clamp((t - start) / 0.9);
        const e = E.outExpo(pe);
        rx = (1 - e) * 16; sc3 = 0.9 + 0.1 * e;
      } else if (contIn) {
        // same shot as before: no entrance, the camera just keeps moving
      } else {
        const pe = clamp((t - (start - 0.06)) / 0.62);
        const e = E.outExpo(pe);
        rx = (1 - e) * 26; ry = (1 - e) * (i % 2 ? 9 : -9); ty = (1 - e) * 620; sc3 = 0.9 + 0.1 * e; op = clamp(pe * 3);
      }
      // exit
      const px = contOut ? 0 : clamp((t - (end - 0.06)) / 0.36);
      if (px > 0) {
        const e = E.inCubic(px);
        ty += -e * 520; rx += -e * 12; sc3 *= 1 - 0.07 * e; op *= 1 - e; blur = e * 16;
      }
      tilt.style.transform = `translateY(${ty}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${sc3})`;
      el.style.opacity = op;
      el.style.filter = blur > 0.2 ? `blur(${blur}px)` : 'none';
      // headline
      wordIn(ws, start + 0.1, t, 0.04, 0.42);
      if (contOut) { const ho = clamp((t - (end - 0.22)) / 0.2); if (ho > 0) ws.forEach((w) => { w.style.opacity = Math.min(Number(w.style.opacity), 1 - ho); w.style.transform = `translateY(${-ho * 30}px)`; }); }
      if (kick) { const pk = clamp((t - start - 0.02) / 0.35); kick.style.opacity = pk; kick.style.transform = `translateY(${(1 - E.outCubic(pk)) * 20}px)`; }
      // cursor
      if (sc.cursor && t >= start && t < end) {
        const c = sc.cursor;
        const lt = t - start;
        const pm = E.inOutCubic(clamp((lt - c.t[0]) / (c.t[1] - c.t[0])));
        const fx = lerp(c.from[0], c.to[0], pm), fy = lerp(c.from[1], c.to[1], pm);
        const sx = X.x + fx * IMG_W * X.s, sy = X.y + (BAR + fy * IMG_H) * X.s;
        const appear = clamp((lt - (c.t[0] - 0.25)) / 0.25);
        const pcl = clamp((lt - c.click) / 0.2);
        const dip = pcl > 0 && pcl < 1 ? 1 - Math.sin(pcl * Math.PI) * 0.18 : 1;
        const cur = $('cursor');
        cur.style.opacity = appear * (1 - clamp((t - (end - 0.12)) / 0.1));
        cur.style.transform = `translate(${sx - 8}px, ${sy - 5}px) scale(${dip})`;
        cursorShown = true;
        const rp = $('ripple');
        const pr = clamp((lt - c.click) / 0.5);
        rp.style.opacity = pr > 0 && pr < 1 ? (1 - pr) * 0.9 : 0;
        rp.style.transform = `translate(${sx - 60}px, ${sy - 60}px) scale(${0.15 + E.outCubic(pr) * 1.3})`;
      }
    });
    if (!cursorShown) { $('cursor').style.opacity = 0; $('ripple').style.opacity = 0; }

    // end card
    const endEl = $('end');
    const pe = clamp((t - endStart + 0.05) / 0.3);
    endEl.style.opacity = pe;
    if (pe > 0) {
      const lt = t - endStart;
      const pi = clamp((lt - 0.08) / 0.75);
      const icon = $('endIcon');
      icon.style.opacity = clamp((lt - 0.08) / 0.2);
      icon.style.transform = `translateY(${(1 - E.outCubic(pi)) * -80}px) scale(${0.55 + 0.45 * E.outBack(pi)})`;
      const pw = clamp((lt - 0.35) / 0.45);
      $('endWord').style.opacity = pw; $('endWord').style.transform = `translateY(${(1 - E.outCubic(pw)) * 30}px)`;
      [el1, el2].forEach((s, k) => {
        const p = clamp((lt - 0.55 - k * 0.16) / 0.5);
        s.style.opacity = p; s.style.transform = `translateY(${(1 - E.outCubic(p)) * 50}px)`; s.style.filter = p < 1 ? `blur(${(1 - p) * 10}px)` : 'none';
      });
      const pc = clamp((lt - 1.15) / 0.45);
      const cta = $('endCta');
      cta.style.opacity = pc; cta.style.transform = `translateX(-50%) scale(${0.86 + 0.14 * E.outBack(pc)})`;
      const ps = clamp((lt - 1.4) / 0.4);
      $('endSub').style.opacity = ps;
      endEl.style.transform = `scale(${1 + clamp(lt / SB.end.dur) * 0.03})`;
      // rings on the icon landing
      [['ring1', 0.12], ['ring2', 0.21]].forEach(([id, d]) => {
        const r = $(id);
        const pr = clamp((lt - d) / 0.8);
        if (pr > 0 && pr < 1) {
          r.style.opacity = (1 - pr) * 0.7;
          r.style.transform = `translate(${CX - 100}px, ${630 - 100}px) scale(${0.6 + E.outCubic(pr) * 4})`;
        }
      });
    }
  };
  window.SB_READY = true;
})();
