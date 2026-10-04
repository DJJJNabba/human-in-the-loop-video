// Entry point for both the live preview and the offline export (?export=1).
// Both drive the same Engine with the same composition; only the clock differs:
// the preview follows the <audio> element, the export steps frame by frame.
import * as THREE from 'three';
import { Engine } from './engine/engine.js';
import { buildComposition } from './composition.js';
import { AUDIO_URL, DURATION, FPS, LANDSCAPE, PORTRAIT } from './config.js';

const q = new URLSearchParams(location.search);
const EXPORT = q.has('export');
const portrait = q.has('portrait');
const scale = +(q.get('scale') || 1);
const base = portrait ? PORTRAIT : LANDSCAPE;
const res = +(q.get('res') || 1); // preview only: render at a fraction of the logical size
const width = Math.round(+(q.get('w') || base.w * scale * (EXPORT ? 1 : res)));
const height = Math.round(+(q.get('h') || base.h * scale * (EXPORT ? 1 : res)));

const canvas = document.getElementById('c');
const msg = document.getElementById('msg');
if (EXPORT) document.body.classList.add('export');

const api = (window.__hitl = { ready: false, error: null, width, height, duration: DURATION, fps: FPS });

async function boot() {
  const engine = new Engine(canvas, { width, height, samples: +(q.get('samples') || 1) });
  api.engine = engine;
  api.gpu = engine.gpu;
  await buildComposition(engine, { only: q.get('only') });
  api.timeline = engine.timeline.shots.map((s) => ({ id: s.id, start: s.start, end: s.end, set: s.set.name }));
  api.errors = engine.errors;
  if (EXPORT) setupExport(engine);
  else setupPreview(engine);
  api.ready = true;
}

