// Smoke test of the interactive preview: loads it, drives the keyboard, and
// checks that seeking, frame stepping, shot navigation, play and hide all work.
//   node tools/check_preview.mjs [--out out/wip/preview.png]
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { ROOT, startServer } from './server.mjs';

const s = await startServer(0);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${s.url}/?t=60&res=0.5`);
await page.waitForFunction(() => window.__hitl?.ready || window.__hitl?.error, { timeout: 120000 });
const read = () => page.evaluate(() => ({ time: document.getElementById('time').textContent, shot: document.getElementById('shot').textContent, lyric: document.getElementById('lyric').textContent }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const step = async (label, fn) => { await fn(); await wait(250); const r = await read(); log.push([label, r.time, r.shot, r.lyric]); return r; };
await wait(800);
await step('load ?t=60', async () => {});
await step('. (frame +1)', () => page.keyboard.press('.'));
await step('. (frame +1)', () => page.keyboard.press('.'));
await step(', (frame -1)', () => page.keyboard.press(','));
await step('] (next shot)', () => page.keyboard.press(']'));
await step('] (next shot)', () => page.keyboard.press(']'));
await step('[ (prev shot)', () => page.keyboard.press('['));
await step('→ (+1 s)', () => page.keyboard.press('ArrowRight'));
await step('shift+← (−5 s)', async () => { await page.keyboard.down('Shift'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift'); });
const before = await read();
await page.keyboard.press(' ');
await wait(1500);
const playing = await read();
await page.keyboard.press(' ');
log.push(['space, 1.5 s, space', playing.time, playing.shot, playing.lyric]);
await page.screenshot({ path: path.join(ROOT, 'out/wip/preview_ui.png') });
await page.keyboard.press('h');
await wait(200);
const hidden = await page.evaluate(() => getComputedStyle(document.getElementById('ui')).display);
await page.screenshot({ path: path.join(ROOT, 'out/wip/preview_hidden.png') });
console.table(log.map(([a, b, c, d]) => ({ action: a, time: b, shot: c, lyric: d.slice(0, 40) })));
const t0 = parseFloat(before.time), t1 = parseFloat(playing.time);
console.log(`play advanced ${(t1 - t0).toFixed(3)} s in ~1.5 s wall time; UI after 'h': display=${hidden}`);
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
s.server.close();
