# HUMAN IN THE LOOP — music video

An original, code-rendered music video. A human approval operator sits at one
desk with a green button. Each approval makes the machine more capable and the
operator less necessary, until the loop closes without him.

Every frame is a pure function of song time: the live preview and the offline
export run the same composition on the same timebase, and seeking straight to
any timestamp gives the same picture as playing up to it.

Made in conversation with Claude (Opus 5.5) in Claude Code: concept, lyric
alignment, beat analysis, renderer and every scene. The song was made with Suno.

## Layout

| Path | What it is |
|---|---|
| `assets/audio/human-in-the-loop-v2.wav` | **the song used**: the second recording, 48 kHz 16-bit WAV, 266.4 s (byte-identical copy) |
| `assets/audio/human-in-the-loop.m4a` | the first recording (v1), kept for provenance; its timing data is in `data/v1/` |
| `assets/fonts/` | Inter Tight, Newsreader, Martian Mono (OFL, licences alongside) |
| `data/lyrics.json` | **performed-lyric timing** of the WAV: 66 lines, 432 words, start/end/confidence per word |
| `data/performed_lyrics.srt / .lrc / .tsv` | the same timing as line cues, word-level LRC, and a table |
| `data/audio.json` | tempo (127.0 BPM), bar grid, 25 sections, kick/snare/hat hits, loudness envelopes |
| `src/engine/beat.js` | the beat layer: per-bar weights of the new drum layers (8th kicks, 16th hats) and per-hit accents |
| `src/engine/timemap.js` | maps the edit's v1 bar positions onto the v2 bar grid, section by section |
| `analysis/` | the Python tools that measured all of the above (see below) |
| `src/config.js` | timebase, palette, type system |
| `src/engine/` | renderer: sub-frame accumulation, depth of field, bloom, grade, type geometry |
| `src/world/` | the sets: the floor (desk, loop, machine, city), chart, station/street, aerial, planet, lamp panel |
| `src/shots/` | the edit, one file per part of the song; each shot is anchored to measured bars and words |
| `tools/server.mjs` | static server for the preview |
| `tools/render.mjs` | offline renderer: headless Chrome (GPU) → GPU-packed YUV → ffmpeg |
| `PRODUCTION_NOTES.md` | checklist, decisions, provenance, timing verification, defects, review log |

## Requirements

Node 18+ (tested on 22), Google Chrome, ffmpeg with libx264 on the PATH, a GPU.
`npm install` once.

## Preview

```sh
npm install
npm run preview          # http://127.0.0.1:5180/
```

Add `?t=57.2` to start at a time, `&portrait=1` for the vertical layout,
`&res=0.5` for a lighter preview.

| Key | Action |
|---|---|
| space | play / pause (audio-locked) |
| ← / → | seek ±1 s (shift: ±5 s) |
| `,` / `.` | step one frame back / forward |
| `[` / `]` | previous / next shot |
| `l` | loop the current shot |
| `q` | draft (1 sample) / fine (16 sub-frames when paused) |
| `s` | shot list |
| `h` | hide all controls |

The scrub bar is divided into shots, with the measured song sections above it.

## Render

These are the exact commands that produced the delivered files.

