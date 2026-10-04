"""Music analysis -> data/audio.json

  * beats and downbeats from beat_this (neural tracker) on the full mix,
  * a constant-tempo grid fitted to those beats (tempo + phase by least
    squares), with the residuals reported so tempo drift would show,
  * bar phase checked against kick energy from the Demucs drum stem,
  * drum hits (kick / snare / hat) from band-limited onsets of the drum stem,
  * 100 fps loudness envelopes of the mix and each stem,
  * sections: lyric-driven, snapped to bar lines.

Run:  .venv/Scripts/python analysis/beats.py
"""
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy.signal import butter, find_peaks, sosfiltfilt

from common import DATA, STEMS, WAV as MIX, WORK

HERE = Path(__file__).parent
ROOT = HERE.parent
FPS = 100


def load(path):
    x, sr = sf.read(str(path), dtype="float32", always_2d=True)
    return x.mean(axis=1), sr


def env100(x, sr):
    hop = sr // FPS
    win = hop * 2
    n = 1 + (len(x) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    return np.sqrt((x[idx] ** 2).mean(axis=1) + 1e-12)


def band(x, sr, lo, hi):
    if lo is None:
        sos = butter(4, hi, btype="low", fs=sr, output="sos")
    elif hi is None:
        sos = butter(4, lo, btype="high", fs=sr, output="sos")
    else:
        sos = butter(4, [lo, hi], btype="band", fs=sr, output="sos")
    return sosfiltfilt(sos, x)


def onsets(x, sr, thresh, min_gap=0.09):
    """Onset times of a band-limited signal from the rise of its envelope."""
    hop = sr // 400  # 2.5 ms
    win = hop * 4
    n = 1 + (len(x) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    e = np.sqrt((x[idx] ** 2).mean(axis=1) + 1e-12)
    ref = np.percentile(e, 99)
    d = np.maximum(0, e[4:] - e[:-4]) / ref
    pk, pr = find_peaks(d, height=thresh, distance=int(min_gap / (hop / sr)))
    t = (pk + 2) * hop / sr
    return t, pr["peak_heights"]


def main():
    mix, sr = load(MIX)
    dur = len(mix) / sr

    # --- constant-tempo grid fitted to drum-stem onsets -----------------------
    # (beat_this was the first choice, but its checkpoint host serves an expired
    #  TLS certificate; a comb fit is exact enough for a machine-steady track.)
    drums, dsr = load(STEMS / "drums.wav")
    hop = 128
    oenv = librosa.onset.onset_strength(y=drums, sr=dsr, hop_length=hop, aggregate=np.median)
    oenv = oenv / oenv.max()
    ot = np.arange(len(oenv)) * hop / dsr

    def comb(period, phase, t0=8.0, t1=None):
        t1 = dur - 12 if t1 is None else t1
        g = np.arange(phase + period * np.ceil((t0 - phase) / period), t1, period)
        return np.interp(g, ot, oenv).mean()

    best = (-1, None, None)
    for period in np.arange(0.4600, 0.5000, 0.00005):
        for phase in np.arange(0, period, 0.004):
            sc = comb(period, phase)
            if sc > best[0]:
                best = (sc, period, phase)
    _, period, phase = best
    # refine
    for step_p, step_f in ((0.00001, 0.001), (0.000002, 0.0005)):
        cands = [(comb(p, f), p, f) for p in np.arange(period - 20 * step_p, period + 20 * step_p, step_p) for f in np.arange(phase - 0.01, phase + 0.01, step_f)]
        _, period, phase = max(cands)
    phase = phase % period
    print(f"comb fit: period {period:.5f} s = {60/period:.3f} BPM, phase {phase:.4f} s")
    for a_, b_ in ((8, 80), (80, 160), (160, dur - 12)):
        # local phase error: best phase shift within +-40 ms for this third
        shifts = np.arange(-0.04, 0.0401, 0.001)
        sc = [comb(period, phase + d, a_, b_) for d in shifts]
        print(f"   {a_:5.0f}-{b_:5.0f} s: best local phase shift {shifts[int(np.argmax(sc))]*1000:+.0f} ms")

    n0 = int(np.floor((0 - phase) / period))
    n1 = int(np.ceil((dur - phase) / period))
    grid = phase + period * np.arange(n0, n1 + 1)
    grid = grid[(grid >= 0) & (grid <= dur)]
    beats = grid
    downbeats = np.array([])
    k0 = int(round((grid[0] - phase) / period))  # grid index of the first beat in the file

    # drums
    kick_t, kick_h = onsets(band(drums, dsr, None, 110), dsr, 0.18)
    snare_t, snare_h = onsets(band(drums, dsr, 180, 2500), dsr, 0.22)
    hat_t, hat_h = onsets(band(drums, dsr, 7000, None), dsr, 0.2, min_gap=0.05)

    def beat_phase_hist(t, w=None):
        ph = ((t - phase) / period) % 4
        h, _ = np.histogram(ph, bins=8, range=(-0.25, 3.75), weights=w)
        return np.round(h, 1).tolist()

    print(f"kick onsets {len(kick_t)}: count per half-beat over the bar, grid index mod 4 = 0,.5,1,..: {beat_phase_hist(kick_t)}")
    print(f"snare onsets {len(snare_t)}: {beat_phase_hist(snare_t)}")
    kd = (kick_t - phase) / period
    kd = (kd - np.round(kd)) * period
    onb = np.abs(kd) < 0.06
    print(f"kicks within 60 ms of a beat: {onb.sum()}/{len(kick_t)}, mean offset {kd[onb].mean()*1000:+.1f} ms (std {kd[onb].std()*1000:.1f})")

    # chord changes: bass-stem chroma novelty at each beat, by position in the bar
    bass, bsr = load(STEMS / "bass.wav")
    other, _ = load(STEMS / "other.wav")
    chroma = librosa.feature.chroma_cqt(y=bass + 0.5 * other, sr=bsr, hop_length=512)
    ct = np.arange(chroma.shape[1]) * 512 / bsr
    nov = np.zeros(4)
    cnt = np.zeros(4)
    gi_all = np.round((grid - phase) / period).astype(int)
    for t, g in zip(grid, gi_all):
        if t < 9 or t > dur - 12:
            continue
        a_ = chroma[:, (ct >= t - period * 0.9) & (ct < t - 0.05)].mean(axis=1)
        b_ = chroma[:, (ct >= t + 0.05) & (ct < t + period * 0.9)].mean(axis=1)
        d = 1 - np.dot(a_, b_) / (np.linalg.norm(a_) * np.linalg.norm(b_) + 1e-9)
        nov[g % 4] += d
        cnt[g % 4] += 1
    print(f"chord-change novelty by grid index mod 4: {np.round(nov / cnt, 3).tolist()}")
    # lyric line starts by position in the bar
    lyr0 = json.loads((DATA / "lyrics.json").read_text(encoding="utf-8"))
    ls = np.array([l["start"] for l in lyr0["lines"]])
    print(f"lyric line starts, position in bar (grid mod 4, 8 half-beat bins from -0.25): {beat_phase_hist(ls)}")
    db_mod = int(np.argmax(nov / cnt))
    print(f"-> downbeat = grid index mod 4 == {db_mod}")

    out = dict(
        duration=round(dur, 3),
        bpm=round(60 / period, 3),
        beat_period=round(float(period), 5),
        phase=round(float(phase), 4),
        downbeat_mod=db_mod,
        beats=[round(float(t), 3) for t in grid],
        kick=[round(float(t), 3) for t in kick_t],
        snare=[round(float(t), 3) for t in snare_t],
        hat=[round(float(t), 3) for t in hat_t],
        env_fps=FPS,
        env={},
    )
    envs = {"mix": mix}
    for name in ("vocals", "drums", "bass", "other"):
        envs[name], _ = load(STEMS / f"{name}.wav")
    for name, x in envs.items():
        xs = sr if name == "mix" else dsr
        e = env100(x, xs)
        e = e / np.percentile(e, 99.5)
        out["env"][name] = [round(float(v), 3) for v in np.clip(e, 0, 1.5)]
    low = env100(band(mix, sr, None, 150), sr)
    out["env"]["low"] = [round(float(v), 3) for v in np.clip(low / np.percentile(low, 99.5), 0, 1.5)]
    high = env100(band(mix, sr, 5000, None), sr)
    out["env"]["high"] = [round(float(v), 3) for v in np.clip(high / np.percentile(high, 99.5), 0, 1.5)]

    (WORK / "audio_raw.json").write_text(json.dumps(out), encoding="utf-8")
    print(f"wrote {WORK / 'audio_raw.json'}")

    # loudness by bar for a first look at the arrangement
    lyr = json.loads((DATA / "lyrics.json").read_text(encoding="utf-8"))
    first_db = phase + period * db_mod
    while first_db - 4 * period >= -1e-6:
        first_db -= 4 * period
    while first_db < -1e-6:
        first_db += 4 * period
    bars = np.arange(first_db, dur, 4 * period)
    e = {k: np.array(v) for k, v in out["env"].items()}
    print("\nbar  time     mix  drums bass  vocal other | lyric line starting in this bar")
    for bi, t in enumerate(bars):
        a, b = int(t * FPS), int(min(dur, t + 4 * period) * FPS)
        if b <= a:
            continue
        ls = [l["id"] for l in lyr["lines"] if t <= l["start"] < t + 4 * period]
        row = " ".join(f"{e[k][a:b].mean():5.2f}" for k in ("mix", "drums", "bass", "vocals", "other"))
        print(f"{bi:3d} {t:7.2f}  {row} | {' '.join(ls)}")


if __name__ == "__main__":
    main()
