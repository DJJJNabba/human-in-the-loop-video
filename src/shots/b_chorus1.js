// PRE-CHORUS 1, CHORUS 1, POST-CHORUS 1 (39.8 – 86.0 s).
// One more click and the lights come on. The loop, with the human in it.
import { PAL } from '../config.js';
import { makeTimeMap } from '../engine/timemap.js';
import { defineShot } from '../engine/set.js';
import { fonts } from '../engine/type.js';
import { ease, hash, lerp, prog, smoothstep } from '../engine/util.js';
import { INK, camKeys, faceTo, layFlat, makeClock, operate, setInk, scrim } from './common.js';

/** Room lighting once the lights are on. k: 0 dark .. 1 fully lit. */
export const lit = (k = 1) => ({ env: k > 0.5 ? 'lit' : 'dark', envI: lerp(1.0, 1.1, k), ceiling: k, top: 1.7 * k, amb: 0.04 + 1.1 * k, lamp: 1, rim: lerp(1, 0.6, k), wash: 1 });

/** Centre of the loop's floor, and helpers that set big type inside it for the top-down shots. */
export const LOOP_C = [0, -4.6];
export function loopType(engine) {
  const P = engine.portrait;
  /** Top-down camera over the loop. In landscape the frame is turned so the loop lies along it (machine right, human left). */
  const ROLL0 = P ? 0 : 90;
  const topCam = (h = P ? 10.8 : 13.2, roll = 0) => ({ pos: [0, h, LOOP_C[1] + 0.25 + 0.02], look: [0, 0, LOOP_C[1] + 0.25], fov: 36, roll: ROLL0 + roll });
  /** A lyric block sized to fill the inside of the loop. textL / textP: line breaks for landscape / portrait. */
  const inLoop = (S, id, textL, textP, o = {}) => {
    const b = S.lyric(id, { text: P ? textP : textL, font: 'displayBlack', size: 1, leading: 0.92, align: 'center', hold: 0.25, out: 0.2, material: INK.white(1.05), dist: 0.1, ...o });
    const cap = fonts.displayBlack.cap;
    const h1 = (b.block.lineCount - 1) * 0.92 + cap;
    const s = Math.min((P ? 4.9 : 6.7) / b.block.width, (P ? 6.4 : 4.2) / h1) * (o.fit ?? 1);
    b.object.scale.setScalar(s);
    b.blockH = h1 * s;
    b.capH = cap * s;
    return b;
  };
  /** Keep the block centred in the loop and upright on screen for a camera roll (degrees, including ROLL0). */
  const place = (b, rollDeg, y = 0.012) => {
    const th = (rollDeg * Math.PI) / 180;
    const off = b.blockH / 2 - b.capH;
    layFlat(b.object, LOOP_C[0] - Math.sin(th) * off, y, LOOP_C[1] - Math.cos(th) * off, th);
  };
  return { ROLL0, topCam, inLoop, place };
}

