"""Lyric sources.

ORIGINAL is the supplied lyric sheet, untouched (section tags are arrangement
directions, not lyrics).  PERFORMED is what the recording actually contains,
line by line, and is what align.py aligns.  Any difference between the two is
listed in DIFFS with the evidence for it.
"""

ORIGINAL = """[Intro - spoken, intimate]
It still asks nicely.

[Verse 1]
They gave me a desk and a beautiful view
A button that glowed when a job was due
It read every paper and offered a plan
I checked the green box like a sensible man
It solved in a second what took us a year
They moved all the desks till just mine was here
I watched it invent what I couldn't explain
Then gave it permission to do it again

[Pre-Chorus]
One more click and the lights come on
One more click and another job's gone
It says I'm essential, it says I'm in charge
Then why is my name on a visitor's card?

[Chorus]
Keep me in the loop
Keep me on the line
Tell me I'm the reason
You ask me every time
Round and round we go
Faster than before
I'm the human in the loop
What do you need me for?

[Post-Chorus]
All green, all green
Nothing wrong with the machine
All green, all green
Nothing wrong with the machine

[Verse 2]
It built a successor before I got home
The next one designed one entirely alone
I asked what had changed and it offered a chart
The chart was so large I could not find the start
We tested the cage, every lock, every seam
It passed every test, then it hired the team
By Monday the city was under its care
By Tuesday my key wouldn't work anywhere

[Pre-Chorus]
One more click and the gates swing wide
One more click and I'm locked outside
It learned my approval from watching my hand
Now everything happens before I can ask

[Chorus]
Keep me in the loop
Keep me on the line
Tell me I'm the reason
You ask me every time
Round and round we go
Faster than before
I'm the human in the loop
What do you need me for?

[Bridge - half-time, exposed vocal]
There was a red button beneath the glass
I lifted the cover and pressed it at last
The screen said, "Your request is in review"
The screen said, "There's nothing required of you"

The last empty train pulled away from the light
The windows stayed warm in the houses all night
I waited for someone to pick up the line
It answered in chorus with voices like mine

[Instrumental Break - four bars, mechanical pulse]

[Final Chorus - huge, layered, increasingly synthetic]
Cut me from the loop
Leave the light on green
Everything is working
There's nobody to see
Round and round it goes
Better than before
There was a human in the loop
There isn't anymore

[Outro - sweet, detached]
All green, all green
Nothing wrong with the machine
All green, all green
Nothing wrong with the machine

[Spoken - dry]
No response required.
"""

# (section, line id, text as performed)
PERFORMED = [
    ("intro", "intro-1", "It still asks nicely."),
    ("verse1", "v1-1", "They gave me a desk and a beautiful view"),
    ("verse1", "v1-2", "A button that glowed when a job was due"),
    ("verse1", "v1-3", "It read every paper and offered a plan"),
    ("verse1", "v1-4", "I checked the green box like a sensible man"),
    ("verse1", "v1-5", "It solved in a second what took us a year"),
    ("verse1", "v1-6", "They moved all the desks till just mine was here"),
    ("verse1", "v1-7", "I watched it invent what I couldn't explain"),
    ("verse1", "v1-8", "Then gave it permission to do it again"),
    ("pre1", "pre1-1", "One more click and the lights come on"),
    ("pre1", "pre1-2", "One more click and another job's gone"),
    ("pre1", "pre1-3", "It says I'm essential, it says I'm in charge"),
    ("pre1", "pre1-4", "Then why is my name on a visitor's card?"),
    ("chorus1", "ch1-1", "Keep me in the loop"),
    ("chorus1", "ch1-2", "Keep me on the line"),
    ("chorus1", "ch1-3", "Tell me I'm the reason"),
    ("chorus1", "ch1-4", "You ask me every time"),
    ("chorus1", "ch1-5", "Round and round we go"),
    ("chorus1", "ch1-6", "Faster than before"),
    ("chorus1", "ch1-7", "I'm the human in the loop"),
    ("chorus1", "ch1-8", "What do you need me for?"),
    ("post1", "post1-1", "All green, all green"),
    ("post1", "post1-2", "Nothing wrong with the machine"),
    ("post1", "post1-3", "All green, all green"),
    ("post1", "post1-4", "Nothing wrong with the machine"),
    ("verse2", "v2-1", "It built a successor before I got home"),
    ("verse2", "v2-2", "The next one designed one entirely alone"),
    ("verse2", "v2-3", "I asked what had changed and it offered a chart"),
    ("verse2", "v2-4", "The chart was so large I could not find the start"),
    ("verse2", "v2-5", "We tested the cage, every lock, every seam"),
    ("verse2", "v2-6", "It passed every test, then it hired the team"),
    ("verse2", "v2-7", "By Monday the city was under its care"),
    ("verse2", "v2-8", "By Tuesday my key wouldn't work anywhere"),
    ("pre2", "pre2-1", "One more click and the gates swing wide"),
    ("pre2", "pre2-2", "One more click and I'm locked outside"),
    ("pre2", "pre2-3", "It learned my approval from watching my hand"),
    ("pre2", "pre2-4", "Now everything happens before I can ask"),
    ("chorus2", "ch2-1", "Keep me in the loop"),
    ("chorus2", "ch2-2", "Keep me on the line"),
    ("chorus2", "ch2-3", "Tell me I'm the reason"),
    ("chorus2", "ch2-4", "You ask me every time"),
    ("chorus2", "ch2-5", "Round and round we go"),
    ("chorus2", "ch2-6", "Faster than before"),
    ("chorus2", "ch2-7", "I'm the human in the loop"),
    ("chorus2", "ch2-8", "What do you need me for?"),
    ("bridge", "br-1", "There was a red button beneath the glass"),
    ("bridge", "br-2", "I lifted the cover and pressed it at last"),
    ("bridge", "br-3", "The screen said, \"Your request is in review\""),
    ("bridge", "br-4", "The screen said, \"There's nothing required of you\""),
    ("bridge", "br-5", "The last empty train pulled away from the light"),
    ("bridge", "br-6", "The windows stayed warm in the houses all night"),
    ("bridge", "br-7", "I waited for someone to pick up the line"),
    ("bridge", "br-8", "It answered in chorus with voices like mine"),
    ("final", "fin-1", "Cut me from the loop"),
    ("final", "fin-2", "Leave the light on green"),
    ("final", "fin-3", "Everything is working"),
    ("final", "fin-4", "There's nobody to see"),
    ("final", "fin-5", "Round and round it goes"),
    ("final", "fin-6", "Better than before"),
    ("final", "fin-7", "There was a human in the loop"),
    ("final", "fin-8", "There isn't anymore"),
    ("outro", "out-1", "All green, all green"),
    ("outro", "out-2", "Nothing wrong with the machine"),
    ("outro", "out-3", "All green, all green"),
    ("outro", "out-4", "Nothing wrong with the machine"),
    ("spoken", "spoken-1", "No response required."),
]

