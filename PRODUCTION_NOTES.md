# HUMAN IN THE LOOP — production notes

Living document. Checklist first, then decisions, provenance, timing, defects.

## Checklist

- [x] Audio copied into the project, probed (242.16 s, Opus 48 kHz stereo)
- [x] References downloaded and studied (frames, motion strips, transcripts, repo)
- [x] Stems (Demucs htdemucs_ft), free transcription (Whisper large-v3)
- [x] Word-level performed-lyric timing → `data/lyrics.json` (verified, see Timing status)
- [x] Tempo / bars / sections / drum hits / envelopes → `data/audio.json`
- [x] Engine: deterministic renderer, sub-frame accumulation, DOF, bloom, grade
- [x] Export pipeline proven with a short clip **with audio** (3 s at 1080p and 4K; streams, colour tags, loudness checked)
- [x] Local preview (audio, seek, frame step, scene nav, hide UI) — driven and checked by `tools/check_preview.mjs`
- [x] Proof passage (operator + loop + integrated lyrics + transition), reviewed (52.7–77 s, motion strips inspected)
- [x] Every section built: intro, verse 1, pre 1, chorus 1, post 1, verse 2, pre 2, chorus 2, bridge, interlude, break, final, outro, ending
- [x] Full-length rough cut (1080p, 4 sub-frames, 10.5 min), reviewed end to end from the encoded file: 2 contact sheets (every 2.5 s), 6 motion strips, sync + blank check
- [x] Revision pass on observed defects (loop trace for overhead shots, successor finish, portrait framing, seek determinism)
- [x] Determinism proven: frames bit-identical regardless of render order (`node tools/render.mjs determinism`, with and without sub-frames)
- [ ] Final master render, verified (dimensions, fps, duration, audio, start/end, no blanks)
- [x] Vertical 1080x1920 cut (55.22–78.34 s, 23.1 s) in the portrait layout, verified (0.00 ms audio offset)
- [x] Thumbnail (title frame at 8.30 s, 1920x1080 and 1280x720)
- [ ] Delivery note

## v3: polish pass (2026-10-04)

Everything below this section describes earlier versions; this is what changed last.

- **Depth of field** is now sampled through the lens: each of the 16 sub-frames looks through a different
  point of the aperture (camera shifted, projection sheared about the focus plane); a gather pass with
  per-pixel rotated taps fills the gaps. Foreground blurs over background; highlights open into discs.
- **Lyric timing**: 49 word starts corrected against vocal-stem spectrograms (`tools/fix_lyrics.mjs`): the
  processed "All green" refrains (anchors sat ~60 ms early), "me in the loop" in chorus 2 (a quarter-second
  early), "Keep" in ch2-2, "Everything", and others. Words now begin arriving 4 frames before the syllable.
- **Drum hits snapped to the sixteenth-note grid** (`engine/timing.js`): single onsets were measured to
  within +-40 ms, the tempo to 1 ms. The 8-bar break is driven by the grid itself: a hit on every quarter,
  hats on sixteenths; each beat is a camera step and a light event. New shot `brk-wall-b`.
- **Type collisions**: `render.mjs textcheck` projects every visible word and reports overlaps between
  blocks and flat type leaving the frame. 20 findings fixed; now none (landscape and the portrait hook).
  Bright scenes get a soft scrim behind flat type (`scrim()` in `shots/common.js`).
- **The tick** in v1-4 is one mitred stroke, drawn along its length.
- **The invented object** is a sphere-traced implicit surface (gyroid lattice ball round a lit core, three
  rings carrying signals), writing real depth (`world/props.js`).
- **The rise to orbit** is one exponential move across three sets with matched height and rate at each cut;
  the planet shot starts 95 km over the same loop, drawn on the surface.
- **The planet**: fbm continents, clouds, ice, limb atmosphere, light grid antialiased by screen-space
  footprint, green arriving as a front. The beat travels round the ring; nothing on the planet flashes.
  Defect found in the first full render: `pow()` of a slightly negative base gave NaN pixels that the bloom
  spread into 27 half-dark frames. Clamped; verified by a per-frame luma scan of the encoded files.
