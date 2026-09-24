#!/usr/bin/env python3
"""Sound design + mix, fully deterministic, driven by build/timeline.json (exported from the storyboard).

Layers: narration · explode whooshes / landing clacks · label ticks · title hits ·
a calm explainer-style music bed (felt-piano arpeggio over a warm pad) ducked under the voice.
Writes public/audio/mix.wav (48 kHz stereo, loudness-normalised) and registers it in the manifest."""
import json, os, subprocess, wave
import numpy as np
from scipy import signal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
rng = np.random.default_rng(20260924)
TL = json.load(open(os.path.join(ROOT, 'build', 'timeline.json')))
MAN_P = os.path.join(ROOT, 'public', 'audio', 'manifest.json'); MAN = json.load(open(MAN_P))
N = int((TL['dur'] + .5) * SR)
L = np.zeros(N); R = np.zeros(N)                    # effects + ambience (stereo)
MUS = np.zeros((2, N)); VO = np.zeros(N)

def db(x): return 10 ** (x / 20)
def lp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, o=2): return signal.sosfilt(signal.butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def env(n, a, r):  # attack/release envelope, samples
    e = np.ones(n); a = max(1, int(a)); r = max(1, int(r)); e[:a] = np.linspace(0, 1, a); e[-r:] *= np.linspace(1, 0, r); return e
def put(buf, t, x, gain=1.0):
    i = int(t * SR); j = min(N, i + len(x));
    if i < N and j > max(0, i): buf[max(0, i):j] += gain * x[max(0, -i):j - i]
def put2(t, x, gain=1.0, pan=0.0):
    put(L, t, x, gain * np.sqrt(.5 * (1 - pan))); put(R, t, x, gain * np.sqrt(.5 * (1 + pan)))

# ---------------- narration ----------------
for ln in TL['lines']:
    f = os.path.join(ROOT, 'public', MAN['lines'][ln['id']]['file']) if ln['id'] in MAN.get('lines', {}) else None
    if not f or not os.path.exists(f): continue
    with wave.open(f) as w: x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
    x = x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * db(-19)                 # consistent spoken level
    put(VO, ln['start'], x)

# ---------------- sound effects ----------------
def tick(f=2600, d=.06, noise=.3):
    n = int(d * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + noise * bp(rng.standard_normal(n), 2000, 7000)) * np.exp(-t * 70)
def whoosh(d):
    n = int(max(.4, d + .5) * SR); t = np.arange(n) / SR; w = rng.standard_normal(n)
    sweep = np.linspace(300, 2200, n); out = np.zeros(n); blk = 2048; zi = None
    for i in range(0, n, blk):                                              # time-varying band-pass
        sos = signal.butter(2, [sweep[i] * .6, min(sweep[i] * 1.8, 20000)], 'band', fs=SR, output='sos')
        seg, zi = signal.sosfilt(sos, w[i:i + blk], zi=zi if zi is not None else signal.sosfilt_zi(sos) * 0)
        out[i:i + blk] = seg
    e = np.sin(np.pi * np.clip(t / (n / SR), 0, 1)) ** 1.5
    return out * e
def clack():
    n = int(.8 * SR); t = np.arange(n) / SR; x = np.zeros(n)
    for f, a, dcy in [(210, 1, 18), (540, .5, 26), (1370, .35, 40), (2890, .2, 60)]: x += a * np.sin(2 * np.pi * f * t) * np.exp(-t * dcy)
    x += .6 * lp(rng.standard_normal(n), 3000) * np.exp(-t * 90)
    return x
def hit():
    n = int(4.5 * SR); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (46 * t - 5 * t ** 2)) * np.exp(-t * 1.3)
    air = lp(hp(rng.standard_normal(n), 3000), 9000) * np.exp(-t * 1.8) * .07
    return (boom + air) * env(n, SR * .01, SR * 1.0)

for ev in TL['events']:
    k = ev['type']
    if k == 'lift': put2(ev['t'], whoosh(ev['dur']), db(-30 if ev['layer'] not in ('cut', 'slice') else -26), pan=rng.uniform(-.4, .4))
    elif k == 'land': put2(ev['t'] - .05, clack(), db(-31), pan=rng.uniform(-.3, .3))
    elif k == 'tick': put2(ev['t'], tick(), db(-34))
    elif k == 'hit': put2(ev['t'], hit(), db(-12))

