"""Word-level lyric alignment -> analysis/work/align_raw.json

Method
  1. CTC emissions of the Demucs vocal stem (mono) from torchaudio's MMS_FA
     forced-alignment model, computed in overlapping windows (20 ms frames).
  2. Each performed line is aligned on its own inside a search window taken
     from the free Whisper transcription (transcribe.py) of the same line,
     padded on both sides; a "star" token before and after the line absorbs
     whatever else is in the window (breaths, backing vocals, neighbours).
  3. Word start = first frame of its first character; word end = last frame of
     its last character, then extended over the sustained vowel using the
     vocal-stem energy (held notes keep their real length).
  4. Every word is cross-checked against the Whisper word timestamps of both
     the vocal stem and the full mix; disagreements are reported.

Run:  .venv/Scripts/python analysis/align.py [--alts]
"""
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio
import torchaudio.functional as AF

from lyrics_src import ALTERNATIVES, PERFORMED

from common import DATA, SONG, VOCALS, WORK

HERE = Path(__file__).parent
FRAME = 0.02  # s per CTC frame
PAD = 1.6 if SONG == 'v1' else 0.9  # s of search margin either side of the Whisper estimate

# Manual anchors (seconds), only where the acoustic model has no confidence:
# the spoken intro/outro and the processed, choir-like "All green" refrains
# (CTC scores ~0).  Each value is a vocal-stem energy onset read from
# `qa_plot.py onsetlist` and checked on the spectrogram strips; the three
# refrains were also checked against each other (same melody: word offsets
# agree within 20 ms after shifting by a whole number of bars).
# (line id, word index) -> start    |    line id -> end of the last word
FIX_V1 = {
    ("intro-1", 0): 1.70, ("intro-1", 1): 1.81, ("intro-1", 2): 2.01, ("intro-1", 3): 2.33,
    ("post1-1", 0): 72.485, ("post1-1", 1): 72.934, ("post1-1", 2): 73.683, ("post1-1", 3): 74.141,
    ("post1-2", 0): 74.790, ("post1-2", 1): 75.34, ("post1-2", 2): 75.66, ("post1-2", 3): 75.85, ("post1-2", 4): 76.10,
    ("post1-3", 0): 80.183, ("post1-3", 1): 80.652, ("post1-3", 2): 81.395, ("post1-3", 3): 81.854,
    ("post1-4", 0): 82.507, ("post1-4", 1): 83.05, ("post1-4", 2): 83.37, ("post1-4", 3): 83.57, ("post1-4", 4): 83.81,
    ("ch2-7", 0): 144.30,
    ("fin-8", 0): 213.34, ("fin-8", 1): 213.70, ("fin-8", 2): 214.10,
    ("out-1", 0): 215.071, ("out-1", 1): 215.540, ("out-1", 2): 216.268, ("out-1", 3): 216.737,
    ("out-2", 0): 217.391, ("out-2", 1): 217.94, ("out-2", 2): 218.26, ("out-2", 3): 218.43, ("out-2", 4): 218.70,
    ("out-3", 0): 222.774, ("out-3", 1): 223.238, ("out-3", 2): 223.976, ("out-3", 3): 224.450,
    ("out-4", 0): 225.148,
    ("spoken-1", 0): 232.80, ("spoken-1", 1): 233.12, ("spoken-1", 2): 233.70,
    ("pre2-3", 3): 126.66,
}
LINE_END_V1 = {"intro-1": 3.05, "spoken-1": 234.80}

