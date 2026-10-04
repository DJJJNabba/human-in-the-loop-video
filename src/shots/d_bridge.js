// BRIDGE, INTERLUDE, BREAK (151.6 – 197.8 s): panic, then the quiet.
// A real red button. An administrative acknowledgement. An empty train, warm
// windows, a line nobody picks up — then voices like his. Then the desk is empty.
import * as THREE from 'three';
import { makeTimeMap } from '../engine/timemap.js';
import { PAL } from '../config.js';
import { defineShot } from '../engine/set.js';
import { clamp, ease, lerp, prog, smoothstep } from '../engine/util.js';
import { DESK_Y } from '../world/kit.js';
import { OP_Z } from '../world/floor_set.js';
import { LOOP } from '../world/loop.js';
import { allGreenBitmap, lit, loopType } from './b_chorus1.js';
import { INK, camKeys, faceTo, scrim } from './common.js';

export default function registerBridge(tl, sets, engine) {
  const floor = sets.floor, outside = sets.outside, panel = sets.panel, A = engine.audio, LY = engine.lyrics;
  // B(): v1 bar positions mapped onto the v2 recording; V(): v2 bars (see engine/timemap.js)
  const { B, V } = makeTimeMap(A);
  const W = (id, i) => LY.line(id).words[i];
  const asp = engine.aspect, P = engine.portrait;
  const { topCam } = loopType(engine);

  const LIFT = W('br-2', 1).start, PRESS = W('br-2', 5).start + 0.06;
  const ESTOP = new THREE.Vector3(-0.42, DESK_Y, 0.17);
  const BAR = A.bar_period;
  /** the alarm: red, slow, half-time like the vocal; it fades to nothing during "nothing required of you" */
  const alarm = (t) => {
    if (t < PRESS) return 0;
    const fade = 1 - smoothstep(W('br-4', 3).start, W('br-4', 7).start + 0.6, t);
    // v2: the bridge drives on 8th-note kicks; the alarm flashes on every one of them
    const kick = A.hit('kick', t, 0.14);
    return (0.3 + 0.7 * kick) * fade * (0.6 + 0.4 * Math.exp(-(t - PRESS) / 0.6));
  };
  /** the floor after the lights went out: lamp, rim, the machines still running green */
  const dark = (t, o = {}) => {
    const a = alarm(t);
    floor.light({ env: 'dark', envI: 0.65, lamp: o.lamp ?? 1, rim: 0.5 + 1.1 * a, ceiling: a * 0.75, top: 0, amb: 0.05 + 0.25 * a, stripColor: PAL.red, rimColor: a > 0.02 ? PAL.red : '#cfe0ff', wash: 0.6 });
    floor.city.uniforms.uOrder.value = 1;
    floor.city.uniforms.uWarmth.value = 0;
    floor.city.uniforms.uGain.value = 1.75;
    floor.g2.group.visible = floor.g3.group.visible = true;
    floor.loop.pieces.C.group.visible = true;
    floor.autoGate.group.visible = true;
    floor.glassWall.group.visible = true;
    floor.glassWall.set(1, 2.2, PAL.white);
    const fl = floor.bypassFlow((t - 120) * 0.5, { n: 8, gain: 2.2 });
    floor.loop.setPulses(fl.pulses, { trail: 1.1 });
    floor.loop.pieces.S.mat.uniforms.uLevel.value = 0.25;
    floor.autoGate.console.setButton(0.9, PAL.green);
    floor.autoGate.console.setDisplay('APPROVED', PAL.green);
    floor.console.setGate(0.08, PAL.white);
    floor.console.setButton(0);
    floor.estop.group.visible = true;
    return a;
  };
  /** left-hand fingertip on the front edge of the cover as it lifts (operator-local) */
  const coverEdge = (k) => {
    const th = -1.75 * ease.inOutCubic(k);
    const y = 0.085, z = 0.14;
    const yy = y * Math.cos(th) - z * Math.sin(th), zz = y * Math.sin(th) + z * Math.cos(th);
    return [ESTOP.x, ESTOP.y + 0.024 + yy + 0.01, ESTOP.z - 0.07 + zz + 0.012 - OP_Z];
  };
  const capTop = (press) => [ESTOP.x, ESTOP.y + 0.069 - 0.008 * press + 0.008, ESTOP.z - OP_Z + 0.005];
  /** the left hand's whole performance: reach, lift the cover, press */
  const leftHand = (t) => {
    const reach = prog(t, LIFT - 0.7, LIFT - 0.1, ease.inOutSine);
    const open = prog(t, LIFT - 0.05, LIFT + 0.55);
    const toCap = prog(t, LIFT + 0.75, PRESS - 0.18, ease.inOutSine);
    const press = Math.max(0, 1 - Math.abs(t - PRESS) / 0.16) * (t < PRESS + 0.6 ? 1 : 0) + (t > PRESS ? 0.0 : 0);
    const rest = [-0.2, 0.775, -0.36];
    const e = coverEdge(open);
    let p = [lerp(rest[0], e[0], reach), lerp(rest[1], e[1], reach) + Math.sin(Math.PI * reach) * 0.04, lerp(rest[2], e[2], reach)];
    const c = capTop(press);
    const over = [c[0], c[1] + 0.035 * (1 - press), c[2]];
    p = [lerp(p[0], over[0], toCap), lerp(p[1], over[1], toCap) + Math.sin(Math.PI * toCap) * 0.05, lerp(p[2], over[2], toCap)];
    // after the press the hand stays there. nothing happens.
    return { lHand: p, lDip: lerp(0.12, toCap > 0 ? 0.9 : 0.55, Math.max(reach, toCap)), open, press };
  };

  // ------------------------------------------- br-1  a red button
  defineShot(tl, floor, 'br-1', B(78), (S) => {
    const line = S.lyric('br-1', { flat: true, text: P ? 'There was\na red button\nbeneath\nthe glass' : 'There was a red button\nbeneath the glass', font: 'display', size: P ? 0.13 : 0.15, leading: 1.04, hold: 0.4, material: INK.white(1), styles: { 3: { material: INK.red(1.3) } } });
    line.object.position.set(-asp + (P ? 0.1 : 0.2), 0.72, 0);
    return (f) => {
      const t = f.t;
      dark(t);
      floor.estop.set(0, 0, 0.3 + 0.12 * smoothstep(W('br-1', 3).start - 0.1, W('br-1', 3).start + 0.4, t));
      floor.op.pose({ headPitch: -0.32, headYaw: 0.35, rHand: [0.25, 0.757, -0.42], rDip: 0.12 });
      camKeys(floor.rig, t, [
        [f.start, { pos: [-0.86, 0.96, 0.66], look: [-0.42, 0.785, 0.17], fov: 23, fstop: 2.8 }],
        [f.end, { pos: [-0.8, 0.93, 0.6], look: [-0.42, 0.785, 0.17], fov: 23, fstop: 2.8 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      return { bloom: 0.45 };
    };
  });

  // ------------------------------------- br-2  lifted the cover, pressed it
  defineShot(tl, floor, 'br-2', B(80, 0.5), (S) => {
    const line = S.lyric('br-2', { flat: true, text: P ? 'I lifted\nthe cover\nand pressed it\nat last' : 'I lifted the cover\nand pressed it at last', font: 'display', size: P ? 0.13 : 0.15, leading: 1.04, hold: 0.4, hot: 2.6, material: INK.white(1) });
    line.object.position.set(-asp + (P ? 0.1 : 0.2), 0.72, 0);
    return (f) => {
      const t = f.t;
      const a = dark(t);
      const h = leftHand(t);
      floor.estop.set(h.open, h.press, 0.42 + 2.4 * Math.exp(-Math.max(0, t - PRESS) / 0.25) * (t >= PRESS ? 1 : 0) + 0.8 * a);
      floor.op.pose({ lean: 0.2, headPitch: -0.36, headYaw: 0.3, lHand: h.lHand, lDip: h.lDip, rHand: [0.25, 0.757, -0.42], rDip: 0.12 });
      camKeys(floor.rig, t, [
        [f.start, { pos: [-1.42, 1.06, 0.42], look: [-0.34, 0.86, 0.12], fov: 30, fstop: 4 }],
        [PRESS, { pos: [-1.26, 1.0, 0.36], look: [-0.36, 0.84, 0.14], fov: 30, fstop: 4 }, ease.inOutSine],
        [f.end, { pos: [-1.24, 0.99, 0.355], look: [-0.36, 0.84, 0.14], fov: 30, fstop: 4 }],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      return { bloom: 0.5, ca: 0.008 };
    };
  });

  // ----------------------------- br-3  "Your request is in review"
  const quote = { font: 'machine', scale: 0.86, material: INK.white(1.15) };
  defineShot(tl, floor, 'br-3', B(82, 0.5), (S) => {
    const line = S.lyric('br-3', { flat: true, text: P ? 'The screen said,\n"Your request\nis in review"' : 'The screen said,\n"Your request is in review"', font: 'display', size: P ? 0.12 : 0.15, leading: 1.18, hold: 0.4, material: INK.white(1), styles: { 3: quote, 4: quote, 5: quote, 6: quote, 7: quote } });
    line.object.position.set(-asp + (P ? 0.1 : 0.2), 0.72, 0);
    return (f) => {
      const t = f.t;
      dark(t);
      floor.estop.set(1, 0, 0.5 + 0.9 * alarm(t));
      // the console answers in the same small polite type it has always used
      floor.console.setDisplay(t < W('br-3', 3).start - 0.1 ? 'REQUEST RECEIVED' : 'YOUR REQUEST IS IN REVIEW', PAL.white);
      floor.op.pose({ lean: 0.16, headPitch: -0.3, lHand: capTop(0), lDip: 0.9, rHand: [0.25, 0.757, -0.42], rDip: 0.12 });
      camKeys(floor.rig, t, [
        [f.start, { pos: [0.63, 0.95, 0.33], look: [0.36, 0.775, -0.08], fov: 17, fstop: 4 }],
        [f.end, { pos: [0.58, 0.93, 0.29], look: [0.36, 0.775, -0.08], fov: 17, fstop: 4 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      return { bloom: 0.45 };
    };
  });

  // ------------------- br-4  "There's nothing required of you" (on the glass)
  defineShot(tl, floor, 'br-4', B(84, 0.5), (S) => {
    const big = { font: 'machineBold', material: INK.green(1.15) };
    const line = S.lyric('br-4', { text: P ? 'The screen said,\n"There\'s\nnothing\nrequired\nof you"' : 'The screen said,\n"There\'s nothing\nrequired of you"', font: 'display', size: P ? 0.34 : 0.42, leading: 1.15, align: 'center', hold: 1.2, out: 0.8, material: INK.white(0.85), styles: { 3: big, 4: big, 5: big, 6: big, 7: big }, dist: 0.08 });
    faceTo(line.object, [0, P ? 3.5 : 3.05, -2.42], [0, 0, 100]);
    return (f) => {
      const t = f.t;
      dark(t);
      floor.estop.set(1, 0, 0.35 + 0.9 * alarm(t));
      floor.console.setDisplay('NO ACTION NEEDED', '#9aa0a4');
      floor.op.pose({ lean: 0.04, headPitch: 0.12, lHand: [-0.3, 0.757, -0.38], lDip: 0.12, rHand: [0.25, 0.757, -0.42], rDip: 0.12 });
      camKeys(floor.rig, t, [
        [f.start, { pos: [0.55, 1.45, 3.4], look: [0, P ? 2.3 : 1.85, -2.4], fov: 32 }],
        [f.end, { pos: [0.4, 1.42, 2.75], look: [0, P ? 2.3 : 1.85, -2.4], fov: 32 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.2 });
      return {};
    };
  });

  // --------------------------------------- outside: the last train
  const TR = { carL: 19, gap: 0.6 };
  const trainX = (t) => {
    // arrives during the interlude, stands, leaves on "pulled away"
    const arrive = prog(t, B(88), B(89, 2), ease.outCubic);
    const leave = Math.max(0, t - W('br-5', 4).start);
    return lerp(-150, 9, arrive) + 2.2 * leave * leave;
  };
  const stageOutside = (t) => {
    const x = trainX(t);
    outside.train.position.x = x;
    outside.trainGlow.position.set(x - TR.carL - TR.gap, 2.6, 0.7);
    outside.op.group.visible = false;
  };
  defineShot(tl, outside, 'br-5', B(90), (S) => {
    const line = S.lyric('br-5', { flat: true, text: P ? 'The last\nempty train\npulled away\nfrom the light' : 'The last empty train\npulled away from the light', font: 'display', size: P ? 0.13 : 0.15, leading: 1.04, hold: 0.4, material: INK.white(1) });
    line.object.position.set(-asp + (P ? 0.1 : 0.2), P ? -0.5 : -0.52, 0);
    return (f) => {
      const t = f.t;
      stageOutside(t);
      camKeys(outside.rig, t, [
        [f.start, { pos: [-4.2, 2.2, 2.0], look: [8, 1.7, -1.2], fov: 30, fstop: 4, focus: 6 }],
        [f.end, { pos: [-4.0, 2.2, 1.9], look: [10, 1.6, -1.2], fov: 30, fstop: 4, focus: 8 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      return { vignette: 0.65 };
    };
  });

  // ------------------------------------ br-6  the windows stayed warm
  defineShot(tl, outside, 'br-6', B(92), (S) => {
    const line = S.lyric('br-6', { flat: true, text: P ? 'The windows\nstayed warm\nin the houses\nall night' : 'The windows stayed warm\nin the houses all night', font: 'display', size: P ? 0.13 : 0.15, leading: 1.04, hold: 0.4, material: INK.warm(1.05) });
    line.object.position.set(-asp + (P ? 0.1 : 0.2), 0.72, 0);
    return (f) => {
      const t = f.t;
      outside.train.position.x = 400;
      outside.trainGlow.position.set(400, 0, 0);
      outside.op.group.visible = false;
      const u = ease.inOutSine(f.p);
      outside.rig.set({ pos: [lerp(-34, -25, u), 1.65, -36.2], look: [lerp(-14, -5, u), 2.6, -27.5], fov: 34 });
      line.update(t, { exit: f.end - 0.03 });
      return { vignette: 0.6 };
    };
  });

  // ---------------------------- br-7  I waited for someone to pick up
  defineShot(tl, outside, 'br-7', B(94), (S) => {
    const line = S.lyric('br-7', { flat: true, text: P ? 'I waited\nfor someone\nto pick up\nthe line' : 'I waited for someone\nto pick up the line', font: 'doubt', size: P ? 0.14 : 0.17, leading: 1.06, hold: 0.4, material: INK.white(1), align: 'right' });
    line.object.position.set(asp - (P ? 0.1 : 0.2), 0.72, 0);
    return (f) => {
      const t = f.t;
      outside.train.position.x = 400;
      outside.trainGlow.position.set(400, 0, 0);
      const op = outside.op;
      op.group.visible = true;
      // he sits on the platform bench, his back to us, one hand at the headset. Across the track the help point rings
      // and rings; beyond it the warm windows of the houses, where nobody is going to answer either.
      op.group.position.set(1.0, 0.95, 3.93);
      op.group.rotation.y = -0.22;
      op.pose({ lean: 0.16, headPitch: -0.08, headYaw: -0.25, lHand: [-0.135, 1.2, -0.03], lDip: -1.25, rHand: [0.16, 0.58, -0.3], rDip: 0.25 });
      // the ring is a call going out: two slow swells a bar, like a ringing tone
      const ringing = 0.5 + 0.5 * Math.sin((t - f.start) * ((Math.PI * 4) / BAR) - 1.2);
      outside.helpRing.color.copy(outside.helpRing.userData.base).multiplyScalar(0.5 + 2.6 * ringing);
      outside.helpLight.intensity = 0.25 + 1.3 * ringing;
      camKeys(outside.rig, t, [
        [f.start, P ? { pos: [0.2, 2.5, 7.6], look: [1.3, 1.85, 2.6], fov: 34, fstop: 2.8, focus: 3.9 } : { pos: [3.7, 2.2, 7.5], look: [0.9, 1.75, 2.2], fov: 30, fstop: 2.8, focus: 4.4 }],
        [f.end, P ? { pos: [0.3, 2.45, 7.0], look: [1.3, 1.85, 2.6], fov: 34, fstop: 2.8, focus: 3.4 } : { pos: [3.3, 2.15, 6.9], look: [0.9, 1.75, 2.2], fov: 30, fstop: 2.8, focus: 3.8 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.03 });
      return { vignette: 0.65 };
    };
  });

  // ---------------------------- br-8  voices like mine
  defineShot(tl, floor, 'br-8', B(96), (S) => {
    const line = S.lyric('br-8', { flat: true, text: P ? 'It answered\nin chorus\nwith voices\nlike mine' : 'It answered in chorus\nwith voices like mine', font: 'display', size: P ? 0.13 : 0.15, leading: 1.04, hold: 3, material: INK.white(1), styles: { 5: { material: INK.green(1.2) }, 6: { material: INK.green(1.2) }, 7: { material: INK.green(1.2) } } });
    line.object.position.set(-asp + (P ? 0.1 : 0.2), 0.72, 0);
    const shade = scrim(S, line, 0.5);
    const t0 = W('br-8', 1).start, tc = W('br-8', 3).start;
    return (f) => {
      const t = f.t;
      floor.light({ ...lit(1), env: 'clinical', top: 2.2, amb: 1.4, lamp: 0 });
      floor.city.uniforms.uOrder.value = 1;
      floor.city.uniforms.uWarmth.value = 0;
      floor.glassWall.group.visible = true;
      floor.glassWall.set(1, 2.2, PAL.white);
      floor.loop.pieces.C.group.visible = true;
      floor.loop.setPulses(floor.bypassFlow((t - 120) * 0.5, { n: 8, gain: 2.2 }).pulses, { trail: 1.1 });
      floor.loop.pieces.S.mat.uniforms.uLevel.value = 0.25;
      floor.autoGate.group.visible = true;
      floor.g3.group.visible = true;
      floor.op.group.visible = false;
      floor.chair.group.position.set(0, 0, OP_Z + 0.37);
      floor.chair.group.rotation.y = 0.35;
      floor.voices.group.visible = true;
      floor.voices.set((s) => (t - (t0 + s.d * 0.035 + s.h * 0.12)) / 0.5, (s) => smoothstep(tc + s.h * 0.4, tc + s.h * 0.4 + 0.1, t));
      camKeys(floor.rig, t, [
        [f.start, { pos: [1.6, 1.3, -1.3], look: [9.5, 1.05, -7.6], fov: 34 }],
        [f.end, { pos: [2.1, 1.32, -1.6], look: [9.5, 1.05, -7.6], fov: 34 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end + 1 });
      shade();
      return {};
    };
  });

  // ================================================================= break
  // bars 102-103: "mine" held over two stop bars. The floor from above, dark. One request waits at the desk. Nobody is there.
  const stageEmpty = () => {
    floor.op.group.visible = false;
    floor.chair.group.position.set(0, 0, OP_Z + 0.37);
    floor.chair.group.rotation.y = 0.35;
    floor.glassWall.group.visible = true;
    floor.glassWall.set(1, 0.6, PAL.white);
    floor.loop.pieces.C.group.visible = true;
    floor.autoGate.group.visible = true;
    floor.g2.group.visible = floor.g3.group.visible = true;
  };
  const C_WHITE = new THREE.Color(PAL.white);
  defineShot(tl, floor, 'break-silence', V(102), () => (f) => {
    const t = f.t;
    stageEmpty();
    floor.light({ env: 'dark', envI: 0.25, lamp: 0, rim: 0, ceiling: 0, top: 0, amb: 0.0, wash: 0 });
    floor.loop.setIdle(0.05, PAL.white);
    floor.loop.showMap();
    floor.loop.pieces.C.mat.uniforms.uLevel.value = 0.4;
    floor.loop.setPulses([{ route: 'human', d: floor.loop.gateD, color: C_WHITE, gain: 1.4 * (0.8 + 0.2 * Math.sin(t * 5.2)) }]);
    floor.console.setButton(0.18 + 0.1 * Math.sin(t * 5.2));
    floor.console.setDisplay('PLEASE CONFIRM', PAL.white);
    floor.rig.set(topCam(lerp(P ? 12.4 : 14.4, P ? 11.6 : 13.6, ease.inOutSine(f.p)), 0));
    return { vignette: 0.75, beat: 0 };
  });

  // The eight hard bars (104-111): the mechanical pulse at full power, no voice. Everything here moves on the
  // beat grid itself (the tempo is steady to a millisecond), never on a detected onset: a hit on every quarter
  // (kick on 1 and 3, snare on 2 and 4) and sixteenth-note hats. Every beat is a visible event: the camera
  // punches, the light slams, something advances by one.
  const bp = A.beat_period, f0 = A.first_downbeat;
  const G = {
    /** beats since the first downbeat (whole number) */
    n: (t) => Math.floor((t - f0) / bp + 1e-6),
    /** seconds since the last grid tick of `div` beats */
    since: (t, div = 1) => { const x = (t - f0) / (bp * div); return (x - Math.floor(x + 1e-6)) * bp * div; },
    /** 1 on the tick, halving every `hl` seconds */
    pulse: (t, div = 1, hl = 0.09) => Math.pow(0.5, G.since(t, div) / hl),
    /** ticks since `from`, each one arriving as a quick eased step (0 → 1 in `dur` s) */
    step: (t, from, div = 1, dur = 0.1) => {
      const x = (t - from) / (bp * div);
      if (x < 0) return 0;
      const n = Math.floor(x + 1e-6);
      return n + ease.outCubic(clamp(((x - n) * bp * div) / dur));
    },
  };
  const kickP = (t, hl = 0.1) => (G.n(t) % 2 === 0 ? G.pulse(t, 1, hl) : 0); // beats 1 and 3
  const snareP = (t, hl = 0.1) => (G.n(t) % 2 === 1 ? G.pulse(t, 1, hl) : 0); // beats 2 and 4
  /** the picture's own accent, on top of the film-wide one */
  const hitPost = (t, o = {}) => ({ exposure: 1 + 0.2 * kickP(t, 0.07) + 0.1 * snareP(t, 0.07), bloom: (o.bloom ?? 0.45) + 0.3 * kickP(t, 0.09), ca: 0.0035 + 0.012 * snareP(t, 0.06), ...o });
  const machineRoom = (t, k = 1, ceiling = null) => {
    stageEmpty();
    floor.light({ env: 'clinical', envI: 0.85, lamp: 0, rim: 0.3, ceiling: ceiling ?? k * 0.7, top: 1.4 * k, amb: 0.8 * k });
    floor.team.group.visible = true;
    floor.team.set(() => 1);
    floor.autoGate.console.setButton(0.4 + 1.2 * G.pulse(t, 1, 0.1), PAL.green);
    floor.autoGate.press(G.pulse(t, 1, 0.07));
    floor.autoGate.console.setDisplay('APPROVED', PAL.green);
  };
  const C_GREEN = new THREE.Color(PAL.green);

  // bars 104-105: the map. Every beat the closed circuit fires and its requests jump a sixteenth of the way round;
  // the camera comes down a notch and turns. The one request at the desk blinks on the off-beats; nothing collects it.
  defineShot(tl, floor, 'brk-pulse', V(104), () => (f) => {
    const t = f.t;
    const s = G.step(t, f.start, 1, 0.13);
    machineRoom(t, smoothstep(f.start, f.start + 0.12, t));
    floor.team.group.visible = false;
    floor.loop.setIdle(0.14 + 1.5 * G.pulse(t, 1, 0.08), PAL.green);
    floor.loop.showMap();
    floor.loop.pieces.S.mat.uniforms.uIdle.value.setScalar(0.05);
    floor.colleagues.group.visible = true;
    floor.colleagues.platesOnly(true);
    const fl = floor.bypassFlow(0.3 + s / 16, { n: 8, gain: 2.0 + 2.2 * G.pulse(t, 1, 0.1) });
    for (const p of fl.pulses) p.color = C_GREEN;
    floor.loop.setPulses([...fl.pulses, { route: 'human', d: floor.loop.gateD, color: C_WHITE, gain: 0.5 + 1.6 * G.pulse(t + bp / 2, 1, 0.12) }], { trail: 0.9 });
    floor.console.setButton(0.1 + 0.3 * G.pulse(t + bp / 2, 1, 0.12));
    floor.console.setDisplay('PLEASE CONFIRM', PAL.white);
    floor.rig.set(topCam(lerp(P ? 12.6 : 14.6, P ? 9.8 : 10.8, s / 8), -8 + s * 3.5));
    return hitPost(t, { vignette: 0.7 });
  });

  // bars 106-107: the lamp wall plays the drums. Kick: the whole wall slams and a ring runs out from the middle.
  // Snare: the letters. Hats: a column steps across on every sixteenth. Dark between hits, so each one reads.
  const BITS = allGreenBitmap();
  const wallShot = (close) => () => (f) => {
    const t = f.t;
    const Pn = panel.wall;
    panel.hero.group.visible = false;
    Pn.group.visible = true;
    const n = G.n(t), b4 = ((n % 4) + 4) % 4, since = G.since(t);
    const k = kickP(t, 0.15), sn = snareP(t, 0.2), hat = G.pulse(t, 0.25, 0.05);
    const head = (Math.floor((t - f0) / (bp / 4) + 1e-6) * 3) % Pn.cols;
    const word = b4 === 1 ? 1 : b4 === 3 ? 2 : 0; // "ALL" on 2, "GREEN" on 4
    const ring = since * 58;
    Pn.set((p) => {
      let v = 0.05;
      if (b4 % 2 === 0) {
        const d = Math.hypot(p.c - (Pn.cols - 1) / 2, (p.r - (Pn.rows - 1) / 2) * 1.15);
        v += 0.75 * k + 0.95 * Math.exp(-(((d - ring) / 1.7) ** 2)) * Math.exp(-since / 0.3);
      } else if (BITS[p.r][p.c] === word) v += 0.45 + 0.55 * sn;
      else v += 0.22 * sn;
      if (p.c === head) v += 0.55 * (0.35 + 0.65 * hat);
      return Math.min(1, v);
    }, 3.6);
    panel.key.intensity = 0.5;
    panel.key.position.set(-7, 0.4, 3.5);
    panel.fill.intensity = 0.1 + 0.7 * k + 0.3 * sn;
    panel.fill.position.set(0, 0, 2.6);
    const s = G.step(t, f.start, 1, 0.11);
    const z0 = P ? 6.4 : 3.5;
    if (!close) panel.rig.set({ pos: [0, 0, z0 - 0.22 * s], look: [0, -0.02, 0], fov: 32, roll: (n % 2 ? 1 : -1) * 1.2 * G.pulse(t, 1, 0.12) });
    else panel.rig.set({ pos: [-1.5 + 0.42 * s, 0.35 - 0.1 * s, P ? 3.0 : 1.9], look: [-0.9 + 0.36 * s, 0.2 - 0.08 * s, 0], fov: 32, roll: -3 + 1.2 * s, fstop: 2.8 });
    return hitPost(t, { bloom: 0.6, vignette: 0.55 });
  };
  defineShot(tl, panel, 'brk-wall', V(106), wallShot(false));
  defineShot(tl, panel, 'brk-wall-b', V(107), wallShot(true));

  // bars 108-109: the units it hired. Each beat throws a wave of light out from the newest machine, the ceiling
  // strips chase on the eighths, and the camera lunges one unit further down the aisle.
  defineShot(tl, floor, 'brk-units', V(108), () => (f) => {
    const t = f.t;
    const n8 = Math.floor((t - f0) / (bp / 2) + 1e-6), p8 = G.pulse(t, 0.5, 0.09);
    machineRoom(t, 1, (i) => 0.12 + 0.88 * (i === ((n8 % 9) + 9) % 9 ? p8 : 0) + 0.5 * kickP(t, 0.08));
    const g3 = floor.g3.group.position;
    floor.team.glow((s) => {
      const d = Math.hypot(s.x - g3.x, s.z - g3.z);
      const dt = G.since(t) - d * 0.012;
      return 0.35 + 7.0 * (dt < 0 ? Math.pow(0.5, (dt + bp) / 0.1) : Math.pow(0.5, dt / 0.1));
    });
    floor.g3.set(1 + 2.2 * G.pulse(t, 1, 0.1));
    floor.loop.setIdle(0.1 + 0.8 * G.pulse(t, 1, 0.08), PAL.green);
    const fl = floor.bypassFlow(0.3 + G.step(t, V(104), 1, 0.13) / 16, { n: 8, gain: 2.6 });
    for (const p of fl.pulses) p.color = C_GREEN;
    floor.loop.setPulses(fl.pulses, { trail: 0.9 });
    const u = G.step(t, f.start, 1, 0.2) / 8;
    // in the aisle between two rows of units (z 7.2-9.6), looking north across their lit fronts
    const cx = lerp(1.6, 7.6, u);
    floor.rig.set({ pos: [cx, 1.3, 8.4], look: [cx + 10, 0.95, 8.0], fov: 42 });
    return hitPost(t, {});
  });

  // bars 110-111: the map again. His branch goes dark one length per beat, towards the desk; the last beat takes the
  // request with it. The frame closes on the desk as it goes.
  defineShot(tl, floor, 'brk-dark', V(110), () => (f) => {
    const t = f.t;
    const BEATS = 7;
    machineRoom(t, 0.22);
    floor.team.group.visible = false;
    floor.loop.setIdle(0.16 + 0.9 * G.pulse(t, 1, 0.08), PAL.green);
    floor.loop.showMap();
    floor.colleagues.group.visible = true;
    floor.colleagues.platesOnly(true);
    const fl = floor.bypassFlow(0.3 + G.step(t, V(104), 1, 0.13) / 16, { n: 8, gain: 2.6 });
    for (const p of fl.pulses) p.color = C_GREEN;
    const S_ = floor.loop.pieces.S;
    const steps = Math.min(BEATS, G.step(t, f.start, 1, 0.1));
    const left = 1 - steps / BEATS;
    floor.loop.setPulses([...fl.pulses, { route: 'human', d: floor.loop.gateD, color: C_WHITE, gain: 1.5 * smoothstep(0.02, 0.2, left) }], { trail: 0.9 });
    // the branch empties from both ends towards the gate in the middle of the desk
    const gs = floor.loop.gateS, L = S_.path.length;
    S_.mat.uniforms.uFrom.value = gs * (1 - left) - 0.01;
    S_.mat.uniforms.uTo.value = gs + (L - gs) * left + 0.01;
    S_.mat.uniforms.uIdle.value.setScalar(0.7 + 2.4 * G.pulse(t, 1, 0.07));
    floor.console.setButton(0.22 * left + 0.5 * G.pulse(t, 1, 0.08) * left);
    floor.console.setDisplay(left > 0.16 ? 'PLEASE CONFIRM' : '', PAL.white);
    const u = steps / BEATS;
    const c = topCam(lerp(P ? 11.6 : 13.6, P ? 9.6 : 10.4, u), -6 + 4 * u);
    c.pos[2] += 1.5 * u; c.look[2] += 1.5 * u;
    floor.rig.set(c);
    return hitPost(t, { vignette: 0.7 });
  });
  void LOOP;
}
