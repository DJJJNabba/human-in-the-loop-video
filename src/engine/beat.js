// The beat layer: how hard the drums are hitting right now, per voice.
//
// The v2 mix adds a harder layer in some sections: an 8th-note kick drive in
// the bridge, 16th-note hats in the post-chorus / verse 2 / break / outro, and
// both in the coda. Each voice gets a weight per bar measured from the drum
// stem (hit counts and loudness), so visual accents follow the arrangement
// instead of firing everywhere.
import { clamp, smoothstep } from './util.js';

export function makeBeat(audio) {
  const P = audio.bar_period, f0 = audio.first_downbeat;
  const nb = Math.ceil((audio.duration - f0) / P) + 2;
  const count = (arr, b) => arr.filter((x) => x >= f0 + b * P && x < f0 + (b + 1) * P).length;
  const env = audio.env_.drums, fps = audio.env_fps;
  const level = (b) => {
    const a = Math.max(0, Math.floor((f0 + b * P) * fps)), z = Math.min(env.length, Math.floor((f0 + (b + 1) * P) * fps));
    let s = 0;
    for (let i = a; i < z; i++) s += env[i];
    return z > a ? s / (z - a) : 0;
  };
  const heavy = new Float32Array(nb), drive = new Float32Array(nb), tick = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    heavy[b] = smoothstep(0.26, 0.31, level(b)); // the louder, harder drum sound
    drive[b] = smoothstep(5, 6.5, count(audio.kick, b)); // 8th-note kicks
    tick[b] = smoothstep(8.5, 10.5, count(audio.hat, b)); // 16th-note hats
  }
  // weights change at bar lines, eased over a 16th so nothing pops
  const at = (arr, t) => {
    const x = (t - f0) / P;
    const b = Math.floor(x), u = x - b;
    const a = arr[clamp(b, 0, nb - 1)], c = arr[clamp(b + 1, 0, nb - 1)];
    return a + (c - a) * smoothstep(0.9375, 1, u);
  };
  return (t) => {
    const H = at(heavy, t), D = at(drive, t), T = at(tick, t);
    const kick = audio.hit('kick', t, 0.075), snare = audio.hit('snare', t, 0.09), hat = audio.hit('hat', t, 0.035);
    const any = Math.max(H, D, T);
    return {
      heavy: H, drive: D, tick: T, kick, snare, hat,
      /** weighted accents (0..1): use these */
      k: kick * Math.max(H, D), s: snare * H, h: hat * T,
      /** an overall "how hard is it" 0..1 */
      any,
      /** snare count (for alternating directions) */
      sn: audio.count('snare', t),
    };
  };
}
