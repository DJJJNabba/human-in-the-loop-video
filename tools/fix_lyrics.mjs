// Word-start corrections found in the spectrogram review of 2026-10-04 (see PRODUCTION_NOTES.md, "v3").
// Each entry sets the measured start of one word (absolute seconds, so running this twice changes nothing);
// ends are trimmed to the next word. Run after analysis/align.py, before tools/export_lyrics.mjs:
//   node tools/fix_lyrics.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './server.mjs';

// [line id, word index, start, (end)]
const FIX = [
  ['intro-1', 0, 9.64],
  ['v1-2', 2, 22.18],
  ['v1-6', 2, 37.29],
  ['v1-7', 0, 40.58], ['v1-7', 1, 40.72],
  ['v2-3', 0, 104.84], ['v2-3', 1, 104.98],
  ['v2-8', 6, 126.09],
  ['pre2-2', 6, 134.84],
  ['pre2-3', 3, 136.82],
  // chorus 2 opens exactly like chorus 1 against the bar; the first alignment had "me in the loop" a quarter-second early
  ['ch2-1', 1, 144.05], ['ch2-1', 2, 144.32], ['ch2-1', 3, 144.46], ['ch2-1', 4, 144.62],
  ['ch2-2', 0, 145.43, 145.72],
  ['ch2-4', 3, 150.0],
  ['br-7', 5, 187.5],
  ['fin-2', 0, 213.44],
  ['fin-3', 0, 215.39],
  // the processed refrains: the hand anchors sat ~60 ms before the voice
  ['post1-1', 0, 80.02], ['post1-1', 1, 80.5], ['post1-1', 2, 81.21], ['post1-1', 3, 81.68], ['post1-1', 4, 82.14],
  ['post1-2', 0, 83.75],
  ['post1-3', 0, 87.6], ['post1-3', 1, 88.03], ['post1-3', 2, 88.76], ['post1-3', 3, 89.24], ['post1-3', 4, 89.69],
  ['post1-4', 0, 91.28], ['post1-4', 2, 92.54], ['post1-4', 4, 93.26],
  ['out-1', 0, 227.43], ['out-1', 1, 227.91], ['out-1', 2, 228.62], ['out-1', 3, 229.09], ['out-1', 4, 229.54],
  ['out-2', 0, 231.15], ['out-2', 2, 232.37], ['out-2', 3, 232.65],
  ['out-3', 0, 235.0], ['out-3', 2, 236.17], ['out-3', 3, 236.65], ['out-3', 4, 237.1],
  ['out-4', 0, 238.71], ['out-4', 2, 239.91], ['out-4', 4, 240.62],
  ['spoken-1', 0, 247.77],
];

const file = path.join(ROOT, 'data/lyrics.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(data.lines.map((l) => [l.id, l]));
let n = 0;
for (const [id, i, start, end] of FIX) {
  const l = byId.get(id);
  if (!l || !l.words[i]) throw new Error(`no word ${id}[${i}]`);
  const w = l.words[i];
  if (Math.abs(w.start - start) > 1e-6) n++;
  w.start = start;
  if (end !== undefined) w.end = end;
  w.conf = 'anchored';
}
for (const l of data.lines) {
  l.words.forEach((w, i) => {
    const nx = l.words[i + 1];
    if (nx && nx.start <= w.start) throw new Error(`${l.id}: "${w.w}" does not start before "${nx.w}"`);
    if (nx && w.end > nx.start - 0.02) w.end = +(nx.start - 0.02).toFixed(3);
    if (w.end < w.start + 0.04) w.end = +(w.start + 0.04).toFixed(3);
  });
  l.start = l.words[0].start;
  l.end = Math.max(l.end, l.words[l.words.length - 1].end);
}
data.meta.review = 'word starts re-checked against vocal-stem spectrograms on 2026-10-04; corrections in tools/fix_lyrics.mjs';
fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
console.log(`${FIX.length} anchors, ${n} changed`);
