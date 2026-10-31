#!/usr/bin/env python3
"""Inkwell sound, engine 2: a beat-synced track plus hits locked to the edit.

usage: music.py <events.json> <out.wav> [--style drive|dark|bright] [--seed N]

Everything is synthesised here (no samples, no AI): four-on-the-floor kick, claps, hats,
an 808-style bass that ducks under the kick, a plucked arpeggio and a soft pad, over a
minor progression. The edit's events (cuts, whips, slams, pops, clicks, keys, counters,
drop-outs, risers, the end card) get their own sounds on the same grid, so every cut lands
on a beat. Deterministic for a given input.
"""
import json, sys, wave
import numpy as np
from scipy import signal

SR = 48000


def sos(kind, f, order=2):
    return signal.butter(order, f, btype=kind, fs=SR, output='sos')


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def place(buf, sig, t, gain=1.0, pan=0.0):
    if t < 0:
        cut = int(-t * SR)
        sig = sig[..., cut:]
        t = 0
    i = int(round(t * SR))
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l * 1.41, sig * r * 1.41])
    j = min(buf.shape[1], i + sig.shape[1])
    if j > i >= 0:
        buf[:, i:j] += sig[:, : j - i] * gain


def tt(d):
    return np.arange(int(d * SR)) / SR


class Kit:
    def __init__(self, seed):
        self.rng = np.random.default_rng(seed)

    def noise(self, d):
        return self.rng.normal(0, 1, int(d * SR))

    def kick(self, punch=1.0):
        t = tt(0.42)
        f = 52 + (170 - 52) * np.exp(-t / 0.03)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2)
        knock = np.sin(2 * np.pi * 118 * t) * np.exp(-t / 0.035) * 0.45  # what a phone speaker can play
        click = filt(self.noise(0.42), 'bandpass', [1800, 5000]) * np.exp(-t / 0.002) * 0.22
        return np.tanh(1.8 * body * punch) * 0.85 + knock + click

    def clap(self):
        t = tt(0.32)
        n = self.noise(0.32)
        env = np.zeros_like(t)
        for k, d in enumerate((0.0, 0.008, 0.017, 0.027)):
            m = t >= d
            env[m] += np.exp(-(t[m] - d) / (0.006 if k < 3 else 0.11))
        body = filt(n * env, 'bandpass', [900, 6000])
        tone = np.sin(2 * np.pi * 205 * t) * np.exp(-t / 0.045) * 0.25
        return body * 0.9 + tone

    def hat(self, open_=False):
        d = 0.2 if open_ else 0.06
        t = tt(d)
        n = filt(filt(self.noise(d), 'highpass', 6500, 4), 'lowpass', 11000)
        return n * np.exp(-t / (0.08 if open_ else 0.016)) * 0.55

    def bass(self, f, d):
        t = tt(d)
        ff = f * (1 + 0.6 * np.exp(-t / 0.018))
        x = np.sin(2 * np.pi * np.cumsum(ff) / SR)
        env = np.minimum(1, t / 0.004) * np.exp(-t / max(0.12, d * 0.7))
        rel = np.clip((d - t) / 0.02, 0, 1)
        y = np.tanh(3.2 * x) * env * rel
        up = np.sin(2 * np.pi * np.cumsum(ff * 2) / SR) * env * rel * 0.28  # octave up, for small speakers
        return filt(y + up, 'lowpass', 1500)

    def pluck(self, f, d=0.32, bright=1.0):
        t = tt(d)
        x = np.zeros_like(t)
        for h in range(1, 9):
            x += np.sin(2 * np.pi * f * h * t + h) / h * np.exp(-t * (6 + h * 9 / bright))
        return x * np.minimum(1, t / 0.002) * 0.5

    def pad(self, freqs, d):
        t = tt(d)
        x = np.zeros_like(t)
        for k, f in enumerate(freqs):
            for det in (-0.09, 0.0, 0.08):
                ph = 2 * np.pi * f * (2 ** (det / 12)) * t + k * 1.1 + det * 40
                x += sum(np.sin(h * ph) / h for h in range(1, 6)) * 0.12
        env = np.minimum(1, t / 0.25) * np.clip((d - t) / 0.3, 0, 1)
        return filt(x * env, 'lowpass', 2400)

    def whoosh(self, d=0.45, up=True):
        t = np.linspace(0, 1, int(d * SR))
        n = self.noise(d)
        # sweep a band-pass by mixing two fixed bands with a moving crossfade
        lo = filt(n, 'bandpass', [250, 1200]); hi = filt(n, 'bandpass', [1800, 9000])
        k = t ** 1.5 if up else (1 - t) ** 1.5
        env = np.sin(np.pi * t) ** 2
        return (lo * (1 - k) + hi * k) * env * 0.9

    def impact(self, big=1.0):
        t = tt(1.4)
        f = 28 + (85 - 28) * np.exp(-t / 0.09)
        sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45) * np.minimum(1, t / 0.002)
        crash = filt(self.noise(1.4), 'highpass', 3000) * np.exp(-t / 0.35) * 0.35
        thump = filt(self.noise(1.4), 'lowpass', 400) * np.exp(-t / 0.05) * 0.8
        return (np.tanh(2 * sub) * 0.9 + crash + thump) * big

    def slam(self):
        t = tt(0.5)
        f = 40 + (120 - 40) * np.exp(-t / 0.03)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
        mid = np.sin(2 * np.pi * np.cumsum(90 + 140 * np.exp(-t / 0.04)) / SR) * np.exp(-t / 0.09) * 0.55
        snap = filt(self.noise(0.5), 'bandpass', [900, 4500]) * np.exp(-t / 0.025) * 0.35
        return np.tanh(2.4 * body) * 0.75 + mid + snap

    def pop(self, f0=700, f1=1500):
        t = tt(0.12)
        f = f1 + (f0 - f1) * np.exp(-t / 0.012)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.03) * 0.5

    def click(self):
        t = tt(0.05)
        return (np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.004) * 0.6 + self.noise(0.05) * np.exp(-t / 0.0015) * 0.45
                + np.sin(2 * np.pi * 400 * t) * np.exp(-t / 0.012) * 0.3)

    def key(self):
        t = tt(0.04)
        return filt(self.noise(0.04), 'bandpass', [1500, 6000]) * np.exp(-t / 0.006) * 0.5 + np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.005) * 0.15

    def tick(self):
        t = tt(0.025)
        return np.sin(2 * np.pi * 3100 * t) * np.exp(-t / 0.004) * 0.35

    def riser(self, d):
        t = np.linspace(0, 1, int(d * SR))
        n = self.noise(d)
        hi = filt(n, 'highpass', 2500)
        lo = filt(n, 'bandpass', [400, 2000])
        sweep = np.sin(2 * np.pi * np.cumsum(200 + 1400 * t ** 2) / SR) * 0.25
        return (lo * (1 - t) + hi * t) * (t ** 2.2) * 0.8 + sweep * t ** 2

    def shimmer(self, d=2.2, base=880.0):
        t = tt(d)
        out = np.zeros_like(t)
        for k, m in enumerate((1, 1.5, 2, 3, 4)):
            out += np.sin(2 * np.pi * base * m * t + k) * np.minimum(1, t / (0.02 + 0.03 * k)) * np.exp(-t / (0.5 + 0.2 * k)) * (0.22 / (1 + 0.5 * k))
        return out