```sh
# 1. the 3840x2160 60 fps master (genuine 4K: every layer is rendered at 3840x2160;
#    ~1 h on an RTX 4070 Ti, 16 sub-frames per frame; audio: the WAV encoded to AAC 320 kb/s)
node tools/render.mjs video --scale 2 --samples 16 --crf 17 --preset medium --out out/HUMAN_IN_THE_LOOP_2160p60.mp4

# 2. 1920x1080 60 fps, rendered natively (~24 min while sharing the GPU with the 4K render)
node tools/render.mjs video --samples 16 --crf 16 --preset medium --out out/HUMAN_IN_THE_LOOP_1080p60.mp4

# 3. vertical 1080x1920 hook cut (64.10 – 87.13 s: chorus 1 + the first refrain couplet, the portrait layout of the same shots), then edge fades
node tools/render.mjs video --portrait --from 64.10 --to 87.13 --samples 16 --crf 14 --preset slow --out out/wip/vertical_raw_v2.mp4
ffmpeg -i out/wip/vertical_raw_v2.mp4 -vf "fade=t=in:st=0:d=0.25,fade=t=out:st=22.03:d=1.0" \
  -af "afade=t=in:st=0:d=0.12,afade=t=out:st=21.83:d=1.2" -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
  -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a 320k \
  -movflags +faststart out/HUMAN_IN_THE_LOOP_vertical_hook_1080x1920.mp4

# 4. thumbnail: the title frame at 16.30 s, rendered at 4K and downscaled
node tools/render.mjs stills --scale 2 --samples 16 --t 16.3 --jpg --name thumb --out out/wip/thumb
ffmpeg -i out/wip/thumb/thumb_016.30.jpg -vf scale=1920:1080:flags=lanczos -q:v 2 out/HUMAN_IN_THE_LOOP_thumbnail_1920x1080.jpg

# verify any export: streams, audio offset against the song (start/middle/end), blank intervals
.venv/Scripts/python analysis/check_sync.py out/HUMAN_IN_THE_LOOP_2160p60.mp4
# (check_sync.py needs only numpy + ffmpeg: `pip install numpy` is enough if you skip the analysis venv)

# a quick draft of one passage
node tools/render.mjs video --from 52.7 --to 77 --samples 4 --preset veryfast --out out/wip/clip.mp4
```

Checks used during production:

```sh
node tools/render.mjs shotorder                 # every shot rendered forwards then backwards: must show no visible difference
node tools/render.mjs determinism --samples 4   # selected frames hashed in two render orders
node tools/check_preview.mjs                    # drives the preview's keyboard controls and reports what happened
```

```sh
node tools/render.mjs textcheck                 # finds lyric blocks that collide or leave the frame (add --portrait for the vertical layout)
node tools/fix_lyrics.mjs                       # re-applies the hand-checked word-start corrections to data/lyrics.json
# the thumbnail is its own staged shot (src/shots/thumb.js)
node tools/render.mjs stills --only thumb --scale 2 --samples 16 --t 1 --jpg --name thumb --out out/wip/thumb
```

Other modes: `stills --t 12.5,57.2`, `sheet --from 55 --to 72 --n 16`
(contact sheet; `--cuts` for every shot boundary), `perf --from 57 --to 59`,
`determinism`, `orderprobe`, `gpu`. Paths given to `--out` are relative to the
directory you run the command from. Every mode takes `--scale 2` and `--portrait`. `--samples N` averages N
sub-frames over half the frame time (motion blur, temporal and sub-pixel AA).

## Regenerate the timing data

The committed `data/*.json` is all the renderer needs. To rebuild it
(downloads ~4 GB of models; needs an NVIDIA GPU for reasonable speed):

```sh
uv venv .venv --python 3.11
uv pip install --python .venv/Scripts/python.exe torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124
uv pip install --python .venv/Scripts/python.exe demucs stable-ts librosa soundfile matplotlib "numpy<2.3"
cd analysis
# HITL_SONG=v2 (default) works on the WAV and writes data/; HITL_SONG=v1 works on the first recording and writes data/v1/
../.venv/Scripts/python -m demucs -n htdemucs_ft -d cuda -o stems ../assets/audio/human-in-the-loop-v2.wav
../.venv/Scripts/python transcribe.py        # what was sung (Whisper large-v3)
../.venv/Scripts/python align.py --alts      # word timing -> data/lyrics.json
../.venv/Scripts/python beats.py             # beat grid, hits, envelopes
../.venv/Scripts/python build_audio_json.py  # + section map -> data/audio.json
../.venv/Scripts/python qa_plot.py plot-final 72 85 post1   # spectrogram check of any passage
cd .. && node tools/export_lyrics.mjs
```

## Credits

Song: "Human in the Loop", supplied by the commissioner (made with Suno).
Fonts: Inter Tight, Newsreader, Martian Mono (SIL Open Font License 1.1).
Libraries: three.js, opentype.js, puppeteer-core, ws (MIT). Everything you see
is generated by the code in this repository; there are no image or video assets.
