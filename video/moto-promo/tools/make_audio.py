#!/usr/bin/env python3
"""Génère la bande son de la vidéo moto : musique électro 120 BPM et moteur.

Tout est synthétisé ici (numpy + scipy), sans échantillon externe, et de façon
déterministe (graine fixe). Les temps forts sont calés sur le découpage de
index.html : drop à 2 s, coupe toutes les 2 s, second drop à 18 s, appel à
l'action à 26 s, impact final à 30 s.

Usage : python3 tools/make_audio.py  (écrit assets/audio/music.wav et engine.wav)
"""

from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
DUR = 32.0
N = int(SR * DUR)
BPM = 120
BEAT = 60 / BPM  # 0,5 s
BAR = 4 * BEAT  # 2 s
RNG = np.random.default_rng(20261011)
OUT = Path(__file__).resolve().parent.parent / "assets" / "audio"


# ---------------------------------------------------------------- outils


def track():
    return np.zeros((2, N))


def place(buf, sig, t, gain=1.0, pan=0.0):
    """Ajoute un signal mono (ou stéréo) à l'instant t, avec panoramique."""
    i0 = int(round(t * SR))
    if i0 >= N:
        return
    if sig.ndim == 1:
        left = sig * gain * np.sqrt(0.5 * (1 - pan))
        right = sig * gain * np.sqrt(0.5 * (1 + pan))
        st = np.vstack([left, right])
    else:
        st = sig * gain
    i1 = min(N, i0 + st.shape[1])
    if i0 < 0:
        st = st[:, -i0:]
        i0 = 0
    buf[:, i0:i1] += st[:, : i1 - i0]


def bandpass(x, lo, hi, order=2):
    sos = butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return sosfilt(sos, x)


