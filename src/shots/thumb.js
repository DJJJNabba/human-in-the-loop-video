// The YouTube thumbnail (not part of the film): `render.mjs stills --only thumb --t 1`.
// One idea, readable at 200 px: the last human, lit alarm-red, about to press the one green button,
// in a room where everything else is already green. Red against green, face against machine.
import * as THREE from 'three';
import { PAL } from '../config.js';
import { defineShot } from '../engine/set.js';
import { INK } from './common.js';

export default function registerThumb(tl, sets, engine) {
  const floor = sets.floor, asp = engine.aspect;
  defineShot(tl, floor, 'thumb', 0, (S) => {
    const size = 0.5;
    const t1 = S.text('HUMAN', { flat: true, font: 'displayBlack', size, tracking: -0.02, material: INK.white(1.15) });
    const t2 = S.text('IN THE\nLOOP', { flat: true, font: 'displayBlack', size, leading: 0.84, tracking: -0.02, material: INK.green(1.5) });
    t1.object.position.set(-asp + 0.1, 0.48, 0);
    t2.object.position.set(-asp + 0.1, 0.48 - size * 0.84, 0);
    // dark wedge behind the type so it holds at any size
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthTest: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 0.82 * smoothstep(0.62, 0.3, vUv.x)); }',
    }));
    shade.scale.set(asp * 2, 2, 1);
    shade.position.z = -5;
    shade.renderOrder = -5;
    S.flat.add(shade);
    const C_GREEN = new THREE.Color(PAL.green);
    return () => {
      // the room after the lights went out: alarm red from behind and above, every machine green
      floor.light({ env: 'dark', envI: 0.5, lamp: 0, rim: 0, ceiling: 1.0, top: 0, amb: 0.1, stripColor: PAL.red, wash: 0 });
      floor.team.group.visible = true;
      floor.team.set(() => 1);
      floor.team.glow(() => 9);
      floor.glassWall.group.visible = false;
      floor.loop.setIdle(2.2, PAL.green);
      floor.loop.setPulses([{ route: 'human', d: floor.loop.gateD - 0.5, color: C_GREEN, gain: 6 }], { trail: 2.5 });
      floor.console.setButton(1.5, PAL.green);
      floor.console.setGate(2.5, PAL.green);
      floor.console.setDisplay('', PAL.green); // the title is the only text in the picture
      // one finger, a centimetre above the button
      floor.op.pose({ headPitch: -0.2, rHand: floor.handOnButton(0, 0.022), rDip: 0.5 });
      floor.console.setButton(2.4, PAL.green);
      // alarm red from behind him rakes across the hand and the desk
      floor.light({ env: 'dark', envI: 0.55, lamp: 0, rim: 2.2, rimColor: PAL.red, ceiling: 1.0, top: 0, amb: 0.02, stripColor: PAL.red, wash: 0 });
      floor.spotAt([1.4, 1.5, 1.6], [0.36, 0.8, 0.1], 16, 0.35, PAL.red);
      floor.rig.set({ pos: [0.6, 0.86, 0.42], look: [0.27, 0.815, 0.12], fov: 32, fstop: 4, focus: 0.43 });
      return { bloom: 0.75, vignette: 0.75, contrast: 0.35, sat: 1.15, grain: 0.012, beat: 0, exposure: 1.15 };
    };
  });
}