- **The platform scene**: the operator sits on a bench with his back to camera, a help point ringing beside
  him, warm windows across the track. The hired units gained plinths, seams, vents and floor light.
- **Thumbnail** is its own staged shot (`shots/thumb.js`).
- Verified: 1080p60, 2160p60 and the vertical cut all at 0.00 ms audio offset (start, middle, end), no blank
  runs beyond the opening fade, no single-frame blips except three deliberate lamp-wall flashes
  (202.4-203.8 s); `shotorder`: 144 frames, largest difference 1 level of 255.
- Still true: nobody has checked this with their ears. All sync claims rest on signal analysis.

## v2: the WAV recording (2026-10-03, evening)

The commissioner supplied a new recording (`assets/audio/human-in-the-loop-v2.wav`,
48 kHz/16-bit, 266.4 s, a different Suno generation: harder drums, new
arrangement). Everything below "Timing status — FINAL" describes v1; v1 data is
kept in `data/v1/` and reproducible with `HITL_SONG=v1`.

**Measured:** 127.0 BPM (127.001), steady (≤ 1 ms local phase error per third).
Bar 1.8898 s, first downbeat 0.205 s. Downbeat phase from bass chord changes
(novelty 0.17 vs ≤ 0.04).

**Performed lyric:** word for word as the sheet, except the four "All green"
lines, which are sung **"All green, all, all green"** (a separate pitched
syllable, e.g. 81.6 s, 228.75 s; both Whisper passes hear it). Recorded in
`analysis/lyrics_src.py` (`PERFORMED_V2`, `DIFFS_V2`) and in `data/lyrics.json`;
the original sheet is untouched. 432 words: 151 high, 218 medium, 49 anchored,
14 low (small function words; "Cut" and "mine" verified on onsets).
Hard spots checked on spectrograms: spoken intro (9.58–11.2 s; Whisper's 0.9 s
placement was wrong), chorus 2's first line (sung faster; CTC drifted a line —
anchored), the four refrains (processed; anchored to onsets, cross-checked
against each other), "Cut me from the loop" (211.56 s, after the 15 s break;
Whisper's 204 s was wrong), the four "click"s (land on the consonant transients).

**Arrangement differences that changed the edit:** 4½-bar pad intro; refrain
lines of 2 bars each with no gaps; chorus 2 ~50 % louder; no bridge interlude;
"mine" held over two stop bars then an **8-bar full hard break**; stripped
final chorus; continuous outro; 3-bar riser, spoken line over a stop, then a
**13 s loud coda**.

**The new drum layer** (counted per bar from the drum stem): 8th-note kicks in
the bridge (7/bar), 16th hats in post-chorus / verse 2 / break / outro
(10–12/bar), both plus extra snares in the coda.

**What was added to the film for it:**
- `engine/beat.js`: per-bar weights for the louder kit, the kick drive and the
  hat ticks, and per-hit accents. Rule: **only machine things keep time** — the
  rail and pulses, ceiling strips, status lights, the city grid, the lamp
  panel, the planet's ring. His lamp, the houses and the train stay still.
- Global accent (post): tiny exposure/glow/zoom punch on weighted kicks,
  chromatic aberration on snares, a 0.14° alternating camera roll on snares;
  switched off in quiet/human shots (`beat: 0`).
- The red alarm flashes on the bridge's 8th-note kicks.
- New opening shot (`intro-a`): a single request travels the rail from the
  machine to the desk during the pad, establishing the loop's geography.
- New 8-bar break: overhead pulses stepping on every kick (`brk-pulse`), the
  lamp wall as a step sequencer — playhead on hats, blocks on kicks, rows on
  snares (`brk-wall`), light waves through the hired units on every kick
  (`brk-units`), his branch going dark one section per kick into "Cut"
  (`brk-dark`). The dark map with the waiting request now sits under the held
  "mine".
- The ending holds the opening frame for the whole coda; the button, the words
  and the camera stay still while the out-of-focus room keeps time with the
  loudest music in the song.

**Re-cut:** `engine/timemap.js` maps the v1 bar positions used inside shots
onto v2 section by section; structurally changed sections are re-cut on v2
bars. The edit list was then checked line by line: every chorus cut now falls
between two sung lines on a beat subdivision. Defects found and fixed in
review: verse-2 shots bypassed the map and landed in the post-chorus; two
camera paths passed through the white units; the opening was too dark to see
the request; the portrait refrain clipped; a syntax error in a re-cut file made
the renderer wait instead of failing (render.mjs now fails fast on parse errors).
Order test after the re-cut: 142 frames, no visible differences.

## Treatment (as built)

One floor, one desk, one loop. The desk sits at the south end of a rounded
rail; the machine stands at the north end; pulses (requests) travel from the
machine down the west side, across the desk **through the operator's approval
gate**, and back up the east side. The audience learns this map from above in
chorus 1, so they can see the change in chorus 2 and the ending in the final.

| Section | Time | What happens | The loop |
|---|---|---|---|
| Intro | 0–9 | Macro on the green button; one request waits. Title builds over the desk. First press. | human-gated |
| Verse 1 | 9–40 | Pride: a desk among many with a view; papers stream into the machine; a green box ticked full-frame; twelve month slabs fall in "a second"; every other desk sinks into the floor; it invents a seamless object, then copies it on every eighth note. | human-gated, one press per bar |
| Pre 1 | 40–55 | "Lights come on" (strips stutter on); a staff name struck out; the console says YOU ARE ESSENTIAL / IN CHARGE; the badge turns over — VISITOR. | |
| Chorus 1 | 55–72 | Overhead map: lyrics fill the loop's interior; presses double, then quadruple ("faster than before"); the diagram labels HUMAN / APPROVAL / MACHINE. | **includes the human** |
| Post 1 | 72–86 | "All green": a lamp panel lights word by word; then a wall of lamps spells ALL / GREEN. | |
| Verse 2 | 86–117 | Unease: successors rise (black → brushed → white); he approves late; the chart outgrows the frame; the cage passes every test; white units rise where the desks were; the city's windows fall into an identical grid; his card reads VISITOR / NOT REQUIRED. | |
| Pre 2 | 119–132 | Gates lift and a bypass chord rises from the floor; glass closes between him and the machines; his press, then the machine's arm makes the identical press (matched framing). | **bypass built** |
| Chorus 2 | 132–151 | Same map, split by glass: pulses take the green chord, his branch goes dim; "I'm the human in the loop" now sits small inside a circuit he is outside. | **routes around him** |
| Bridge | 151–167 | The only red: a real shutdown button under a cover. Alarm. The console: YOUR REQUEST IS IN REVIEW. "There's nothing required of you" written on the glass. Machines keep running green. | |
| Interlude / bridge b | 167–190 | He gets up. Outside: the last train, lit and empty, leaves on time; warm windows, no one; he waits on the platform; inside, rows of figures exactly like him answer. | |
| Break | 190–198 | Silence: the map, dark, one request waiting at an empty desk. Then the mechanical pulse: the bypass steps on every kick; his branch goes dark section by section. | |
| Final | 198–215 | "Cut": his branch flashes and slides out of the circuit. The button stays lit. Everything is working; nobody to see; the camera rises: the same geometry tiles a floor, a district, a region — then a ring round a planet lit on a grid. | **closes without him** |
| Outro | 215–232 | The night side turns green word by word; the lamp wall; the floor, immaculate, coming down to the desk. | |
| End | 232–242 | The opening frame again — same button, same lens — lit steady green. NO RESPONSE REQUIRED. Holds 9 s; fades as the music decays. | |

**Rewatch:** the intro frame and the end frame are the same shot. In the
first, the button breathes because a request is waiting for him; in the last,
it glows steadily because nothing is.

**Type system:** Inter Tight heavy = what he says with confidence; Newsreader
italic = his doubts; Martian Mono = everything the machine says. The final
chorus migrates from his voice to the machine's.

## Decisions

- **Stack:** three.js (WebGL2) in Chrome; every frame is a pure function of song
  time `t`. Preview and export run the same composition and timebase. Export =
  headless Chrome (real GPU) → frame packed to yuv420p on the GPU → WebSocket → ffmpeg. HyperFrames
  was explicitly ruled out by the user.
- **No frame is rendered from simulation state.** Seeded hashes only; pulses on
  the loop, desks, lights etc. are closed-form functions of `t`.
- **Timing authority is the recording.** Shot boundaries sit on measured bar
  lines; word reveals use `data/lyrics.json`.

## Asset provenance

| Asset | Source | Licence / note |
|---|---|---|
| `assets/audio/human-in-the-loop.m4a` | user-supplied Suno export, copied byte-for-byte (SHA-256 `0F183E78…470F96`) | user's song |
| Fonts (Inter Tight, Newsreader, Martian Mono) | `@fontsource/*` npm packages → `assets/fonts/` | SIL Open Font License 1.1 |
| three.js, opentype.js, puppeteer-core, ws | npm | MIT |
| All geometry, textures, environment maps | procedural, generated in code | original |
| Reference videos / repo | downloaded to a temp dir for study only; nothing copied into the project | not redistributed |

## Reference study (actual observations)

Both videos downloaded with yt-dlp (720p) plus auto-captions; contact sheets
of 120 frames each and six 12-frame motion strips were inspected.

**`5EoO5413dBY` — "I'm Upping My P(doom)" (2:36, 60 fps)**
- One palette throughout: near-black, bone white, a single signal orange. Two
  inversions to pale paper (a form, a diagram) give relief without leaving it.
- A new graphic "plate" every 3–8 s, each with its own mechanism (loss
  landscape, prompt box, form 7-B, review schedule, paperclips, fuse…), unified
  by three typefaces and recurring motifs (spark, smiley mask, P(doom) readout).
- Type takes part: a word is drawn as an outline and *fills* as it is sung
  while a spark runs under it; the next line arrives upside-down and the whole
  frame whip-rotates to read it; lyrics are typed into an input field, written
  on a form, stamped, bent along a gravity well.
- Full-frame single words ("I'M") as flat graphic punctuation on chorus hits.
- Repo: frame = f(t); sub-frame averaging for motion blur; headless Chrome →
  WebSocket → ffmpeg; CTC forced alignment cross-checked with Whisper, with
  manual anchors on hard spots.

**`tKrVYOUvrtA` (6:00, 30 fps)**
- A recurring low-poly protagonist (blue beanie), nearly always seen from
  behind or over the shoulder — no facial animation needed.
- Lyrics live on surfaces in the world: phone lock screen, laptop, billboard,
  receipt, building façade, floor paint, news chyron.
- Space tells the story: bedroom → corridor → arena → city street → white
  showroom → home → planet. Travel between spaces is one continuous
  motion-blurred move rather than a cut.
- Escalation of scale ends in a pull-back from an arena to the planet.
- The world's look changes with the story (dark room → dusk city → clean
  white interiors); a few objects (orb, phone) recur.

