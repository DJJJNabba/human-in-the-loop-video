#!/usr/bin/env node
// Offline renderer: drives the composition in headless Chrome (real GPU) and
// pipes raw frames to ffmpeg.
//
//   node tools/render.mjs gpu
//   node tools/render.mjs stills --t 12.5,57.2 [--samples 8] [--out out/wip]
//   node tools/render.mjs sheet  --from 55 --to 72 [--n 16] [--cols 4] [--samples 2] [--out out/wip/sheet.jpg]
//   node tools/render.mjs sheet  --times 1,2,3   |   --cuts   (4 frames around every shot boundary)
//   node tools/render.mjs perf   --from 57 --to 59 [--samples 8]
//   node tools/render.mjs video  --from 0 --to 242.16 [--samples 8] [--crf 16] [--preset slow] [--out out/x.mp4] [--noaudio]
//
// Common flags:  --scale 2 (3840x2160)   --portrait (1080x1920)   --headed   --url http://127.0.0.1:5180
import puppeteer from 'puppeteer-core';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startServer } from './server.mjs';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
const SCALE = +opt('scale', '1');
const PORTRAIT = flag('portrait');
const BASE = PORTRAIT ? [1080, 1920] : [1920, 1080];
const OW = Math.round(BASE[0] * SCALE), OH = Math.round(BASE[1] * SCALE);
const SAMPLES = +opt('samples', '1');
const AUDIO = path.join(ROOT, 'assets/audio/human-in-the-loop-v2.wav');
const FPS = 60;

const CHROME = opt('chrome', process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p)));

async function reachable(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

async function ensureServer() {
  const url = opt('url');
  if (url && (await reachable(url))) return { url, stop() {} };
  const s = await startServer(0);
  return { url: s.url, stop: () => s.server.close() };
}

async function openPage(url) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: flag('headed') ? false : 'new',
    protocolTimeout: 0,
    args: [
      '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${Math.min(OW, 1920)},${Math.min(OH, 1920)}`,
    ],
    defaultViewport: { width: Math.min(OW, 1920), height: Math.min(OH, 1920), deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => { if (['error', 'warn'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const only = opt('only');
  await page.goto(`${url}/?export=1&w=${OW}&h=${OH}${PORTRAIT ? '&portrait=1' : ''}${only ? `&only=${only}` : ''}`, { waitUntil: 'load' });
  // fail fast on a module that does not even parse (the page then never reports ready or error)
  const parseError = new Promise((res) => page.once('pageerror', (e) => res(e)));
  const booted = page.waitForFunction(() => window.__hitl?.ready || window.__hitl?.error, { timeout: 180000, polling: 100 });
  const first = await Promise.race([booted.then(() => null), parseError]);
  if (first && !(await page.evaluate(() => !!window.__hitl))) { await browser.close(); throw new Error('page failed to load: ' + first.message); }
  await booted;
  const err = await page.evaluate(() => window.__hitl.error);
  if (err) { await browser.close(); throw new Error(`composition failed to boot:\n${err}\n${logs.join('\n')}`); }
  const info = await page.evaluate(() => ({ w: window.__hitl.width, h: window.__hitl.height, gpu: window.__hitl.gpu, n: window.__hitl.timeline.length }));
  if (info.w !== OW || info.h !== OH) throw new Error(`page renders ${info.w}x${info.h}, expected ${OW}x${OH}`);
  if (/swiftshader|llvmpipe|basic render/i.test(info.gpu)) console.warn(`WARNING: software renderer in use (${info.gpu})`);
  return { browser, page, logs, info };
}

const dataUrlToFile = (dataUrl, file) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
};

async function video(page, from, to, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // The page hands over planar yuv420p (BT.709, limited range) packed on the GPU: no colour
  // conversion happens in ffmpeg, the stream is only tagged so players do not guess BT.601.
  const args = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', OW + 'x' + OH, '-r', String(FPS),
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-i', 'pipe:0'];
  const audio = !flag('noaudio');
  if (audio) args.push('-ss', String(from), '-t', String(to - from), '-i', AUDIO);
  const enc = opt('enc', 'x264');
  if (enc === 'nvenc') args.push('-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'constqp', '-qp', opt('qp', '16'), '-pix_fmt', 'yuv420p');
  else args.push('-c:v', 'libx264', '-preset', opt('preset', 'slow'), '-crf', opt('crf', '16'), '-pix_fmt', 'yuv420p', '-x264-params', opt('x264', 'aq-mode=3'));
  args.push('-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709');
  if (audio) args.push('-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', opt('abr', '320k'), '-shortest');
  args.push('-movflags', '+faststart', out);
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => { ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))); ff.on('error', rej); });
  const total = Math.round(to * FPS) - Math.round(from * FPS);
  let frames = 0;
  const t0 = Date.now();
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', maxPayload: OW * OH * 2, perMessageDeflate: false });
  await new Promise((r) => wss.once('listening', r));
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const ok = ff.stdin.write(data);
      const ack = () => {
        frames++;
        ws.send(String(frames));
        if (frames % 30 === 0 || frames === total) {
          const el = (Date.now() - t0) / 1000;
          process.stdout.write('\r' + frames + '/' + total + ' frames  ' + (frames / el).toFixed(2) + ' fps  eta ' + Math.round((total - frames) / (frames / el)) + 's    ');
        }
      };
      if (ok) ack(); else ff.stdin.once('drain', ack);
    });
  });
  const st = await page.evaluate((o) => window.__hitl.stream(o), { from, to, ws: 'ws://127.0.0.1:' + wss.address().port, samples: SAMPLES, inflight: 3 });
  while (frames < st.sent) await new Promise((r) => setTimeout(r, 20));
  ff.stdin.end();
  await ffDone;
  wss.close();
  console.log('\nper frame: render ' + st.renderMs.toFixed(1) + ' ms, GPU finish + readback ' + st.readMs.toFixed(1) + ' ms, waiting on encoder ' + st.waitMs.toFixed(1) + ' ms');
  console.log('wrote ' + out + '  (' + frames + ' frames, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s, ' + OW + 'x' + OH + ', ' + SAMPLES + ' sub-frames)');
}

