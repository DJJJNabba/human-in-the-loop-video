// Re-timing the edit to the second recording.
//
// The shots were first cut to v1 (124.56 BPM, 242 s). Their internal timings
// are written in v1 bar numbers (B(n, beats)). For v2 (127 BPM, 266 s, a
// different arrangement) those bar positions are mapped section by section to
// the new bar grid: a piecewise-linear map between matching structural points
// (v1 bar -> v2 bar), then converted to v2 time. Lyric-anchored timings (word
// starts from data/lyrics.json) need no map: they come from the new recording.
// Sections whose structure changed (intro, post-chorus, interlude, break,
// final chorus, outro, coda) are re-cut with v2 bars directly (V()).
const ANCHORS = [
  // [v1 bar, v2 bar]
  [0, 5], // v1 spoken intro  -> v2 spoken intro (after 4.5 bars of pad)
  [4, 9], // verse 1
  [20, 25], // pre-chorus 1 (v1 bar 20 turnaround -> v2 bar 25 turnaround)
  [28, 33], // chorus 1 pickup / stop
  [36, 41], // chorus 1 tag
  [37, 42], // post-chorus (re-cut)
  [44, 51], // verse 2
  [61, 68], // pre-chorus 2
  [68, 75], // chorus 2 pickup
  [76, 83], // chorus 2 tag
  [77, 84], // hit (one v1 bar -> two v2 bars, re-cut)
  [78, 85.25], // bridge a: v1 lines start ~0.6 bar in; v2 lines are pickups at the end of the bar before
  [86, 93.25], // v1 interlude collapses: v2 has none
  [90, 93.5], // bridge b
  [98, 101.5], // v1 break -> v2 bridge stop (re-cut)
  [102, 111.75], // final chorus (re-cut)
  [111, 120], // outro (re-cut)
  [120, 130.75], // spoken (re-cut)
  [124, 141],
];

export function makeTimeMap(audio) {
  const bar = (v1bar) => {
    const A = ANCHORS;
    if (v1bar <= A[0][0]) return A[0][1] + (v1bar - A[0][0]);
    for (let i = 1; i < A.length; i++) {
      if (v1bar <= A[i][0]) {
        const [a0, b0] = A[i - 1], [a1, b1] = A[i];
        return b0 + ((v1bar - a0) * (b1 - b0)) / (a1 - a0);
      }
    }
    const L = A[A.length - 1];
    return L[1] + (v1bar - L[0]);
  };
  return {
    /** v1 bar position (+ beats) -> v2 time */
    B: (n, beats = 0) => audio.first_downbeat + bar(n + beats / 4) * audio.bar_period,
    /** v2 bar (+ beats) -> v2 time */
    V: (n, beats = 0) => audio.bb(n, beats),
    bar,
  };
}