**Carried over as principles, not looks:** one disciplined palette; a distinct
visual event per lyric line; words revealed on the sung syllable; lyric text
as a physical thing in the scene; a protagonist read by silhouette; escalation
of scale to a planet; deterministic sub-frame-averaged rendering.
**Deliberately different:** photoreal-leaning product materials and studio
lighting instead of line art / low-poly; green as the only signal colour;
a single continuous geography (one desk, one loop) instead of many locations.

## Timing status — FINAL

**Recording:** 242.16 s. **Tempo 124.56 BPM** (not the requested 126), steady:
a constant grid fits the drum stem with ≤ 19 ms local phase error in any third
of the song. Beat 0.4817 s, bar 1.9268 s, first downbeat 1.264 s. Bar lines
confirmed by bass chord changes (novelty 0.32 on the chosen phase vs ≤ 0.11),
kick counts, and the three full-band re-entries (57.14 / 134.21 / 199.72 s).

**Lyrics:** the performance follows the supplied sheet word for word — no
omissions, repeats or changed words. Whisper mis-hears three spots (spoken
intro, "till just mine", "It learned"); each was checked on a spectrogram:
"just" is present as a short syllable with frication at 30.52 s. The spoken
intro is mumbled and is kept as written (5 syllable onsets match).

**What the recording does that the sheet does not say:**
- each chorus's first line is sung over a one-bar stop; the band lands one bar
  later (57.14, 134.21, 199.72 s);