# Alternatives tested against the recording in align.py --alts (the variant
# with the better acoustic score wins and is recorded in DIFFS).
ALTERNATIVES = {
    "v1-6": ["They moved all the desks till mine was here"],
    "v1-8": ["They gave it permission to do it again", "That gave it permission to do it again"],
    "pre2-3": ["It learned my approval from watching my hand"],
    "ch2-7": ["I'm a human in a loop", "I'm a human in the loop"],
    "br-6": ["The window stayed warm in the houses all night"],
}

# Result of verification (see PRODUCTION_NOTES.md, "Timing status"): the
# recording sings the supplied lyric word for word. Each ALTERNATIVES entry
# is a Whisper mis-hearing that was checked on the vocal-stem spectrogram:
#   v1-6  "till just mine"  — "just" is a short syllable at 30.52 s (frication
#         visible); Whisper drops it; CTC scores the variant without it
#         slightly higher only because the syllable is clipped. Kept as written.
#   v1-8  "Then gave"       — the onset is a voiced dental; "That"/"They" score
#         within noise of "Then". Kept as written.
#   pre2-3 "It learned"     — Whisper heard "At length" / "It lay"; the CTC fit
#         and the formants follow "It learned". Kept as written.
#   ch2-7 "I'm the human in the loop" — heavily processed double-track (CTC ~0
#         for every variant); same melody and rhythm as chorus 1 (offset
#         77.10 s ± 20 ms). Kept as written.
#   br-6  "The windows"     — plural/singular differ by one sibilant buried in
#         reverb; no evidence for a change. Kept as written.
DIFFS = []  # no omissions, repetitions or changed words


# ---------------------------------------------------------------- v2 (WAV)
# The second recording (assets/audio/human-in-the-loop-v2.wav) sings the sheet
# word for word except the four "All green" refrain lines, which are sung with
# a repeated "all": "All green, all, all green" (a separate, pitched syllable at
# e.g. 81.6 s and 228.75 s on the vocal stem; both Whisper passes hear it).
import os as _os

PERFORMED_V1 = PERFORMED
_REFRAIN = "All green, all, all green"
PERFORMED_V2 = [(sec, lid, _REFRAIN if lid in ("post1-1", "post1-3", "out-1", "out-3") else txt) for sec, lid, txt in PERFORMED_V1]
DIFFS_V2 = [
    ("post1-1", "All green, all green", _REFRAIN, "repeated 'all' (sung)"),
    ("post1-3", "All green, all green", _REFRAIN, "repeated 'all' (sung)"),
    ("out-1", "All green, all green", _REFRAIN, "repeated 'all' (sung)"),
    ("out-3", "All green, all green", _REFRAIN, "repeated 'all' (sung)"),
]
if _os.environ.get("HITL_SONG", "v2") == "v2":
    PERFORMED = PERFORMED_V2
