// data/lyrics.json (word timings) -> human-readable performed-lyric timing files:
//   data/performed_lyrics.srt   one cue per sung line
//   data/performed_lyrics.lrc   enhanced LRC with a timestamp on every word
//   data/performed_lyrics.tsv   line id, section, word, start, end, confidence
//   node tools/export_lyrics.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './server.mjs';

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lyrics.json'), 'utf8'));
const srtT = (s) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(r).padStart(3, '0')}`;
};
const lrcT = (s) => {
  const cs = Math.round(s * 100);
  return `${String(Math.floor(cs / 6000)).padStart(2, '0')}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

const srt = data.lines.map((l, i) => `${i + 1}\n${srtT(l.start)} --> ${srtT(l.end)}\n${l.text}\n`).join('\n');
fs.writeFileSync(path.join(ROOT, 'data/performed_lyrics.srt'), srt);

let section = null;
const lrc = ['[ti:Human in the Loop]', '[re:performed-lyric timing, measured from the recording (see PRODUCTION_NOTES.md)]', ''];
for (const l of data.lines) {
  if (l.section !== section) { lrc.push(`[${lrcT(l.start)}]`); section = l.section; }
  lrc.push(`[${lrcT(l.start)}]` + l.words.map((w) => `<${lrcT(w.start)}>${w.w}`).join(' ') + ` <${lrcT(l.end)}>`);
}
fs.writeFileSync(path.join(ROOT, 'data/performed_lyrics.lrc'), lrc.join('\n') + '\n');

const tsv = ['line\tsection\tword\tstart\tend\tconfidence'];
for (const l of data.lines) for (const w of l.words) tsv.push([l.id, l.section, w.w, w.start.toFixed(3), w.end.toFixed(3), w.conf].join('\t'));
fs.writeFileSync(path.join(ROOT, 'data/performed_lyrics.tsv'), tsv.join('\n') + '\n');
console.log(`wrote performed_lyrics.srt / .lrc / .tsv  (${data.lines.length} lines, ${tsv.length - 1} words)`);