- "What do you need me for?" / "There isn't anymore" are sung over a stop;
- "All green" couplets are separated by two instrumental bars;
- the bridge has a four-bar instrumental interlude (166.97–174.68 s);
- the "four-bar break" is one near-silent bar + three bars of pulse (190.09–197.80 s);
- after "No response required." (232.80–234.80 s) the band plays two loud bars
  (234.41–238.26 s) and decays to silence by ~240.2 s.

**Method:** Demucs vocal stem → MMS_FA CTC forced alignment per line (search
window from Whisper) → word ends extended across held notes from stem energy.
44 words in the processed "All green" refrains and the two spoken lines have
CTC confidence ≈ 0 and are anchored by hand to vocal-stem energy onsets.

**Verification performed:**
- CTC word starts vs. raw energy onsets at line starts: median +28 ms (n = 22).
- Repeats agree with each other: chorus 1 vs chorus 2 word starts differ by a
  constant 77.10 s ± 20 ms (= 40 bars); "All green" refrains agree within
  20 ms after a whole-bar shift.
- Spectrogram strips with final markers inspected for intro, post-chorus,
  chorus-2 ending, outro (`analysis/work/qa_*.png`).
- Whisper word starts run a steady ~0.22 s early on this track, so Whisper is
  used for *which word*, never for *when*.
