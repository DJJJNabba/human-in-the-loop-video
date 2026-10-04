"""Verify an exported video against the source song.

  python analysis/check_sync.py out/HUMAN_IN_THE_LOOP_2160p60.mp4 [--offset 0]

* streams: dimensions, frame rate, frame count, durations, start times, codecs;
* audio offset: the export's audio is cross-correlated with the original song
  in three windows (start, middle, end); the lag must be ~0 ms everywhere;
* blank intervals: mean luma of every frame (sampled at 10 fps) — reports any
  run of near-black frames longer than 0.5 s outside the intended fades.
`--offset` is the song time of the export's first frame (for excerpts).
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
from common import SRC as SONG


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def pcm(path, start, dur, sr=16000):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", str(path), "-map", "0:a:0", "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def lag_ms(a, b, sr=16000, max_ms=200):
    n = min(len(a), len(b))
    a, b = a[:n] - a[:n].mean(), b[:n] - b[:n].mean()
    m = int(sr * max_ms / 1000)
    F = np.fft.rfft(a, 2 * n), np.fft.rfft(b, 2 * n)
    cc = np.fft.irfft(F[0] * np.conj(F[1]))
    cc = np.concatenate([cc[-m:], cc[: m + 1]])
    k = int(np.argmax(cc)) - m
    peak = cc.max() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-12)
    return 1000 * k / sr, peak


def main():
    path = Path(sys.argv[1])
    offset = float(sys.argv[sys.argv.index("--offset") + 1]) if "--offset" in sys.argv else 0.0
    info = probe(path)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    print(f"file      {path}  ({int(info['format']['size']) / 1e6:.1f} MB, {float(info['format']['bit_rate']) / 1e6:.1f} Mbit/s)")
    print(f"video     {v['codec_name']} {v['width']}x{v['height']} {v['r_frame_rate']} fps  {v.get('nb_frames')} frames  {float(v['duration']):.3f} s  start {v['start_time']}  {v.get('pix_fmt')} {v.get('color_space')}/{v.get('color_transfer')}/{v.get('color_range')}")
    if a is None:
        print("AUDIO     MISSING")
        sys.exit(1)
    print(f"audio     {a['codec_name']} {a['sample_rate']} Hz {a['channels']} ch  {float(a['duration']):.3f} s  start {a['start_time']}")
    dur = float(v["duration"])
    print("audio offset against the source song (positive = export audio late):")
    for name, t in (("start", 0.0), ("middle", dur / 2 - 4), ("end", max(0.0, dur - 12))):
        w = min(8.0, dur - t)
        x = pcm(path, t, w)
        y = pcm(SONG, t + offset, w)
        if np.abs(y).max() < 1e-4:
            print(f"  {name:6s} t={t:7.2f}s  (source silent here)")
            continue
        lag, peak = lag_ms(x, y)
        print(f"  {name:6s} t={t:7.2f}s  lag {lag:+6.2f} ms   correlation {peak:.3f}")
    # blank runs
    W, H = 160, 90
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"fps=10,scale={W}:{H}", "-pix_fmt", "gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W)
    flat = frames.reshape(len(frames), -1)
    luma = flat.mean(axis=1)
    # blank = nothing in the frame is bright (a dark graphic frame with white type is not blank)
    p99 = np.percentile(flat, 99, axis=1)
    dark = p99 < 14
    runs, i = [], 0
    while i < len(dark):
        if dark[i]:
            j = i
            while j < len(dark) and dark[j]:
                j += 1
            if (j - i) / 10 >= 0.5:
                runs.append((i / 10 + offset, j / 10 + offset))
            i = j
        else:
            i += 1
    print(f"luma      mean {luma.mean():.1f}, min {luma.min():.1f} (frame at {np.argmin(luma) / 10 + offset:.1f} s)")
    print("blank runs (99th-pct luma < 14) >= 0.5 s:", ", ".join(f"{a:.1f}-{b:.1f}s" for a, b in runs) if runs else "none")
    print(f"first frame luma {luma[0]:.1f}, last frame luma {luma[-1]:.1f}")


if __name__ == "__main__":
    main()
