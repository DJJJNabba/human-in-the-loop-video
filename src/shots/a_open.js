// INTRO and VERSE 1 (0 – 39.8 s): pride.
// The operator has a desk, a view, a button that glows. Everything works.
import * as THREE from 'three';
import { makeTimeMap } from '../engine/timemap.js';
import { PAL } from '../config.js';
import { glow, setGlow } from '../engine/look.js';
import { defineShot } from '../engine/set.js';
import { clamp, ease, impulse, lerp, prog, smoothstep } from '../engine/util.js';
import { DESK_Y } from '../world/kit.js';
import { INK, camKeys, faceTo, layFlat, makeClock, operate, setInk } from './common.js';

export default function registerOpen(tl, sets, engine) {
  const floor = sets.floor, A = engine.audio, LY = engine.lyrics;
  // B(): v1 bar positions mapped onto the v2 recording; V(): v2 bars (see engine/timemap.js)
  const { B, V } = makeTimeMap(A);
  const W = (id, i) => LY.line(id).words[i];
  const asp = engine.aspect;

  // every press of the button in this part of the film (the first one lands a quarter-second before the band comes in)
  const PRESS0 = V(9) - 0.25;
  const CLK = makeClock([PRESS0, B(6) + 0.35, B(7.82), W('v1-4', 1).start, B(12) + 0.3, B(14) + 0.3, B(16) + 0.3, W('v1-8', 1).start, W('v1-8', 7).start]);
  const C_WHITE = new THREE.Color(PAL.white), C_GREEN = new THREE.Color(PAL.green);
  const kickerText = (S) => {
    const k = S.text('REQUEST 0001   PLEASE CONFIRM', { flat: true, font: 'machine', size: 0.03, tracking: 0.14, material: INK.green(1.2) });
    k.object.position.set(-asp + 0.205, -0.72, 0);
    return k;
  };

  // ------------------------------------------- intro a: one request, travelling
  // The pad before the first word: a single request leaves the machine and runs the rail down to the one desk,
  // so the loop's geography is in the audience's head before anything else happens.
  const ARRIVE = V(4, 1.5);
  const pulseD = (t) => floor.loop.gateD * ease.inOutSine(prog(t, 0.6, ARRIVE));
  const pulsePos = (d, out) => {
    const L = floor.loop;
    return d < L.paths.A.length ? L.paths.A.at(d, out) : L.paths.S.at(d - L.paths.A.length, out);
  };
  defineShot(tl, floor, 'intro-a', 0, (S) => {
    const kicker = kickerText(S);
    const p = new THREE.Vector3();
    return (f) => {
      const t = f.t;
      const up = smoothstep(0, f.end, t);
      floor.light({ lamp: 0, rim: 0.35 + 0.4 * up, envI: lerp(0.4, 0.6, up), wash: 0.6 + 0.4 * up, amb: 0.08 });
      const d = pulseD(t);
      const breathe = 0.78 + 0.22 * Math.sin(t * 5.2);
      floor.loop.setPulses([{ route: 'human', d, color: C_WHITE, gain: (t < ARRIVE ? 3.2 : 1.9 * breathe) * smoothstep(0.3, 1.2, t) }], { trail: 2.2 });
      floor.loop.setIdle(0.07, PAL.white);
      floor.loop.showMap();
      floor.stageApproval({ waiting: smoothstep(ARRIVE - 0.2, ARRIVE + 0.3, t) }, 99, 99, { t });
      floor.op.pose({ rHand: [0.25, 0.757, -0.42], rDip: 0.12, headPitch: -0.1 });
      // the camera rides alongside the request, then lets it run ahead into the gate
      pulsePos(Math.max(0, d), p);
      const u = prog(t, 0.0, f.end);
      const side = lerp(-3.4, -1.0, ease.inOutSine(u));
      floor.rig.set({
        pos: [p.x + side, lerp(3.6, 1.2, ease.inOutSine(u)), p.z + lerp(1.8, 3.0, ease.inOutSine(u))],
        look: [p.x * 0.85, 0.8, p.z - 0.4], fov: lerp(34, 30, u), fstop: 2.8, focus: Math.hypot(side, lerp(3.6, 1.2, u) - 0.8, lerp(1.8, 3.0, u)),
      });
      setInk(kicker, smoothstep(2.0, 3.0, t) * (0.7 + 0.3 * Math.sin(t * 5.2)));
      return { fade: 1 - smoothstep(0.2, 2.2, t), bloom: 0.55 };
    };
  });

  // ---------------------------------------------------------------- intro
  defineShot(tl, floor, 'intro', V(4, 3), (S) => {
    const line = S.lyric('intro-1', { flat: true, font: 'doubt', size: 0.115, hold: 1.7, out: 0.6, material: INK.white(1) });
    // set above the title's cap line: the two share the frame for a moment as "HUMAN" lands
    line.object.position.set(-asp + 0.2, 0.71, 0);
    const title = S.text('HUMAN\nIN THE\nLOOP', { flat: true, font: 'displayBlack', size: 0.34, leading: 0.86, tracking: -0.012, material: INK.white(1) });
    title.object.position.set(-asp + 0.2, 0.36, 0);
    const kicker = kickerText(S);
    const titleAt = [V(6), V(6, 2), V(7)];
    return (f) => {
      const t = f.t;
      const up = smoothstep(V(5), V(8), t);
      floor.light({ lamp: 0.02 + 0.98 * smoothstep(V(5, 2), V(7), t), rim: 0.45 + 0.55 * up, envI: lerp(0.4, 0.85, up), wash: 0.7 + 0.3 * up });
      // the request waits in the gate
      const gd = floor.loop.gateD;
      const waiting = t < PRESS0;
      const since = t - PRESS0;
      const breathe = 0.78 + 0.22 * Math.sin(t * 5.2);
      floor.loop.setPulses([waiting
        ? { route: 'human', d: gd, color: C_WHITE, gain: 1.7 * breathe }
        : { route: 'human', d: gd + since * since * 28, color: C_GREEN, gain: 2.4 }]);
      const press = floor.stageApproval({ waiting: waiting ? 1 : 0 }, waiting ? 99 : since, waiting ? PRESS0 - t : 99, { t });
      const reach = smoothstep(PRESS0 - 1.2, PRESS0 - 0.37, t);
      const over = floor.handOnButton(press);
      floor.op.pose({ rHand: [lerp(0.25, over[0], reach), lerp(0.757, over[1], reach) + Math.sin(Math.PI * reach) * 0.03, lerp(-0.42, over[2], reach)], rDip: lerp(0.12, 0.4, reach), headPitch: -0.16 });
      camKeys(floor.rig, t, [
        [f.start, { pos: [0.6, 0.865, 0.36], look: [0.35, 0.785, 0.02], fov: 19, fstop: 2.0 }],
        [V(7), { pos: [0.66, 0.88, 0.42], look: [0.35, 0.785, 0.02], fov: 19, fstop: 2.0 }, ease.linear],
        [V(9), { pos: [1.5, 1.22, 1.72], look: [0.12, 0.9, -0.5], fov: 27, fstop: 2.8 }, ease.inOutCubic],
      ]);
      line.update(t);
      title.words.forEach((w, i) => {
        const k = [0, 1, 1, 2][i];
        const a = prog(t, titleAt[k], titleAt[k] + 0.3, ease.outCubic);
        w.mesh.material.opacity = a * (1 - prog(t, V(9) - 0.5, V(9) - 0.1));
        w.mesh.visible = a > 0.003;
        w.mesh.position.y = w.home.y - (1 - a) * 0.06;
      });
      setInk(kicker, (1 - smoothstep(V(9) - 0.6, V(9) - 0.2, t)) * (0.7 + 0.3 * Math.sin(t * 5.2)));
      return { bloom: 0.5 };
    };
  });

  // ------------------------------------------------- v1-1  desk and view
  defineShot(tl, floor, 'v1-1', B(4), (S) => {
    const line = S.lyric('v1-1', { text: 'They gave me\na desk and a\nbeautiful view', font: 'display', size: 0.8, leading: 1.0, hold: 0.5, hot: 1.6, material: INK.white(0.95), dist: 0.12 });
    line.object.position.set(-5.0, 2.9, -16.5);
    return (f) => {
      const t = f.t;
      floor.colleagues.group.visible = true;
      floor.colleagues.set(() => 0);
      operate(floor, f, CLK);
      camKeys(floor.rig, t, [
        [f.start, { pos: [-3.3, 1.72, 6.1], look: [2.2, 1.5, -9], fov: 31 }],
        [f.end, { pos: [-2.6, 1.66, 4.9], look: [2.2, 1.5, -9], fov: 31 }, ease.outSine],
      ]);
      line.update(t, { exit: f.end - 0.05 });
      return {};
    };
  });

  // --------------------------------------------------- v1-2  the button
  defineShot(tl, floor, 'v1-2', B(6), (S) => {
    const line = S.lyric('v1-2', { text: 'A button that glowed\nwhen a job was due', font: 'display', size: 0.047, leading: 1.12, hold: 0.6, material: INK.white(0.9), mode: 'reveal', dim: 0.0 });
    layFlat(line.object, 0.6, DESK_Y + 0.0012, 0.3, Math.PI / 2);
    return (f) => {
      const t = f.t;
      operate(floor, f, CLK);
      camKeys(floor.rig, t, [
        [f.start, { pos: [1.42, 1.1, 0.02], look: [0.42, 0.765, 0.06], fov: 30, fstop: 4, focus: 0.95 }],
        [f.end, { pos: [1.3, 1.02, 0.1], look: [0.42, 0.765, 0.06], fov: 30, fstop: 4, focus: 0.86 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.05 });
      return { bloom: 0.5 };
    };
  });

  // ------------------------------------------------ v1-3  every paper
  defineShot(tl, floor, 'v1-3', B(8), (S) => {
    const line = S.lyric('v1-3', { text: 'It read every paper\nand offered a plan', font: 'display', size: 0.62, leading: 1.02, hold: 0.5, material: INK.white(0.95), dist: 0.14 });
    const camA = [10.2, 1.5, -4.4];
    faceTo(line.object, [0, 0.72, -1.25], [100, 0, -1.25]);
    return (f) => {
      const t = f.t;
      operate(floor, f, CLK);
      floor.papers.group.visible = true;
      // the stack lifts off the desk and streams into the machine during "read every paper"
      const u = lerp(-0.05, 2.75, prog(t, W('v1-3', 1).start - 0.25, W('v1-3', 4).start + 0.3));
      floor.papers.set(u, [-0.62, DESK_Y + 0.004, 0.14], [0, 1.02, -8.52], { arc: 1.9 });
      // ...and the machine answers: its status line pulses once on "plan"
      floor.machine.set(1 + 2.5 * impulse(t, W('v1-3', 7).start, 0.25));
      camKeys(floor.rig, t, [
        [f.start, { pos: camA, look: [0, 1.3, -4.4], fov: 38 }],
        [f.end, { pos: [9.4, 1.5, -4.7], look: [0, 1.3, -4.6], fov: 38 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.05 });
      return {};
    };
  });

  // ------------------------------------------- v1-4  the green box (flat)
  defineShot(tl, floor, 'v1-4', B(10), (S) => {
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(asp * 2 + 0.4, 2.4), new THREE.MeshBasicMaterial({ color: '#040506', transparent: true }));
    bg.position.z = -3;
    bg.renderOrder = 0;
    const SZ = 0.86, bx = -asp + 0.3 + SZ / 2, by = 0.02;
    const fillMat = glow(PAL.green, 1.0, { transparent: true });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(SZ, SZ), fillMat);
    fill.position.set(bx, by, -2);
    fill.renderOrder = 1;
    const frameMat = glow(PAL.white, 1, { transparent: true });
    const th = 0.014;
    const frame = [[0, SZ / 2, SZ + th, th], [0, -SZ / 2, SZ + th, th], [-SZ / 2, 0, th, SZ + th], [SZ / 2, 0, th, SZ + th]].map(([x, y, w, h]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frameMat);
      m.position.set(bx + x, by + y, -1);
      m.renderOrder = 2;
      return m;
    });
    // the tick: one stroke with a mitred elbow, drawn the way a hand draws it (down the short leg, up the long one)
    const tickMat = glow('#040506', 1, { transparent: true, side: THREE.DoubleSide });
    const TK = { a: [-0.262, 0.012], b: [-0.062, -0.202], c: [0.292, 0.286], h: 0.046 };
    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
    const tick = new THREE.Mesh(tickGeo, tickMat);
    tick.position.set(bx, by, -0.5);
    tick.renderOrder = 3;
    tick.frustumCulled = false;
    const L1 = Math.hypot(TK.b[0] - TK.a[0], TK.b[1] - TK.a[1]), L2 = Math.hypot(TK.c[0] - TK.b[0], TK.c[1] - TK.b[1]);
    /** Rebuild the stroke for a drawn length of p * (L1 + L2). */
    const drawTick = (p) => {
      const d = clamp(p) * (L1 + L2), h = TK.h, P = tickGeo.attributes.position.array;
      const d1 = [(TK.b[0] - TK.a[0]) / L1, (TK.b[1] - TK.a[1]) / L1], d2 = [(TK.c[0] - TK.b[0]) / L2, (TK.c[1] - TK.b[1]) / L2];
      const n1 = [-d1[1], d1[0]], n2 = [-d2[1], d2[0]];
      const u1 = Math.min(d, L1), u2 = Math.max(0, d - L1);
      // end of the first leg: a square end while it is still being drawn, the mitre once the stroke has turned the corner
      const e = [TK.a[0] + d1[0] * u1, TK.a[1] + d1[1] * u1];
      let ep = [e[0] + n1[0] * h, e[1] + n1[1] * h], em = [e[0] - n1[0] * h, e[1] - n1[1] * h];
      if (u2 > 0) {
        const m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(m[0], m[1]);
        const k = h / ((m[0] * n1[0] + m[1] * n1[1]) / ml) / ml;
        ep = [TK.b[0] + m[0] * k, TK.b[1] + m[1] * k];
        em = [TK.b[0] - m[0] * k, TK.b[1] - m[1] * k];
      }
      const ap = [TK.a[0] + n1[0] * h, TK.a[1] + n1[1] * h], am = [TK.a[0] - n1[0] * h, TK.a[1] - n1[1] * h];
      const c = [TK.b[0] + d2[0] * u2, TK.b[1] + d2[1] * u2];
      const cp = u2 > 0 ? [c[0] + n2[0] * h, c[1] + n2[1] * h] : ep, cm = u2 > 0 ? [c[0] - n2[0] * h, c[1] - n2[1] * h] : em;
      [ap, am, em, ap, em, ep, ep, em, cm, ep, cm, cp].forEach((v, i) => { P[i * 3] = v[0]; P[i * 3 + 1] = v[1]; P[i * 3 + 2] = 0; });
      tickGeo.attributes.position.needsUpdate = true;
      tick.visible = d > 1e-4;
    };
    S.flat.add(bg, fill, ...frame, tick);
    const tx = bx + SZ / 2 + 0.22;
    const l1 = S.lyric('v1-4', { flat: true, text: 'I checked\nthe green box\nlike a\nsensible man', font: 'display', size: 0.2, leading: 1.0, hold: 3, material: INK.white(1), styles: { 3: { material: INK.green(1.15) }, 4: { material: INK.green(1.15) } } });
    l1.object.position.set(tx, 0.3, 0);
    l1.words.forEach((w) => (w.mesh.renderOrder = 10));
    const base = l1.words.map((w) => w.mesh.material.userData.base.clone());
    return (f) => {
      const t = f.t;
      operate(floor, f, CLK);
      floor.rig.set({ pos: [0.3, 1.13, 0.98], look: [0.06, 0.76, -0.12], fov: 27 });
      const wd = LY.line('v1-4').words;
      const inP = prog(t, f.start, f.start + 0.18);
      bg.material.opacity = 1;
      frameMat.opacity = inP;
      // tick on "checked", fill on "green", then the box takes the whole frame
      const fillP = prog(t, wd[3].start - 0.02, wd[3].start + 0.22, ease.outCubic);
      const grow = prog(t, wd[5].start - 0.05, wd[6].start, ease.inOutCubic);
      fillMat.opacity = fillP;
      const sc = lerp(1, 6.5, grow);
      fill.scale.set(sc, sc, 1);
      fill.position.x = lerp(bx, 0, grow);
      drawTick(prog(t, wd[1].start - 0.03, wd[1].start + 0.2, ease.inOutSine));
      // tick is white on the empty box, black once the box is green
      tickMat.color.set('#f3f5f2').lerp(new THREE.Color('#040506'), fillP);
      tickMat.opacity = 1 - prog(t, wd[5].start, wd[5].start + 0.2);
      frame.forEach((m) => (m.material.opacity = inP * (1 - grow)));
      l1.update(t, { exit: f.end + 1 });
      // once the green has swallowed the frame, all the type is black on green
      l1.words.forEach((w, i) => {
        const m = w.mesh.material;
        const covered = clamp((grow - 0.25) * 2.2);
        m.color.copy(base[i]).lerp(new THREE.Color('#031008'), covered);
        m.userData.base.copy(m.color);
      });
      l1.words.forEach((w, i) => w.mesh.material.userData.base.copy(base[i]));
      return { vignette: lerp(0.55, 0.15, grow), grain: 0.018, bloom: lerp(0.3, 0.12, grow), ca: 0 };
    };
  });

  // ---------------------------------------------------- v1-5  the year
  defineShot(tl, floor, 'v1-5', B(12), (S) => {
    const line = S.lyric('v1-5', { flat: true, text: 'It solved in a second\nwhat took us a year', font: 'display', size: 0.15, leading: 1.04, hold: 0.4, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, 0.72, 0);
    const Y0 = [11.5, 0, -5.5];
    return (f) => {
      const t = f.t;
      floor.light({ lamp: 0, rim: 0, envI: 0.8, wash: 0.5 });
      floor.station.visible = false;
      floor.loop.group.visible = false;
      floor.machine.group.visible = false;
      floor.year.group.visible = true;
      floor.spotAt([Y0[0] - 2.5, 4.1, Y0[2] + 4.6], [Y0[0] + 0.5, 0.5, Y0[2] - 0.6], 150, 0.78);
      const wd = LY.line('v1-5').words;
      const t0 = wd[4].start - 0.04; // "second"
      floor.year.set((i) => (t - (t0 + i * 0.062)) / 0.42, (i) => prog(t, t0 + i * 0.062 + 0.4, t0 + i * 0.062 + 0.6));
      camKeys(floor.rig, t, [
        [f.start, { pos: [Y0[0] - 6.4, 1.5, Y0[2] + 4.3], look: [Y0[0] - 0.8, 0.72, Y0[2]], fov: 30, fstop: 4 }],
        [t0, { pos: [Y0[0] - 5.6, 1.6, Y0[2] + 4.6], look: [Y0[0] - 0.3, 0.7, Y0[2]], fov: 30, fstop: 4 }, ease.linear],
        [f.end, { pos: [Y0[0] - 4.2, 2.5, Y0[2] + 4.9], look: [Y0[0] + 0.4, 0.2, Y0[2] - 0.9], fov: 30, fstop: 4 }, ease.outCubic],
      ]);
      line.update(t, { exit: f.end - 0.05 });
      return {};
    };
  });

  // ------------------------------------------- v1-6  they moved the desks
  defineShot(tl, floor, 'v1-6', B(14), (S) => {
    const line = S.lyric('v1-6', { flat: true, text: 'They moved\nall the desks\ntill just mine\nwas here', font: 'display', size: 0.17, leading: 0.98, hold: 0.4, material: INK.white(1), align: 'left' });
    line.object.position.set(-asp + 0.2, 0.68, 0);
    return (f) => {
      const t = f.t;
      operate(floor, f, CLK);
      floor.spotAt([8, 4.3, 9], [-2, 0, -3], 420, 0.95, '#cfdcf2');
      floor.colleagues.group.visible = true;
      // a wave that starts at the far walls and closes in on the one desk that stays
      const t0 = W('v1-6', 1).start - 0.1, span = 1.85;
      floor.colleagues.set((s) => (t - (t0 + (1 - s.dist / 21) * span + s.r * 0.2)) / 0.8);
      camKeys(floor.rig, t, [
        [f.start, { pos: [11.5, 5.6, 13.5], look: [-1.5, 0.3, -2.2], fov: 36 }],
        [f.end, { pos: [9.6, 6.6, 12.2], look: [-1.2, 0.3, -2.4], fov: 36 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.05 });
      return { vignette: 0.7 };
    };
  });

  // --------------------------------------------- v1-7  what it invented
  const ART = [0, 1.22, -6.6];
  const stageArt = (t, t0) => {
    floor.artifact.group.visible = true;
    floor.plinth.visible = true;
    floor.artLight.intensity = 36 * smoothstep(t0 - 0.3, t0 + 0.5, t);
    // it is made in front of him: the lattice is laid down outwards from the core, then the rings are drawn round it
    floor.artifact.set({ t, grow: prog(t, t0, t0 + 2.3, ease.inOutSine), glow: smoothstep(t0 - 0.2, t0 + 0.4, t) });
    floor.artifact.group.rotation.set(0.3, (t - t0) * 0.3, 0.12);
  };
  defineShot(tl, floor, 'v1-7', B(16), (S) => {
    const line = S.lyric('v1-7', { flat: true, text: 'I watched it invent\nwhat I couldn’t explain', plain: true, font: 'display', size: 0.14, leading: 1.08, hold: 0.4, material: INK.white(1), align: 'right', styles: { 4: { font: 'doubt', scale: 1.08 }, 5: { font: 'doubt', scale: 1.08 }, 6: { font: 'doubt', scale: 1.08 }, 7: { font: 'doubt', scale: 1.08 } } });
    line.object.position.set(asp - 0.2, -0.56, 0);
    return (f) => {
      const t = f.t;
      operate(floor, f, CLK, { pose: { headPitch: 0.06, headYaw: 0.0 } });
      stageArt(t, W('v1-7', 3).start - 0.35);
      camKeys(floor.rig, t, [
        [f.start, { pos: [-1.15, 1.18, -4.05], look: [0.12, 1.22, -6.6], fov: 22, fstop: 2.8, focus: 2.85 }],
        [f.end, { pos: [-0.7, 1.26, -4.3], look: [0.1, 1.22, -6.6], fov: 22, fstop: 2.8, focus: 2.4 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.05 });
      return { bloom: 0.5 };
    };
  });

  // ------------------------------------------------------ v1-8  again
  defineShot(tl, floor, 'v1-8', B(18), (S) => {
    const line = S.lyric('v1-8', { flat: true, text: 'Then gave it permission\nto do it again', font: 'display', size: 0.15, leading: 1.04, hold: 0.3, material: INK.white(1), styles: { 7: { material: INK.green(1.15) } } });
    line.object.position.set(-asp + 0.2, 0.72, 0);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
    const spots = [[-1.5, -6.6], [1.5, -6.6], [-1.5, -4.9], [0, -4.9], [1.5, -4.9], [-1.5, -3.2], [0, -3.2], [1.5, -3.2], [-0.75, -1.9], [0.75, -1.9], [-2.2, -8.0], [2.2, -8.0]];
    return (f) => {
      const t = f.t;
      operate(floor, f, CLK);
      stageArt(t, B(16));
      // permission given on "gave"; from then on a new one lands on every eighth note
      const t0 = W('v1-8', 1).start + 0.25;
      floor.artCopies.group.visible = true;
      spots.forEach(([x, z], i) => {
        const a = prog(t, t0 + i * A.beat_period * 0.5, t0 + i * A.beat_period * 0.5 + 0.3, ease.outBack);
        _p.set(x, -1.3 * (1 - a), z);
        _e.set(0, t * 0.55 + i * 1.7, 0);
        _q.setFromEuler(_e);
        _s.setScalar(a > 0 ? 1 : 0.0001);
        _m.compose(_p, _q, _s);
        floor.artCopies.setMatrix(i, _m);
        const o = floor.artCopyObjs[i];
        o.visible = a > 0;
        o.position.set(x, 1.22 - 1.3 * (1 - a), z);
        o.rotation.set(0.3, i * 1.7, 0.12);
      });
      floor.artCopies.commit();
      floor.artCopyMat.uniforms.uT.value = t;
      floor.spotAt([2.5, 4.2, 0.5], [0, 0.6, -5], 240, 0.75);
      camKeys(floor.rig, t, [
        [f.start, { pos: [3.4, 1.7, 2.9], look: [-0.5, 1.0, -4.8], fov: 36 }],
        [f.end, { pos: [4.4, 2.6, 4.0], look: [-0.5, 0.9, -4.6], fov: 36 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.05 });
      return {};
    };
  });
  void ART;
}
