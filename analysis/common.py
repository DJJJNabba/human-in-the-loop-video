"""Which recording the analysis tools work on.

    HITL_SONG=v2 (default)  assets/audio/human-in-the-loop-v2.wav  -> data/
    HITL_SONG=v1            assets/audio/human-in-the-loop.m4a     -> data/v1/
"""
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SONG = os.environ.get("HITL_SONG", "v2")
SONGS = {
    "v1": dict(
        src=ROOT / "assets" / "audio" / "human-in-the-loop.m4a",
        wav=HERE / "song_48k.wav",
        stems=HERE / "stems" / "htdemucs_ft" / "song_48k",
        work=HERE / "work",
        data=ROOT / "data" / "v1",
    ),
    "v2": dict(
        src=ROOT / "assets" / "audio" / "human-in-the-loop-v2.wav",
        wav=ROOT / "assets" / "audio" / "human-in-the-loop-v2.wav",
        stems=HERE / "stems" / "htdemucs_ft" / "human-in-the-loop-v2",
        work=HERE / "work_v2",
        data=ROOT / "data",
    ),
}
S = SONGS[SONG]
SRC, WAV, STEMS, WORK, DATA = S["src"], S["wav"], S["stems"], S["work"], S["data"]
VOCALS = STEMS / "vocals.wav"
WORK.mkdir(exist_ok=True)
DATA.mkdir(exist_ok=True)
