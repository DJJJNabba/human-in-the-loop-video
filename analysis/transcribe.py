"""Step 1 of lyric timing: what was actually sung?

Free transcription (no lyric prompt) of the Demucs vocal stem and of the full
mix with Whisper large-v3 via stable-ts, with word timestamps.  The result is
only used to (a) detect omissions / repeats / changed words against the
supplied lyrics and (b) cross-check the forced alignment in align.py.

Run:  .venv/Scripts/python analysis/transcribe.py
Out:  analysis/work/whisper_vocals.json, analysis/work/whisper_mix.json
"""
import json
import sys
from pathlib import Path

import stable_whisper

from common import VOCALS, WAV, WORK

SOURCES = {
    "vocals": VOCALS,
    "mix": WAV,
}


def main():
    model = stable_whisper.load_model("large-v3", device="cuda")
    for name, path in SOURCES.items():
        result = model.transcribe(
            str(path),
            language="en",
            word_timestamps=True,
            vad=False,
            regroup=False,
            condition_on_previous_text=False,
            temperature=0.0,
            verbose=None,
        )
        segs = []
        for seg in result.segments:
            segs.append(
                {
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "text": seg.text.strip(),
                    "words": [
                        {
                            "w": w.word.strip(),
                            "start": round(w.start, 3),
                            "end": round(w.end, 3),
                            "p": round(float(w.probability), 3),
                        }
                        for w in seg.words
                    ],
                }
            )
        (WORK / f"whisper_{name}.json").write_text(json.dumps(segs, indent=1), encoding="utf-8")
        print(f"=== {name} ===")
        for s in segs:
            print(f"{s['start']:7.2f} {s['end']:7.2f}  {s['text']}")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
