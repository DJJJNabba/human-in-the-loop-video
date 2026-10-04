"""QA for the lyric alignment: spectrogram strips of the vocal stem with word
markers, and an energy-onset check of line starts.

  python qa_plot.py onsets                 # CTC / Whisper start vs. first vocal energy, per line
  python qa_plot.py plot 72 85 [name]      # PNG of that time range -> work/qa_<name>.png
  python qa_plot.py plot-final 72 85 name  # same, with data/lyrics.json markers

Markers: white = CTC forced alignment (align_raw.json), cyan = Whisper on the
vocal stem, yellow = Whisper on the full mix, green = final data/lyrics.json.
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

from common import DATA, VOCALS, WORK

HERE = Path(__file__).parent


def load():
    x, sr = sf.read(str(VOCALS), dtype="float32", always_2d=True)
    return x.mean(axis=1), sr


def rms_env(x, sr, hop_s=0.005, win_s=0.02):
    hop, win = int(sr * hop_s), int(sr * win_s)
    n = 1 + (len(x) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    # the hop is a whole number of samples: return its true length, not the nominal one
    return np.sqrt((x[idx] ** 2).mean(axis=1) + 1e-12), hop / sr


def whisper_words(name):
    segs = json.loads((WORK / f"whisper_{name}.json").read_text(encoding="utf-8"))
    return [w for s in segs for w in s["words"]]


def onsets():
    x, sr = load()
    env, hop = rms_env(x, sr)
    ref = np.percentile(env, 95)
    thr = ref * 0.08
    lines = json.loads((WORK / "align_raw.json").read_text(encoding="utf-8"))
    wv = whisper_words("vocals")
    print("line       ctc    energy  ctc-energy   quiet-before(s)")
    diffs = []
    for l in lines:
        t = l["words"][0]["start"]
        k = int(t / hop)
        # search for the energy onset nearest the CTC start: last quiet->loud crossing in [t-0.6, t+0.3]
        a, b = max(1, int((t - 0.6) / hop)), min(len(env) - 1, int((t + 0.3) / hop))
        cross = [i for i in range(a, b) if env[i] > thr and env[i - 1] <= thr]
        if not cross:
            print(f"{l['id']:9s} {t:7.2f}   (no clean onset)")
            continue
        c = min(cross, key=lambda i: abs(i * hop - t))
        # how long was it quiet before the crossing
        q = c
        while q > 0 and env[q - 1] <= thr:
            q -= 1
        quiet = (c - q) * hop
        d = t - c * hop
        if quiet > 0.12:
            diffs.append(d)
        print(f"{l['id']:9s} {t:7.2f} {c*hop:7.3f}  {d:+.3f}      {quiet:.2f}")
    if diffs:
        d = np.array(diffs)
        print(f"\nCTC start minus energy onset (lines preceded by >120 ms of quiet, n={len(d)}): median {np.median(d):+.3f}  mean {d.mean():+.3f}  p10 {np.percentile(d,10):+.3f}  p90 {np.percentile(d,90):+.3f}")


def plot(t0, t1, name, final=False):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import librosa

    x, sr = load()
    a, b = int(t0 * sr), int(t1 * sr)
    seg = x[a:b]
    hop = 256
    S = librosa.feature.melspectrogram(y=seg, sr=sr, n_fft=2048, hop_length=hop, n_mels=128, fmax=8000)
    D = librosa.power_to_db(S, ref=np.max(S) if S.max() > 0 else 1.0)
    fig, ax = plt.subplots(2, 1, figsize=(20, 7.5), gridspec_kw=dict(height_ratios=[3.2, 1]), sharex=True)
    ax[0].imshow(D, origin="lower", aspect="auto", extent=[t0, t1, 0, 128], cmap="magma", vmin=-70, vmax=0)
    env, eh = rms_env(x, sr)
    te = np.arange(len(env)) * eh
    m = (te >= t0) & (te <= t1)
    ax[1].plot(te[m], env[m], color="k", lw=0.8)
    ax[1].set_xlim(t0, t1)
    ax[1].set_xticks(np.arange(np.ceil(t0 * 4) / 4, t1, 0.25))
    ax[1].tick_params(axis="x", labelsize=7, rotation=90)
    ax[1].grid(True, axis="x", alpha=0.3)

    def marks(words, color, y, key="w"):
        for w in words:
            if t0 <= w["start"] <= t1:
                ax[0].axvline(w["start"], color=color, lw=0.9, alpha=0.9)
                ax[0].text(w["start"] + 0.01, y, w[key], color=color, fontsize=9, va="top")
                ax[1].axvline(w["start"], color=color, lw=0.7, alpha=0.6)
            if "end" in w and t0 <= w["end"] <= t1 and color in ("white", "lime"):
                ax[0].plot([w["end"]], [y - 6], marker="|", color=color, ms=6)

    if final:
        data = json.loads((DATA / "lyrics.json").read_text(encoding="utf-8"))
        marks([w for l in data["lines"] for w in l["words"]], "lime", 126)
    else:
        lines = json.loads((WORK / "align_raw.json").read_text(encoding="utf-8"))
        marks([w for l in lines for w in l["words"]], "white", 126)
    marks(whisper_words("vocals"), "cyan", 108)
    marks(whisper_words("mix"), "yellow", 92)
    ax[0].set_title(f"{name}  {t0:.2f}-{t1:.2f}s   white/green=aligned  cyan=whisper(vocals)  yellow=whisper(mix)")
    fig.tight_layout()
    out = WORK / f"qa_{name}.png"
    fig.savefig(out, dpi=80)
    print(out)


def onsetlist(t0, t1):
    """Energy onsets of the vocal stem in [t0, t1]: local maxima of the rise of
    the log envelope (5 ms hop), strongest first-order evidence of syllable starts."""
    from scipy.ndimage import uniform_filter1d
    from scipy.signal import find_peaks

    x, sr = load()
    env, hop = rms_env(x, sr)
    ref = np.percentile(env, 95)
    le = np.log(np.maximum(env, ref * 1e-3) / ref)
    sm = uniform_filter1d(le, 3)
    rise = np.maximum(0, sm[6:] - sm[:-6])  # rise over 30 ms
    t = (np.arange(len(rise)) + 3) * hop
    pk, pr = find_peaks(rise, height=0.35, distance=int(0.07 / hop))
    for i in pk:
        if t0 <= t[i] <= t1:
            # onset time = where the rise starts (walk back to 20 % of the peak rise)
            j = i
            while j > 0 and rise[j] > 0.2 * rise[i]:
                j -= 1
            lvl = env[min(len(env) - 1, i + 8)] / ref
            print(f"  {t[j]:8.3f}  rise={rise[i]:.2f}  level_after={lvl:.2f}")


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "onsets":
        onsets()
    elif mode == "onsetlist":
        onsetlist(float(sys.argv[2]), float(sys.argv[3]))
    elif mode in ("plot", "plot-final"):
        t0, t1 = float(sys.argv[2]), float(sys.argv[3])
        plot(t0, t1, sys.argv[4] if len(sys.argv) > 4 else f"{t0:.0f}_{t1:.0f}", final=(mode == "plot-final"))