def reverb(x, decay=1.6, seed=5):
    r = np.random.default_rng(seed)
    n = int(decay * SR)
    t = np.arange(n) / SR
    irs = []
    for s in (0, 1):
        ir = r.normal(0, 1, n) * np.exp(-t * 6.9 / decay)
        ir[: int((0.011 + 0.006 * s) * SR)] = 0
        ir = filt(ir, 'lowpass', 6000)
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    L = len(x) + n
    nfft = 1 << (L - 1).bit_length()
    X = np.fft.rfft(x, nfft)
    return np.stack([np.fft.irfft(X * np.fft.rfft(ir, nfft), nfft)[: len(x)] for ir in irs])


NOTE = {'A1': 55.0, 'F1': 43.65, 'C2': 65.41, 'G1': 49.0, 'D2': 73.42, 'E1': 41.2, 'B1': 61.74}
PROGS = {
    # (bass root, chord tones for the arp and pad, Hz)
    'drive': [('A1', [220.0, 261.63, 329.63, 392.0]), ('F1', [174.61, 220.0, 261.63, 329.63]),
              ('C2', [196.0, 261.63, 329.63, 392.0]), ('G1', [196.0, 246.94, 293.66, 392.0])],
    'dark': [('A1', [220.0, 261.63, 329.63, 415.3]), ('F1', [174.61, 220.0, 261.63, 349.23]),
             ('D2', [220.0, 293.66, 349.23, 440.0]), ('E1', [207.65, 246.94, 329.63, 415.3])],
    'bright': [('C2', [261.63, 329.63, 392.0, 493.88]), ('G1', [246.94, 293.66, 392.0, 493.88]),
               ('A1', [261.63, 329.63, 440.0, 523.25]), ('F1', [261.63, 349.23, 440.0, 523.25])],
}


