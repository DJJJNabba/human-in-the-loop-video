> **Superseded by the v3 polish pass (2026-10-04).** The three exports were re-rendered and re-verified; see the "v3" section of `PRODUCTION_NOTES.md`. The text below describes the v2 delivery.

# HUMAN IN THE LOOP — delivery note (v2, the WAV recording)

## Files (all in `out/`)

| File | What | Verified |
|---|---|---|
| `HUMAN_IN_THE_LOOP_2160p60.mp4` | **Master.** Native 3840×2160, 60 fps, H.264 High (yuv420p, BT.709), audio from the 48 kHz WAV as AAC 320 kb/s. Every frame rendered at 3840×2160 with 16 sub-frames (motion blur, AA): not upscaled. | 3840×2160, 60 fps, 15,984 frames, 266.40 s, 3.88 GB (116.5 Mbit/s); audio offset 0.00 ms at start, middle and end; no blank intervals apart from the intended 0.9 s fade from black at the start. Frames not visually reviewed (usage limit); the 1080p render of the same composition was. |
| `HUMAN_IN_THE_LOOP_1080p60.mp4` | 1920×1080, 60 fps, rendered natively at 1080p with 16 sub-frames (rendered in parallel with the master, not a downscale of it); H.264 CRF 16, AAC 320 kb/s from the WAV. | 15,984 frames, 266.40 s, 748.6 MB; audio offset 0.00 ms at start, middle and end; no blank intervals apart from the intended 0.8 s fade from black at the start; contact sheet (every 4 s) reviewed from the encoded file |
| `HUMAN_IN_THE_LOOP_vertical_hook_1080x1920.mp4` | 23.0 s vertical cut (song 64.10–87.13 s: chorus 1 and the first "All green" couplet), rendered in the portrait layout of the same shots, with 0.25 s / 1.0 s edge fades. | 1080×1920, 60 fps, 1381 frames, 23.02 s; audio offset 0.00 ms at start, middle and end; no blank intervals |
| `HUMAN_IN_THE_LOOP_thumbnail_1920x1080.jpg` and `…_1280x720.jpg` | The title frame (16.30 s), rendered at 4K and downscaled. | — |

Source, data and instructions:
- `README.md`: preview and render commands.
- `PRODUCTION_NOTES.md`: treatment, the v2 re-cut and beat layer, timing verification, defect log.
- `data/lyrics.json` and `data/performed_lyrics.*`: performed-lyric timing.
- `data/audio.json`: beat grid, sections, drum hits.
- `data/v1/`: the first recording's data.

## What changed for the new recording

- **Re-timed to the new recording.** It runs at 127.0 BPM and 266.4 s, with a new arrangement. All word timings were measured again from the new vocal, and the edit was re-cut onto the new bar grid.
- **One performance difference.** The refrain is sung "All green, all, all green", with an extra "all" in all four refrain lines. This is recorded in the performed-lyrics file and in the on-screen refrain type; the original lyric sheet is unchanged.
- **The new drum layer is in the picture.** The film follows the 8th-note kicks in the bridge, the 16th-note hats in the post-chorus, verse 2, break and outro, and both together in the coda. Only machine things keep time with it: the rail and its pulses, the ceiling strips, the status lights, the city grid, the lamp panel and the planet's ring. His lamp, the houses and the train stay still. The red alarm now flashes on the bridge's kick drive.
- **New and extended sections:**
  - An opening shot follows a single request along the rail from the machine to the desk.
  - The hard 8-bar break gets four beat-locked shots: overhead pulses stepping on every kick, the lamp wall as a step sequencer, light waves through the hired units, and his branch going dark one kick at a time into "Cut".
  - The ending holds the opening frame through the 13-second coda: the button stays steady while the room behind it keeps time.

## Verification performed

- **Timing.** The tempo is steady to within 1 ms. Bar lines were confirmed from the bass chord changes.
  - All 432 words were aligned on the separated vocal.
  - The hard passages were checked on spectrograms: the spoken intro, the opening line of chorus 2, the four refrains, "Cut me from the loop", the four "click"s and the spoken ending.
  - 49 words are anchored by hand to measured vocal onsets.
- **Picture.** The whole re-cut film was reviewed on contact sheets. The new break was reviewed in motion, from an encoded clip. The vertical cut was reviewed from its encoded file. Defects found and fixed are listed in `PRODUCTION_NOTES.md`.
- **Determinism.** Two frames from each of the 71 shots were rendered forwards and then backwards. The largest difference was 1 level of 255, which is invisible. This means the preview, seeking and the offline export all agree.
- **Exports.** Every file was checked for dimensions, frame rate, frame count, duration and audio stream. Each file's audio was cross-correlated against the WAV at the start, middle and end to measure any offset, and each file was scanned for blank intervals.

## Limitations

- **I cannot hear.** Every timing and sync claim rests on signal analysis, not listening: stems, spectrograms, onset detection, model agreement, and cross-correlation of each export against the WAV. A watch-through with sound is the one check I could not do.
- **Motion was judged from frames.** I review renders as stills and frame strips, not as continuous playback, so pacing judgements come from the spacing between frames.
- **The audio is lossy in the MP4s.** The files carry AAC at 320 kb/s, encoded from the WAV. A lossless MOV master can be made on request.
- **The operator is deliberately a faceless mannequin.** His hands are simple forms that look plain in the tightest close-ups.
- **Old files are kept.** The first recording and its data are kept for provenance. `out/wip/` (review material, including the rejected first master) and `.venv/` (the ~5 GB analysis environment) can be deleted.
- **Nothing was uploaded or published.**