function setupExport(engine) {
  canvas.style.width = Math.min(width, 1920) + 'px';
  api.still = (t, samples = 1) => {
    engine.flipY = false;
    const shot = engine.renderFrame(t, { samples });
    return shot.id;
  };
  api.png = () => canvas.toDataURL('image/png');
  // FNV-1a over every byte of the finished frame: used to prove frames do not depend on render order
  // 4x4-averaged copy of the finished frame, kept in the page: lets the order test measure how large a difference is
  api.frames = new Map();
  api.frameSmall = (key, t, samples = 1, compare = false) => {
    engine.flipY = false;
    engine.renderFrame(t, { samples });
    const buf = new Uint8Array(width * height * 4);
    engine.renderer.readRenderTargetPixels(engine.rtOut, 0, 0, width, height, buf);
    const w = width >> 2, h = height >> 2, out = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) sum += buf[((y * 4 + j) * width + x * 4 + i) * 4 + c];
      out[(y * w + x) * 3 + c] = sum >> 4;
    }
    if (!compare) { api.frames.set(key, out); return 0; }
    const ref = api.frames.get(key);
    let max = 0, n = 0;
    for (let i = 0; i < out.length; i++) { const d = Math.abs(out[i] - ref[i]); if (d > max) max = d; if (d > 3) n++; }
    return { max, n };
  };
  api.frameHash = (t, samples = 1) => {
    engine.flipY = false;
    engine.renderFrame(t, { samples });
    const buf = new Uint8Array(width * height * 4);
    engine.renderer.readRenderTargetPixels(engine.rtOut, 0, 0, width, height, buf);
    let h = 2166136261;
    for (let i = 0; i < buf.length; i++) { h ^= buf[i]; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  };
  api.jpeg = (quality = 0.92) => canvas.toDataURL('image/jpeg', quality);
  // Screen rectangles (NDC) of every word of type that is showing at time t. No frame is rendered: the shot is
  // staged and its type is measured. Used by `render.mjs textcheck` to find blocks that collide or leave the frame.
  const _v = new THREE.Vector3(), _c = new THREE.Vector3();
  api.textBoxes = (t) => {
    const shot = engine.timeline.at(t), set = shot.set;
    const f = engine.frame(shot, t);
    set.begin(f, shot);
    shot.update(f);
    const out = [];
    const walk = (root, cam, flat) => {
      cam.clearViewOffset();
      cam.updateMatrixWorld(true);
      root.traverseVisible((o) => {
        const tx = o.userData.text;
        if (!tx || !o.isMesh || !o.geometry.attributes.position) return;
        if ((o.material.opacity ?? 1) < 0.3) return;
        const g = o.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        o.updateWorldMatrix(true, false);
        const b = g.boundingBox;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, behind = false;
        for (let k = 0; k < 8; k++) {
          _v.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld);
          if (!flat && _c.copy(_v).applyMatrix4(cam.matrixWorldInverse).z > -cam.near) behind = true;
          _v.project(cam);
          x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y);
        }
        if (!behind) out.push({ block: tx.block, word: tx.word, flat, x0, y0, x1, y1 });
      });
    };
    walk(set.scene, set.camera, false);
    walk(set.overlay, set.overlayCamera, true);
    return { shot: shot.id, boxes: out };
  };
  api.sheet = (times, cols = 4, cw = 480, samples = 1) => {
    const ch = Math.round((cw * height) / width), pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad;
    cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d');
    c.fillStyle = '#1b1d1e';
    c.fillRect(0, 0, cv.width, cv.height);
    times.forEach((t, i) => {
      engine.flipY = false;
      const shot = engine.renderFrame(t, { samples });
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(canvas, x, y + lab, cw, ch);
      c.fillStyle = '#cfd4d2';
      c.font = '12px monospace';
      c.fillText(`${t.toFixed(2)}s  ${shot.id}`, x + 2, y + 13);
    });
    return cv.toDataURL('image/jpeg', 0.9);
  };
  api.perf = async (from, to, samples = 1) => {
    const ms = [];
    const buf = new Uint8Array(width * height * 4);
    engine.renderFrame(from, { samples });
    for (let t = from; t < to; t += 1 / FPS) {
      const a = performance.now();
      engine.renderFrame(t, { samples });
      await engine.readPixels(buf);
      ms.push(performance.now() - a);
    }
    ms.sort((a, b) => a - b);
    return { n: ms.length, avg: ms.reduce((a, b) => a + b, 0) / ms.length, p50: ms[ms.length >> 1], p95: ms[Math.floor(ms.length * 0.95)], max: ms[ms.length - 1] };
  };
  // Stream frames [from, to) to the render script over a WebSocket, a few frames ahead of
  // ffmpeg at most. (Measured with tools/bench_transfer.mjs: WebSocket ~150 MB/s and stable;
  // fetch/XHR of a typed array ~30-45 MB/s; Blob POST is fast but exhausts Chrome's blob
  // store after ~60 frames. Synchronous readPixels is twice as fast as the PBO path.)
  api.stream = async ({ from, to, ws, samples = 1, inflight = 3 }) => {
    const sock = new WebSocket(ws);
    sock.binaryType = 'arraybuffer';
    await new Promise((res, rej) => { sock.onopen = res; sock.onerror = () => rej(new Error('websocket failed')); });
    let acked = 0, sent = 0, wake = null;
    sock.onmessage = (e) => { acked = +e.data; if (wake) { wake(); wake = null; } };
    engine.flipY = false;
    const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS);
    const buf = new Uint8Array(engine.yuvSize); // planar yuv420p, packed on the GPU (see Engine.readYuv)
    const stat = { render: 0, read: 0, wait: 0 };
    for (let i = f0; i < f1; i++) {
      let a = performance.now();
      engine.renderFrame(i / FPS, { samples });
      let b = performance.now();
      stat.render += b - a;
      engine.readYuv(buf); // blocks until the GPU has finished the frame
      stat.read += performance.now() - b;
      sock.send(buf); // copies; buf is free to reuse
      sent++;
      b = performance.now();
      while (sent - acked > inflight) await new Promise((r) => (wake = r));
      stat.wait += performance.now() - b;
    }
    while (acked < sent) await new Promise((r) => (wake = r));
    sock.close();
    const n = f1 - f0;
    return { sent: n, renderMs: stat.render / n, readMs: stat.read / n, waitMs: stat.wait / n };
  };
}