- Suno's embedded timed-text track (kept as `analysis/embedded_subtitles.srt`)
  is wrong by up to several seconds and is not used.

**Verification limit:** I cannot listen to audio. Every timing claim above
rests on signal analysis and model agreement, not on hearing it.

Confidence tally (428 words): 260 high, 122 medium, 44 anchored, 2 low.

## Observed defects / fixes log

- analysis: envelope hop was rounded to whole samples but timed with the
  nominal 5 ms → 0.23 % drift (0.5 s at the end of the song). Fixed; all
  cross-checks redone afterwards.
- beat_this (neural beat tracker): checkpoint host serves an expired TLS
  certificate. Not bypassed; replaced by a comb fit to drum-stem onsets.

- export: a WebSocket of RGBA frames topped out at ~145 MB/s (4K = 33 MB/frame).
  Measured alternatives (`tools/bench_transfer.mjs`): fetch/XHR of a typed array
  30–45 MB/s; Blob POST fast but exhausts Chrome's blob store after ~60 frames.
  Fix: pack the frame to planar yuv420p (BT.709, limited range) in a shader and
  read that back (1.5 bytes/px instead of 4); ffmpeg receives finished YUV and
  only tags it. 4K export went from ~1 s/frame to ~0.1 s/frame.
- export: first test frames were blank white — `preserveDrawingBuffer` was off,
  so the canvas was cleared before capture. Fixed.
- look-dev: floor reflected unseen spot lights as glare streaks; floor specular
  now comes only from the planar reflection. Task lamp too weak to model the
  desk; re-aimed and re-balanced. Operator proportions (shoulders, neck) fixed.
