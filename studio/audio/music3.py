#!/usr/bin/env python3
"""Inkwell sound, engine 3: several musical palettes, sections that switch mid-video, and foley.

usage: music3.py <events.json> <out.wav> [--style STYLE] [--seed N]

Styles: drive, dark, bright (engine 2's groove), lofi, frantic, cinematic, pluck, ambient.
The storyboard's music.sections ([{at: beat, style, half?, switch?}]) arrive in events.json as
`sections` with times; a section can play at half tempo ('half': true) and announce itself with
'switch': 'tapestop' (the old music winds down), 'scratch' (a record scratch, then a gap) or 'cut'
(a short silence). --style is only the default for a storyboard without sections.
Everything is synthesised (no samples, no AI). Deterministic for a given input.
Foley: sticky-note slaps, paper rustle, pencil scratch, page flips, chimes, thumps, soft
whooshes, ink blooms, glitches, typing, plus engine 2's whooshes, slams, pops, clicks and ticks.
"""
import json, sys, wave
import numpy as np
from music import Kit, place, filt, tt, reverb, NOTE, PROGS, SR

HZ = lambda m: 440.0 * 2 ** ((m - 69) / 12)  # midi -> Hz


class Kit3(Kit):
    # ---------- instruments ----------
    def ep(self, freqs, d, bright=0.55):
        """electric piano chord (FM tine), with a slow tremolo"""
        t = tt(d); out = np.zeros_like(t)
        for k, f in enumerate(freqs):
            env = np.exp(-t / 1.6) * (1 - np.exp(-t / 0.004))
            idx = bright * 1.8 * np.exp(-t / 0.35)
            out += np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t)) * env
            out += 0.12 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.08)  # the tine's attack
        return out * (1 + 0.1 * np.sin(2 * np.pi * 4.2 * t)) / max(1, len(freqs)) * 0.95

    def ks(self, f, d=1.1, damp=0.997, bright=0.55):
        """Karplus-Strong plucked string, computed a period at a time"""
        n = int(d * SR); N = max(2, int(SR / f))
        y = np.zeros(n + N)
        y[:N] = filt(self.rng.uniform(-1, 1, N), 'lowpass', 1500 + 7000 * bright) if N > 24 else self.rng.uniform(-1, 1, N)
        for j in range(N, n + N, N):
            prev = y[j - N:j]
            blk = damp * 0.5 * (prev + np.roll(prev, -1))
            m = min(N, n + N - j)
            y[j:j + m] = blk[:m]
        return y[:n] * 0.9

    def lkick(self):
        t = tt(0.35)
        f = 46 + (120 - 46) * np.exp(-t / 0.025)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)
        knock = np.sin(2 * np.pi * 105 * t) * np.exp(-t / 0.03) * 0.35
        return filt(np.tanh(1.4 * body) + knock, 'lowpass', 2500) * 0.9

    def snare(self, bright=1.0):
        t = tt(0.3)
        nz = filt(self.noise(0.3), 'bandpass', [1400, 5200 + 2000 * bright]) * np.exp(-t / (0.07 + 0.03 * bright))
        body = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.06) * 0.6
        return (nz * 0.9 + body) * 0.8

    def shaker(self):
        t = tt(0.07)
        return filt(self.noise(0.07), 'highpass', 7000) * np.exp(-t / 0.018) * 0.6

    def crackle(self, d):
        n = int(d * SR); x = np.zeros(n)
        idx = self.rng.integers(0, n, int(d * 18))
        x[idx] = self.rng.normal(0, 1, len(idx)) * self.rng.uniform(0.2, 1, len(idx))
        x = filt(x, 'bandpass', [900, 6000])
        hiss = filt(self.noise(d), 'bandpass', [3000, 9000]) * 0.012
        return x * 0.5 + hiss

    def stab(self, freqs, d=0.14):
        t = tt(d); out = np.zeros_like(t)
        for f in freqs:
            for det in (-0.006, 0.006):
                ph = (f * (1 + det) * t) % 1.0
                out += (2 * ph - 1)
        out = filt(out / (2 * len(freqs)), 'lowpass', 3200) * np.exp(-t / 0.06) * (1 - np.exp(-t / 0.002))
        return out

    def sawpad(self, freqs, d, attack=0.8, cutoff=1800):
        t = tt(d); out = np.zeros_like(t)
        for f in freqs:
            for det in (-0.004, 0.0, 0.005):
                ph = (f * (1 + det) * t + self.rng.random()) % 1.0
                out += 2 * ph - 1
        env = np.minimum(1, t / attack) * np.minimum(1, (d - t) / 0.4).clip(0, 1)
        return filt(out / (3 * len(freqs)), 'lowpass', cutoff) * env

    def braam(self, f, d=1.6):
        t = tt(d); out = np.zeros_like(t)
        for mult, det in ((1, 0), (1, 0.007), (2, -0.004), (0.5, 0)):
            ph = (f * mult * (1 + det) * t) % 1.0
            out += 2 * ph - 1
        sweep = filt(out / 4, 'lowpass', 900) * 0.6 + filt(out / 4, 'lowpass', 2200) * 0.4 * np.exp(-t / 0.5)
        env = (1 - np.exp(-t / 0.03)) * np.exp(-t / (d * 0.55))
        return np.tanh(sweep * env * 2.2) * 0.8

    def taiko(self):
        t = tt(0.6)
        f = 52 + (95 - 52) * np.exp(-t / 0.05)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
        skin = filt(self.noise(0.6), 'lowpass', 1200) * np.exp(-t / 0.03) * 0.5
        return np.tanh((body + skin) * 1.6) * 0.9

    def bell(self, f, d=1.8):
        t = tt(d)
        idx = 2.4 * np.exp(-t / 0.4)
        return np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 3.5 * t)) * np.exp(-t / 0.9) * (1 - np.exp(-t / 0.002)) * 0.6

    def sub(self, f, d):
        t = tt(d)
        return np.sin(2 * np.pi * f * t) * np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.3).clip(0, 1) * 0.7

    def clocktick(self, hi=True):
        t = tt(0.05)
        return filt(self.noise(0.05), 'bandpass', [2500, 6000] if hi else [1500, 3500]) * np.exp(-t / 0.006) * 0.7

    # ---------- foley ----------
    def slap(self):
        t = tt(0.25)
        nz = filt(self.noise(0.25), 'lowpass', 3500) * np.exp(-t / 0.018)
        thud = np.sin(2 * np.pi * 130 * t) * np.exp(-t / 0.04) * 0.6
        return (nz + thud) * 0.9

    def paper(self, d=0.4):
        n = int(d * SR); t = tt(d)
        env = np.zeros(n)
        for _ in range(int(d * 40)):
            c = self.rng.integers(0, n); w = self.rng.integers(200, 1800)
            env[c:c + w] += np.hanning(min(w, n - c)) * self.rng.uniform(0.3, 1)
        x = filt(self.noise(d), 'bandpass', [1200, 7500]) * env
        return x * np.minimum(1, (d - t) / 0.08).clip(0, 1) * 0.7

    def pencil(self, d=0.7):
        t = tt(d)
        am = (np.abs(np.sin(2 * np.pi * (11 + 4 * np.sin(2 * np.pi * 1.3 * t)) * t)) ** 3)
        x = filt(self.noise(d), 'bandpass', [2200, 6500]) * am
        return x * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.1).clip(0, 1) * 0.55

    def pageflip(self):
        d = 0.45; t = tt(d)
        sw = filt(self.noise(d), 'bandpass', [600, 5000]) * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
        return sw * 0.6

    def scratch(self):
        d = 0.38; t = tt(d)
        rate = np.sin(2 * np.pi * t / d * 1.5) * 1.0
        f = 300 + 900 * np.abs(rate)
        ton = np.sin(2 * np.pi * np.cumsum(f) / SR)
        nz = filt(self.noise(d), 'bandpass', [400, 3000])
        return np.tanh((ton * 0.5 + nz * 0.7) * np.abs(rate) * 2) * np.minimum(1, (d - t) / 0.05).clip(0, 1) * 0.75

    def chime(self, f=1318.5):
        a = self.bell(f, 1.6) * 0.7
        b = np.pad(self.bell(f * 1.26, 1.5) * 0.5, (int(0.07 * SR), 0))
        m = max(len(a), len(b))
        return np.pad(a, (0, m - len(a))) + np.pad(b, (0, m - len(b)))

    def thump(self):
        t = tt(0.4)
        return (np.sin(2 * np.pi * (60 + 40 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.12) + filt(self.noise(0.4), 'lowpass', 400) * np.exp(-t / 0.03) * 0.4) * 0.9

    def soft(self, d=0.55):
        t = tt(d)
        env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
        return filt(self.noise(d), 'bandpass', [300, 2600]) * env * 0.45

    def glitchfx(self):
        d = 0.22; x = self.noise(d)
        x = np.round(x * 3) / 3  # crush
        x = filt(x, 'bandpass', [500, 6000])
        gate = (np.sin(2 * np.pi * 37 * tt(d)) > 0).astype(float)
        return x * gate * 0.4

    def inkbloom(self):
        d = 0.9; t = tt(d)
        return self.soft(d) * 0.8 + np.sin(2 * np.pi * 48 * t) * np.sin(np.pi * np.clip(t / d, 0, 1)) * 0.35


# ---------- progressions (bass root, chord tones) ----------
P3 = dict(PROGS)
P3['lofi'] = [('F1', [HZ(57), HZ(60), HZ(64), HZ(67)]), ('E1', [HZ(55), HZ(59), HZ(62), HZ(67)]),
              ('D2', [HZ(53), HZ(57), HZ(60), HZ(64)]), ('C2', [HZ(52), HZ(55), HZ(59), HZ(62)])]
P3['frantic'] = [('A1', [HZ(57), HZ(60), HZ(64)]), ('A1', [HZ(57), HZ(60), HZ(64)]), ('F1', [HZ(53), HZ(57), HZ(60)]), ('G1', [HZ(55), HZ(59), HZ(62)])]
P3['cinematic'] = [('D2', [HZ(62), HZ(65), HZ(69)]), ('B1', [HZ(59), HZ(62), HZ(66)]), ('G1', [HZ(55), HZ(59), HZ(62)]), ('A1', [HZ(57), HZ(61), HZ(64)])]
P3['pluck'] = [('C2', [HZ(60), HZ(64), HZ(67), HZ(72)]), ('G1', [HZ(59), HZ(62), HZ(67), HZ(71)]), ('A1', [HZ(57), HZ(60), HZ(64), HZ(69)]), ('F1', [HZ(57), HZ(60), HZ(65), HZ(69)])]
P3['ambient'] = P3['lofi']
NOTE3 = dict(NOTE)


def groove(style, t0, t1, beat, K, drums, music, send, kicks, half=False):
    """write one section's music into the buses between t0 and t1 (times on the video's grid)"""
    B = beat * (2 if half else 1); S16 = B / 4
    prog = P3.get(style, P3['drive'])
    first = int(np.ceil(t0 / S16 - 1e-6))
    st = first
    while True:
        t = st * S16
        if t >= t1:
            break
        bar = int((st - first) // 16); s = (st - first) % 16  # bars count from the section's own start
        chord = prog[bar % len(prog)]; root = NOTE3[chord[0]]; tones = chord[1]
        snd = lambda x, g: send.__setitem__(slice(int(t * SR), int(t * SR) + len(x)), send[int(t * SR):int(t * SR) + len(x)] + x * g) if int(t * SR) + len(x) <= len(send) else None
        if style in ('drive', 'dark', 'bright'):
            if s % 4 == 0: place(drums, K.kick(), t, 0.95); kicks.append(t)
            if s in (4, 12): c = K.clap(); place(drums, c, t, 0.5, 0.05); snd(c, 0.35)
            if s % 2 == 1 or s in (0, 8): place(drums, K.hat(False), t, 0.09 + (0.04 if s % 4 == 2 else 0), 0.3 if s % 2 else -0.25)
            if s % 4 == 2: place(drums, K.hat(True), t, 0.11, 0.35)
            if s in (0, 3, 6, 8, 11, 14):
                d = {0: 3, 3: 2, 6: 2, 8: 3, 11: 2, 14: 2}[s] * S16 * 0.92
                place(music, K.bass(root * (2 if s == 14 else 1), d), t, 0.6)
            order = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 3, 1, 2, 3, 2, 1]
            p = K.pluck(tones[order[s] % len(tones)] * (2 if s >= 8 else 1), 0.3, 1.0 + 0.6 * (bar % 2))
            place(music, p, t, 0.3, -0.35 if s % 2 else 0.35); snd(p, 0.5)
            if s == 0: pd = K.pad([x / 2 for x in tones], 16 * S16 + 0.1); place(music, pd, t, 0.2); snd(pd, 0.4)
        elif style == 'lofi':
            sw = S16 * 0.18 if s % 2 == 1 else 0.0  # swing on the off 16ths
            tq = t + sw
            if s in (0, 7, 10): place(drums, K.lkick(), tq, 0.85); kicks.append(tq)
            if s in (4, 12): sn = K.snare(0.6); place(drums, filt(sn, 'lowpass', 4200), tq, 0.42, 0.05); snd(sn, 0.25)
            if s % 2 == 0: place(drums, K.hat(False), tq, 0.05 + (0.025 if s % 4 == 2 else 0), 0.25)
            if s == 0:
                e = K.ep([x / 1.0 for x in tones], 16 * S16 + 0.4); place(music, e, t, 0.42); snd(e, 0.5)
                place(music, K.sub(root * 2, 16 * S16 * 0.95), t, 0.55)
            if s == 8:
                e = K.ep([tones[1] * 2, tones[3] * 2 if len(tones) > 3 else tones[2] * 2], 8 * S16, 0.35); place(music, e, tq, 0.18, 0.3); snd(e, 0.4)
        elif style == 'frantic':
            if s % 4 == 0: place(drums, K.kick(0.9), t, 0.85); kicks.append(t)
            if s in (4, 12): place(drums, K.snare(1.2), t, 0.45)
            place(drums, K.hat(False), t, 0.07 + (0.05 if s % 2 == 0 else 0), (-0.3, 0.3)[s % 2])
            if s % 4 == 2: place(drums, K.hat(True), t, 0.09, 0.35)
            if bar % 4 == 3 and s >= 8: place(drums, K.snare(1.0), t, 0.18 + 0.03 * (s - 8), 0.1)  # roll into the next phrase
            if s % 2 == 0: place(music, K.bass(root * (2 if s % 4 == 2 else 1), S16 * 1.6), t, 0.5)
            if s in (0, 3, 6, 10, 13): st_ = K.stab([x for x in tones], 0.12); place(music, st_, t, 0.32, (-0.3, 0.3)[s % 2]); snd(st_, 0.3)
            if s % 4 == 0: place(drums, K.clocktick(s % 8 == 0), t + S16 * 2, 0.35, 0.6)
        elif style == 'cinematic':
            if s % 2 == 0:
                p = K.pluck(root * 2, 0.22, 0.6); place(music, p, t, 0.45)
            if s in (0, 8): place(drums, K.taiko(), t, 0.8); kicks.append(t)
            if s in (6, 14) and bar % 2 == 1: place(drums, K.taiko(), t, 0.45, 0.2)
            if s == 0:
                pd = K.sawpad([x for x in tones], 16 * S16 + 0.5, 0.9, 1500); place(music, pd, t, 0.28); snd(pd, 0.5)
                place(music, K.sub(root, 16 * S16), t, 0.5)
            if s in (2, 6, 10, 14) and bar >= 1:
                b = K.bell(tones[(s // 4) % len(tones)] * 2, 1.2); place(music, b, t, 0.14, (-0.4, 0.4)[(s // 4) % 2]); snd(b, 0.6)
        elif style == 'pluck':
            if s in (0, 8): place(drums, K.lkick(), t, 0.75); kicks.append(t)
            if s in (4, 12): c = K.clap(); place(drums, c, t, 0.32, -0.05); snd(c, 0.3)
            place(drums, K.shaker(), t, 0.12 + (0.06 if s % 2 == 0 else 0), 0.3)
            if s % 2 == 0:
                order = [0, 2, 1, 3, 2, 1, 3, 2]
                g = K.ks(tones[order[(s // 2) % 8] % len(tones)], 0.9, 0.996, 0.5); place(music, g, t, 0.34, (-0.25, 0.25)[(s // 2) % 2]); snd(g, 0.45)
            if s in (0, 6, 10): place(music, K.bass(root * 2, S16 * 3), t, 0.45)
        elif style == 'ambient':
            if s == 0:
                pd = K.pad([x / 2 for x in tones] + [tones[0]], 16 * S16 + 0.6); place(music, pd, t, 0.3); snd(pd, 0.6)
            if s in (0, 6, 12):
                b = K.bell(tones[(s // 6) % len(tones)] * 2, 2.0); place(music, b, t, 0.12, 0.2); snd(b, 0.7)
        st += 1


def tapestop(buf, t, d=0.42):
    """the music in [t-d, t] winds down in pitch to a stop; silence until t"""
    a, b = int((t - d) * SR), int(t * SR)
    if a < 0 or b > buf.shape[1]:
        return
    seg = buf[:, a:b].copy()
    n = b - a
    rate = (1 - np.linspace(0, 1, n)) ** 1.6
    pos = np.cumsum(rate); pos = pos / pos[-1] * (n * 0.45)
    for ch in range(buf.shape[0]):
        buf[ch, a:b] = np.interp(pos, np.arange(n), seg[ch]) * (1 - np.linspace(0, 1, n) ** 3)


def build(ev, out, style='drive', seed=7):
    K = Kit3(seed)
    beat = ev.get('beat') or 60.0 / ev['bpm']
    total = ev['total']; endStart = ev['endStart']
    n = int((total + 0.6) * SR)
    drums = np.zeros((2, n)); music = np.zeros((2, n)); fx = np.zeros((2, n)); send = np.zeros(n)
    secs = ev.get('sections') or [{'t': 0, 'style': style}]
    if len(secs) == 1 and secs[0].get('style') in (None, 'drive') and style != 'drive':
        secs = [dict(secs[0], style=style)]
    dropouts = [tuple(x) for x in ev.get('dropouts', [])]
    groove_end = endStart + 2 * beat
    kicks = []
    for i, sc in enumerate(secs):
        a = sc['t']; b = secs[i + 1]['t'] if i + 1 < len(secs) else groove_end
        if sc.get('style') == 'none':
            continue
        groove(sc.get('style', style), a, min(b, groove_end), beat, K, drums, music, send, kicks, sc.get('half', False))
    # drop-outs and switch gaps: silence the beat
    gaps = list(dropouts)
    for i, sc in enumerate(secs[1:], 1):
        sw = sc.get('switch')
        if sw == 'scratch':
            gaps.append((sc['t'] - 0.16, sc['t'])); place(fx, K.scratch(), sc['t'] - 0.42, 0.7)
        elif sw == 'cut':
            gaps.append((sc['t'] - 0.22, sc['t']))
    for a, b in gaps:
        ia, ib = max(0, int(a * SR)), min(n, int(b * SR))
        drums[:, ia:ib] = 0; music[:, ia:ib] *= 0.0
    # ducking under kicks (lighter in lofi / pluck)
    tk = np.array(sorted(kicks))
    if len(tk):
        tt_ = np.arange(n) / SR
        idx = np.searchsorted(tk, tt_, side='right') - 1
        since = np.where(idx >= 0, tt_ - tk[np.clip(idx, 0, None)], 9)
        depth = 0.62 if any(s.get('style') in ('drive', 'dark', 'bright', 'frantic') for s in secs) else 0.3
        music *= 1 - depth * np.exp(-since / 0.11)
    # lofi sections: a vinyl bed and a darker top
    for i, sc in enumerate(secs):
        if sc.get('style') == 'lofi':
            a = sc['t']; b = secs[i + 1]['t'] if i + 1 < len(secs) else total
            place(fx, K.crackle(max(0.1, b - a)), a, 0.5)
    # tape stops: from the storyboard (freeze frames) and from section switches
    stops = list(ev.get('tapestops', [])) + [sc['t'] for sc in secs[1:] if sc.get('switch') == 'tapestop']
    for t in stops:
        tapestop(music, t); tapestop(drums, t)
        nxt = min([sc['t'] for sc in secs if sc['t'] > t + 1e-3] + [t + 0.35])
        ia, ib = int(t * SR), min(n, int(min(nxt, t + 1.2) * SR))
        music[:, ia:ib] = 0; drums[:, ia:ib] = 0
        place(fx, K.soft(0.4), t - 0.4, 0.25)

    # ---- the edit's own sounds (engine 2 set) ----
    op = ev.get('opener', 'impact')
    if op == 'impact': place(fx, K.impact(1.1), 0.0, 0.9)
    elif op == 'slap': place(fx, K.slap(), 0.0, 0.9)
    elif op == 'soft': place(fx, K.soft(0.6), 0.0, 0.5)
    for c in ev.get('cuts', []):
        t = c['t']
        if c['kind'].startswith('whip'):
            place(fx, K.whoosh(0.36, True), t - 0.2, 0.55, -0.5 if c['i'] % 2 else 0.5)
        elif c['kind'] == 'zoom':
            place(fx, K.whoosh(0.4, True), t - 0.3, 0.5); place(fx, K.slam(), t, 0.35)
        elif c['kind'] in ('flash', 'punch') and t > 0.05:
            place(fx, K.slam(), t, 0.4)
        elif c['kind'] == 'drop':
            place(fx, K.whoosh(0.3, False), t - 0.05, 0.4)
        elif c['kind'] == 'page':
            place(fx, K.pageflip(), t - 0.05, 0.6)
    for t in ev.get('drops', []): place(fx, K.slam(), t, 0.6)
    for k, t in enumerate(ev.get('slams', [])): place(fx, K.slam(), t + 0.02, 0.62, (-0.15, 0.15)[k % 2])
    for t in ev.get('pops', []) + ev.get('labels', []): place(fx, K.pop(), t, 0.4, 0.1)
    for t in ev.get('clicks', []):
        c = K.click(); place(fx, c, t, 0.55, 0.12)
    for t in ev.get('keys', []): place(fx, K.key(), t, 0.42, 0.05)
    for a, b in ev.get('counts', []):
        q = 0.0
        while q < 1:
            place(fx, K.tick(), a + (b - a) * q, 0.45, 0.2); q += 0.03 + 0.25 * q ** 2
    for t in ev.get('risers', []): d = 2 * beat; place(fx, K.riser(d), t - d, 0.5)
    for t in ev.get('swells', []): place(fx, K.riser(1.2), t - 1.2, 0.35); place(fx, K.sub(55, 1.4), t - 1.0, 0.3)
    for t in ev.get('hits', []): place(fx, K.impact(1.0), t, 0.8)
    for a, b in dropouts: place(fx, K.impact(1.0), b, 0.85)
    # ---- engine 3 foley ----
    for k, t in enumerate(ev.get('slaps', [])): place(fx, K.slap(), t, 0.7, (-0.35, 0.35, 0.0)[k % 3])
    for t in ev.get('papers', []): place(fx, K.paper(0.45), t, 0.6, 0.2)
    for t in ev.get('pencils', []): place(fx, K.pencil(0.7), t, 0.55, -0.15)
    for t in ev.get('chimes', []):
        c = K.chime(); place(fx, c, t, 0.45)
        i0 = int(t * SR); m = max(0, min(len(c), n - i0))
        if m: send[i0:i0 + m] += c[:m] * 0.5
    for t in ev.get('thumps', []): place(fx, K.thump(), t, 0.7)
    for t in ev.get('softs', []): place(fx, K.soft(0.55), t - 0.3, 0.5)
    for t in ev.get('inks', []): place(fx, K.inkbloom(), t - 0.1, 0.6)
    for t in ev.get('glitches', []): place(fx, K.glitchfx(), t, 0.6)
    for t in ev.get('scratches', []): place(fx, K.scratch(), t - 0.3, 0.7)
    # ---- end card ----
    end_style = (secs[-1].get('style') if secs else style)
    soft_end = end_style in ('lofi', 'ambient', 'pluck')
    place(fx, K.impact(0.7 if soft_end else 1.2), endStart + 0.02, 0.55 if soft_end else 0.9)
    tones = P3.get(end_style, P3['drive'])[0][1]
    if end_style == 'lofi':
        e = K.ep(tones, total - endStart + 0.6); place(music, e, endStart, 0.4); send[int(endStart * SR):int(endStart * SR) + len(e)] += e[: n - int(endStart * SR)] * 0.5
    elif end_style == 'cinematic':
        place(music, K.braam(NOTE3[P3['cinematic'][0][0]] , 1.8), endStart, 0.5)
    pd = K.pad([x / 2 for x in tones] + [tones[0]], total - endStart + 0.5)
    place(music, pd, endStart, 0.2)
    send[int(endStart * SR):int(endStart * SR) + len(pd)] += pd[: n - int(endStart * SR)] * 0.5
    sh = K.shimmer(min(2.4, total - endStart + 0.4), 880 if not soft_end else 660)
    place(fx, sh, endStart + 0.08, 0.45)

    wet = reverb(send, 1.9 if soft_end else 1.7) * 0.34
    mix = drums + music + fx + np.pad(wet, ((0, 0), (0, max(0, n - wet.shape[1]))))[:, :n]
    tail = np.clip((total + 0.25 - np.arange(n) / SR) / 0.6, 0, 1)
    mix *= tail
    mix = np.stack([filt(ch, 'highpass', 36) for ch in mix])
    mix = np.stack([0.62 * filt(ch, 'lowpass', 7500) + 0.38 * ch for ch in mix])
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    mix /= np.max(np.abs(mix)) / 0.9
    mix = mix[:, : int((total + 0.05) * SR)]
    pcm = (mix.T * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    ev = json.load(open(sys.argv[1]))
    style = sys.argv[sys.argv.index('--style') + 1] if '--style' in sys.argv else 'drive'
    seed = int(sys.argv[sys.argv.index('--seed') + 1]) if '--seed' in sys.argv else 7
    build(ev, sys.argv[2], style, seed)
    print('wrote', sys.argv[2])
