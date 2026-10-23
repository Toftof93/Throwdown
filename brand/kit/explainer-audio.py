# Soundtrack for the explainer: a fight-night beat, a boxing bell at the start
# and end, and an impact on every scene change. Writes a 44.1 kHz stereo WAV.
import sys, wave
import numpy as np

SR = 44100
DUR = 31.0
SCENES = [3.6, 8.4, 13.2, 18.0, 22.8, 27.4]
out = sys.argv[1]
n = int(SR * DUR)
mix = np.zeros(n)
rng = np.random.default_rng(7)


def place(sig, at, gain=1.0):
    i = int(at * SR)
    if i >= n:
        return
    j = min(n, i + len(sig))
    mix[i:j] += sig[: j - i] * gain


def env(length, attack=0.002, decay=0.2):
    t = np.arange(int(length * SR)) / SR
    return np.minimum(1, t / attack) * np.exp(-t / decay)


def kick():
    t = np.arange(int(0.45 * SR)) / SR
    f = 50 + 110 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(0.45, 0.001, 0.12)


def clap():
    e = env(0.25, 0.001, 0.05)
    noise = rng.standard_normal(len(e))
    return np.convolve(noise, np.ones(4) / 4, "same") * e


def hat():
    e = env(0.06, 0.0005, 0.012)
    noise = rng.standard_normal(len(e))
    return np.diff(noise, prepend=0) * e


def bass(freq, length):
    t = np.arange(int(length * SR)) / SR
    tone = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2 * t)
    return tone * np.minimum(1, t / 0.01) * np.exp(-t / 0.9)


def bell():
    t = np.arange(int(3.0 * SR)) / SR
    sig = np.zeros_like(t)
    for ratio, amp, dec in [(1, 1, 1.4), (2.0, 0.5, 0.9), (2.76, 0.45, 0.7), (5.4, 0.25, 0.4), (8.93, 0.15, 0.25)]:
        sig += amp * np.sin(2 * np.pi * 1180 * ratio * t) * np.exp(-t / dec)
    return sig * np.minimum(1, t / 0.001)


def impact():
    t = np.arange(int(0.9 * SR)) / SR
    f = 38 + 90 * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.35)
    noise = rng.standard_normal(len(t)) * np.exp(-t / 0.05)
    return boom + 0.35 * np.convolve(noise, np.ones(8) / 8, "same")


def riser(length):
    t = np.arange(int(length * SR)) / SR
    noise = rng.standard_normal(len(t))
    k = 3
    out_sig = np.zeros_like(noise)
    for s in range(0, len(t), 2048):
        k = max(1, int(30 * (1 - s / len(t))) + 1)
        out_sig[s : s + 2048] = np.convolve(noise[s : s + 2048], np.ones(k) / k, "same")
    return out_sig * (t / length) ** 2


# Beat: 100 bpm, from the first scene change to the end card.
beat = 60 / 100
roots = [55.0, 43.65, 65.41, 49.0]  # A, F, C, G
t0, t1 = 3.6, 27.4
b = 0
while t0 + b * beat < t1:
    at = t0 + b * beat
    if b % 4 in (0, 2):
        place(kick(), at, 0.9)
    else:
        place(clap(), at, 0.32)
    place(hat(), at + beat / 2, 0.16)
    place(hat(), at, 0.08)
    if b % 4 == 0:
        place(bass(roots[(b // 4) % 4], beat * 4), at, 0.42)
    b += 1

# Soft pad under the intro.
t = np.arange(int(3.6 * SR)) / SR
pad = sum(np.sin(2 * np.pi * f * t) for f in (110, 164.8, 220)) / 3
place(pad * np.minimum(1, t / 0.8) * np.minimum(1, (3.6 - t) / 0.4), 0, 0.12)

place(bell(), 0.05, 0.38)
for s in SCENES[:-1]:
    place(impact(), s, 0.7)
place(riser(1.6), 25.8, 0.18)
place(impact(), 27.4, 0.9)
for k in range(3):
    place(bell(), 27.45 + k * 0.28, 0.34)

# Master: gentle limit, fade out, stereo.
mix = np.tanh(mix * 1.1)
fade = int(1.4 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)
mix /= np.max(np.abs(mix)) * 1.05
stereo = np.stack([mix, mix], axis=1)
pcm = (stereo * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("audio", out, len(mix) / SR, "s")
