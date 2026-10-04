// Look-development angles on the floor set (not part of the film).
import { defineShot } from '../engine/set.js';

export default function registerLookdev(tl, sets, engine) {
  const floor = sets.floor;
  const A = engine.audio;
  const run = (f, presses = true) => {
    const clock = A.barAt(f.t);
    const fl = floor.humanFlow(clock);
    floor.loop.setPulses(fl.pulses);
    const press = floor.stageApproval(fl, fl.since * A.bar_period, fl.until * A.bar_period, { t: f.t, presses });
    floor.op.pose({ rHand: floor.handOnButton(press), rDip: 0.35 + press * 0.1, headPitch: -0.12 });
  };
  const cams = {
    shoulder: { pos: [1.25, 1.42, 2.3], look: [0.1, 0.92, -1.2], fov: 30, fstop: 2.8, focus: 2.6 },
    macro: { pos: [0.78, 0.93, 0.42], look: [0.36, 0.775, 0.02], fov: 24, fstop: 2.8 },
    high: { pos: [7.5, 5.4, 6.5], look: [0, 0.6, -4.2], fov: 32 },
    top: { pos: [0, 16, -4.4], look: [0, 0, -4.6], fov: 40 },
    front: { pos: [-1.3, 1.15, -1.9], look: [0.1, 0.95, 0.4], fov: 30, fstop: 2.8 },
    wide: { pos: [-5.5, 1.5, 6.5], look: [0, 1.1, -5], fov: 36 },
  };
  let t0 = 0;
  for (const [name, cam] of Object.entries(cams)) {
    defineShot(tl, floor, 'ld-' + name, t0, () => (f) => {
      run(f);
      floor.rig.set(cam);
    });
    // same angle, lamp only (no rim, no wash): what does the task lamp do on its own?
    defineShot(tl, floor, 'ld-' + name + '-lamp', t0 + 5, () => (f) => {
      floor.light({ rim: 0, wash: 0, lamp: 1, envI: 0.0 });
      floor.loop.setPulses([]);
      floor.rig.set(cam);
    });
    t0 += 10;
  }
}
