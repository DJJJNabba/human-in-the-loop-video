// FINAL CHORUS, OUTRO, ENDING (197.8 – 242.16 s): immaculate indifference.
// The loop closes without him. The same geometry runs a floor, a city, a region,
// a planet. Everything is green. The desk is still there. No response required.
import * as THREE from 'three';
import { makeTimeMap } from '../engine/timemap.js';
import { DURATION, PAL } from '../config.js';
import { defineShot } from '../engine/set.js';
import { clamp, ease, hash, lerp, prog, smoothstep } from '../engine/util.js';
import { OP_Z } from '../world/floor_set.js';
import { LOOP } from '../world/loop.js';
import { allGreenBitmap, lit, loopType } from './b_chorus1.js';
import { INK, camKeys, scrim } from './common.js';

export default function registerFinal(tl, sets, engine) {
  const floor = sets.floor, aerial = sets.aerial, planet = sets.planet, panel = sets.panel, A = engine.audio, LY = engine.lyrics;
  // B(): v1 bar positions mapped onto the v2 recording; V(): v2 bars (see engine/timemap.js)
  const { B, V } = makeTimeMap(A);
  const W = (id, i) => LY.line(id).words[i];
  const asp = engine.aspect, P = engine.portrait;
  const { ROLL0, topCam } = loopType(engine);
  const CUT = W('fin-1', 0).start;

  /** The world after: brighter, whiter, every pulse green, the desk's branch gone, the chair empty. */
  const after = (t, o = {}) => {
    floor.light({ ...lit(1), env: 'clinical', top: o.top ?? 2.5, amb: o.amb ?? 1.6, lamp: 0, rim: 0.4, ...(o.light || {}) });
    floor.city.uniforms.uOrder.value = 1;
    floor.city.uniforms.uWarmth.value = 0;
    floor.city.uniforms.uGreenMix.value = o.cityGreen ?? 0.35;
    floor.city.uniforms.uGain.value = 1.8;
    floor.op.group.visible = false;
    floor.chair.group.position.set(0, 0, OP_Z + 0.37);
    floor.chair.group.rotation.y = 0.35 + (o.chairSpin ?? 0);
    floor.g2.group.visible = floor.g3.group.visible = true;
    floor.team.group.visible = o.team !== false;
    if (o.team !== false) floor.team.set(() => 1);
    floor.glassWall.group.visible = o.glass !== false;
    floor.glassWall.set(1, 1.2, PAL.green);
    floor.loop.pieces.C.group.visible = true;
    floor.autoGate.group.visible = true;
    // the branch that ran across his desk has gone into the floor
    const out = prog(t, CUT + 0.12, CUT + 0.85, ease.inCubic);
    floor.loop.pieces.S.group.position.set(0, 0, 3.2 * out);
    floor.loop.pieces.S.group.visible = out < 1;
    floor.loop.pieces.S.mat.uniforms.uLevel.value = 0.0;
    const fl = floor.bypassFlow((t - 120) * (o.rate ?? 0.62), { n: o.n ?? 10, gain: 2.4 });
    for (const p of fl.pulses) p.color = new THREE.Color(PAL.green);
    floor.loop.setPulses(fl.pulses, { trail: o.trail ?? 1.3 });
    floor.loop.setIdle(o.idle ?? 0.1, PAL.green);
    floor.autoGate.console.setButton(1.0, PAL.green);
    floor.autoGate.console.setDisplay('APPROVED', PAL.green);
    floor.autoGate.press(0.5 + 0.5 * Math.sin(t * 9));
    // his button: lit, steady, green. It no longer waits for anything.
    floor.console.setButton(o.button ?? 0.55, PAL.green);
    floor.console.setGate(0.0, PAL.white);
    floor.console.setDisplay(o.display ?? 'ALL GREEN', PAL.green);
  };
  const flatLine = (S, id, text, o = {}) => {
    const b = S.lyric(id, { flat: true, text, font: 'displayBlack', size: P ? 0.17 : 0.27, leading: 0.9, tracking: -0.01, hold: 0.25, out: 0.2, material: INK.white(1.05), ...o });
    b.object.position.set(o.x ?? -asp + (P ? 0.1 : 0.2), o.y ?? (P ? 0.68 : 0.42), 0);
    return b;
  };

  // ------------------------------------ fin-1  cut me from the loop (stop bar)
  // the map from the first chorus, one last time: on "Cut" the branch across the desk flashes and goes into the floor
  defineShot(tl, floor, 'fin-cut', V(111, 3), (S) => {
    const line = flatLine(S, 'fin-1', 'Cut me\nfrom the loop', { hold: 3 });
    return (f) => {
      const t = f.t;
      after(t, { button: 0.25, display: '', glass: false, idle: 0.2, team: false });
      floor.colleagues.group.visible = true;
      floor.colleagues.platesOnly(true);
      floor.loop.showMap();
      const S_ = floor.loop.pieces.S;
      const flash = t < CUT ? 0 : Math.exp(-(t - CUT) / 0.35);
      S_.mat.uniforms.uLevel.value = 1;
      S_.mat.uniforms.uIdle.value.setScalar(0.2 + 3.5 * flash);
      floor.rig.set(topCam(P ? 11.0 : 13.2, lerp(-2, 1, ease.outCubic(f.p))));
      line.update(t, { exit: f.end + 1 });
      return { vignette: 0.7 };
    };
  });

  // ------------------------------------ fin-2  leave the light on green
  defineShot(tl, floor, 'fin-green', V(112, 3), (S) => {
    const line = flatLine(S, 'fin-2', 'Leave the light\non green', { styles: { 4: { material: INK.green(1.3) } } });
    const shade = scrim(S, line, 0.5);
    return (f) => {
      const t = f.t;
      after(t, { button: 0.75, display: 'ALL GREEN', light: { top: 1.2, amb: 0.7 } });
      camKeys(floor.rig, t, [
        [f.start, { pos: [0.62, 0.9, 0.44], look: [0.34, 0.79, 0.07], fov: 21, fstop: 2.4 }],
        [f.end, { pos: [0.58, 0.88, 0.4], look: [0.34, 0.79, 0.07], fov: 21, fstop: 2.4 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.02 });
      shade();
      return { bloom: 0.55 };
    };
  });

  // ------------------------------------ fin-3  everything is working
  // "Everything" is sung a sixteenth before the bar: cut with it, not after it
  defineShot(tl, floor, 'fin-working', W('fin-3', 0).start - 0.1, (S) => {
    const line = flatLine(S, 'fin-3', 'Everything\nis working', P ? { size: 0.15 } : {});
    const shade = scrim(S, line, 0.5);
    return (f) => {
      const t = f.t;
      after(t, { rate: 0.9, n: 12 });
      floor.colleagues.group.visible = true;
      floor.colleagues.platesOnly(true);
      camKeys(floor.rig, t, [
        [f.start, { pos: [12.5, 6.4, 12.0], look: [-1.0, 0.4, -3.2], fov: 38 }],
        [f.end, { pos: [10.4, 7.6, 11.0], look: [-1.0, 0.4, -3.6], fov: 38 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.02 });
      shade();
      return { vignette: 0.55 };
    };
  });

  // ------------------------------------ fin-4  there's nobody to see
  defineShot(tl, floor, 'fin-nobody', V(114, 2.75), (S) => {
    const line = flatLine(S, 'fin-4', P ? 'There’s\nnobody\nto see' : 'There’s nobody\nto see', { plain: true, font: 'doubt', size: P ? 0.16 : 0.22, leading: 1.04, x: P ? -asp + 0.1 : asp - 0.2, align: P ? 'left' : 'right' });
    const shade = scrim(S, line, 0.5);
    return (f) => {
      const t = f.t;
      // the chair still turns a little from when he got up
      after(t, { chairSpin: 0.5 * Math.sin((t - V(114, 2.75)) * 0.7), light: { top: 1.6, amb: 1.0 } });
      camKeys(floor.rig, t, [
        [f.start, { pos: [0.0, 1.32, 2.7], look: [0.05, 0.85, 0.5], fov: 28, fstop: 2.8 }],
        [f.end, { pos: [0.0, 1.3, 2.45], look: [0.05, 0.85, 0.5], fov: 28, fstop: 2.8 }, ease.inOutSine],
      ]);
      line.update(t, { exit: f.end - 0.02 });
      shade();
      return {};
    };
  });

  // -------------------------- fin-5..7: the same geometry, at every scale
  const machineLine = (S, id, text, o = {}) => {
    const b = S.lyric(id, { flat: true, text, font: 'machineBold', size: P ? 0.1 : 0.15, tracking: 0.02, leading: 1.12, align: 'center', hold: 0.25, out: 0.2, material: INK.white(1.1), ...o });
    b.object.position.set(0, o.y ?? (P ? -0.62 : -0.62), 0);
    return b;
  };
  // One move from the desk to orbit. The height grows exponentially and never stops between shots: each cut
  // lands on the same loop at the same size, moving at the same rate, so the three sets read as one rise.
  const Z0 = V(115, 3.25), Z1 = V(116, 3.25), Z3 = V(118, 2), Z4 = V(120);
  const H0 = P ? 11 : 12.5, H1 = 60, H3 = 95000, R_PLANET = 6371000;
  const zv1 = (2 * Math.log(H1 / H0)) / (Z1 - Z0);                                  // rate (nepers/s) at the first cut
  const za = (2 * (Math.log(H3 / H1) - zv1 * (Z3 - Z1))) / ((Z3 - Z1) * (Z3 - Z1)); // it keeps accelerating to the edge of space
  const zv3 = zv1 + za * (Z3 - Z1);
  const heightAt = (t) => {
    if (t <= Z1) { const u = clamp((t - Z0) / (Z1 - Z0)); return H0 * Math.exp(Math.log(H1 / H0) * u * u); }
    const x = Math.min(t, Z3) - Z1;
    return H1 * Math.exp(zv1 * x + 0.5 * za * x * x);
  };
  const ORBIT = 4.9; // distance from the planet's centre at which the move comes to rest
  /** altitude above the planet (in radii) once we are over it: starts at the rate the last shot ended on, eases to rest */
  const altAt = (t) => {
    const D = Z4 - Z3, u = clamp((t - Z3) / D), a0 = H3 / R_PLANET;
    const s = (u * u * u - 2 * u * u + u) * zv3 * D + (-2 * u * u * u + 3 * u * u) * Math.log((ORBIT - 1) / a0);
    return a0 * Math.exp(s);
  };
  const ROLL_RATE = 12 / (Z3 - Z1);
  defineShot(tl, floor, 'fin-round', Z0, (S) => {
    const line = machineLine(S, 'fin-5', 'ROUND AND ROUND IT GOES', { plain: true });
    return (f) => {
      const t = f.t;
      after(t, { rate: 1.1, n: 12, glass: false, team: true });
      floor.loop.showMap();
      floor.colleagues.group.visible = true;
      floor.colleagues.platesOnly(true);
      // straight up out of the room: through the ceiling, towards the city
      const c = topCam(heightAt(t), 0);
      c.fov = 36;
      floor.rig.set(c);
      line.update(t, { exit: f.end - 0.02 });
      return { vignette: 0.6 };
    };
  });
  const sky = (t, green) => {
    aerial.uniforms.uGreenMix.value = green;
    aerial.look(heightAt(t), t, ROLL0 + (t - Z1) * ROLL_RATE, 0, 0);
  };
  defineShot(tl, aerial, 'fin-better', Z1, (S) => {
    const line = machineLine(S, 'fin-6', 'BETTER THAN BEFORE', {});
    return (f) => {
      const t = f.t;
      sky(t, lerp(0.45, 0.5, f.p));
      line.update(t, { exit: f.end - 0.02 });
      return { vignette: 0.6, bloom: 0.55 };
    };
  });
  defineShot(tl, aerial, 'fin-was', V(117, 2.25), (S) => {
    const line = machineLine(S, 'fin-7', P ? 'THERE WAS A HUMAN\nIN THE LOOP' : 'THERE WAS A HUMAN IN THE LOOP', { styles: { 3: { material: INK.white(1.1) } }, material: INK.green(1.2) });
    return (f) => {
      const t = f.t;
      sky(t, lerp(0.5, 0.55, f.p));
      line.update(t, { exit: f.end + 1 });
      return { vignette: 0.6, bloom: 0.55 };
    };
  });

  // the planet: the loop is a ring now.
  const globe = (t, dist, green, o = {}) => {
    planet.spin(t);
    planet.uniforms.uGreenMix.value = green;
    const yaw = o.yaw ?? 0.0;
    planet.rig.set({ pos: [Math.sin(yaw) * dist, dist * 0.18, Math.cos(yaw) * dist], look: [0, o.lookY ?? 0, 0], fov: o.fov ?? 30 });
  };
  // The cut from the air lands 95 km over the same loop, drawn on the planet's surface, and keeps going: the
  // ground falls away, the horizon bends, the grid of the night side comes into view, then the ring.
  const SPIN = planet.constructor.SPIN;
  planet.anchor([0, 0.18, 1], Z3, !P);
  const riseOver = (t) => {
    planet.spin(t);
    planet.uniforms.uGreenMix.value = 0;
    const u = clamp((t - Z3) / (Z4 - Z3)), alt = altAt(t);
    // at first the camera turns with the ground it left; it lets go as it climbs
    const yaw = (t - Z3) * SPIN * (1 - smoothstep(0.12, 0.6, u));
    const k = (1 + alt) / Math.hypot(0.18, 1);
    planet.uniforms.uLoop.value = 1 - smoothstep(0.03, 0.25, alt);
    planet.rig.set({
      pos: [Math.sin(yaw) * k, 0.18 * k, Math.cos(yaw) * k], look: [0, 0, 0], fov: lerp(36, 30, smoothstep(0.1, 0.7, u)),
      roll: 12 * (1 - smoothstep(0.0, 0.5, u)), near: Math.min(0.05, alt * 0.3), far: 400,
    });
    return alt;
  };
  defineShot(tl, planet, 'fin-planet', Z3, (S) => {
    const tail = machineLine(S, 'fin-7', P ? 'THERE WAS A HUMAN\nIN THE LOOP' : 'THERE WAS A HUMAN IN THE LOOP', { styles: { 3: { material: INK.white(1.1) } }, material: INK.green(1.2), hold: 0.3 });
    return (f) => {
      const t = f.t;
      riseOver(t);
      tail.update(t, { exit: f.start + 0.5 });
      return { vignette: 0.5, beat: 0.4 };
    };
  });
  defineShot(tl, planet, 'fin-anymore', V(119), (S) => {
    const line = S.lyric('fin-8', { flat: true, text: 'There isn’t anymore', plain: true, font: 'doubt', size: P ? 0.11 : 0.13, align: 'center', hold: 1.0, out: 0.5, material: INK.white(1) });
    line.object.position.set(0, P ? -0.8 : -0.86, 0);
    return (f) => {
      const t = f.t;
      riseOver(t);
      line.update(t, { exit: f.end - 0.35 });
      return { vignette: 0.5, beat: 0.4 };
    };
  });

  // ================================================================= outro
  const allGreen = (S, id, o = {}) => {
    const b = S.lyric(id, { flat: true, text: P ? 'ALL GREEN,\nALL, ALL GREEN' : 'ALL GREEN, ALL, ALL GREEN', plain: true, font: 'machine', leading: 1.3, size: P ? 0.07 : 0.085, tracking: 0.12, align: 'center', hold: 0.6, out: 0.4, hot: 2.2, material: INK.green(1.2), ...o });
    b.object.position.set(0, o.y ?? (P ? -0.74 : -0.8), 0);
    return b;
  };
  const nothing = (S, id, o = {}) => {
    const b = S.lyric(id, { flat: true, text: 'NOTHING WRONG WITH THE MACHINE', plain: true, font: 'machine', size: P ? 0.05 : 0.06, tracking: 0.12, align: 'center', hold: 0.6, out: 0.4, material: INK.white(0.9), ...o });
    b.object.position.set(0, o.y ?? (P ? -0.83 : -0.91), 0);
    return b;
  };
  defineShot(tl, planet, 'out-1', V(120), (S) => {
    const a = allGreen(S, 'out-1'), n = nothing(S, 'out-2');
    const shadeA = scrim(S, a, 0.75), shadeN = scrim(S, n, 0.75);
    const hits = LY.line('out-1').words.map((w) => w.start);
    return (f) => {
      const t = f.t;
      // the night side goes green, a fifth at a time, on the sung words; then the planet turns, all green
      let g = 0;
      hits.forEach((h) => (g += 0.2 * prog(t, h, h + 0.35, ease.outCubic)));
      // the planet comes closer and rides up the frame, leaving the bottom of it to the words
      globe(t, lerp(ORBIT, 3.9, ease.inOutSine(f.p)), g, { yaw: lerp(0, -0.8, ease.inOutSine(f.p)), lookY: lerp(0, -0.42, ease.inOutSine(f.p)) });
      a.update(t, { exit: f.end - 0.4 });
      n.update(t, { exit: f.end - 0.4 });
      shadeA();
      shadeN();
      return { vignette: 0.5, bloom: 0.6, beat: 0.4 };
    };
  });
  const BITS = allGreenBitmap();
  defineShot(tl, panel, 'out-3', V(124), (S) => {
    const Pn = panel.wall;
    const legend = S.lyric('out-4', { upper: true, font: 'machine', size: 0.105, tracking: 0.12, align: 'center', mode: 'reveal', dim: 0.16, hold: 6, hot: 2.2, material: INK.white(1.1), parent: Pn.group });
    legend.object.position.set(0, Pn.legendY, 0.0108);
    const hits = LY.line('out-3').words.map((w) => w.start);
    return (f) => {
      const t = f.t;
      panel.hero.group.visible = false;
      Pn.group.visible = true;
      // every lamp is on already. on the words, the letters glow a little brighter. that is all.
      Pn.set((p) => {
        const id = BITS[p.r][p.c];
        // ALL on 'All' and on each 'all'; GREEN on each 'green'
        const on = (h) => prog(t, h, h + 0.12) * (1 - prog(t, h + 0.3, h + 0.7));
        const lift = id === 1 ? Math.max(on(hits[0]), on(hits[2]), on(hits[3])) : id === 2 ? Math.max(on(hits[1]), on(hits[4])) : 0;
        return 0.62 + 0.38 * clamp(lift);
      });
      panel.key.intensity = 1.1;
      panel.key.position.set(-7, 0.4, 3.5);
      panel.fill.intensity = 0.3;
      panel.fill.position.set(0, 0, 2.6);
      const z0 = P ? 7.6 : 4.3;
      camKeys(panel.rig, t, [
        [f.start, { pos: [0.4, -0.1, z0 + 0.6], look: [0, -0.16, 0], fov: 32 }],
        [f.end, { pos: [-0.25, -0.12, z0 - 0.6], look: [0, -0.18, 0], fov: 32 }, ease.inOutSine],
      ]);
      legend.update(t, { exit: f.end + 1 });
      return { bloom: 0.5, vignette: 0.6 };
    };
  });

  // the riser (bars 128-130, drums out): back to the floor, everything running, coming down towards the desk
  defineShot(tl, floor, 'out-floor', V(128), () => (f) => {
    const t = f.t;
    after(t, { rate: 0.55, n: 10, display: 'ALL GREEN', button: 0.6, light: { top: 1.8, amb: 1.2 } });
    floor.colleagues.group.visible = true;
    floor.colleagues.platesOnly(true);
    camKeys(floor.rig, t, [
      [f.start, { pos: [6.5, 4.6, 7.5], look: [0, 0.6, -2.0], fov: 36 }],
      [f.end, { pos: [1.7, 1.45, 1.9], look: [0.2, 0.8, -0.2], fov: 32 }, ease.inOutCubic],
    ]);
    return {};
  });

  // ============================================== the end: no response required
  // The opening frame again: the same button, from the same place. Then it was waiting for him.
  defineShot(tl, floor, 'end', V(130, 3), (S) => {
    const line = S.lyric('spoken-1', { flat: true, text: 'No response required.', plain: true, font: 'machine', size: P ? 0.075 : 0.1, tracking: 0.04, hold: 99, hot: 1.4, material: INK.white(1.0), mode: 'rise', dist: 0.05 });
    line.object.position.set(-asp + (P ? 0.1 : 0.2), P ? 0.62 : 0.52, 0);
    return (f) => {
      const t = f.t;
      // coda (bars 132-138): the loudest music of the song. Out of focus behind the button, the room's strips, the rail and
      // the city keep time with it (the beat layer). The button, the words and the camera do not.
      const coda = smoothstep(V(132) - 0.05, V(132) + 0.2, t) * (1 - smoothstep(V(139), V(139, 3), t));
      after(t, { rate: 0.4 + 0.5 * coda, n: 8, display: 'NO RESPONSE REQUIRED', button: 0.62, trail: 1.0, light: { top: 0.35, amb: 0.25, ceiling: 0.15 + 0.5 * coda, rim: 0.6 }, team: false });
      floor.city.uniforms.uGreenMix.value = 0.5;
      // the slowest possible push: the frame barely moves for the last eight seconds
      camKeys(floor.rig, t, [
        [f.start, { pos: [0.66, 0.9, 0.42], look: [0.34, 0.785, -0.01], fov: 19, fstop: 4.0 }],
        [DURATION, { pos: [0.61, 0.88, 0.36], look: [0.34, 0.785, -0.01], fov: 19, fstop: 4.0 }, ease.outSine],
      ]);
      line.update(t, { exit: DURATION + 5 });
      return { fade: smoothstep(264.9, 266.25, t), bloom: 0.5, beat: 0 };
    };
  });
  void hash; void LOOP;
}