def build(ev, out, style='drive', seed=7):
    K = Kit(seed)
    bpm = ev['bpm']; B = 60.0 / bpm; S16 = B / 4
    total = ev['total']; endStart = ev['endStart']
    n = int((total + 0.6) * SR)
    drums = np.zeros((2, n)); music = np.zeros((2, n)); fx = np.zeros((2, n)); send = np.zeros(n)
    prog = PROGS.get(style, PROGS['drive'])
    dropouts = ev.get('dropouts', [])
    in_drop = lambda t: any(a <= t < b for a, b in dropouts)
    groove_end = endStart + 2 * B  # the beat plays two beats into the end card, then the chord rings

    steps = int(groove_end / S16) + 1
    kicks = []
    for st in range(steps):
        t = st * S16
        if t >= groove_end or in_drop(t):
            continue
        bar = st // 16; s = st % 16
        chord = prog[bar % len(prog)]
        # drums
        if s % 4 == 0:
            place(drums, K.kick(), t, 0.95); kicks.append(t)
        if s in (4, 12):
            c = K.clap(); place(drums, c, t, 0.5, 0.05); send[int(t * SR):int(t * SR) + len(c)] += c * 0.35
        if s % 2 == 1 or s in (0, 8):
            place(drums, K.hat(False), t, 0.09 + (0.04 if s % 4 == 2 else 0), 0.3 if s % 2 else -0.25)
        if s % 4 == 2:
            place(drums, K.hat(True), t, 0.11, 0.35)
        # bass: root on the beat, syncopated pushes
        root = NOTE[chord[0]]
        if s in (0, 3, 6, 8, 11, 14):
            d = {0: 3, 3: 2, 6: 2, 8: 3, 11: 2, 14: 2}[s] * S16 * 0.92
            f = root * (2 if s == 14 else 1)
            place(music, K.bass(f, d), t, 0.6)
        # pluck arpeggio, 16ths, from the chord tones, up an octave on the second half
        tones = chord[1]
        order = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 3, 1, 2, 3, 2, 1]
        f = tones[order[s]] * (2 if s >= 8 else 1)
        p = K.pluck(f, 0.3, 1.0 + 0.6 * (bar % 2))
        place(music, p, t, 0.3, -0.35 if s % 2 else 0.35)
        send[int(t * SR):int(t * SR) + len(p)] += p * 0.5
        # pad, once a bar
        if s == 0:
            pd = K.pad([x / 2 for x in tones], 16 * S16 + 0.1)
            place(music, pd, t, 0.2)
            send[int(t * SR):int(t * SR) + len(pd)] += pd * 0.4

    # ducking: bass, arp and pad dip under every kick (the pump)
    duck = np.ones(n)
    tk = np.array(kicks)
    if len(tk):
        tt_ = np.arange(n) / SR
        idx = np.searchsorted(tk, tt_, side='right') - 1
        has = idx >= 0
        since = np.where(has, tt_ - tk[np.clip(idx, 0, None)], 9)
        duck = 1 - 0.62 * np.exp(-since / 0.11)
    music *= duck

    # ---- the edit's own sounds ----
    place(fx, K.impact(1.1), 0.0, 0.9)  # the opener lands on frame one
    for c in ev.get('cuts', []):
        t = c['t']
        if c['kind'].startswith('whip'):
            place(fx, K.whoosh(0.36, True), t - 0.2, 0.55, -0.5 if c['i'] % 2 else 0.5)
        elif c['kind'] == 'zoom':
            place(fx, K.whoosh(0.4, True), t - 0.3, 0.5)
            place(fx, K.slam(), t, 0.35)
        elif c['kind'] in ('flash', 'punch') and t > 0.05:
            place(fx, K.slam(), t, 0.4)
        elif c['kind'] == 'drop':
            place(fx, K.whoosh(0.3, False), t - 0.05, 0.4)
    for t in ev.get('drops', []):
        place(fx, K.slam(), t, 0.6)
    for k, t in enumerate(ev.get('slams', [])):
        place(fx, K.slam(), t + 0.02, 0.62, (-0.15, 0.15)[k % 2])
    for t in ev.get('pops', []) + ev.get('labels', []):
        place(fx, K.pop(), t, 0.4, 0.1)
    for t in ev.get('clicks', []):
        c = K.click(); place(fx, c, t, 0.55, 0.12); send[int(t * SR):int(t * SR) + len(c)] += c * 0.2
    for t in ev.get('keys', []):
        place(fx, K.key(), t, 0.5, 0.05)
    for a, b in ev.get('counts', []):
        # ticks that slow down as the counter settles (outExpo)
        q = 0.0
        while q < 1:
            tq = a + (b - a) * q
            place(fx, K.tick(), tq, 0.45, 0.2)
            q += 0.03 + 0.25 * q ** 2
    for t in ev.get('risers', []):
        d = 2 * B
        place(fx, K.riser(d), t - d, 0.5)
    for t in ev.get('hits', []):
        place(fx, K.impact(1.0), t, 0.8)
    for a, b in dropouts:
        place(fx, K.impact(1.0), b, 0.85)  # the beat comes back with a hit
    # end card: impact, ringing chord, shimmer
    place(fx, K.impact(1.2), endStart + 0.02, 0.9)
    tones = prog[0][1]
    pd = K.pad([x / 2 for x in tones] + [tones[0]], total - endStart + 0.5)
    place(music, pd, endStart, 0.2)
    send[int(endStart * SR):int(endStart * SR) + len(pd)] += pd * 0.5
    sh = K.shimmer(min(2.4, total - endStart + 0.4), 880)
    place(fx, sh, endStart + 0.08, 0.5)
    send[int(endStart * SR):int(endStart * SR) + len(sh)] += sh * 0.6

    wet = reverb(send, 1.7) * 0.32
    mix = drums + music + fx + np.pad(wet, ((0, 0), (0, max(0, n - wet.shape[1]))))[:, :n]
    # tail: everything fades over the last 0.35 s
    tail = np.clip((total + 0.25 - np.arange(n) / SR) / 0.6, 0, 1)
    mix *= tail
    mix = np.stack([filt(ch, 'highpass', 38) for ch in mix])
    # tame the top: a gentle shelf above ~8 kHz (sum of a low-passed copy and a quieter full copy)
    mix = np.stack([0.62 * filt(ch, 'lowpass', 7500) + 0.38 * ch for ch in mix])
    mix = np.tanh(mix * 1.25) / np.tanh(1.25)
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