- review fixes (contact sheets after each section): lyric type colliding with
  scene objects (moved to negative space); type on the floor running off the
  frame in the top-down chorus shots (fitted to the loop's interior); console
  display inside its housing; ceiling tinted green by the clinical environment;
  red shutdown button visible on the desk long before the shutdown (now hidden
  until the bridge — red appears nowhere else); key-card close-up blocked by
  the arm; "learned my approval" not readable (now two identically framed
  presses, his and the machine's); station cameras at knee height; the cut of
  the desk's branch invisible from a side angle (now the top-down map: the
  branch slides out of the circuit on "Cut"); outro type over the planet.
- preview: shot navigation could land one frame before a shot (rounding); seeks
  to a shot now take its first whole frame. Short section labels overlapped.

- determinism test (frame hashes in two render orders) failed on 7 of 18
  frames. Bisected with `orderprobe`: every predecessor changed the result, so
  not leaked shot state but a lag — the floor's planar reflection rendered
  with shadow-map updates disabled, i.e. with the previous frame's shadows.
  The reflection pass now renders this frame's shadow maps and the main pass
  reuses them. Also completed the per-frame reset (chair position, the
  machine's gate height, the ejected branch, city window warmth, panel lights).
  Re-test: 18/18 identical, also with 4 sub-frames.
- rough-cut review (encoded file, thumbnails at 300–480 px): the loop rail is
  ~2 px wide from 13 m and nearly vanishes after encoding, so the overhead map
  shots lost their subject and the "Cut" ejection was hard to see. Added a wide
  lit trace of the loop on the floor (same pulse shader) for overhead shots.
  The second-generation machine was black-on-black: generations now go black
  lacquer → brushed metal → white. Portrait: pickup shot reframed, floor
  labels moved off the machine and above the operator's head.

- **first 4K master rejected.** Inspecting frames of the finished master showed
  the loop missing from every overhead shot. Cause: the "year" shot (25 s)
  hides the loop group and the per-frame reset never restored it, so in a
  straight-through render the loop vanished for the rest of the film. Contact
  sheets never showed it because each sheet started rendering after 25 s, and
  the 18-frame order test happened not to include that shot. The rough cut had
  the same defect; I misread it there as "the rail is too thin" (the floor
  trace added in response is still worth keeping). Fixes: `Loop.reset()`
  restores visibility; new test `render.mjs shotorder` renders two frames of
  every shot (140) forwards then backwards and reports the largest visible
  difference on a 4×4-averaged image. Verified it catches this defect (254
  levels, 8 frames) and that the fixed build shows 0 levels. The remaining
  raw-hash mismatches are ≤ 1 level of 255 (floating-point noise, invisible).
  Master re-rendered; the defective one is kept as `out/wip/master_v1_loop_missing.mp4`.

## Render budget (measured, RTX 4070 Ti, 16 sub-frames)

| | per frame | whole film |
|---|---|---|
| 1080p, 4 sub-frames (rough cut) | ~44 ms incl. encode | 10.5 min |
| 4K, 16 sub-frames, render + readback | 100–140 ms (heaviest shots) | — |
| 4K master incl. x264 medium | ~0.23 s (GPU-bound: 4K readback ~0.1 s) | 57 min |
| vertical 1080x1920, 16 sub-frames | ~98 ms | 2.3 min for 23 s |

## Review log (what was looked at, not just generated)

- 4 reference contact sheets + 6 motion strips; transcripts of both videos.
- Look-dev sheets (4 rounds), section sheets for every part (2–3 rounds each).
- Proof passage 52.7–77 s exported with audio; 4 motion strips.
- Full rough cut from the encoded mp4: 97 frames on 2 sheets, 6 motion strips
  (intro title, year slabs, fastest spin, red press, the cut, the ending).
- Vertical cut from the encoded mp4: 19-frame sheet.
- Audio/video sync measured by cross-correlating each export's audio with the
  song at start / middle / end (all 0.00 ms), plus the frame-exact lyric
  reveals seen in the motion strips (e.g. the tick on "checked", the press on
  "pressed", the ejection on "Cut").

## Assumptions (recorded, reversible)

- The operator is written as "he" in shot comments because the lyric says
  "a sensible man"; the figure itself is a faceless mannequin (headset, badge).
- Vertical cut: chorus 1 + the first "All green" (55.22–78.34 s, 23.1 s): the
  hook, the spatial premise (the loop with the human in it) and the refrain.
- Master: genuine 3840×2160 at 60 fps (measured ~0.1 s/frame, see budget).

## Next action

Full-length rough cut (1080p, 4 sub-frames) → review motion, transitions and
sync at start / middle / end → revise → 4K master.
