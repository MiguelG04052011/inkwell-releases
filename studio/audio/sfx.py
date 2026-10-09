#!/usr/bin/env python3
"""Inkwell sound design, synthesised from scratch (no samples, no AI).

usage: sfx.py <times.json> <storyboard.json> <out.wav> [--mood warm|bright|tense]
Builds an ambient bed plus synced sound effects: ink-drop "plip" on impact,
whooshes on scene changes, UI clicks for cursor clicks, a sub pulse per cut,
and a shimmer + sting on the end card. Deterministic for a given input.
"""
import json, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(11)


def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    sus = max(0, n - a - d - r)
    e = np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)), np.full(sus, s), np.linspace(s, 0, max(r, 1))])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def onepole_lp(x, fc):
    """time-varying one-pole low-pass; fc may be scalar or array (Hz)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def lp_fast(x, fc):
    # constant-cutoff one-pole via scipy-free recursion vectorised in blocks
    return onepole_lp(x, fc)


def reverb(x, decay=1.9, mix=0.28, seed=3):
    r = np.random.default_rng(seed)
    n = int(decay * SR)
    t = np.arange(n) / SR
    irL = r.normal(0, 1, n) * np.exp(-t * 6.9 / decay)
    irR = r.normal(0, 1, n) * np.exp(-t * 6.9 / decay)
    irL[:int(0.012 * SR)] = 0; irR[:int(0.017 * SR)] = 0
    irL /= np.sqrt(np.sum(irL ** 2)); irR /= np.sqrt(np.sum(irR ** 2))
    L = len(x) + n
    nfft = 1 << (L - 1).bit_length()
    X = np.fft.rfft(x, nfft)
    wl = np.fft.irfft(X * np.fft.rfft(irL, nfft), nfft)[:len(x)]
    wr = np.fft.irfft(X * np.fft.rfft(irR, nfft), nfft)[:len(x)]
    return np.stack([x * (1 - mix) + wl * mix, x * (1 - mix) + wr * mix])


def place(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l * 1.41, sig * r * 1.41])
    j = min(buf.shape[1], i + sig.shape[1])
    if j > i >= 0:
        buf[:, i:j] += sig[:, : j - i] * gain


def plip(dur=0.16):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 520 + 1500 * (1 - np.exp(-t / 0.018))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.035) * 0.9


def sub_hit(dur=0.7, f0=120, f1=42):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.05)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.22) * (1 - np.exp(-t / 0.003))


def whoosh(dur=0.55, up=True):
    n = int(dur * SR); t = np.linspace(0, 1, n)
    noise = rng.normal(0, 1, n)
    fc = (300 + 5200 * (t ** 1.6 if up else (1 - t) ** 1.6))
    lp = onepole_lp(noise, fc)
    hp = lp - onepole_lp(lp, 180)
    e = np.sin(np.pi * np.clip(t, 0, 1)) ** 1.8
    return hp * e * 0.55


def click():
    n = int(0.045 * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 2200 * t) * np.exp(-t / 0.004) * 0.6
    tick = rng.normal(0, 1, n) * np.exp(-t / 0.0015) * 0.5
    low = np.sin(2 * np.pi * 380 * t) * np.exp(-t / 0.012) * 0.35
    return body + tick + low


def shimmer(dur=2.6, notes=(1174.66, 1760.0, 2349.32, 2959.96)):
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for k, f in enumerate(notes):
        a = np.minimum(1, t / (0.05 + 0.04 * k))
        out += np.sin(2 * np.pi * f * t + k) * a * np.exp(-t / (0.7 + 0.2 * k)) * (0.25 / (1 + k * 0.4))
    return out


def pad(total, mood='warm'):
    n = int(total * SR); t = np.arange(n) / SR
    chords = {'warm': [73.42, 110.0, 164.81, 185.0, 220.0], 'bright': [98.0, 146.83, 196.0, 246.94, 293.66], 'tense': [69.3, 103.83, 155.56, 164.81, 207.65]}[mood]
    sig = np.zeros(n)
    for k, f in enumerate(chords):
        for det in (-0.12, 0.0, 0.11):
            ff = f * (2 ** (det / 12))
            ph = 2 * np.pi * ff * t + k * 1.3
            # soft saw-ish: first 6 harmonics
            w = sum(np.sin(h * ph) / h for h in range(1, 7))
            sig += w * (0.16 if k == 0 else 0.1)
    swell = 0.55 + 0.45 * np.clip((t - 0.0) / 1.2, 0, 1)
    cutoff = 380 + 260 * np.sin(2 * np.pi * t / 7.0) ** 2 + 900 * np.clip((t - (total - 4)) / 3, 0, 1)
    out = onepole_lp(onepole_lp(sig, cutoff), cutoff)
    trem = 1 + 0.08 * np.sin(2 * np.pi * 0.25 * t)
    fade = np.clip(t / 0.8, 0, 1) * np.clip((total - t) / 0.45, 0, 1)
    return out * swell * trem * fade


def build(times, sb, out, mood='warm'):
    total = times['total']
    n = int((total + 0.05) * SR)
    dry = np.zeros((2, n))
    wet_src = np.zeros(n)  # mono send to reverb
    impact = times['hookImpact']
    # ink drop falling + impact
    place(dry, whoosh(0.42, up=True) * 0.5, impact - 0.42, 0.7, 0.0)
    p = plip(); place(dry, p, impact, 0.55); wet_src[int(impact * SR):int(impact * SR) + len(p)] += p * 0.9
    place(dry, sub_hit(0.9, 130, 40), impact, 0.85)
    # scene changes
    for k, (s, e) in enumerate(times['scenes']):
        if k > 0:
            w = whoosh(0.5, up=(k % 2 == 1))
            place(dry, w, s - 0.28, 0.55, -0.6 if k % 2 else 0.6)
            place(dry, sub_hit(0.45, 95, 48), s, 0.35)
        sc = sb['scenes'][k]
        if sc.get('cursor'):
            c = sc['cursor']
            ck = click(); place(dry, ck, s + c['click'], 0.5, 0.15)
            wet_src[int((s + c['click']) * SR):int((s + c['click']) * SR) + len(ck)] += ck * 0.3
    # end card
    E = times['endStart']
    place(dry, whoosh(0.6, up=False), E - 0.3, 0.45)
    place(dry, sub_hit(1.2, 150, 36), E + 0.08, 1.0)
    p2 = plip(0.2); place(dry, p2, E + 0.1, 0.5)
    wet_src[int((E + 0.1) * SR):int((E + 0.1) * SR) + len(p2)] += p2
    sh = shimmer(min(3.0, total - E)); place(dry, sh, E + 0.15, 0.55)
    wet_src[int((E + 0.15) * SR):int((E + 0.15) * SR) + len(sh)] += sh * 0.8
    ck2 = click(); place(dry, ck2, E + 1.15, 0.4)
    # bed
    bed = pad(total, mood) * 0.33
    place(dry, bed, 0.0, 1.0)
    wet = reverb(wet_src, 2.2, 1.0) * 0.45
    mix = dry + np.pad(wet, ((0, 0), (0, max(0, n - wet.shape[1]))))[:, :n]
    # gentle glue: soft clip + normalise to -1 dBFS
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    mix /= np.max(np.abs(mix)) / 0.89
    pcm = (mix.T * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    times = json.load(open(sys.argv[1])); sb = json.load(open(sys.argv[2]))
    mood = sys.argv[sys.argv.index('--mood') + 1] if '--mood' in sys.argv else 'warm'
    build(times, sb, sys.argv[3], mood)
    print('wrote', sys.argv[3])
