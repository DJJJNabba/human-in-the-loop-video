// Diagnostic: where does export time go?  node tools/bench_transfer.mjs [--scale 2]
// Compares render+readback alone against several ways of getting frames out of the page.
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { startServer } from './server.mjs';

const SCALE = process.argv.includes('--scale') ? +process.argv[process.argv.indexOf('--scale') + 1] : 1;
const W = 1920 * SCALE, H = 1080 * SCALE;
const s = await startServer(0);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 0,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-web-security'],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto(`${s.url}/?export=1&w=${W}&h=${H}`);
await page.waitForFunction(() => window.__hitl?.ready || window.__hitl?.error, { timeout: 120000 });

let bytes = 0;
const sink = http.createServer((req, res) => {
  req.on('data', (c) => (bytes += c.length));
  req.on('end', () => res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }).end('ok'));
});
await new Promise((r) => sink.listen(0, '127.0.0.1', r));
const wss = new WebSocketServer({ port: 0, maxPayload: W * H * 4 + 1024 });
wss.on('connection', (ws) => ws.on('message', (d) => { bytes += d.length; ws.send('k'); }));

const r = await page.evaluate(async ({ httpUrl, wsUrl, N }) => {
  const P = window.__hitl, E = P.engine;
  const size = P.width * P.height * 4;
  const buf = new Uint8Array(size);
  const out = {};
  const time = async (name, fn) => { const a = performance.now(); for (let i = 0; i < N; i++) await fn(i); out[name] = ((performance.now() - a) / N).toFixed(1) + ' ms/frame'; };
  await time('render only (8 sub-frames)', async (i) => { E.renderFrame(1 + i / 60, { samples: 8 }); E.renderer.getContext().finish(); });
  await time('render + async readback', async (i) => { E.renderFrame(1 + i / 60, { samples: 8 }); await E.readPixels(buf); });
  await time('render + sync readPixels', async (i) => { E.renderFrame(1 + i / 60, { samples: 8 }); E.renderer.readRenderTargetPixels(E.rtOut, 0, 0, P.width, P.height, buf); });
  await time('fetch POST only (same buffer)', async () => { await fetch(httpUrl, { method: 'POST', body: buf }); });
  await time('fetch POST of a Blob', async () => { await fetch(httpUrl, { method: 'POST', body: new Blob([buf]) }); });
  await time('XHR POST (typed array)', () => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('POST', httpUrl); x.onload = res; x.onerror = rej; x.send(buf); }));
  await time('XHR POST (ArrayBuffer copy)', () => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('POST', httpUrl); x.onload = res; x.onerror = rej; x.send(buf.buffer.slice(0)); }));
  const sock = new WebSocket(wsUrl);
  await new Promise((res) => (sock.onopen = res));
  await time('websocket send + ack', async () => { sock.send(buf); await new Promise((res) => (sock.onmessage = res)); });
  await time('websocket 1 MB chunks + ack', async () => {
    let n = 0, want = Math.ceil(size / (1 << 20));
    const done = new Promise((res) => (sock.onmessage = () => { if (++n === want) res(); }));
    for (let o = 0; o < size; o += 1 << 20) sock.send(buf.subarray(o, Math.min(size, o + (1 << 20))));
    await done;
  });
  return out;
}, { httpUrl: `http://127.0.0.1:${sink.address().port}/x`, wsUrl: `ws://127.0.0.1:${wss.address().port}`, N: 12 });
console.log(`${W}x${H}  frame = ${(W * H * 4 / 1e6).toFixed(1)} MB`);
console.table(r);
await browser.close();
s.server.close(); sink.close(); wss.close();
process.exit(0);