# ---------------- music: calm explainer bed — felt-piano arpeggio over a warm pad (Cmaj9 → Am9 → Fmaj9 → Gsus2) ----------------
BPM = 80; beat = 60 / BPM; bar = 8 * beat                                  # two 4/4 bars per chord
chords = [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [41, 48, 52, 55, 57], [43, 50, 55, 57, 62]]
mf = lambda m: 440 * 2 ** ((m - 69) / 12)
def keys(f, d=2.4, vel=1.0):                                               # soft felt piano: few harmonics, fast top decay, soft hammer
    n = int(d * SR); t = np.arange(n) / SR; x = np.zeros(n)
    for h, a, k in [(1, 1, 2.2), (2, .45, 3.8), (3, .18, 6), (4, .08, 9)]: x += a * np.sin(2 * np.pi * f * h * (1 + .0004 * h * h) * t) * np.exp(-t * k)
    x += .05 * lp(rng.standard_normal(n), 1800) * np.exp(-t * 120)
    return lp(x, 3200) * env(n, SR * .006, SR * .4) * vel
nbars = int(TL['dur'] / bar) + 2
for ci in range(nbars):
    notes = chords[ci % 4]; t0 = ci * bar
    # pad: soft detuned sines, slow swell
    i0 = int(t0 * SR); n = int((bar + 3) * SR); t = np.arange(n) / SR
    e = np.clip(t / 2.5, 0, 1) * np.clip((bar + 3 - t) / 3, 0, 1)
    for j, m in enumerate(notes[1:]):
        for ch, det in ((0, -.1), (1, .1)):
            x = np.sin(2 * np.pi * mf(m) * (1 + det / 100) * t + j) * e * .16
            seg = MUS[ch, i0:i0 + n]; seg += x[:len(seg)]
    # bass note on the downbeat
    put(MUS[0], t0, keys(mf(notes[0]), 5, .7)); put(MUS[1], t0, keys(mf(notes[0]), 5, .7))
    # gentle eighth-note arpeggio, up and back, alternating sides
    arp = [notes[1], notes[2], notes[3], notes[4] + 12 if notes[4] < 62 else notes[4], notes[3], notes[2]] * 3
    for k in range(16):
        m = arp[k % len(arp)] + 12; vel = (.55 if k % 4 == 0 else .38) * (.9 + .2 * rng.random())
        put(MUS[k % 2], t0 + k * beat / 2 + .012 * rng.standard_normal(), keys(mf(m), 2.2, vel))
MUS = np.stack([lp(hp(MUS[0], 60), 5000), lp(hp(MUS[1], 60), 5000)])
ir_n = int(3.2 * SR); irt = np.arange(ir_n) / SR; ir = rng.standard_normal((2, ir_n)) * np.exp(-irt * 2.0); ir[:, :int(.025 * SR)] = 0
ir = np.stack([lp(ir[0], 6000), lp(ir[1], 6000)])
MUS = np.stack([signal.fftconvolve(MUS[c], ir[c])[:N] * .045 + MUS[c] * .6 for c in (0, 1)])
MUS = MUS / (np.sqrt(np.mean(MUS ** 2)) + 1e-9) * db(-25)
# duck music and ambience under the voice (smoothed envelope)
venv = lp(np.abs(VO), 4, 2); venv = np.clip(venv / (venv.max() + 1e-9) * 6, 0, 1)
duck = 1 - .55 * venv; MUS *= duck; L *= (1 - .35 * venv); R *= (1 - .35 * venv)
# swell the music under the title and fade the whole thing at the end
for ev in TL['events']:
    if ev['type'] == 'hit': i = int(ev['t'] * SR); w = np.zeros(N); w[max(0, i - SR * 2):i + SR * 5] = np.hanning(min(N, i + SR * 5) - max(0, i - SR * 2)); MUS *= (1 + .6 * w)
fade = np.clip((TL['dur'] - np.arange(N) / SR) / 2.0, 0, 1) * np.clip(np.arange(N) / SR / 1.0, 0, 1)

out = np.stack([L + MUS[0] + VO, R + MUS[1] + VO]) * fade
out = np.tanh(out * 1.2) / 1.2                                            # gentle safety saturation
os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
raw = os.path.join(ROOT, 'build', 'mix-raw.wav')
with wave.open(raw, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(out.T, -1, 1) * 32767).astype(np.int16).tobytes())
dst = os.path.join(ROOT, 'public', 'audio', 'mix.wav')
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', str(SR), '-c:a', 'pcm_s16le', dst], check=True)
MAN['mix'] = 'audio/mix.wav'; json.dump(MAN, open(MAN_P, 'w'), indent=1)
print(f'wrote public/audio/mix.wav ({TL["dur"]:.1f} s)')