// "ALL" over "GREEN" as a lamp bitmap: 7x9 letters on the 46x20 wall
const GLYPH = {
  A: ['..###..', '.#####.', '##...##', '##...##', '#######', '#######', '##...##', '##...##', '##...##'],
  L: ['##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '#######', '#######'],
  G: ['.#####.', '#######', '##...##', '##.....', '##.####', '##.####', '##...##', '#######', '.#####.'],
  R: ['######.', '#######', '##...##', '##...##', '######.', '#####..', '##.###.', '##..###', '##...##'],
  E: ['#######', '#######', '##.....', '#####..', '#####..', '##.....', '##.....', '#######', '#######'],
  N: ['##...##', '###..##', '####.##', '#######', '#######', '##.####', '##..###', '##...##', '##...##'],
};
export function allGreenBitmap(cols = 46, rows = 20) {
  const word = Array.from({ length: rows }, () => new Int8Array(cols)); // 0 none, 1 "ALL", 2 "GREEN"
  const put = (str, c0, r0, id) => [...str].forEach((ch, k) => GLYPH[ch].forEach((line, r) => [...line].forEach((px, c) => { if (px === '#') word[r0 + r][c0 + k * 8 + c] = id; })));
  put('ALL', 4, 0, 1);
  put('GREEN', 4, 11, 2);
  return word;
}

export default function registerChorus1(tl, sets, engine) {
  const floor = sets.floor, panel = sets.panel, A = engine.audio, LY = engine.lyrics;
  // B(): v1 bar positions mapped onto the v2 recording; V(): v2 bars (see engine/timemap.js)
  const { B, V } = makeTimeMap(A);
  const W = (id, i) => LY.line(id).words[i];
  const asp = engine.aspect, P = engine.portrait;
  const { ROLL0, topCam, inLoop, place } = loopType(engine);
  /** when a line has to start leaving so that it has gone before the next one (in the same place) starts to arrive */
  const gone = (nextId, out = 0.2) => LY.line(nextId).start - 0.07 - out - 0.03;

  const CLICK1 = W('pre1-1', 2).start, CLICK2 = W('pre1-2', 2).start;
  // chorus: one approval a bar, then two, then four — "faster than before"
  const presses = [CLICK1, CLICK2, B(29), B(30), B(31), B(32), B(32, 2), B(33), B(33, 2), B(34), B(34, 1), B(34, 2), B(34, 3), B(35), B(35, 1), B(35, 2), B(35, 3), B(37) - 0.06];
  const CLK = makeClock(presses);
  const lightsOn = W('pre1-1', 5).start; // "lights"
  // strips ignite one after another across the ceiling, each with a fluorescent stutter
  const strips = (t) => (i) => {
    const t0 = lightsOn + i * 0.085;
    if (t < t0) return 0;
    const dt = t - t0;
    return dt < 0.16 ? (hash(i, Math.floor(dt * 60)) > 0.45 ? 1 : 0.15) : 1;
  };
  const roomAt = (t) => {
    const L = lit(smoothstep(lightsOn, lightsOn + 0.9, t));
    L.ceiling = strips(t);
    return L;
  };

  // ------------------------------------------------- pre1-1  one more click
  defineShot(tl, floor, 'pre1-click', B(20), (S) => {
    const line = S.lyric('pre1-1', { flat: true, text: 'One more click\nand the lights\ncome on', font: 'display', size: 0.19, leading: 1.0, hold: 3, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, -0.32, 0);
    return (f) => {
      const t = f.t;
      operate(floor, f, CLK, { pose: { headPitch: -0.2 } });
      camKeys(floor.rig, t, [
        [f.start, { pos: [0.74, 0.92, 0.52], look: [0.34, 0.79, 0.07], fov: 22, fstop: 2.4 }],
        [CLICK1, { pos: [0.62, 0.87, 0.43], look: [0.34, 0.79, 0.07], fov: 22, fstop: 2.4 }, ease.inOutSine],
        [f.end, { pos: [0.62, 0.873, 0.43], look: [0.34, 0.79, 0.07], fov: 22, fstop: 2.4 }],
      ]);
      line.update(t, { exit: f.end + 1 });
      return { bloom: 0.5 };
    };
  });

  defineShot(tl, floor, 'pre1-lights', B(21, 2), (S) => {
    const line = S.lyric('pre1-1', { flat: true, text: 'One more click\nand the lights\ncome on', font: 'display', size: 0.19, leading: 1.0, hold: 0.25, hot: 3.4, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, -0.32, 0);
    const shade = scrim(S, line, 0.5);
    return (f) => {
      const t = f.t;
      floor.light(roomAt(t));
      operate(floor, f, CLK);
      camKeys(floor.rig, t, [
        [f.start, { pos: [-5.2, 0.42, 5.6], look: [1.6, 2.9, -6.5], fov: 40 }],
        [f.end, { pos: [-4.6, 0.5, 4.6], look: [1.6, 2.75, -6.5], fov: 40 }, ease.outSine],
      ]);
      line.update(t, { exit: f.end - 0.05 });
      shade();
      return {};
    };
  });

  // ------------------------------------------ pre1-2  another job's gone
  defineShot(tl, floor, 'pre1-click2', B(22, 3), (S) => {
    const line = S.lyric('pre1-2', { flat: true, text: 'One more click\nand another\njob’s gone', plain: true, font: 'display', size: 0.19, leading: 1.0, hold: 3, material: INK.white(1), align: 'right' });
    line.object.position.set(asp - 0.2, 0.66, 0);
    return (f) => {
      const t = f.t;
      floor.light(lit(1));
      operate(floor, f, CLK, { pose: { headPitch: -0.2 } });
      // in profile across the desk: the hand comes down from the right
      camKeys(floor.rig, t, [
        [f.start, { pos: [-0.42, 0.87, 0.02], look: [0.36, 0.8, 0.1], fov: 24, fstop: 2.8 }],
        [f.end, { pos: [-0.36, 0.86, 0.0], look: [0.36, 0.8, 0.1], fov: 24, fstop: 2.8 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end + 1 });
      line.words.forEach((w, i) => { if (i > 2) w.mesh.visible = false; });
      return {};
    };
  });

  defineShot(tl, floor, 'pre1-job', B(23, 2), (S) => {
    const line = S.lyric('pre1-2', { flat: true, text: 'One more click\nand another\njob’s gone', plain: true, font: 'display', size: 0.19, leading: 1.0, hold: 0.3, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, 0.66, 0);
    const struck = W('pre1-2', 5).start; // "job's"
    return (f) => {
      const t = f.t;
      floor.light(lit(1));
      floor.directory.group.visible = true;
      floor.dirLight.intensity = 70;
      operate(floor, f, CLK);
      // most of the floor has already gone; one more goes now
      floor.directory.set((i) => (i < 9 ? 1 : i === 9 ? (t - struck) / 0.5 : 0));
      camKeys(floor.rig, t, [
        [f.start, { pos: [-5.5, 1.5, 2.7], look: [-8.9, 1.42, 4.35], fov: 30, fstop: 4, focus: 3.3 }],
        [f.end, { pos: [-5.9, 1.5, 2.8], look: [-8.9, 1.36, 4.2], fov: 30, fstop: 4, focus: 2.9 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.05 });
      line.words.forEach((w, i) => { if (i <= 2) w.mesh.material.opacity *= 0.4; });
      return {};
    };
  });

  // ------------------------------------------- pre1-3  essential, in charge
  defineShot(tl, floor, 'pre1-essential', B(24, 2), (S) => {
    const line = S.lyric('pre1-3', {
      flat: true, text: 'It says I’m\nessential,\nit says I’m\nin charge', plain: true, font: 'display', size: 0.165, leading: 1.04, hold: 0.3, material: INK.white(1),
      styles: { 3: { font: 'machineBold', scale: 0.8, material: INK.green(1.2) }, 7: { font: 'machineBold', scale: 0.8, material: INK.green(1.2) }, 8: { font: 'machineBold', scale: 0.8, material: INK.green(1.2) } },
    });
    line.object.position.set(-asp + 0.2, 0.7, 0);
    const tA = W('pre1-3', 3).start, tB = W('pre1-3', 7).start;
    return (f) => {
      const t = f.t;
      floor.light({ ...lit(1), top: 0.8 });
      operate(floor, f, CLK, { presses: false });
      // the machine's one line of display, read from where the operator sits
      floor.console.setDisplay(t < tA - 0.05 ? '' : t < tB - 0.05 ? 'YOU ARE ESSENTIAL' : 'YOU ARE IN CHARGE', PAL.green);
      camKeys(floor.rig, t, [
        [f.start, { pos: [0.52, 1.03, 0.47], look: [0.27, 0.775, -0.075], fov: 19, fstop: 4 }],
        [f.end, { pos: [0.5, 1.0, 0.42], look: [0.28, 0.775, -0.075], fov: 19, fstop: 4 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.05 });
      return { bloom: 0.5 };
    };
  });

  // --------------------------------------------- pre1-4  a visitor's card
  defineShot(tl, floor, 'pre1-badge', B(26, 3) - 0.1, (S) => {
    const line = S.lyric('pre1-4', { flat: true, text: 'Then why\nis my name\non a visitor’s\ncard?', plain: true, font: 'doubt', size: P ? 0.125 : 0.19, leading: 1.06, hold: 3, material: INK.white(1) });
    line.object.position.set(-asp + (P ? 0.1 : 0.22), P ? 0.72 : 0.42, 0);
    const flip = W('pre1-4', 7).start - 0.12; // "visitor's"
    return (f) => {
      const t = f.t;
      floor.light({ ...lit(1), lamp: 0.55, top: 0.5, rim: 0.35 });
      operate(floor, f, CLK, { presses: false, pose: { lean: 0.04, headPitch: -0.3 } });
      floor.op.badge.mesh.visible = false;
      const hb = floor.heroBadge.group;
      hb.visible = true;
      hb.position.set(0.0, 0.918, 0.458);
      // the card turns over on its strap: the other side has always said VISITOR
      const k = prog(t, flip, flip + 0.42, ease.inOutCubic);
      hb.rotation.set(0, Math.PI + Math.PI * k + Math.sin(t * 1.3) * 0.04 * (1 - k), 0);
      floor.spotAt([-0.7, 1.5, -0.7], [0, 0.86, 0.46], 1.6, 0.4, '#fff6ea');
      camKeys(floor.rig, t, [
        [f.start, { pos: [0.115, 0.875, 0.1], look: [0.062, 0.86, 0.46], fov: 21, fstop: 4 }],
        [f.end, { pos: [0.105, 0.87, 0.14], look: [0.058, 0.858, 0.46], fov: 21, fstop: 4 }, ease.outSine],
      ]);
      line.update(t, { exit: f.end + 1 });
      return { bloom: 0.25 };
    };
  });

  // ------------------------------------------ chorus 1: keep me in the loop
  const pickupText = (S, o = {}) => {
    const b = S.lyric('ch1-1', { flat: true, text: 'Keep me\nin the loop', font: 'displayBlack', size: P ? 0.2 : 0.3, leading: 0.9, tracking: -0.01, hold: 3, material: INK.white(1), styles: { 4: { material: INK.green(1.2) } }, ...o });
    b.object.position.set(-asp + (P ? 0.1 : 0.2), P ? 0.62 : 0.42, 0);
    return b;
  };
  defineShot(tl, floor, 'ch1-pickup', V(33, 3.25), (S) => {
    const line = pickupText(S);
    const shade = scrim(S, line, 0.5);
    return (f) => {
      const t = f.t;
      floor.light(lit(1));
      operate(floor, f, CLK, { pose: { headPitch: 0.02 } });
      camKeys(floor.rig, t, [
        [f.start, P ? { pos: [0.8, 1.58, 2.3], look: [0.0, 0.98, 0.15], fov: 30, fstop: 2.8 } : { pos: [1.5, 1.5, 2.9], look: [-0.5, 1.02, -3], fov: 28, fstop: 2.8, focus: 2.9 }],
        [f.end, P ? { pos: [0.7, 1.55, 2.05], look: [0.0, 0.98, 0.15], fov: 30, fstop: 2.8 } : { pos: [1.2, 1.46, 2.5], look: [-0.5, 1.02, -3], fov: 28, fstop: 2.8, focus: 2.5 }, ease.outSine],
      ]);
      line.update(t, { exit: f.end + 1 });
      shade();
      return {};
    };
  });

  const stageTop = (f, o = {}) => {
    floor.light({ ...lit(1), rim: 0.3, top: 1.2 });
    floor.loop.setIdle(0.2, PAL.white);
    floor.loop.showMap();
    floor.colleagues.group.visible = true; // only the plates: the slots where the other desks were
    floor.colleagues.platesOnly(true);
    return operate(floor, f, CLK, { pulse: { trail: 1.2 }, ...o });
  };

  defineShot(tl, floor, 'ch1-top', V(34, 3), (S) => {
    const l1 = inLoop(S, 'ch1-2', 'Keep me\non the line', 'Keep me\non the\nline');
    const l2 = inLoop(S, 'ch1-3', 'Tell me I’m\nthe reason', 'Tell me\nI’m the\nreason', { plain: true });
    return (f) => {
      const t = f.t;
      stageTop(f);
      const roll = lerp(-4, 3, ease.outCubic(f.p));
      const c = topCam(lerp(P ? 9.6 : 11.8, P ? 10.9 : 13.4, ease.outCubic(f.p)), roll);
      floor.rig.set(c);
      place(l1, c.roll);
      place(l2, c.roll);
      l1.update(t, { exit: gone('ch1-3') });
      l2.update(t, { exit: f.end - 0.02 });
      return { vignette: 0.7 };
    };
  });

  defineShot(tl, floor, 'ch1-orbit', V(36, 3), (S) => {
    const l = S.lyric('ch1-4', { text: P ? 'You\nask me\nevery\ntime' : 'You ask me\nevery time', font: 'displayBlack', size: P ? 0.82 : 1.05, leading: 0.94, align: 'center', hold: 0.3, material: INK.white(1.05), dist: 0.12 });
    faceTo(l.object, [0, P ? 3.1 : 1.45, -5.0], [0, 0, 100]);
    return (f) => {
      const t = f.t;
      floor.light(lit(1));
      floor.loop.setIdle(0.1, PAL.white);
      operate(floor, f, CLK, { pulse: { trail: 1.0 } });
      // travel behind the operator, east to west, the loop and the words sliding past his shoulders
      const u = ease.inOutSine(f.p);
      const a = lerp(0.62, -0.5, u);
      floor.rig.set({ pos: [Math.sin(a) * 6.2, lerp(1.9, 1.62, u), 0.4 + Math.cos(a) * 5.4], look: [0, P ? 1.7 : 1.15, -3.4], fov: 33 });
      l.update(t, { exit: f.end - 0.02 });
      return {};
    };
  });

  defineShot(tl, floor, 'ch1-round', V(37, 3.25), (S) => {
    const l1 = inLoop(S, 'ch1-5', 'Round and\nround we go', 'Round\nand round\nwe go', { fit: 0.9 });
    const l2 = inLoop(S, 'ch1-6', 'Faster\nthan before', 'Faster\nthan\nbefore', { fit: 0.9 });
    return (f) => {
      const t = f.t;
      stageTop(f);
      // the room turns under the words; it turns faster each bar
      const u = f.p;
      const c = topCam(lerp(P ? 10.9 : 13.4, P ? 10.2 : 12.6, u), 300 * (0.3 * u + 0.7 * u * u));
      floor.rig.set(c);
      place(l1, c.roll);
      place(l2, c.roll);
      l1.update(t, { exit: gone('ch1-6') });
      l2.update(t, { exit: f.end - 0.02 });
      return { vignette: 0.7 };
    };
  });

  defineShot(tl, floor, 'ch1-human', V(39, 3), (S) => {
    const l = inLoop(S, 'ch1-7', 'I’m the human\nin the loop', 'I’m the\nhuman\nin the\nloop', { plain: true, hold: 2.5, styles: { 2: { material: INK.green(1.25) } } });
    // the diagram, written on the floor: who sends, who approves
    const th = (ROLL0 * Math.PI) / 180;
    const lab = (str, x, z, size = 0.3, mat = INK.dim(0.95), yaw = 0) => {
      const b = S.text(str, { font: 'machine', size, tracking: 0.14, align: 'center', material: mat });
      layFlat(b.object, x, 0.012, z, th + yaw);
      return b;
    };
    const labels = P
      ? [lab('MACHINE', 0, -10.75), lab('REQUEST', -3.4, -4.6, 0.17, INK.dim(0.95), Math.PI / 2), lab('APPROVAL', 3.4, -4.6, 0.17, INK.dim(0.95), -Math.PI / 2), lab('HUMAN', 0, 1.95, 0.28, INK.green(1.25))]
      : [lab('MACHINE', 4.25, -8.9), lab('REQUEST', -4.0, -4.6, 0.24), lab('APPROVAL', 4.2, -4.6, 0.24), lab('HUMAN', 4.25, -0.15, 0.3, INK.green(1.25))];
    const s0 = S.shot.start, bp = A.beat_period;
    const at = [s0, s0 + bp, s0 + 2 * bp, W('ch1-7', 2).start];
    return (f) => {
      const t = f.t;
      stageTop(f);
      const c = topCam(lerp(P ? 11.6 : 13.6, P ? 12.2 : 14.4, ease.outSine(f.p)), 0);
      if (P) { c.pos[2] -= 0.4; c.look[2] -= 0.4; }
      floor.rig.set(c);
      place(l, c.roll);
      l.update(t, { exit: f.end - 0.02 });
      labels.forEach((b, i) => setInk(b, prog(t, at[i], at[i] + 0.18)));
      return { vignette: 0.7 };
    };
  });

  // ------------------------------------- tag: what do you need me for?
  defineShot(tl, floor, 'ch1-tag', B(36), (S) => {
    const line = S.lyric('ch1-8', { flat: true, text: P ? 'What do\nyou need\nme for?' : 'What do you\nneed me for?', font: 'doubt', size: P ? 0.15 : 0.2, leading: 1.08, hold: 3, material: INK.white(1) });
    line.object.position.set(-asp + (P ? 0.1 : 0.22), P ? 0.7 : 0.2, 0);
    return (f) => {
      const t = f.t;
      floor.light({ ...lit(1), top: 0.7, ceiling: 0.5, amb: 0.5 });
      // the request waits. so does everything else.
      operate(floor, f, CLK, { pose: { headYaw: -0.5 * smoothstep(f.start, f.start + 1.2, t), headPitch: 0.04, lean: 0.08 } });
      camKeys(floor.rig, t, [
        [f.start, { pos: [1.55, 1.3, 1.45], look: [P ? 0.05 : 0.2, 1.16, 0.3], fov: 24, fstop: 2.0 }],
        [f.end, { pos: [1.45, 1.3, 1.3], look: [P ? 0.05 : 0.2, 1.16, 0.3], fov: 24, fstop: 2.0 }, ease.outSine],
      ]);
      line.update(t, { exit: f.end + 1 });
      return { bloom: 0.35 };
    };
  });

  // --------------------------------------------- post-chorus: all green
  const legendOn = (S, Pn, id, size) => {
    const legend = S.lyric(id, { upper: true, font: 'machine', size, tracking: 0.12, align: 'center', mode: 'reveal', dim: 0.16, hold: 6, hot: 2.2, material: INK.white(1.1), parent: Pn.group });
    legend.object.position.set(0, Pn.legendY, 0.0108);
    return legend;
  };

  // v2: four refrain lines of two bars each, sung "All green, all, all green" (five words), then a one-bar breakdown
  const allText = P ? 'ALL GREEN,\nALL, ALL GREEN' : 'ALL GREEN, ALL, ALL GREEN';
  defineShot(tl, panel, 'post1-a', V(42), (S) => {
    const Pn = panel.hero;
    const all = S.lyric('post1-1', { flat: true, text: allText, plain: true, font: 'machineBold', size: P ? 0.095 : 0.16, tracking: 0.05, leading: 1.2, hold: 6, hot: 2.4, material: INK.green(1.2), align: 'center' });
    all.object.position.set(0, P ? 0.66 : 0.66, 0);
    const legend = legendOn(S, Pn, 'post1-2', 0.03);
    const hits = LY.line('post1-1').words.map((w) => w.start);
    return (f) => {
      const t = f.t;
      // each sung word switches on the next fifth of the panel; inside it, lamps come on bottom to top
      Pn.set((p) => {
        const t0 = hits[Math.min(4, Math.floor((p.c / Pn.cols) * 5))] + (Pn.rows - 1 - p.r) * 0.05 + hash(p.i, 1) * 0.05;
        return t < t0 ? 0 : 0.72 + 0.28 * Math.exp(-(t - t0) / 0.18);
      });
      panel.fill.intensity = 0.07 * smoothstep(hits[0], hits[4] + 0.3, t);
      // close on the lamps while they come on; the plate and its legend are revealed for "nothing wrong with the machine"
      camKeys(panel.rig, t, [
        [f.start, { pos: [-0.42, 0.13, P ? 1.9 : 1.2], look: [0.05, 0.1, 0], fov: 30, fstop: 2.8 }],
        [V(44), { pos: [-0.1, 0.06, P ? 2.3 : 1.5], look: [0.02, 0.06, 0], fov: 30, fstop: 4 }, ease.inOutSine],
        [f.end, { pos: [0.34, 0.02, P ? 2.6 : 1.75], look: [0.0, 0.04, 0], fov: 30, fstop: 4 }, ease.inOutSine],
      ]);
      all.update(t, { exit: f.end + 1 });
      legend.update(t, { exit: f.end + 1 });
      return { bloom: 0.5, vignette: 0.6 };
    };
  });

  // second couplet: the wall of lamps spells it out, then every lamp agrees
  const BITS = allGreenBitmap();
  defineShot(tl, panel, 'post1-b', V(46), (S) => {
    const Pn = panel.wall;
    const legend = legendOn(S, Pn, 'post1-4', 0.062);
    const hits = LY.line('post1-3').words.map((w) => w.start);
    return (f) => {
      const t = f.t;
      panel.hero.group.visible = false;
      Pn.group.visible = true;
      Pn.set((p) => {
        const id = BITS[p.r][p.c];
        // "All" -> ALL; "green" -> GREEN; "all" -> the top half; "all" -> the bottom half; "green" -> every lamp flares
        const t0 = id === 1 ? hits[0] + p.c * 0.004 : id === 2 ? hits[1] + p.c * 0.003 : (p.r < 10 ? hits[2] : hits[3]) + hash(p.i, 2) * 0.18;
        const base = t < t0 ? 0 : 0.7 + 0.3 * Math.exp(-(t - t0) / 0.2);
        return Math.min(1, base + 0.3 * Math.exp(-Math.max(0, t - hits[4]) / 0.25) * (t >= hits[4] ? 1 : 0));
      });
      panel.key.intensity = 1.1;
      panel.key.position.set(-7, 0.4, 3.5);
      panel.fill.intensity = 0.3 * smoothstep(hits[2], hits[4] + 0.4, t);
      panel.fill.position.set(0, 0, 2.6);
      const z0 = P ? 7.6 : 4.3;
      camKeys(panel.rig, t, [
        [f.start, { pos: [-0.5, 0.0, z0 - 0.4], look: [0, -0.06, 0], fov: 32 }],
        [f.end, { pos: [0.5, 0.0, z0 + 0.7], look: [0, -0.06, 0], fov: 32 }, ease.inOutSine],
      ]);
      legend.update(t, { exit: f.end + 1 });
      return { bloom: 0.5, vignette: 0.6 };
    };
  });

  // the one-bar breakdown (no drums): the floor, lit, everything working
  defineShot(tl, floor, 'post1-floor', V(50), () => {
    const clk = makeClock(Array.from({ length: 6 }, (_, i) => V(49, 2) + i * A.beat_period * 2 + 0.02));
    return (f) => {
      const t = f.t;
      floor.light(lit(1));
      floor.loop.setIdle(0.1, PAL.white);
      operate(floor, f, clk, { pulse: { trail: 1.0 }, pose: { headPitch: -0.05 } });
      camKeys(floor.rig, t, [
        [f.start, P ? { pos: [-3.4, 1.5, 3.4], look: [0.1, 1.0, -1.2], fov: 34 } : { pos: [-6.4, 1.15, 2.2], look: [1.0, 1.0, -4.6], fov: 34 }],
        [f.end, P ? { pos: [-2.9, 1.6, 3.7], look: [0.1, 1.0, -1.4], fov: 34 } : { pos: [-5.8, 1.4, 2.9], look: [1.0, 1.0, -4.6], fov: 34 }, ease.inOutSine],
      ]);
      return {};
    };
  });
}
