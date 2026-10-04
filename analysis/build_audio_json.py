"""analysis/work/audio_raw.json (beats.py) + the section map -> data/audio.json

The section map is in bars.  Bar n starts at first_downbeat + n * 4 * beat_period.
It was read off the per-bar loudness table printed by beats.py (stems: drums /
bass / vocals / other) together with data/lyrics.json, and follows the
recording, not the lyric sheet's arrangement tags:

  * every chorus opens with its first line sung over a one-bar STOP, and the
    band lands on the following bar line (57.14, 134.21, 199.72 s);
  * the last line of each chorus ("What do you need me for?" / "There isn't
    anymore") is again sung over a one-bar stop;
  * the post-chorus / outro couplets are separated by two instrumental bars;
  * the bridge has a four-bar instrumental interlude between its halves;
  * the "instrumental break" is one near-silent bar plus three bars of pulse;
  * after the spoken last line the band plays two loud bars, then decays.
"""
import json
from pathlib import Path

from common import DATA, SONG, WORK

HERE = Path(__file__).parent
ROOT = HERE.parent

# (id, first bar, last bar exclusive, note)
SECTIONS_V1 = [
    ("intro", 0, 4, "spoken line in bar 0, three bars of build"),
    ("verse1", 4, 20, "8 lines x 2 bars; drums thin out in bars 4 and 12"),
    ("pre1", 20, 28, "bar 20 turnaround; bar 27 is a full stop under 'visitor's card?'"),
    ("chorus1", 28, 36, "bar 28 stop under 'Keep me in the loop'; band in at bar 29; bar 35 instrumental"),
    ("chorus1_tag", 36, 37, "stop: 'What do you need me for?'"),
    ("post1", 37, 44, "couplet (37-38), 2 bars instrumental (39-40), couplet (41-42, bar 42 a stop), turnaround (43)"),
    ("verse2", 44, 60, "8 lines x 2 bars, full band"),
    ("turn2", 60, 61, "one-bar instrumental turnaround"),
    ("pre2", 61, 68, "bar 67 is a full stop under 'before I can ask'"),
    ("chorus2", 68, 76, "bar 68 stop; band in at bar 69; bar 75 instrumental"),
    ("chorus2_tag", 76, 77, "stop: 'What do you need me for?'"),
    ("hit", 77, 78, "one-bar instrumental hit into the bridge"),
    ("bridge_a", 78, 86, "red button, 4 lines x 2 bars"),
    ("bridge_inter", 86, 90, "bar 86 thin, bars 87-89 full instrumental"),
    ("bridge_b", 90, 98, "train / windows / line / voices; bar 97 a stop under 'voices like mine'"),
    ("break", 98, 102, "bar 98 near silence, bars 99-101 mechanical pulse"),
    ("final", 102, 110, "bar 102 pickup line; band in at bar 103; bar 109 instrumental"),
    ("final_tag", 110, 111, "stop: 'There isn't anymore'"),
    ("outro", 111, 120, "couplet (111-112), 2 bars instrumental (113-114), couplet (115-116, bar 116 a stop), 3 bars instrumental (117-119)"),
    ("spoken", 120, 121, "near silence: 'No response required.'"),
    ("coda", 121, 124, "two loud bars (121-122), one bar of decay (123)"),
    ("tail", 124, 126, "silence to the end of the file"),
]


# v2: read off the per-bar table printed by beats.py for the new recording
SECTIONS_V2 = [
    ("intro", 0, 9, "4 bars of pad; spoken line from the end of bar 4 over a stop (bar 5); 3-bar build"),
    ("verse1", 9, 26, "8 lines x 2 bars; band from bar 10; bar 25 turnaround"),
    ("pre1", 26, 33, "lines on bars 26, 28, 29.7, 31.7"),
    ("pre1_stop", 33, 34, "stop under 'visitor's card?'; chorus pickup 'Keep' at its end"),
    ("chorus1", 34, 41, "band in at 34; bar 40 'loop' held"),
    ("chorus1_tag", 41, 42, "stop: 'What do you need me for?'"),
    ("post1", 42, 50, "four refrain lines x 2 bars, 16th hats"),
    ("breakdown", 50, 51, "one bar of pad, no drums"),
    ("verse2", 51, 68, "bar 51 near-stop with the first line; band from 52; 'anywhere' held over 66-67"),
    ("pre2", 68, 75, "bass drops out on alternate bars; bar 74 builds"),
    ("chorus2", 75, 83, "bar 75 pickup over no bass; band slams in at 76, ~50 % louder than chorus 1"),
    ("chorus2_tag", 83, 84, "stop: 'What do you need me for?'"),
    ("hit", 84, 86, "two instrumental bars; bridge pickup at the end of bar 85"),
    ("bridge", 86, 102, "eight lines x 2 bars, no interlude; 8th-note kick drive"),
    ("bridge_stop", 102, 104, "'mine' held over two stop bars"),
    ("break", 104, 112, "eight bars, full band, 16th hats: the mechanical pulse"),
    ("final_stop", 112, 113, "'Cut me from the loop' (pickup at the end of 111), silence 213.0-213.4"),
    ("final", 113, 119, "stripped: vocals and light drums, no bass"),
    ("final_tag", 119, 120, "stop: 'There isn't anymore'"),
    ("outro", 120, 128, "four refrain lines x 2 bars, full band, 16th hats"),
    ("riser", 128, 131, "drums out, pads building"),
    ("spoken", 131, 132, "stop: 'No response required.'"),
    ("coda", 132, 139, "seven bars, the loudest of the song: double kicks, 16th hats"),
    ("decay", 139, 140, "bass rings out; silence from ~264.8 s"),
    ("tail", 140, 141, "silence to the end of the file (266.4 s)"),
]


def main():
    SECTIONS = SECTIONS_V1 if SONG == "v1" else SECTIONS_V2
    raw = json.loads((WORK / "audio_raw.json").read_text(encoding="utf-8"))
    period, phase, mod = raw["beat_period"], raw["phase"], raw["downbeat_mod"]
    first_db = phase + period * mod
    while first_db - 4 * period >= -1e-6:
        first_db -= 4 * period
    bar = 4 * period
    dur = raw["duration"]
    out = dict(
        duration=dur,
        bpm=raw["bpm"],
        beat_period=period,
        bar_period=round(bar, 5),
        first_downbeat=round(first_db, 4),
        note="beat k is at first_downbeat + k * beat_period (k may be negative for the pickup); bar n at first_downbeat + n * bar_period",
        sections=[
            dict(id=s, bar0=a, bar1=b, start=round(first_db + a * bar, 3), end=round(min(dur, first_db + b * bar), 3), note=n)
            for s, a, b, n in SECTIONS
        ],
        kick=raw["kick"],
        snare=raw["snare"],
        hat=raw["hat"],
        env_fps=raw["env_fps"],
        env=raw["env"],
    )
    (DATA / "audio.json").write_text(json.dumps(out), encoding="utf-8")
    for s in out["sections"]:
        print(f"{s['id']:13s} bars {s['bar0']:3d}-{s['bar1']:3d}  {s['start']:7.2f} - {s['end']:7.2f}")
    print(f"bpm {out['bpm']}  beat {period}  bar {out['bar_period']}  first downbeat {out['first_downbeat']}")


if __name__ == "__main__":
    main()