function setupPreview(engine) {
  const $ = (id) => document.getElementById(id);
  const audio = new Audio(AUDIO_URL);
  audio.preload = 'auto';
  const shots = engine.timeline.shots;
  let t = clampT(+(q.get('t') || 0));
  let playing = false, loop = false, fine = false, dirty = true;
  let anchorA = 0, anchorP = 0;

  function clampT(x) { return Math.max(0, Math.min(DURATION - 1 / FPS, x)); }
  const snap = (x) => Math.round(x * FPS) / FPS;
  function seek(x) {
    t = snap(clampT(x));
    audio.currentTime = t;
    anchorA = t;
    anchorP = performance.now();
    dirty = true;
  }
  function setPlaying(p) {
    playing = p;
    if (p) { audio.currentTime = t; audio.play().catch((e) => (msg.textContent = 'audio: ' + e.message)); anchorA = t; anchorP = performance.now(); }
    else audio.pause();
    $('play').textContent = p ? 'pause' : 'play';
    $('play').classList.toggle('on', p);
    dirty = true;
  }
  const shotAt = (x) => engine.timeline.at(x);
  const gotoShot = (d) => {
    const cur = shotAt(t).index;
    const here = shots[cur];
    const target = d < 0 && t - here.start > 0.4 ? cur : Math.max(0, Math.min(shots.length - 1, cur + d));
    seek(Math.ceil(shots[target].start * FPS - 1e-6) / FPS); // first whole frame of the shot
  };

  // timeline strip: one cell per shot, section names above
  const track = $('track');
  for (const s of shots) {
    const i = document.createElement('i');
    i.style.left = (s.start / DURATION) * 100 + '%';
    i.style.width = ((s.end - s.start) / DURATION) * 100 + '%';
    i.title = s.id;
    track.appendChild(i);
  }
  for (const s of engine.audio.sections) {
    const e = document.createElement('span');
    e.style.left = (s.start / DURATION) * 100 + '%';
    e.textContent = s.end - s.start >= 4 ? s.id : '';
    e.title = s.id;
    $('secs').appendChild(e);
  }
  const list = $('shots');
  shots.forEach((s) => {
    const d = document.createElement('div');
    d.innerHTML = `<span>${s.id}</span><span>${s.start.toFixed(2)}</span>`;
    d.onclick = () => seek(Math.ceil(s.start * FPS - 1e-6) / FPS);
    s._row = d;
    list.appendChild(d);
  });

  const scrub = $('scrub');
  const scrubTo = (e) => { const r = scrub.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * DURATION); };
  let dragging = false;
  scrub.addEventListener('pointerdown', (e) => { dragging = true; scrub.setPointerCapture(e.pointerId); scrubTo(e); });
  scrub.addEventListener('pointermove', (e) => dragging && scrubTo(e));
  scrub.addEventListener('pointerup', () => (dragging = false));

  $('play').onclick = () => setPlaying(!playing);
  $('prev').onclick = () => gotoShot(-1);
  $('next').onclick = () => gotoShot(1);
  $('fb').onclick = () => { setPlaying(false); seek(t - 1 / FPS); };
  $('ff').onclick = () => { setPlaying(false); seek(t + 1 / FPS); };
  const toggleLoop = () => { loop = !loop; $('loop').classList.toggle('on', loop); };
  const toggleQual = () => { fine = !fine; $('qual').textContent = 'quality: ' + (fine ? 'fine' : 'draft'); $('qual').classList.toggle('on', fine); dirty = true; };
  const toggleHide = () => document.body.classList.toggle('hide');
  const toggleList = () => document.body.classList.toggle('list');
  $('loop').onclick = toggleLoop;
  $('qual').onclick = toggleQual;
  $('hide').onclick = toggleHide;
  $('list').onclick = toggleList;
  addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === ' ') { e.preventDefault(); setPlaying(!playing); }
    else if (k === 'ArrowLeft') seek(t - (e.shiftKey ? 5 : 1));
    else if (k === 'ArrowRight') seek(t + (e.shiftKey ? 5 : 1));
    else if (k === ',') { setPlaying(false); seek(t - 1 / FPS); }
    else if (k === '.') { setPlaying(false); seek(t + 1 / FPS); }
    else if (k === '[') gotoShot(-1);
    else if (k === ']') gotoShot(1);
    else if (k === 'l') toggleLoop();
    else if (k === 'q') toggleQual();
    else if (k === 'h') toggleHide();
    else if (k === 's') toggleList();
    else if (k === 'Home') seek(0);
  });
  addEventListener('resize', () => (dirty = true));

  let lastShot = null;
  function frame() {
    if (playing) {
      let x = anchorA + (performance.now() - anchorP) / 1000;
      // follow the audio clock; re-anchor if we drift from it
      if (Math.abs(x - audio.currentTime) > 0.05) { anchorA = audio.currentTime; anchorP = performance.now(); x = anchorA; }
      const here = shotAt(t);
      if (loop && x >= here.end - 1 / FPS) { seek(here.start); x = here.start; audio.play(); }
      if (x >= DURATION - 1 / FPS) { setPlaying(false); x = DURATION - 1 / FPS; }
      const nt = snap(x);
      if (nt !== t) { t = nt; dirty = true; }
    }
    if (dirty) {
      dirty = false;
      // draft: one sample (real time). fine: full sub-frame accumulation while paused, light while playing
      const shot = engine.renderFrame(t, { samples: fine ? (playing ? 4 : 16) : 1 });
      $('head').style.left = (t / DURATION) * 100 + '%';
      const fr = Math.round(t * FPS);
      const bar = engine.audio.barAt(t);
      $('time').textContent = `${t.toFixed(3)}s  f${fr}  bar ${Math.floor(bar)}.${Math.floor((bar % 1) * 4 + 1e-6) + 1}`;
      $('shot').textContent = shot.id;
      const l = engine.lyrics.current(t);
      $('lyric').textContent = l ? l.text : '';
      if (shot !== lastShot) { lastShot?._row?.classList.remove('on'); shot._row?.classList.add('on'); lastShot = shot; }
      if (engine.errors.length) msg.textContent = engine.errors.slice(-3).join('\n');
    }
    requestAnimationFrame(frame);
  }
  // fit the canvas to the window while keeping its aspect
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.style.width = `min(100vw, calc(100vh * ${width / height}))`;
  canvas.style.height = 'auto';
  frame();
}

boot().catch((e) => {
  api.error = String(e.stack || e);
  msg.textContent = api.error;
  console.error(e);
});