# v2: filled in from `qa_plot.py onsetlist` after the first automatic pass
FIX_V2 = {
    # spoken intro (9.58-11.2 s): syllable onsets on the vocal stem
    ("intro-1", 0): 9.583, ("intro-1", 1): 9.778, ("intro-1", 3): 10.556,
    # chorus 2, first line: sung faster than in chorus 1 ("keep-me / in / the loop"), CTC drifts into the next line
    ("ch2-1", 0): 143.534, ("ch2-1", 1): 143.693, ("ch2-1", 2): 144.003, ("ch2-1", 3): 144.2, ("ch2-1", 4): 144.372,
    # the four refrains (processed, CTC ~0): onsets, checked against each other (same melody; word offsets agree within 40 ms)
    ("post1-1", 0): 79.953, ("post1-1", 1): 80.317, ("post1-1", 2): 81.151, ("post1-1", 3): 81.634, ("post1-1", 4): 82.088,
    ("post1-2", 0): 83.680, ("post1-2", 1): 84.219, ("post1-2", 2): 84.857, ("post1-2", 3): 84.972, ("post1-2", 4): 85.366,
    ("post1-3", 0): 87.541, ("post1-3", 1): 88.025, ("post1-3", 2): 88.713, ("post1-3", 3): 89.177, ("post1-3", 4): 89.641,
    ("post1-4", 0): 91.213, ("post1-4", 1): 91.880, ("post1-4", 2): 92.480, ("post1-4", 3): 92.769, ("post1-4", 4): 93.198,
    ("out-1", 0): 227.368, ("out-1", 1): 227.892, ("out-1", 2): 228.566, ("out-1", 3): 229.039, ("out-1", 4): 229.483,
    ("out-2", 0): 231.095, ("out-2", 1): 231.589, ("out-2", 2): 232.337, ("out-2", 3): 232.450, ("out-2", 4): 232.881,
    ("out-3", 0): 234.946, ("out-3", 1): 235.470, ("out-3", 2): 236.128, ("out-3", 3): 236.597, ("out-3", 4): 237.046,
    ("out-4", 0): 238.638, ("out-4", 1): 239.266, ("out-4", 2): 239.865, ("out-4", 3): 240.179, ("out-4", 4): 240.558,
    # spoken ending
    ("spoken-1", 0): 247.702,
}
LINE_END_V2 = {"intro-1": 11.2, "spoken-1": 249.15}
FIX = FIX_V1 if SONG == "v1" else FIX_V2
LINE_END = LINE_END_V1 if SONG == "v1" else LINE_END_V2


def norm(word):
    w = word.lower().replace("’", "'")
    return re.sub(r"[^a-z']", "", w)


def load_vocals():
    x, sr = sf.read(str(VOCALS), dtype="float32", always_2d=True)
    mono = torch.from_numpy(x.mean(axis=1))
    wav16 = AF.resample(mono, sr, 16000)
    return mono.numpy(), sr, wav16


def emissions(wav16, device):
    """Log-probs for the whole song, windowed with context so memory stays flat."""
    path = WORK / "ctc_emissions.npy"
    if path.exists():
        return np.load(path)
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=True).to(device).eval()
    win, ctx = 16000 * 24, 16000 * 3
    out = []
    n = wav16.shape[0]
    with torch.inference_mode():
        for s in range(0, n, win):
            a, b = max(0, s - ctx), min(n, s + win + ctx)
            em, _ = model(wav16[a:b].unsqueeze(0).to(device))
            em = torch.log_softmax(em[0], dim=-1).cpu().numpy()
            f0 = round((s - a) / 320)
            f1 = f0 + int(np.ceil(min(win, n - s) / 320))
            out.append(em[f0:f1])
    em = np.concatenate(out, axis=0)
    np.save(path, em)
    return em


def whisper_lines():
    """Line-level time estimates: best match of each performed line in either
    Whisper transcript, by text similarity, searched monotonically."""
    words = {}
    for name in ("vocals", "mix"):
        segs = json.loads((WORK / f"whisper_{name}.json").read_text(encoding="utf-8"))
        words[name] = [w for s in segs for w in s["words"] if norm(w["w"])]
    return words


def match_whisper(perf_words, wh):
    """Map each performed word (flat index) to a Whisper word via sequence matching."""
    a = [norm(w) for w in perf_words]
    b = [norm(w["w"]) for w in wh]
    sm = SequenceMatcher(None, a, b, autojunk=False)
    m = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                m[i1 + k] = wh[j1 + k]
    return m


def align_window(em, f0, f1, words, dictionary):
    """Forced-align `words` inside emission frames [f0, f1) with star padding."""
    star = dictionary["*"]
    tokens, spans_idx = [star], []
    for w in words:
        ids = [dictionary[c] for c in w]
        spans_idx.append((len(tokens), len(tokens) + len(ids)))
        tokens.extend(ids)
    tokens.append(star)
    e = torch.from_numpy(em[f0:f1]).unsqueeze(0)
    t = torch.tensor([tokens], dtype=torch.int32)
    aligned, scores = AF.forced_align(e, t, blank=0)
    aligned, scores = aligned[0], scores[0].exp()
    spans = AF.merge_tokens(aligned, scores)
    # merge_tokens returns one span per emitted token, in order
    assert len(spans) == len(tokens), (len(spans), len(tokens))
    out = []
    for (a, b) in spans_idx:
        sp = spans[a:b]
        out.append(
            dict(
                start=(f0 + sp[0].start) * FRAME,
                end=(f0 + sp[-1].end) * FRAME,
                score=float(np.mean([s.score for s in sp])),
                chars=[[round((f0 + s.start) * FRAME, 3), round((f0 + s.end) * FRAME, 3), round(float(s.score), 3)] for s in sp],
            )
        )
    total = float(np.mean([s.score for s in spans[1:-1]]))
    return out, total