def highpass(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def lowpass(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def note_hz(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    pitch, octave = name[:-1], int(name[-1])
    midi = 12 * (octave + 1) + names[pitch]
    return 440.0 * 2 ** ((midi - 69) / 12)


def env_adsr(n, a=0.005, d=0.1, s=0.6, r=0.05):
    t = np.arange(n) / SR
    dur = n / SR
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = np.clip((dur - t) / max(r, 1e-6), 0, 1)
    return e * rel


def additive(freq, dur, kind="saw", cutoff=(6000, 6000, 0.1), detune=0.0, phase=0.0, max_h=48):
    """Oscillateur additif avec filtre passe-bas à enveloppe (cutoff : début, fin, tau)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    c0, c1, tau = cutoff
    fc = c1 + (c0 - c1) * np.exp(-t / max(tau, 1e-4))
    out = np.zeros(n)
    f = freq * (2 ** (detune / 1200))
    for k in range(1, max_h + 1):
        fk = k * f
        if fk > 17000:
            break
        if kind == "square" and k % 2 == 0:
            continue
        amp = 1.0 / k
        g = 1.0 / (1.0 + (fk / fc) ** 4)
        out += amp * g * np.sin(2 * np.pi * fk * t + phase * k)
    return out


def supersaw(freq, dur, cutoff=(3000, 3000, 0.1), voices=5, spread=14, max_h=32):
    sig_l = np.zeros(int(dur * SR))
    sig_r = np.zeros(int(dur * SR))
    for v in range(voices):
        det = (v - (voices - 1) / 2) * (spread / max(1, voices - 1)) * 2
        ph = RNG.uniform(0, 2 * np.pi)
        s = additive(freq, dur, "saw", cutoff, det, ph, max_h)
        pan = (v / max(1, voices - 1)) * 2 - 1
        sig_l += s * np.sqrt(0.5 * (1 - pan * 0.8))
        sig_r += s * np.sqrt(0.5 * (1 + pan * 0.8))
    return np.vstack([sig_l, sig_r]) / voices


def noise(n):
    return RNG.standard_normal(n)


def reverb_ir(seconds=1.6, decay=0.45):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir_l = noise(n) * np.exp(-t / decay)
    ir_r = noise(n) * np.exp(-t / decay)
    ir_l = lowpass(ir_l, 6500)
    ir_r = lowpass(ir_r, 6500)
    ir_l[: int(0.012 * SR)] = 0
    ir_r[: int(0.017 * SR)] = 0
    norm = np.sqrt(np.sum(ir_l**2))
    return ir_l / norm, ir_r / norm


def apply_reverb(buf, mix=0.25):
    ir_l, ir_r = reverb_ir()
    mono = buf.mean(axis=0)
    wet_l = fftconvolve(mono, ir_l)[:N]
    wet_r = fftconvolve(mono, ir_r)[:N]
    return buf + mix * np.vstack([wet_l, wet_r])


# ---------------------------------------------------------------- instruments


def kick(level=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 120 * np.exp(-t / 0.04)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.22) * np.clip(t / 0.002, 0, 1)
    click = highpass(noise(n), 2500) * np.exp(-t / 0.004) * 0.35
    return np.tanh(1.8 * (body + click)) * level


def clap():
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    nz = bandpass(noise(n), 900, 3200)
    e = np.zeros(n)
    for k, off in enumerate([0.0, 0.009, 0.018, 0.027]):
        tt = t - off
        e += np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / (0.005 if k < 3 else 0.11)), 0)
    return nz * e * 0.9


def snare():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.6
    nz = bandpass(noise(n), 1200, 8000) * np.exp(-t / 0.08)
    return (tone + nz) * 0.8


def hat(open_=False):
    n = int((0.35 if open_ else 0.07) * SR)
    t = np.arange(n) / SR
    nz = highpass(noise(n), 7500, 4)
    return nz * np.exp(-t / (0.16 if open_ else 0.022)) * (0.55 if open_ else 0.45)


def crash(length=2.6):
    n = int(length * SR)
    t = np.arange(n) / SR
    nz = highpass(noise(n), 3500, 2) + 0.4 * bandpass(noise(n), 5000, 9000)
    return nz * np.exp(-t / 0.8) * np.clip(t / 0.003, 0, 1) * 0.5


def sub_drop(length=1.6, f0=85, f1=32):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.35)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.6) * np.clip(t / 0.004, 0, 1)


def riser(length, f_lo=300, f_hi=7000):
    """Souffle filtré qui monte (bande passante balayée par blocs) + dent de scie montante."""
    n = int(length * SR)
    out = np.zeros(n)
    block = 1024
    nz = noise(n + block)
    for i in range(0, n, block):
        p = i / n
        fc = f_lo * (f_hi / f_lo) ** p
        seg = bandpass(nz[i : i + block * 2], max(60, fc * 0.6), min(16000, fc * 1.6), 2)[block // 2 : block // 2 + block]
        out[i : i + block] = seg[: min(block, n - i)]
    t = np.arange(n) / SR
    f = 110 * (8 ** (t / length))
    saw = 2 * ((np.cumsum(f) / SR) % 1.0) - 1
    saw = lowpass(saw, 3000)
    ramp = (t / length) ** 2.2
    return (out * 0.9 + saw * 0.12) * ramp


# ---------------------------------------------------------------- arrangement

CHORDS = {
    "Em": ["E", "G", "B"],
    "C": ["C", "E", "G"],
    "D": ["D", "F#", "A"],
    "Bm": ["B", "D", "F#"],
}
# une mesure = 2 s ; 16 mesures
BARS = ["Em", "Em", "C", "D", "Bm", "Em", "C", "D", "Bm", "Em", "C", "D", "Bm", "Em", "C", "Em"]
ROOTS = {"Em": "E", "C": "C", "D": "D", "Bm": "B"}


def section(bar):
    if bar == 0:
        return "intro"
    if bar in (1, 2, 3, 4, 5, 6):
        return "drop"
    if bar == 7:
        return "break"
    if bar == 8:
        return "build"
    if bar in (9, 10, 11, 12, 13, 14):
        return "drop2"
    return "end"


def build_music():
    drums = track()
    bass = track()
    music = track()  # accords, arpège, nappe (subissent le sidechain)
    fx = track()
    kicks = []

    for bar, chord in enumerate(BARS):
        t0 = bar * BAR
        sec = section(bar)
        root = ROOTS[chord]
        tones = CHORDS[chord]

        # --- batterie
        if sec in ("drop", "drop2"):
            for b in range(4):
                tk = t0 + b * BEAT
                place(drums, kick(), tk, 0.72)
                kicks.append(tk)
                if b in (1, 3):
                    place(drums, clap(), tk, 0.95, 0.05)
                    place(drums, snare(), tk, 0.22)
                place(drums, hat(open_=True), tk + BEAT / 2, 0.42, 0.25)
            for s in range(16):
                if s % 2 == 1:
                    continue
                vel = 0.36 if s % 4 == 0 else 0.24
                place(drums, hat(), t0 + s * BEAT / 4 + BEAT / 4, vel, -0.3)
        elif sec == "break":
            place(drums, kick(), t0, 0.9)
            kicks.append(t0)
            for s in range(8):
                place(drums, hat(), t0 + s * BEAT / 2 + BEAT / 4, 0.12, -0.3)
        elif sec == "build":
            place(drums, kick(), t0, 0.9)
            kicks.append(t0)
            place(drums, kick(), t0 + 2 * BEAT, 0.8)
            kicks.append(t0 + 2 * BEAT)
            # roulement de caisse claire qui accélère
            hits = []
            hits += [t0 + i * BEAT / 2 for i in range(4)]
            hits += [t0 + BAR / 2 + i * BEAT / 4 for i in range(4)]
            hits += [t0 + 0.75 * BAR + i * BEAT / 8 for i in range(4)]
            hits += [t0 + 0.875 * BAR + i * BEAT / 16 for i in range(4)]
            for i, th in enumerate(hits):
                place(drums, snare(), th, 0.18 + 0.5 * i / len(hits), 0.05)
        elif sec == "end" and bar == 15:
            place(drums, kick(), t0, 1.1)
            kicks.append(t0)

        # --- basse : sous-grave + basse sur les contretemps
        if sec in ("drop", "drop2"):
            f = note_hz(root + "1")
            sub = additive(f, BAR, "saw", (180, 180, 0.1), max_h=3)
            place(bass, sub * env_adsr(len(sub), 0.01, 0.3, 0.9, 0.05), t0, 0.2)
            for b in range(4):
                for half in (1,):
                    tn = t0 + b * BEAT + half * BEAT / 2
                    s = additive(note_hz(root + "2"), BEAT / 2 * 0.9, "saw", (1400, 260, 0.06), max_h=40)
                    place(bass, np.tanh(2.2 * s) * env_adsr(len(s), 0.004, 0.12, 0.55, 0.02), tn, 0.42)
        elif sec == "build":
            for i in range(8):
                tn = t0 + i * BEAT / 2
                s = additive(note_hz(root + "2"), BEAT / 2 * 0.85, "saw", (600 + i * 220, 300, 0.05), max_h=40)
                place(bass, s * env_adsr(len(s), 0.004, 0.1, 0.5, 0.02), tn, 0.4)

        # --- arpège pincé (doubles croches)
        if sec in ("drop", "drop2", "build", "break"):
            pattern = [0, 1, 2, 3, 2, 1, 0, 2]
            notes = [note_hz(tones[0] + "4"), note_hz(tones[1] + "4"), note_hz(tones[2] + "4"), note_hz(tones[0] + "5")]
            bright = {"drop": 3200, "drop2": 4200, "build": 1500 + 0, "break": 1800}[sec]
            for s in range(16):
                tn = t0 + s * BEAT / 4
                fq = notes[pattern[s % len(pattern)]]
                p = additive(fq, 0.2, "saw", (bright, 420, 0.05), max_h=36)
                pan = -0.45 if s % 2 == 0 else 0.45
                vel = 0.46 if s % 4 == 0 else 0.33
                if sec == "build":
                    vel *= 0.6 + 0.6 * s / 16
                place(music, p * env_adsr(len(p), 0.002, 0.09, 0.0, 0.03), tn, vel, pan)

        # --- accords en stabs syncopés (drop 2 et fin)
        if sec in ("drop", "drop2"):
            stab_gain = 0.28 if sec == "drop" else 0.4
            for pos in (0.0, 0.75, 1.5, 2.5, 3.25):
                tn = t0 + pos * BEAT
                st = np.zeros((2, int(0.32 * SR)))
                for tone in tones:
                    st += supersaw(note_hz(tone + "3"), 0.32, (2600, 700, 0.09), voices=3, spread=18, max_h=26)
                e = env_adsr(st.shape[1], 0.003, 0.12, 0.25, 0.06)
                place(music, st * e, tn, stab_gain)

        # --- nappe (intro, pause, montée, fin)
        if sec in ("intro", "break", "build", "end"):
            length = BAR + 0.6 if sec != "end" else 2.2
            pad = np.zeros((2, int(length * SR)))
            for tone in tones:
                pad += supersaw(note_hz(tone + "3"), length, (900, 900, 1), voices=5, spread=16, max_h=18)
            pad += supersaw(note_hz(root + "2"), length, (500, 500, 1), voices=3, spread=10, max_h=12)
            e = env_adsr(pad.shape[1], 0.35 if sec == "intro" else 0.08, 0.8, 0.85, 0.6)
            gain = {"intro": 0.32, "break": 0.3, "build": 0.26, "end": 0.38}[sec]
            if bar == 15:
                pad = np.zeros((2, int(2.0 * SR)))
                for tone in tones + [tones[0]]:
                    pad += supersaw(note_hz(tone + "3"), 2.0, (2400, 500, 0.5), voices=5, spread=16, max_h=24)
                e = env_adsr(pad.shape[1], 0.003, 0.5, 0.35, 0.9)
                gain = 0.42
            place(music, pad * e, t0, gain)

    # --- mélodie simple sur le second drop et la fin (accroche)
    melody = [
        (18.0, "B4", 0.5), (18.5, "B4", 0.25), (18.75, "A4", 0.25), (19.0, "G4", 0.5), (19.5, "E4", 0.5),
        (20.0, "G4", 0.5), (20.5, "G4", 0.25), (20.75, "A4", 0.25), (21.0, "B4", 0.75),
        (22.0, "A4", 0.5), (22.5, "F#4", 0.5), (23.0, "D5", 0.75),
        (24.0, "B4", 0.5), (24.5, "D5", 0.25), (24.75, "C#5", 0.25), (25.0, "B4", 0.75),
        (26.0, "E5", 0.75), (27.0, "D5", 0.25), (27.25, "B4", 0.25), (27.5, "G4", 0.5),
        (28.0, "E5", 0.5), (28.5, "G5", 0.5), (29.0, "F#5", 0.75),
    ]
    lead = track()
    for t, nm, d in melody:
        s = additive(note_hz(nm), d * 0.95, "square", (3800, 1600, 0.12), max_h=24)
        s += 0.5 * additive(note_hz(nm) * 2, d * 0.95, "saw", (2500, 1200, 0.12), max_h=12)
        place(lead, s * env_adsr(len(s), 0.006, 0.18, 0.55, 0.05), t, 0.16, 0.1)

    # --- effets : montées, impacts, cymbales
    place(fx, riser(1.85), 0.15, 0.32)
    place(fx, riser(2.0, 250, 9000), 16.0, 0.38)
    place(fx, riser(0.9, 400, 6000), 25.1, 0.22)
    for t in (2.0, 18.0, 26.0):
        place(fx, sub_drop(), t, 0.7)
        place(fx, crash(), t, 0.42, 0.15)
    for t in (8.0, 10.0, 12.0, 22.0):
        place(fx, crash(1.4), t, 0.22, -0.2)
    place(fx, sub_drop(2.0, 70, 28), 30.0, 0.85)
    place(fx, crash(2.0), 30.0, 0.5)
    # cymbale inversée qui aspire vers les drops
    rc = crash(1.2)[::-1]
    place(fx, rc, 2.0 - 1.2, 0.3)
    place(fx, rc, 18.0 - 1.2, 0.34)
    # coups sourds sur la lumière (0,15 s) et sur « PISTE PRIVÉE » (1,3 s)
    place(fx, sub_drop(0.9, 70, 35), 0.15, 0.5)
    place(fx, kick(1.0), 1.3, 0.8)
    place(fx, crash(1.6), 1.3, 0.25)

    # --- sidechain : la basse, les accords et l'arpège respirent sous le kick
    t = np.arange(N) / SR
    duck = np.ones(N)
    for tk in kicks:
        i0 = int(tk * SR)
        i1 = min(N, i0 + int(0.4 * SR))
        tt = t[i0:i1] - tk
        duck[i0:i1] = np.minimum(duck[i0:i1], 1 - 0.65 * np.exp(-tt / 0.11))
    bass *= duck
    music *= duck

    # --- filtre de la pause (14-16 s) : on étouffe l'arpège et la nappe
    i0, i1 = int(14 * SR), int(16 * SR)
    music[:, i0:i1] = np.vstack([lowpass(music[0, i0:i1], 900), lowpass(music[1, i0:i1], 900)])

    wet = music * 0.9 + lead * 1.0 + drums * np.array([[0.15], [0.15]])
    mix = drums + bass + music + lead + fx
    mix += 0.22 * (apply_reverb(wet, 1.0) - wet)

    # fin propre
    fade = np.clip((DUR - t) / 1.4, 0, 1) ** 1.5
    mix *= fade
    mix[:, : int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))
    return master(mix, target_rms_db=-15.0)


def master(mix, target_rms_db=-15.0):
    mix = mix - mix.mean(axis=1, keepdims=True)
    mix = np.vstack([highpass(mix[0], 32, 2), highpass(mix[1], 32, 2)])
    low = np.vstack([lowpass(mix[0], 90, 2), lowpass(mix[1], 90, 2)])
    mix = mix - 0.45 * low
    pres = np.vstack([bandpass(mix[0], 1200, 5000), bandpass(mix[1], 1200, 5000)])
    mix = mix + 0.5 * pres
    rms = np.sqrt(np.mean(mix**2))
    mix *= 10 ** (target_rms_db / 20) / max(rms, 1e-9)
    # limiteur doux
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    peak = np.max(np.abs(mix))
    if peak > 0.93:
        mix *= 0.93 / peak
    return mix


# ---------------------------------------------------------------- moteur


def rpm_curve():
    """Régime (tr/min) et volume du moteur dans le temps, calés sur les plans."""
    keys = [
        # t, rpm, volume
        (0.00, 0, 0.0),
        (0.14, 0, 0.0),
        (0.16, 2200, 0.9),
        (0.45, 1300, 0.7),
        (0.55, 1300, 0.7),
        (0.70, 6800, 1.0),
        (0.90, 1600, 0.75),
        (1.02, 1500, 0.75),
        (1.20, 9200, 1.0),
        (1.45, 1700, 0.8),
        (1.90, 2500, 0.85),
        (2.55, 9600, 1.0),
        (2.62, 6200, 0.9),
        (3.20, 9000, 0.75),
        (3.6, 7000, 0.16),
        (8.0, 6600, 0.16),
        (8.05, 6000, 0.6),
        (10.0, 6400, 0.6),
        (10.92, 11800, 1.0),
        (11.0, 9000, 0.75),
        (11.25, 6200, 0.7),
        (11.3, 7400, 0.75),
        (11.5, 4200, 0.6),
        (11.55, 5200, 0.6),
        (11.85, 1500, 0.5),
        (12.0, 5200, 0.6),
        (12.4, 8600, 0.75),
        (12.75, 6800, 0.6),
        (13.2, 8800, 0.75),
        (14.0, 8200, 0.6),
        (14.1, 6200, 0.14),
        (16.0, 6000, 0.14),
        (16.05, 5600, 0.6),
        (17.2, 10600, 1.0),
        (17.25, 7600, 0.85),
        (17.9, 10000, 0.7),
        (18.0, 9000, 0.0),
        (26.0, 7000, 0.0),
        (26.2, 7000, 0.15),
        (28.6, 7200, 0.17),
        (29.3, 3800, 0.4),
        (29.8, 1400, 0.45),
        (29.98, 1400, 0.45),
        (30.08, 7400, 1.0),
        (30.25, 1600, 0.6),
        (30.33, 8200, 1.0),
        (30.55, 1500, 0.55),
        (31.4, 1350, 0.4),
        (32.0, 1300, 0.0),
    ]
    t = np.arange(N) / SR
    kt = np.array([k[0] for k in keys])
    rpm = np.interp(t, kt, [k[1] for k in keys])
    vol = np.interp(t, kt, [k[2] for k in keys])
    # en slalom, petites relances de gaz à chaque changement de côté
    m = (t >= 8.05) & (t < 10.0)
    rpm[m] += 700 * np.sin(2 * np.pi * (t[m] - 8.05) / 0.92)
    return rpm, vol


def build_engine():
    rpm, vol = rpm_curve()
    # bicylindre 4 temps à calage irrégulier : deux explosions par cycle (0 et 0,375 du cycle)
    cyc = np.cumsum(rpm / 120.0) / SR
    fires = np.zeros(N)
    for offset in (0.0, 0.375):
        k = np.floor(cyc - offset)
        idx = np.nonzero(np.diff(k) > 0)[0] + 1
        jitter = RNG.normal(0, 0.06, len(idx))
        fires[idx] += 1.0 + jitter
    # chaque explosion excite des résonances d'échappement (noyau fixe)
    kn = int(0.03 * SR)
    kt = np.arange(kn) / SR
    kernel = (
        0.6 * np.sin(2 * np.pi * 95 * kt) * np.exp(-kt / 0.012)
        + 0.85 * np.sin(2 * np.pi * 210 * kt) * np.exp(-kt / 0.009)
        + 0.5 * np.sin(2 * np.pi * 430 * kt) * np.exp(-kt / 0.006)
        + 0.35 * np.sin(2 * np.pi * 980 * kt) * np.exp(-kt / 0.004)
        + 0.45 * highpass(noise(kn), 600) * np.exp(-kt / 0.004)
    )
    exhaust = fftconvolve(fires, kernel)[:N]
    exhaust = np.tanh(exhaust * 1.8)
    # admission : souffle filtré qui suit le régime
    intake = bandpass(noise(N), 300, 2400) * (0.05 + 0.25 * np.clip(rpm / 12000, 0, 1))
    eng = lowpass(exhaust, 4200) + intake * 0.8
    eng *= vol

    # crissement de pneu au freinage (11,0 – 11,8 s)
    t = np.arange(N) / SR
    sq = np.zeros(N)
    i0, i1 = int(11.0 * SR), int(11.85 * SR)
    tt = t[i0:i1] - 11.0
    f = 2300 + 160 * np.sin(2 * np.pi * 9 * tt)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    sq_env = np.clip(tt / 0.04, 0, 1) * np.clip((0.85 - tt) / 0.3, 0, 1)
    sq[i0:i1] = (tone * 0.25 + bandpass(noise(i1 - i0), 1800, 3600) * 0.6) * sq_env
    eng += sq * 0.35

    st = np.vstack([eng, eng])
    # légère largeur stéréo
    st[1] = np.concatenate([np.zeros(int(0.0008 * SR)), st[1][: -int(0.0008 * SR)]])
    rms = np.sqrt(np.mean(st[:, vol > 0.05] ** 2)) if np.any(vol > 0.05) else 1
    st *= 10 ** (-17 / 20) / max(rms, 1e-9)
    peak = np.max(np.abs(st))
    if peak > 0.9:
        st *= 0.9 / peak
    return st


def write(path, stereo):
    data = np.clip(stereo.T, -1, 1)
    wavfile.write(path, SR, (data * 32767).astype(np.int16))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    write(OUT / "music.wav", build_music())
    write(OUT / "engine.wav", build_engine())
    print("ok :", OUT / "music.wav", OUT / "engine.wav")