const { url, stop } = await ensureServer();
const { browser, page, logs, info } = await openPage(url);
let code = 0;
try {
  if (mode === 'gpu') {
    console.log(`${info.gpu}\n${OW}x${OH}, ${info.n} shots`);
  } else if (mode === 'timeline') {
    const tl = await page.evaluate(() => window.__hitl.timeline);
    for (const e of tl) console.log(e.start.toFixed(2).padStart(7), (e.end - e.start).toFixed(2).padStart(6) + 's', e.set.padEnd(8), e.id);
  } else if (mode === 'stills') {
    const times = (opt('t') ?? '0').split(',').map(Number);
    const dir = path.resolve(opt('out', path.join(ROOT, 'out/wip')));
    for (const t of times) {
      const id = await page.evaluate(([t, s]) => window.__hitl.still(t, s), [t, SAMPLES]);
      const jpg = flag('jpg');
      const f = path.join(dir, `${opt('name', 'f')}_${t.toFixed(2).padStart(6, '0')}${PORTRAIT ? '_p' : ''}.${jpg ? 'jpg' : 'png'}`);
      dataUrlToFile(await page.evaluate((j) => (j ? window.__hitl.jpeg(0.93) : window.__hitl.png()), jpg), f);
      console.log(`${f}  [${id}]`);
    }
  } else if (mode === 'sheet') {
    const from = +opt('from', '0'), to = +opt('to', '10'), n = +opt('n', '16');
    let times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
    if (opt('times')) times = opt('times').split(',').map(Number);
    if (flag('cuts')) {
      const tl = await page.evaluate(() => window.__hitl.timeline);
      times = tl.slice(1).filter((e) => e.start >= from && e.start <= to).flatMap((e) => [e.start - 0.1, e.start - 1 / 60, e.start + 1 / 60, e.start + 0.1]);
    }
    const out = path.resolve(opt('out', path.join(ROOT, `out/wip/sheet_${from}-${to}.jpg`)));
    const cols = +opt('cols', '4');
    dataUrlToFile(await page.evaluate((a) => window.__hitl.sheet(...a), [times, cols, +opt('cw', PORTRAIT ? '270' : '480'), SAMPLES]), out);
    console.log(out);
  } else if (mode === 'perf') {
    const r = await page.evaluate((a) => window.__hitl.perf(...a), [+opt('from', '0'), +opt('to', '2'), SAMPLES]);
    console.log(`${info.gpu}\n${OW}x${OH} x${SAMPLES} sub-frames: ${r.n} frames  avg ${r.avg.toFixed(1)} ms  p50 ${r.p50.toFixed(1)}  p95 ${r.p95.toFixed(1)}  max ${r.max.toFixed(1)}  (incl. pixel readback)`);
  } else if (mode === 'shotorder') {
    // two points in every shot, rendered all forwards and then all backwards; reports the largest difference
    // (on a 4x4-averaged image, levels of 255). Any visible state a shot leaves behind shows up here.
    const tl = await page.evaluate(() => window.__hitl.timeline);
    const times = tl.flatMap((e) => [e.start + (e.end - e.start) * 0.3, e.start + (e.end - e.start) * 0.8]);
    for (let i = 0; i < times.length; i++) await page.evaluate(([k, x, s]) => window.__hitl.frameSmall(k, x, s), [i, times[i], SAMPLES]);
    const res = new Array(times.length);
    for (let i = times.length - 1; i >= 0; i--) res[i] = await page.evaluate(([k, x, s]) => window.__hitl.frameSmall(k, x, s, true), [i, times[i], SAMPLES]);
    let worst = 0, bad = 0;
    res.forEach((r, i) => { worst = Math.max(worst, r.max); if (r.max > 3) { bad++; console.log(`DIFFERENT at t=${times[i].toFixed(3)} (${tl.find((e) => times[i] >= e.start && times[i] < e.end).id}): max ${r.max} levels, ${r.n} values > 3`); } });
    console.log(`${times.length} frames in ${tl.length} shots, forwards vs backwards: largest difference ${worst} level(s) of 255; ${bad ? bad + ' frame(s) differ visibly' : 'no visible differences'}`);
    if (bad) code = 4;
  } else if (mode === 'leakdiff') {
    // save frame --t rendered fresh, and again after rendering --after (comma list) in that order
    const t = +opt('t');
    const save = async (name) => { await page.evaluate(([x]) => window.__hitl.still(x, 1), [t]); dataUrlToFile(await page.evaluate(() => window.__hitl.png()), path.join(ROOT, 'out/wip', name)); };
    await save('leak_fresh.png');
    let after = opt('after') ? opt('after').split(',').map(Number) : [];
    if (opt('back-to')) {
      const tl = await page.evaluate(() => window.__hitl.timeline);
      const stop = +opt('back-to');
      after = tl.flatMap((e) => [e.start + (e.end - e.start) * 0.3, e.start + (e.end - e.start) * 0.8]).filter((x) => x > t + 0.01 && x >= stop - 0.001).reverse();
    }
    for (const x of after) await page.evaluate(([x]) => window.__hitl.frameHash(x, 1), [x]);
    await save('leak_after.png');
    console.log('saved out/wip/leak_fresh.png, leak_after.png');
  } else if (mode === 'bisect') {
    // which prefix of the forward shot sequence changes frame --t? (page reloaded for every test)
    const target = +opt('t');
    const tl = await page.evaluate(() => window.__hitl.timeline);
    const times = tl.flatMap((e) => [e.start + (e.end - e.start) * 0.3, e.start + (e.end - e.start) * 0.8]).filter((x) => (flag('back') ? x > target + 0.01 : x < target - 0.01));
    if (flag('back')) times.reverse(); // the end of the film first, as in the backwards pass
    const H = (x) => page.evaluate(([x, s]) => window.__hitl.frameHash(x, s), [x, SAMPLES]);
    const fresh = async () => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__hitl?.ready, { timeout: 120000 }); };
    const test = async (k) => { await fresh(); for (let i = 0; i < k; i++) await H(times[i]); return H(target); };
    const ref = await test(0);
    let lo = 0, hi = times.length;
    if ((await test(hi)) === ref) { console.log('full forward prefix gives the fresh result'); } else {
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if ((await test(m)) === ref) lo = m; else hi = m; }
      const t0 = times[hi - 1]; console.log(`first prefix that changes t=${target}: up to t=${t0.toFixed(3)} (${tl.find((e) => t0 >= e.start && t0 < e.end).id})`);
      // is that shot alone enough?
      await fresh(); await H(t0); console.log(`that shot alone: ${(await H(target)) === ref ? 'no effect' : 'CHANGES it'}`);
    }
  } else if (mode === 'orderprobe') {
    // hash of --t rendered fresh, then right after each time in --prev
    const t = +opt('t');
    const H = (x) => page.evaluate(([x, s]) => window.__hitl.frameHash(x, s), [x, SAMPLES]);
    const ref = await H(t);
    for (const pv of opt('prev').split(',').map(Number)) { await H(pv); const h = await H(t); await H(t); console.log(`after ${pv}: ${h === ref ? 'same' : 'DIFFERENT'}`); }
  } else if (mode === 'determinism') {
    // render each time fresh-in-order, then again in reverse with other shots in between; every hash must match
    const times = (opt('t') ?? '5,30,60,100,150,200,240').split(',').map(Number);
    const first = [];
    for (const t of times) first.push(await page.evaluate(([t, s]) => window.__hitl.frameHash(t, s), [t, SAMPLES]));
    const second = [];
    for (const t of [...times].reverse()) {
      await page.evaluate(([t, s]) => window.__hitl.frameHash(t, s), [242.16 - t * 0.37, SAMPLES]);
      second.unshift(await page.evaluate(([t, s]) => window.__hitl.frameHash(t, s), [t, SAMPLES]));
    }
    let bad = 0;
    times.forEach((t, i) => { const ok = first[i] === second[i]; if (!ok) bad++; console.log(`t=${t.toFixed(3)}  ${first[i]}  ${second[i]}  ${ok ? 'same' : 'DIFFERENT'}`); });
    console.log(bad ? `${bad} frame(s) depend on render order` : 'all frames identical regardless of render order');
    if (bad) code = 4;
  } else if (mode === 'textcheck') {
    // every --step seconds: do two different blocks of type cover each other, or does flat type leave the frame?
    const dur = await page.evaluate(() => window.__hitl.duration);
    const from = +opt('from', '0'), to = +opt('to', String(dur)), step = +opt('step', '0.05');
    const res = await page.evaluate(([from, to, step]) => {
      const hits = [];
      for (let t = from; t < to; t += step) {
        const { shot, boxes } = window.__hitl.textBoxes(t);
        const seen = new Set();
        for (let i = 0; i < boxes.length; i++) {
          const a = boxes[i];
          if (a.flat && (a.x0 < -1.001 || a.x1 > 1.001 || a.y0 < -1.001 || a.y1 > 1.001)) hits.push({ t, shot, kind: 'off-frame', what: a.word });
          for (let j = i + 1; j < boxes.length; j++) {
            const b = boxes[j];
            if (a.block === b.block) continue;
            const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
            if (w <= 0 || h <= 0) continue;
            const small = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
            if (w * h < 0.12 * small) continue;
            const key = a.word + '|' + b.word;
            if (!seen.has(key)) { seen.add(key); hits.push({ t, shot, kind: 'overlap', what: `"${a.word}" x "${b.word}"` }); }
          }
        }
      }
      return hits;
    }, [from, to, step]);
    // merge runs of the same finding
    const runs = [];
    for (const h of res) {
      const last = runs.find((r) => r.shot === h.shot && r.kind === h.kind && r.what === h.what && h.t - r.t1 < step * 2.5);
      if (last) last.t1 = h.t; else runs.push({ ...h, t0: h.t, t1: h.t });
    }
    for (const r of runs) console.log(`${r.kind.padEnd(9)} ${r.t0.toFixed(2).padStart(7)}-${r.t1.toFixed(2).padStart(7)}  ${r.shot.padEnd(14)} ${r.what}`);
    console.log(runs.length ? `${runs.length} finding(s)` : 'no colliding or off-frame type');
    if (runs.length) code = 5;
  } else if (mode === 'video') {
    const dur = await page.evaluate(() => window.__hitl.duration);
    await video(page, +opt('from', '0'), +opt('to', String(dur)), path.resolve(opt('out', path.join(ROOT, 'out/wip/clip.mp4'))));
  } else {
    console.error(`unknown mode ${mode}`);
    code = 2;
  }
  const errs = await page.evaluate(() => window.__hitl.errors);
  if (errs?.length) { console.error('SHOT ERRORS:\n' + errs.join('\n')); code = code || 3; }
  if (logs.length) console.error('BROWSER LOG:\n' + [...new Set(logs)].slice(0, 30).join('\n'));
} catch (e) {
  console.error(e);
  if (logs.length) console.error('BROWSER LOG:\n' + [...new Set(logs)].slice(0, 30).join('\n'));
  code = 1;
} finally {
  await browser.close();
  stop();
}
process.exit(code);