def rms_env(x, sr, hop_s=0.005, win_s=0.02):
    hop, win = int(sr * hop_s), int(sr * win_s)
    n = 1 + (len(x) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    # the hop is a whole number of samples: return its true length, not the nominal one
    return np.sqrt((x[idx] ** 2).mean(axis=1) + 1e-12), hop / sr


def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    mono, sr, wav16 = load_vocals()
    em = emissions(wav16, device)
    dictionary = torchaudio.pipelines.MMS_FA.get_dict(star="*")
    dur = len(mono) / sr
    nF = em.shape[0]

    # flat performed word list
    flat = []
    for li, (_, _, text) in enumerate(PERFORMED):
        for wi, w in enumerate(text.split()):
            flat.append((li, wi, w))
    wh = whisper_lines()
    maps = {k: match_whisper([w for _, _, w in flat], v) for k, v in wh.items()}

    # line windows from whichever Whisper pass matched more of the line
    est = []
    for li, (_, lid, text) in enumerate(PERFORMED):
        idxs = [i for i, f in enumerate(flat) if f[0] == li]
        ts = []
        for k in (("vocals", "mix") if SONG == "v1" else ("vocals",)):
            got = [maps[k][i] for i in idxs if i in maps[k]]
            if got:
                ts.append((len(got), got[0]["start"], got[-1]["end"]))
        if not ts and SONG != "v1":
            got = [maps["mix"][i] for i in idxs if i in maps["mix"]]
            if got:
                ts.append((len(got), got[0]["start"], got[-1]["end"]))
        if ts:
            ts.sort(reverse=True)
            # word starts from Whisper are trustworthy; first-word starts of a
            # segment after a long gap are not, so take the latest plausible start
            starts = [t[1] for t in ts]
            ends = [t[2] for t in ts]
            est.append((min(starts), max(ends)))
        else:
            est.append(None)

    lines = []
    for li, (section, lid, text) in enumerate(PERFORMED):
        words = [norm(w) for w in text.split()]
        if est[li] is None:
            prev_end = lines[-1]["end"] if lines else 0.0
            a, b = prev_end, min(dur, prev_end + 12)
        else:
            a, b = est[li][0] - PAD, est[li][1] + PAD
            if SONG != "v1":
                nxt = next((e for e in est[li + 1:] if e is not None), None)
                if nxt is not None:
                    b = min(b, nxt[0] + 0.35)  # Whisper starts run early: the next line begins after its estimate
        # never search before the previous line's last word started
        if lines:
            a = max(a, lines[-1]["words"][-1]["start"] + 0.1)
        a, b = max(0.0, a), min(dur, b)
        f0, f1 = int(a / FRAME), min(nF, int(np.ceil(b / FRAME)))
        res, total = align_window(em, f0, f1, words, dictionary)
        lines.append(
            dict(
                section=section,
                id=lid,
                text=text,
                window=[round(a, 2), round(b, 2)],
                score=round(total, 3),
                start=res[0]["start"],
                end=res[-1]["end"],
                words=[dict(w=w, **r) for w, r in zip(text.split(), res)],
            )
        )

    # manual anchors
    for l in lines:
        for wi, w in enumerate(l["words"]):
            w["ctc_start"], w["ctc_end"] = round(w["start"], 3), round(w["end"], 3)
            w["anchored"] = (l["id"], wi) in FIX
            if w["anchored"]:
                w["start"] = FIX[(l["id"], wi)]
            w["start"] = round(w["start"], 3)

    # word ends.  Base = CTC end of the last character (or a short stub for an
    # anchored word), then extended across the sustained vowel using the
    # vocal-stem energy, so held notes keep their real length.
    env, hop = rms_env(mono, sr)
    ref = np.percentile(env, 95)
    thr = ref * 0.06
    all_words = [(l, w) for l in lines for w in l["words"]]
    for i, (l, w) in enumerate(all_words):
        nxt = all_words[i + 1][1]["start"] if i + 1 < len(all_words) else dur
        base = w["ctc_end"]
        if w["anchored"] or not (w["start"] < base <= nxt):
            base = min(w["start"] + 0.12, nxt)
        k = int(base / hop)
        k_max = int(min(nxt - 0.03, base + 6.0) / hop)
        last_loud = k
        while k < min(k_max, len(env) - 1):
            if env[k] > thr:
                last_loud = k
            elif (k - last_loud) * hop > 0.06:  # allow consonant closures up to 60 ms
                break
            k += 1
        w["end"] = round(min(max(base, last_loud * hop), nxt), 3)
    for l in lines:
        if l["id"] in LINE_END:
            l["words"][-1]["end"] = LINE_END[l["id"]]
        l["start"] = l["words"][0]["start"]
        l["end"] = l["words"][-1]["end"]

    # cross-check against Whisper.  Whisper's word starts run early by a steady
    # ~0.2 s on this track (median of all matched words), so compare after
    # removing each pass's own median offset.
    fi = 0
    deltas = {"vocals": [], "mix": []}
    for l in lines:
        for w in l["words"]:
            d = {k: round(maps[k][fi]["start"] - w["start"], 3) for k in ("vocals", "mix") if fi in maps[k]}
            w["whisper_delta"] = d
            for k, v in d.items():
                deltas[k].append(v)
            fi += 1
    bias = {k: float(np.median(v)) for k, v in deltas.items()}
    report = []
    for l in lines:
        for w in l["words"]:
            vals = [abs(v - bias[k]) for k, v in w["whisper_delta"].items()]
            w["agree"] = bool(vals) and min(vals) <= 0.15
            if not w["agree"]:
                report.append((l["id"], w["w"], w["start"], w["whisper_delta"], round(w["score"], 2), "anchored" if w["anchored"] else ""))

    (WORK / "align_raw.json").write_text(json.dumps(lines, indent=1), encoding="utf-8")

    for l in lines:
        ws = " ".join(f"{w['w']}@{w['start']:.2f}" for w in l["words"])
        print(f"{l['id']:9s} {l['start']:7.2f}-{l['end']:7.2f} sc={l['score']:.2f}  {ws}")
    print()
    print(f"Whisper start minus aligned start, median: vocals {bias['vocals']:+.3f} s, mix {bias['mix']:+.3f} s")
    print(f"{len(report)} of {len(all_words)} words where neither Whisper pass agrees within 150 ms after removing that bias:")
    for r in report:
        print("  ", r)

    def conf(w):
        if w["anchored"]:
            return "anchored"
        if w["score"] >= 0.3 and w["agree"]:
            return "high"
        if w["score"] >= 0.1 or w["agree"]:
            return "medium"
        return "low"

    data = dict(
        meta=dict(
            song="Human in the Loop",
            audio="assets/audio/human-in-the-loop-v2.wav" if SONG == "v2" else "assets/audio/human-in-the-loop.m4a",
            duration=round(dur, 3),
            method="MMS_FA CTC forced alignment of the Demucs htdemucs_ft vocal stem, per-line windows from Whisper large-v3; "
            "word ends extended over held notes from vocal-stem energy; manual onset anchors where CTC confidence is ~0",
            conf_legend=dict(
                high="CTC score >= 0.3 and Whisper agrees within 150 ms",
                medium="one of the two",
                low="neither; kept from CTC, consistent with the repeated section",
                anchored="start set from a vocal-stem energy onset, verified on spectrogram",
            ),
            whisper_bias=bias,
        ),
        lines=[
            dict(
                id=l["id"],
                section=l["section"],
                text=l["text"],
                start=l["start"],
                end=l["end"],
                words=[dict(w=w["w"], start=w["start"], end=w["end"], conf=conf(w)) for w in l["words"]],
            )
            for l in lines
        ],
    )
    out = DATA / "lyrics.json"
    out.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    counts = {}
    for l in data["lines"]:
        for w in l["words"]:
            counts[w["conf"]] = counts.get(w["conf"], 0) + 1
    print()
    print(f"wrote {out}  confidence: {counts}")

    if "--alts" in sys.argv:
        print("\nAlternative wordings (mean CTC score, higher = better fit):")
        by_id = {l["id"]: l for l in lines}
        for lid, alts in ALTERNATIVES.items():
            l = by_id[lid]
            f0, f1 = int(l["window"][0] / FRAME), min(nF, int(np.ceil(l["window"][1] / FRAME)))
            print(f"  {lid}: {l['score']:.3f}  {l['text']}")
            for alt in alts:
                _, sc = align_window(em, f0, f1, [norm(w) for w in alt.split()], dictionary)
                print(f"  {'':{len(lid)}}  {sc:.3f}  {alt}")


if __name__ == "__main__":
    main()
