// Read-only access to the measured timing data (data/lyrics.json, data/audio.json).
import { clamp } from './util.js';

const bsearch = (arr, t) => {
  // index of the last element <= t, or -1
  let lo = 0, hi = arr.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= t) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r;
};

export class Lyrics {
  constructor(data) {
    this.meta = data.meta;
    this.lines = data.lines;
    this.byId = new Map(data.lines.map((l) => [l.id, l]));
  }
  /** Line by id ("v1-3", "ch1-7" ...). Throws if unknown so typos fail loudly. */
  line(id) {
    const l = this.byId.get(id);
    if (!l) throw new Error(`unknown lyric line "${id}"`);
    return l;
  }
  /** Line being sung at t (or the most recent one within `hold` seconds). */
  current(t, hold = 0.6) {
    let best = null;
    for (const l of this.lines) {
      if (t >= l.start - 0.05 && t <= l.end + hold) best = l;
    }
    return best;
  }
  /** 0 before the word starts, rising to 1 across its sung duration, then 1. */
  static wordProgress(w, t) {
    return clamp((t - w.start) / Math.max(0.05, w.end - w.start));
  }
}

export class Audio {
  constructor(d) {
    Object.assign(this, d);
    this.secById = new Map(d.sections.map((s) => [s.id, s]));
  }
  /** Time of bar n (may be fractional: bar(29.5) = half-way through bar 29). */
  bar(n) { return this.first_downbeat + n * this.bar_period; }
  /** Time of beat k counted from the first downbeat. */
  beat(k) { return this.first_downbeat + k * this.beat_period; }
  /** bar(n) + b beats. */
  bb(n, b = 0) { return this.first_downbeat + n * this.bar_period + b * this.beat_period; }
  beatAt(t) { return (t - this.first_downbeat) / this.beat_period; }
  barAt(t) { return (t - this.first_downbeat) / this.bar_period; }
  section(id) {
    const s = this.secById.get(id);
    if (!s) throw new Error(`unknown section "${id}"`);
    return s;
  }
  /** Normalised loudness envelope (0..~1): mix | vocals | drums | bass | other | low | high. */
  env(name, t) {
    const e = this.envs?.[name] ?? this.env_[name];
    const x = t * this.env_fps;
    const i = Math.floor(x);
    if (i < 0 || i >= e.length - 1) return 0;
    return e[i] + (e[i + 1] - e[i]) * (x - i);
  }
  /** Decaying pulse since the last hit of a kind ('kick' | 'snare' | 'hat'). */
  hit(kind, t, halfLife = 0.09) {
    const arr = this[kind];
    const i = bsearch(arr, t);
    if (i < 0) return 0;
    return Math.pow(0.5, (t - arr[i]) / halfLife);
  }
  /** Hits of a kind within [t0, t1). */
  hits(kind, t0, t1) {
    const arr = this[kind];
    const out = [];
    for (let i = Math.max(0, bsearch(arr, t0)); i < arr.length && arr[i] < t1; i++) if (arr[i] >= t0) out.push(arr[i]);
    return out;
  }
  /** Number of hits of a kind up to t (a monotone counter for step animations). */
  count(kind, t) { return bsearch(this[kind], t) + 1; }
}

export async function loadTiming() {
  const [l, a] = await Promise.all([
    fetch('/data/lyrics.json').then((r) => r.json()),
    fetch('/data/audio.json').then((r) => r.json()),
  ]);
  a.env_ = a.env;
  delete a.env;
  // The tempo is steady to a millisecond, but single drum onsets were measured to within +-40 ms. Anything that
  // moves on a hit has to move on the grid: snap every hit to its sixteenth note (and drop doubles).
  const s16 = a.bar_period / 16;
  for (const k of ['kick', 'snare', 'hat']) {
    a[k + 'Raw'] = a[k];
    const q = a[k].map((t) => a.first_downbeat + Math.round((t - a.first_downbeat) / s16) * s16);
    a[k] = q.filter((t, i) => i === 0 || t - q[i - 1] > s16 * 0.5);
  }
  return { lyrics: new Lyrics(l), audio: new Audio(a) };
}
