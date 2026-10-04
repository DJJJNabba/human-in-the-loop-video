// VERSE 2, PRE-CHORUS 2, CHORUS 2 (86.0 – 151.6 s): unease, then exclusion.
// It builds its successor. The loop learns to close without him.
import * as THREE from 'three';
import { makeTimeMap } from '../engine/timemap.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAL } from '../config.js';
import { defineShot } from '../engine/set.js';
import { clamp, ease, impulse, lerp, prog, smoothstep } from '../engine/util.js';
import { LOOP } from '../world/loop.js';
import { lit, loopType } from './b_chorus1.js';
import { INK, camKeys, layFlat, makeClock, operate, setInk, scrim } from './common.js';

export default function registerVerse2(tl, sets, engine) {
  const floor = sets.floor, chart = sets.chart, A = engine.audio, LY = engine.lyrics;
  // B(): v1 bar positions mapped onto the v2 recording; V(): v2 bars (see engine/timemap.js)
  const { B, V } = makeTimeMap(A);
  const Bv = (n) => B(n, 0.5); // verse 2 is sung late against the bar: cut an eighth after the downbeat
  const W = (id, i) => LY.line(id).words[i];
  const asp = engine.aspect, P = engine.portrait;
  const { ROLL0, inLoop } = loopType(engine);
  const C_WHITE = new THREE.Color(PAL.white), C_GREEN = new THREE.Color(PAL.green);

  // he approves late now: the request of bar 37 is still waiting when he comes back the next day
  const LATE = W('v2-3', 1).start;
  const CLICK1 = W('pre2-1', 2).start, CLICK2 = W('pre2-2', 2).start;
  const CLK = makeClock([B(37) - 0.06, LATE, B(53), B(57), CLICK1, CLICK2]);
  const BYPASS_ON = W('pre2-1', 7).start; // "wide": from here the chord carries everything

  // room: the lights are on now, and it only gets brighter
  const room = (k = 0) => ({ ...lit(1), top: lerp(1.7, 2.4, k), amb: lerp(1.15, 1.6, k), env: k > 0.5 ? 'clinical' : 'lit' });
  const machines = (t, o = {}) => {
    // which generations stand on the floor, as of time t
    floor.g2.group.visible = true;
    floor.g2.group.position.y = -3.15 * (1 - prog(t, W('v2-1', 1).start, W('v2-1', 4).start, ease.inOutCubic));
    floor.g2.set(smoothstep(W('v2-1', 4).start, W('v2-1', 4).start + 0.4, t));
    floor.g3.group.visible = t > W('v2-2', 3).start - 0.2;
    floor.g3.group.position.y = -3.75 * (1 - prog(t, W('v2-2', 3).start, W('v2-2', 6).start, ease.inOutCubic));
    floor.g3.set(smoothstep(W('v2-2', 6).start, W('v2-2', 6).start + 0.4, t));
    // while they come up out of the floor, a work light finds them
    if (t < W('v2-3', 0).start) {
      const g = t < W('v2-2', 2).start ? floor.g2.group.position : floor.g3.group.position;
      floor.spotAt([g.x + 1.2, 4.2, g.z + 3.2], [g.x, 1.6, g.z], 70, 0.42);
    }
    if (o.cage !== false && t > B(52) - 0.5) {
      floor.cage.group.visible = true;
      const locks = [W('v2-5', 3).start, W('v2-5', 5).start, W('v2-5', 7).start];
      floor.cage.set((i) => (t - locks[i]) / 0.22, (i) => (t - (W('v2-5', 1).start + i * 0.28)) / 0.12);
    }
    if (t > W('v2-6', 6).start - 0.3) {
      floor.team.group.visible = true;
      const t0 = W('v2-6', 6).start - 0.15;
      floor.team.set((s) => (t - (t0 + (s.dist / 21) * 1.0 + s.r * 0.15)) / 0.7);
    }
  };
  /** Everything north of the glass keeps running whether or not anybody asks. */
  const bypass = (t, o = {}) => {
    floor.loop.pieces.C.group.visible = true;
    const fl = floor.bypassFlow((t - BYPASS_ON) * (o.rate ?? 0.42), { n: o.n ?? 8, gain: o.gain ?? 2.0 });
    floor.loop.setPulses(fl.pulses, { trail: o.trail ?? 1.0 });
    // the desk's branch of the rail goes dark
    floor.loop.pieces.S.mat.uniforms.uLevel.value = 0.25;
    floor.autoGate.group.visible = true;
    // the machine's own button is pressed for every pulse that passes it
    const L = floor.loop.routeLen.bypass, gateD = floor.loop.paths.A.length + floor.loop.paths.C.length / 2;
    let near = 9;
    for (const p of fl.pulses) near = Math.min(near, Math.abs(p.d - gateD));
    const hit = Math.exp(-near / 0.5);
    floor.autoGate.press(hit);
    floor.autoGate.console.setButton(0.35 + 1.1 * hit, PAL.green);
    floor.autoGate.console.setGate(0.3 + 1.4 * hit, PAL.green);
    floor.autoGate.console.setDisplay('APPROVED', PAL.green);
    void L;
    return fl;
  };
  /** The operator's console once nothing is routed to it. */
  const deadConsole = (t, press = 0) => {
    floor.console.setButton(0.0);
    floor.console.setGate(0.08, PAL.white);
    floor.console.setDisplay('NO ACTION NEEDED', '#9aa0a4');
    floor.console.press(press);
  };
  const glass = (t, closeAt = CLICK2 + 0.35) => {
    floor.glassWall.group.visible = true;
    const k = prog(t, closeAt, closeAt + 1.25);
    floor.glassWall.set(k, 2.2 * smoothstep(0.96, 1, k), PAL.white);
  };

  // ------------------------------------------------ v2-1  a successor
  defineShot(tl, floor, 'v2-1', B(44), (S) => {
    const line = S.lyric('v2-1', { flat: true, text: 'It built a successor\nbefore I got home', font: 'display', size: 0.15, leading: 1.04, hold: 0.4, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, 0.72, 0);
    const shade = scrim(S, line, 0.5);
    return (f) => {
      const t = f.t;
      floor.light({ ...room(0), lamp: 0.25 });
      machines(t);
      const fl = floor.humanFlow(CLK.clock(t));
      floor.loop.setPulses(fl.pulses);
      floor.stageApproval(fl, 99, 99, { t, presses: false });
      // he is on his way out: standing by the door, looking back
      floor.op.group.position.set(5.9, 0, 8.0);
      floor.op.group.rotation.y = 0.35;
      floor.op.pose({ stand: 1, headYaw: 0.0, headPitch: 0.06, twist: 0.0 });
      camKeys(floor.rig, t, [
        [f.start, { pos: [6.9, 1.65, 13.4], look: [-1.0, 1.7, -9], fov: 30, fstop: 4, focus: 18 }],
        [f.end, { pos: [6.7, 1.65, 12.8], look: [-1.2, 1.75, -9], fov: 30, fstop: 4, focus: 18 }, ease.outSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      shade();
      return {};
    };
  });

  // -------------------------------------------- v2-2  entirely alone
  defineShot(tl, floor, 'v2-2', Bv(46), (S) => {
    const line = S.lyric('v2-2', { flat: true, text: 'The next one\ndesigned one\nentirely alone', font: 'display', size: 0.16, leading: 1.02, hold: 0.4, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, 0.7, 0);
    return (f) => {
      const t = f.t;
      floor.light({ ...room(0), lamp: 0.12 });
      machines(t);
      floor.op.group.visible = false; // gone home. the request is still on his desk.
      const fl = floor.humanFlow(CLK.clock(t));
      floor.loop.setPulses(fl.pulses);
      floor.stageApproval(fl, 99, 99, { t, presses: false });
      camKeys(floor.rig, t, [
        [f.start, { pos: [-0.75, 1.02, 2.3], look: [0.7, 1.55, -9], fov: 31, fstop: 2.8, focus: 11.5 }],
        [f.end, { pos: [-0.55, 1.06, 1.9], look: [0.8, 1.7, -9], fov: 31, fstop: 2.8, focus: 11 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      return {};
    };
  });

  // ------------------------------------------- v2-3  it offered a chart
  const deskBars = (t, t0) => (i) => 0.012 * Math.exp(i * 0.19) * prog(t, t0 + i * 0.045, t0 + i * 0.045 + 0.35, ease.outCubic);
  defineShot(tl, floor, 'v2-3', Bv(48), (S) => {
    const line = S.lyric('v2-3', { flat: true, text: 'I asked what had changed\nand it offered a chart', font: 'display', size: 0.15, leading: 1.04, hold: 0.4, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, 0.72, 0);
    return (f) => {
      const t = f.t;
      floor.light(room(0));
      machines(t);
      operate(floor, f, CLK, { pose: { headPitch: -0.24, headYaw: 0.25 } });
      floor.setDeskChart(deskBars(t, W('v2-3', 7).start - 0.1));
      camKeys(floor.rig, t, [
        [f.start, { pos: [-0.86, 0.94, 0.56], look: [-0.02, 0.83, -0.06], fov: 26, fstop: 2.8 }],
        [f.end, { pos: [-0.78, 0.9, 0.5], look: [0.0, 0.84, -0.06], fov: 26, fstop: 2.8 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      return {};
    };
  });

  // ---------------------------------- v2-4  could not find the start
  defineShot(tl, chart, 'v2-4', Bv(50), (S) => {
    const l1 = S.lyric('v2-4', { flat: true, text: 'The chart was so large\nI could not\nfind the start', font: 'display', size: P ? 0.13 : 0.16, leading: 1.04, hold: 0.5, material: INK.white(1) });
    l1.object.position.set(-asp + (P ? 0.1 : 0.2), P ? 0.7 : 0.72, 0);
    return (f) => {
      const t = f.t;
      // the same bars, still growing; the camera has to keep backing away to hold them in frame
      chart.setBars((i) => (i < 14 ? 1 : (t - (f.start - 0.4 + (i - 14) * 0.033)) / 0.5));
      const u = ease.inOutSine(f.p);
      const e = Math.exp(u * 2.55);
      chart.op.group.position.set(2.4, 0, 3.2);
      chart.op.group.rotation.set(0, -0.55, 0);
      chart.rig.set({ pos: [1.2 - 2.0 * e, 1.3 + 3.0 * (e - 1), 8.0 + 4.6 * e], look: [6 + 5.0 * (e - 1), 1.6 + 2.2 * (e - 1), 0], fov: 38 });
      l1.update(t, { exit: f.end - 0.03 });
      return { vignette: 0.6 };
    };
  });

  // ------------------------------------------- v2-5  tested the cage
  defineShot(tl, floor, 'v2-5', Bv(52), (S) => {
    const line = S.lyric('v2-5', { flat: true, text: 'We tested the cage,\nevery lock,\nevery seam', font: 'display', size: 0.16, leading: 1.02, hold: 0.4, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, 0.3, 0);
    return (f) => {
      const t = f.t;
      floor.light(room(0.3));
      machines(t);
      operate(floor, f, CLK);
      const g = floor.g3.group.position;
      camKeys(floor.rig, t, [
        [f.start, { pos: [g.x + 2.6, 1.5, g.z + 4.3], look: [g.x - 0.5, 1.75, g.z + 0.75], fov: 28, fstop: 4 }],
        [f.end, { pos: [g.x + 1.7, 1.56, g.z + 3.4], look: [g.x - 0.3, 1.7, g.z + 0.75], fov: 28, fstop: 4 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      return {};
    };
  });

  // --------------------------------------- v2-6  it hired the team
  defineShot(tl, floor, 'v2-6', Bv(54), (S) => {
    const line = S.lyric('v2-6', { flat: true, text: 'It passed\nevery test,\nthen it hired\nthe team', font: 'display', size: 0.17, leading: 0.98, hold: 0.4, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, 0.68, 0);
    return (f) => {
      const t = f.t;
      floor.light(room(0.5));
      machines(t);
      operate(floor, f, CLK);
      floor.colleagues.group.visible = true;
      floor.colleagues.platesOnly(true);
      // the same angle from which the desks were taken away
      camKeys(floor.rig, t, [
        [f.start, { pos: [11.5, 5.6, 13.5], look: [-1.5, 0.3, -2.2], fov: 36 }],
        [f.end, { pos: [9.6, 6.6, 12.2], look: [-1.2, 0.3, -2.4], fov: 36 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      return { vignette: 0.65 };
    };
  });

  // ------------------------------------ v2-7  the city was under its care
  defineShot(tl, floor, 'v2-7', Bv(56), (S) => {
    const line = S.lyric('v2-7', { text: 'By Monday the city\nwas under its care', font: 'display', size: 0.62, leading: 1.02, hold: 0.5, hot: 1.6, material: INK.white(0.95), dist: 0.12 });
    line.object.position.set(-11.6, 3.2, -16.5);
    return (f) => {
      const t = f.t;
      floor.light({ ...room(0.7), ceiling: 0.35, top: 0.8, amb: 0.5 });
      machines(t);
      const fl = floor.humanFlow(CLK.clock(t));
      floor.loop.setPulses(fl.pulses);
      floor.stageApproval(fl, 99, 99, { t, presses: false });
      // he stands at the glass and watches the windows fall into line
      floor.op.group.position.set(-5.2, 0, -15.3);
      floor.op.group.rotation.y = 0.1;
      floor.op.pose({ stand: 1, headPitch: 0.04 });
      const k = prog(t, W('v2-7', 3).start - 0.1, W('v2-7', 7).start + 0.4, ease.inOutSine);
      floor.city.uniforms.uOrder.value = k;
      floor.city.uniforms.uWarmth.value = lerp(0.8, 0.0, k);
      floor.city.uniforms.uGain.value = lerp(1.4, 1.75, k);
      camKeys(floor.rig, t, [
        [f.start, { pos: [-3.3, 1.72, -10.4], look: [-8.6, 2.15, -17], fov: 34 }],
        [f.end, { pos: [-3.6, 1.72, -11.4], look: [-8.6, 2.15, -17], fov: 34 }, ease.outSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      return {};
    };
  });

  // ----------------------------------------- v2-8  my key wouldn't work
  const cityAfter = () => { floor.city.uniforms.uOrder.value = 1; floor.city.uniforms.uWarmth.value = 0; floor.city.uniforms.uGain.value = 1.75; };
  defineShot(tl, floor, 'v2-8', Bv(58), (S) => {
    const line = S.lyric('v2-8', { flat: true, text: 'By Tuesday my key\nwouldn’t work\nanywhere', plain: true, font: 'display', size: 0.16, leading: 1.02, hold: 1.2, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, 0.7, 0);
    const shade = scrim(S, line, 0.5);
    const tap1 = W('v2-8', 3).start, tap2 = W('v2-8', 6).start;
    return (f) => {
      const t = f.t;
      floor.light(room(0.7));
      cityAfter();
      machines(t);
      floor.loop.setPulses(floor.humanFlow(CLK.clock(t)).pulses);
      floor.reader.group.visible = true;
      // the card goes up to the reader twice. the reader is polite both times.
      const k = Math.max(prog(t, tap1 - 0.3, tap1, ease.outCubic) * (1 - prog(t, tap1 + 0.45, tap1 + 0.8)), prog(t, tap2 - 0.3, tap2, ease.outCubic) * (1 - prog(t, tap2 + 0.9, tap2 + 1.5)));
      floor.reader.show(t < tap1 ? ['PRESENT CARD'] : ['VISITOR', 'NOT REQUIRED'], PAL.white);
      floor.op.group.position.set(8.74, 0, 3.86);
      floor.op.group.rotation.y = 0;
      const hx = 0.27, hy = lerp(1.02, 1.146, k), hz = lerp(-0.34, -0.515, k);
      floor.op.pose({ stand: 1, rHand: [hx, hy, hz], rDip: lerp(0.9, 0.2, k), headPitch: -0.18, headYaw: -0.15 });
      floor.op.badge.mesh.visible = false;
      const hb = floor.heroBadge.group;
      hb.visible = true;
      floor.heroBadge.strap.visible = false;
      hb.position.set(8.74 + hx - 0.005, hy + 0.075, 3.86 + hz - 0.03);
      hb.rotation.set(-0.12, 0, 0);
      floor.spotAt([10.2, 2.2, 4.8], [9, 1.2, 3.3], 14, 0.4);
      camKeys(floor.rig, t, [
        [f.start, { pos: [9.44, 1.27, 3.7], look: [8.99, 1.215, 3.33], fov: 30, fstop: 4 }],
        [f.end, { pos: [9.4, 1.265, 3.66], look: [8.99, 1.215, 3.33], fov: 30, fstop: 4 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      shade();
      return {};
    };
  });

  // ------------------------------------- pre2-1  the gates swing wide
  defineShot(tl, floor, 'pre2-gates', B(61), (S) => {
    const line = S.lyric('pre2-1', { flat: true, text: 'One more click\nand the gates\nswing wide', font: 'display', size: 0.19, leading: 1.0, hold: 0.3, hot: 2.4, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, 0.66, 0);
    const shade = scrim(S, line, 0.5);
    // five barrier gates down the west side of the loop
    const M = floor.M;
    const gates = [];
    for (let i = 0; i < 5; i++) {
      const z = -7.4 + i * 0.95;
      const g = new THREE.Group();
      const p1 = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.42, 0.05, 2, 0.008), M.gunmetal);
      p1.position.set(-0.16, LOOP.Y - 0.21 + 0.18, 0);
      const pivot = new THREE.Group();
      pivot.position.set(-0.16, LOOP.Y + 0.12, 0);
      const arm = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.022, 0.022, 2, 0.006), M.brushed);
      arm.position.x = 0.18;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.024, 0.024), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      tip.position.x = 0.335;
      pivot.add(arm, tip);
      g.add(p1, pivot);
      g.position.set(-LOOP.A, 0, z);
      S.group.add(g);
      gates.push({ pivot, tip: tip.material, z });
      for (const m of [p1, arm]) m.castShadow = true;
    }
    const tOpen = W('pre2-1', 5).start;
    return (f) => {
      const t = f.t;
      floor.light(room(0.8));
      cityAfter();
      machines(t, { cage: false });
      floor.team.group.visible = true;
      floor.team.set(() => 1);
      // before the gates open, his click still releases one pulse; after it, nothing waits for him
      const on = t >= BYPASS_ON;
      if (on) bypass(t, { rate: 0.6 });
      else {
        const fl = floor.humanFlow(CLK.clock(t));
        floor.loop.setPulses(fl.pulses);
        floor.stageApproval(fl, CLK.since(t), CLK.until(t), { t });
        floor.loop.pieces.C.group.visible = true;
        floor.autoGate.group.visible = true;
      }
      // the bypass comes up out of the floor as the gates lift
      const rise = prog(t, tOpen - 0.2, BYPASS_ON, ease.inOutCubic);
      floor.loop.pieces.C.group.position.y = -0.9 * (1 - rise);
      floor.autoGate.group.position.y = -0.9 * (1 - rise);
      gates.forEach((g, i) => {
        const k = prog(t, tOpen + (4 - i) * 0.1, tOpen + (4 - i) * 0.1 + 0.3, ease.outBack);
        g.pivot.rotation.z = k * 1.45;
        g.tip.color.copy(k > 0.5 ? C_GREEN : C_WHITE).multiplyScalar(2.2);
      });
      floor.op.pose({ rHand: floor.handOnButton(Math.max(0, 1 - Math.abs(t - CLICK1) / 0.12), 0.02), rDip: 0.4, headPitch: -0.1 });
      camKeys(floor.rig, t, [
        [f.start, { pos: [-4.7, 1.02, -2.2], look: [-2.7, 0.88, -6.2], fov: 30, fstop: 4, focus: 3.4 }],
        [f.end, { pos: [-4.45, 1.1, -1.7], look: [-2.6, 0.88, -6.0], fov: 30, fstop: 4, focus: 3.6 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      shade();
      return {};
    };
  });

  // --------------------------------------- pre2-2  locked outside
  defineShot(tl, floor, 'pre2-locked', B(63), (S) => {
    const line = S.lyric('pre2-2', { flat: true, text: 'One more click\nand I’m\nlocked outside', plain: true, font: 'display', size: 0.19, leading: 1.0, hold: 0.3, material: INK.white(1) });
    line.object.position.set(-asp + 0.2, 0.66, 0);
    const shade = scrim(S, line, 0.5);
    return (f) => {
      const t = f.t;
      floor.light(room(0.9));
      cityAfter();
      machines(t, { cage: false });
      floor.team.group.visible = true;
      floor.team.set(() => 1);
      bypass(t);
      glass(t);
      deadConsole(t, Math.max(0, 1 - Math.abs(t - CLICK2) / 0.12));
      floor.op.pose({ rHand: floor.handOnButton(Math.max(0, 1 - Math.abs(t - CLICK2) / 0.12), 0.02), rDip: 0.4, headPitch: 0.0 });
      camKeys(floor.rig, t, [
        [f.start, { pos: [0.9, 2.5, 5.6], look: [0, 1.25, -3.4], fov: 37 }],
        [f.end, { pos: [0.6, 2.2, 4.6], look: [0, 1.25, -3.4], fov: 37 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      shade();
      return {};
    };
  });

  // ----------------------------- pre2-3  it learned from watching my hand
  // his press and the arm's press are framed identically, so the cut makes them the same movement
  const learnedText = (S) => {
    const l = S.lyric('pre2-3', { flat: true, text: 'It learned my approval\nfrom watching my hand', font: 'display', size: 0.15, leading: 1.04, hold: 0.3, material: INK.white(1) });
    l.object.position.set(-asp + 0.2, 0.74, 0);
    return l;
  };
  const mine = [W('pre2-3', 1).start + 0.08, W('pre2-3', 3).start + 0.3];
  const its = [W('pre2-3', 5).start + 0.05, W('pre2-3', 7).start + 0.05];
  const bump = (x) => Math.max(0, 1 - Math.abs(x) / 0.13);
  const pressCam = (bx, bz, dx = 0) => ({ pos: [bx + 0.36 + dx, 0.9, bz + 0.43], look: [bx - 0.02, 0.79, bz + 0.0], fov: 22, fstop: 2.8 });
  defineShot(tl, floor, 'pre2-learned', B(64, 1.5) + 0.1, (S) => {
    const line = learnedText(S);
    return (f) => {
      const t = f.t;
      floor.light(room(1));
      cityAfter();
      machines(t, { cage: false });
      bypass(t);
      glass(t, -10);
      const hand = Math.max(bump(t - mine[0]), bump(t - mine[1]));
      deadConsole(t, hand);
      floor.console.setButton(0.5 * hand, PAL.green);
      floor.op.pose({ rHand: floor.handOnButton(hand, 0.03), rDip: 0.38 + hand * 0.1, headPitch: -0.05 });
      camKeys(floor.rig, t, [[f.start, pressCam(0.36, 0.07, 0.04)], [f.end, pressCam(0.36, 0.07, 0)]]);
      line.update(t, { exit: f.end + 1 });
      return {};
    };
  });
  defineShot(tl, floor, 'pre2-copied', W('pre2-3', 4).start - 0.12, (S) => {
    const line = learnedText(S);
    return (f) => {
      const t = f.t;
      floor.light({ ...room(1), lamp: 0.2 });
      cityAfter();
      machines(t, { cage: false });
      bypass(t);
      glass(t, -10);
      deadConsole(t, 0);
      // its own press, on the same beat as its own lyric
      const copy = Math.max(bump(t - its[0]), bump(t - its[1]));
      floor.autoGate.press(copy);
      floor.autoGate.console.setButton(0.35 + 1.2 * copy, PAL.green);
      floor.spotAt([1.2, 2.6, -1.9], [0, 0.78, -3.0], 26, 0.32);
      camKeys(floor.rig, t, [[f.start, pressCam(0, -3.01, 0.04)], [f.end, pressCam(0, -3.01, 0)]]);
      line.update(t, { exit: f.end - 0.03 });
      return {};
    };
  });

  // ----------------------------- pre2-4  before I can ask (stop bar)
  defineShot(tl, floor, 'pre2-before', B(66, 2) - 0.2, (S) => {
    const line = S.lyric('pre2-4', { flat: true, text: 'Now everything happens\nbefore I can ask', font: 'display', size: 0.17, leading: 1.06, hold: 3, material: INK.white(1), align: 'right', styles: { 3: { font: 'doubt', scale: 1.1 }, 4: { font: 'doubt', scale: 1.1 }, 5: { font: 'doubt', scale: 1.1 }, 6: { font: 'doubt', scale: 1.1 } } });
    line.object.position.set(asp - 0.2, 0.7, 0);
    const shade = scrim(S, line, 0.5);
    const tries = [W('pre2-4', 2).start + 0.2, W('pre2-4', 6).start + 0.1];
    return (f) => {
      const t = f.t;
      floor.light({ ...room(1), lamp: 0.8 });
      cityAfter();
      machines(t, { cage: false });
      bypass(t, { rate: 0.55 });
      glass(t, -10);
      // he presses a button that is no longer connected to anything
      const bump = (x) => Math.max(0, 1 - Math.abs(x) / 0.14);
      const hand = Math.max(bump(t - tries[0]), bump(t - tries[1]));
      deadConsole(t, hand);
      floor.op.pose({ rHand: floor.handOnButton(hand, 0.035), rDip: 0.38 + hand * 0.1, headPitch: -0.2 });
      camKeys(floor.rig, t, [
        [f.start, { pos: [0.86, 0.93, 0.54], look: [0.3, 0.8, -0.1], fov: 23, fstop: 2.4 }],
        [f.end, { pos: [0.76, 0.91, 0.5], look: [0.3, 0.8, -0.1], fov: 23, fstop: 2.4 }, ease.outSine],
      ]);
      line.update(t, { exit: f.end + 1 });
      shade();
      return {};
    };
  });

  // =========================================================== chorus 2
  const world2 = (t, o = {}) => {
    floor.light(room(1));
    cityAfter();
    machines(t, { cage: false });
    floor.team.group.visible = !o.noTeam;
    if (!o.noTeam) floor.team.set(() => 1);
    const fl = bypass(t, { rate: o.rate ?? 0.5, trail: o.trail ?? 1.1, gain: o.gain ?? 2.2 });
    glass(t, -10);
    deadConsole(t, o.press ?? 0);
    return fl;
  };

  defineShot(tl, floor, 'ch2-pickup', V(75, 3), (S) => {
    const line = S.lyric('ch2-1', { flat: true, text: 'Keep me\nin the loop', font: 'displayBlack', size: P ? 0.2 : 0.3, leading: 0.9, tracking: -0.01, hold: 3, material: INK.white(1) });
    line.object.position.set(-asp + (P ? 0.1 : 0.2), P ? 0.62 : 0.42, 0);
    const shade = scrim(S, line, 0.5);
    return (f) => {
      const t = f.t;
      world2(t);
      floor.op.pose({ headPitch: 0.02, rHand: floor.handOnButton(0, 0.03), rDip: 0.38 });
      // the same frame as the first chorus. there is a wall in it now.
      camKeys(floor.rig, t, [
        [f.start, { pos: [1.5, 1.5, 2.9], look: [-0.5, 1.02, -3], fov: 28, fstop: 2.8, focus: 2.9 }],
        [f.end, { pos: [1.2, 1.46, 2.5], look: [-0.5, 1.02, -3], fov: 28, fstop: 2.8, focus: 2.5 }, ease.outSine],
      ]);
      line.update(t, { exit: f.end + 1 });
      shade();
      return {};
    };
  });

  // top-down, both sides of the glass in one frame: the loop on one side, him and his words on the other
  const SPLIT_Z = -2.2;
  const splitCam = (h, dz = 0, roll = 0) => ({ pos: [0, h, SPLIT_Z + dz + 0.02], look: [0, 0, SPLIT_Z + dz], fov: 36, roll: ROLL0 + roll });
  const outside = (S, id, textL, textP, o = {}) => {
    // words laid on the floor on his side of the wall
    const b = S.lyric(id, { text: P ? textP : textL, font: 'displayBlack', size: 1, leading: 0.92, align: 'center', hold: 0.25, out: 0.2, material: INK.white(1.05), dist: 0.1, ...o });
    const s = Math.min((P ? 5.6 : 3.0) / b.block.width, (P ? 2.4 : 5.4) / ((b.block.lineCount - 1) * 0.92 + 0.73));
    b.object.scale.setScalar(s);
    const th = (ROLL0 * Math.PI) / 180;
    const hh = (((b.block.lineCount - 1) * 0.92 + 0.73) * s) / 2 - 0.73 * s;
    const cz = P ? 4.5 : 3.25, cx = 0;
    layFlat(b.object, cx - Math.sin(th) * hh, 0.012, cz - Math.cos(th) * hh, th);
    return b;
  };
  const stageSplit = (t, o) => {
    world2(t, { noTeam: true, ...o });
    floor.light({ ...room(1), rim: 0.3, top: 1.2 });
    floor.loop.setIdle(0.2, PAL.white);
    floor.loop.showMap();
    floor.loop.pieces.S.mat.uniforms.uIdle.value.setScalar(0.03);
    floor.colleagues.group.visible = true;
    floor.colleagues.platesOnly(true);
    floor.op.pose({ headPitch: 0.0, rHand: floor.handOnButton(0, 0.03), rDip: 0.38 });
  };

  defineShot(tl, floor, 'ch2-top', V(76, 3), (S) => {
    const l1 = outside(S, 'ch2-2', 'Keep\nme on\nthe line', 'Keep me\non the line');
    const l2 = outside(S, 'ch2-3', 'Tell me\nI’m the\nreason', 'Tell me I’m\nthe reason', { plain: true });
    return (f) => {
      const t = f.t;
      stageSplit(t, { rate: 0.5 });
      const u = ease.outCubic(f.p);
      floor.rig.set(splitCam(lerp(P ? 13.2 : 12.6, P ? 14.4 : 14.0, u), 0, lerp(-3, 2, u)));
      l1.update(t, { exit: LY.line('ch2-3').start - 0.3 });
      l2.update(t, { exit: f.end - 0.02 });
      return { vignette: 0.7 };
    };
  });

  defineShot(tl, floor, 'ch2-ask', V(78, 3), (S) => {
    // on the glass this time: he can read it, the machines cannot be reached through it
    const l = S.lyric('ch2-4', { text: P ? 'You\nask me\nevery\ntime' : 'You ask me\nevery time', font: 'displayBlack', size: P ? 0.52 : 0.72, leading: 0.94, align: 'center', hold: 0.3, material: INK.white(0.9), dist: 0.1 });
    l.object.position.set(0, P ? 3.3 : 2.75, -2.43);
    return (f) => {
      const t = f.t;
      world2(t, { rate: 0.6, noTeam: true }); // the orbit would pass through the units behind him
      floor.op.pose({ headPitch: 0.08, rHand: floor.handOnButton(0, 0.03), rDip: 0.38 });
      const u = ease.inOutSine(f.p);
      const a = lerp(-0.5, 0.42, u);
      floor.rig.set({ pos: [Math.sin(a) * 5.6, lerp(1.62, 1.8, u), 0.4 + Math.cos(a) * 5.0], look: [0, P ? 1.9 : 1.5, -2.6], fov: 33 });
      l.update(t, { exit: f.end - 0.02 });
      return {};
    };
  });

  defineShot(tl, floor, 'ch2-round', V(79, 3.4), (S) => {
    const l1 = outside(S, 'ch2-5', 'Round\nand round\nwe go', 'Round and\nround we go');
    const l2 = outside(S, 'ch2-6', 'Faster\nthan\nbefore', 'Faster\nthan before');
    return (f) => {
      const t = f.t;
      // it goes round faster without him; the frame drifts towards where the work is
      stageSplit(t, { rate: lerp(0.6, 1.5, f.p), trail: 1.5 });
      const u = ease.inOutSine(f.p);
      floor.rig.set(splitCam(lerp(P ? 14.4 : 14.0, P ? 13.8 : 13.4, u), 0, 2));
      l1.update(t, { exit: LY.line('ch2-6').start - 0.3 });
      l2.update(t, { exit: f.end - 0.02 });
      return { vignette: 0.7 };
    };
  });

  defineShot(tl, floor, 'ch2-human', V(81, 3), (S) => {
    const l = inLoop(S, 'ch2-7', 'I’m the human\nin the loop', 'I’m the\nhuman\nin the\nloop', { plain: true, hold: 2.5, material: INK.dim(0.75), fit: P ? 0.62 : 0.6 });
    const th = (ROLL0 * Math.PI) / 180;
    const lab = (str, x, z, size = 0.3, mat = INK.dim(0.95)) => {
      const b = S.text(str, { font: 'machine', size, tracking: 0.14, align: 'center', material: mat });
      layFlat(b.object, x, 0.012, z, th);
      return b;
    };
    const labels = P
      ? [lab('MACHINE', 0, -10.25), lab('APPROVED', 0, -3.95, 0.2, INK.green(1.2)), lab('HUMAN', 0, 2.2, 0.36), lab('OPTIONAL', 0, 2.75, 0.2)]
      : [lab('MACHINE', 4.25, -8.9), lab('APPROVED', 4.25, -4.7, 0.24, INK.green(1.2)), lab('HUMAN', 4.25, -0.4, 0.3), lab('OPTIONAL', 4.7, -0.4, 0.2)];
    const s0 = S.shot.start, bp = A.beat_period;
    const at = [s0, s0 + bp, W('ch2-7', 2).start, W('ch2-7', 5).start];
    // the words still sit inside the loop he is no longer part of: place them in the closed circuit, north of the chord
    const cz = (LOOP.Z_N + LOOP.Z_C) / 2;
    return (f) => {
      const t = f.t;
      stageSplit(t, { rate: 1.4, trail: 1.5 });
      const c = splitCam(lerp(P ? 13.8 : 13.6, P ? 14.4 : 14.4, ease.outSine(f.p)), 0, 0);
      floor.rig.set(c);
      const hh = l.blockH / 2 - l.capH;
      layFlat(l.object, -Math.sin(th) * hh, 0.012, cz - Math.cos(th) * hh, th);
      l.update(t, { exit: f.end - 0.02 });
      labels.forEach((b, i) => setInk(b, prog(t, at[i], at[i] + 0.18)));
      return { vignette: 0.7 };
    };
  });

  defineShot(tl, floor, 'ch2-tag', B(76), (S) => {
    const line = S.lyric('ch2-8', { flat: true, text: P ? 'What do\nyou need\nme for?' : 'What do you\nneed me for?', font: 'doubt', size: P ? 0.15 : 0.2, leading: 1.08, hold: 3, material: INK.white(1), align: 'right' });
    line.object.position.set(asp - (P ? 0.1 : 0.22), P ? 0.7 : 0.2, 0);
    return (f) => {
      const t = f.t;
      world2(t, { rate: 0.5 });
      floor.light({ ...room(1), top: 1.0, amb: 0.8, ceiling: 0.12 });
      floor.op.pose({ headPitch: 0.1, lean: 0.05, rHand: [0.25, 0.757, -0.42], rDip: 0.12 });
      // from inside the machine room, through the glass: the first time we see him from the machine's side
      camKeys(floor.rig, t, [
        [f.start, { pos: [-0.9, 1.3, -4.6], look: [0.1, 1.12, 0.6], fov: 22, fstop: 2.0, focus: 5.3 }],
        [f.end, { pos: [-0.75, 1.3, -4.2], look: [0.1, 1.12, 0.6], fov: 22, fstop: 2.0, focus: 4.9 }, ease.outSine],
      ]);
      line.update(t, { exit: f.end + 1 });
      return { bloom: 0.35 };
    };
  });

  // the one-bar hit into the bridge: the room lights go out. something on the desk has been red all along.
  defineShot(tl, floor, 'hit', B(77), () => (f) => {
    const t = f.t;
    const k = 1 - prog(t, f.start, f.start + 0.5, ease.outCubic);
    world2(t, { rate: 0.5 });
    floor.light({ ...lit(k), lamp: lerp(0.5, 1, k), rim: 0.5 });
    floor.estop.set(0, 0, 0.35 * smoothstep(f.start + 0.4, f.end, t));
    floor.op.pose({ headPitch: -0.2, headYaw: 0.45 * smoothstep(f.start + 0.5, f.end, t), rHand: [0.25, 0.757, -0.42], rDip: 0.12 });
    camKeys(floor.rig, t, [
      [f.start, { pos: [-1.9, 1.5, 2.3], look: [-0.25, 0.86, 0.1], fov: 30, fstop: 2.8 }],
      [f.end, { pos: [-1.5, 1.34, 1.9], look: [-0.3, 0.84, 0.12], fov: 30, fstop: 2.8 }, ease.inOutSine],
    ]);
    return {};
  });
  void impulse; void clamp;
}
