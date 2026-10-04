// Shared shot helpers: camera keyframes, the approval clock, type styles.
import * as THREE from 'three';
import { PAL } from '../config.js';
import { inkMaterial } from '../engine/type.js';
import { clamp, ease, lerp, smoothstep } from '../engine/util.js';

export const mix3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Camera keyframes. ks = [[time, cam], [time, cam, ease], ...] with cam = { pos, look, fov, roll, focus, fstop }.
 * The ease belongs to the move arriving at that key. Holds the first/last key outside the range.
 */
export function camKeys(rig, t, ks) {
  let A = ks[0][1], B = A, u = 0;
  const last = ks[ks.length - 1];
  if (t >= last[0]) A = B = last[1];
  else if (t > ks[0][0]) {
    for (let i = 1; i < ks.length; i++) {
      if (t < ks[i][0]) {
        A = ks[i - 1][1];
        B = ks[i][1];
        u = (ks[i][2] || ease.inOutSine)((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0]));
        break;
      }
    }
  }
  const cam = {
    pos: mix3(A.pos, B.pos, u),
    look: mix3(A.look, B.look, u),
    fov: lerp(A.fov ?? 35, B.fov ?? 35, u),
    roll: lerp(A.roll || 0, B.roll || 0, u),
    fstop: lerp(A.fstop || 0, B.fstop || 0, u),
    focus: lerp(A.focus ?? dist3(A.pos, A.look), B.focus ?? dist3(B.pos, B.look), u),
  };
  rig.set(cam);
  return cam;
}

/**
 * The approval clock: a list of the instants at which the button is pressed.
 * clock(t) counts presses (fractional between them), so pulse k is approved exactly at times[k].
 */
export function makeClock(times) {
  const n = times.length;
  return {
    times,
    clock(t) {
      let i = -1;
      while (i + 1 < n && times[i + 1] <= t) i++;
      if (i < 0) return (t - times[0]) / (n > 1 ? times[1] - times[0] : 2);
      if (i >= n - 1) return i + (t - times[i]) / (n > 1 ? times[i] - times[i - 1] : 2);
      return i + (t - times[i]) / (times[i + 1] - times[i]);
    },
    since(t) {
      let s = 99;
      for (const x of times) if (x <= t) s = t - x;
      return s;
    },
    until(t) {
      for (const x of times) if (x > t) return x - t;
      return 99;
    },
  };
}

const REST_R = [0.25, 0.757, -0.42];

/**
 * Run the human-gated loop for this frame: pulses, console state, and the operator's pressing hand.
 * Returns { fl, press, reach }.
 *   o.flow / o.pulse   passed to humanFlow / setPulses      o.presses  false: nobody presses
 *   o.pose             extra pose fields (headYaw, lean ...) or false to leave the operator alone
 */
export function operate(floor, f, clk, o = {}) {
  const t = f.t;
  const fl = floor.humanFlow(clk.clock(t), o.flow);
  floor.loop.setPulses(fl.pulses, o.pulse);
  const since = clk.since(t), until = clk.until(t);
  const press = floor.stageApproval(fl, since, until, { t, presses: o.presses !== false });
  // the hand rests on the desk, comes over the button ~0.6 s before a press, and goes back after it
  const reach = o.presses === false ? 0 : Math.max(smoothstep(0.75, 0.28, until), 1 - smoothstep(0.25, 0.7, since));
  if (o.pose !== false) {
    const over = floor.handOnButton(press);
    const lift = Math.sin(Math.PI * reach) * 0.03;
    const hand = [lerp(REST_R[0], over[0], reach), lerp(REST_R[1], over[1], reach) + lift, lerp(REST_R[2], over[2], reach)];
    floor.op.pose({ rHand: hand, rDip: lerp(0.12, 0.38, reach) + press * 0.1, headPitch: -0.14, ...(o.pose || {}) });
  }
  return { fl, press, reach, since, until };
}

/** Shared ink for lyric type. One place to change the white, the green and their glow. */
export const INK = {
  white: (gain = 1.0) => inkMaterial(PAL.white, gain),
  dim: (gain = 0.5) => inkMaterial('#9aa0a4', gain),
  green: (gain = 1.25) => inkMaterial(PAL.green, gain),
  black: () => inkMaterial('#030404', 1),
  red: (gain = 1.4) => inkMaterial(PAL.red, gain),
  warm: (gain = 1.0) => inkMaterial(PAL.warm, gain),
};

/** Lay a text block flat on a horizontal surface, reading from the south (or turned by `yaw` radians). */
export function layFlat(obj, x, y, z, yaw = 0) {
  obj.rotation.set(-Math.PI / 2, 0, yaw, 'YXZ');
  obj.rotation.order = 'YXZ';
  obj.rotation.y = yaw;
  obj.rotation.x = -Math.PI / 2;
  obj.rotation.z = 0;
  obj.position.set(x, y, z);
  return obj;
}

const _v = new THREE.Vector3();
/** Stand a text block upright at `pos`, turned to face a point (usually where the camera is). */
export function faceTo(obj, pos, toward) {
  obj.position.set(pos[0], pos[1], pos[2]);
  _v.set(toward[0], pos[1], toward[2]);
  obj.lookAt(_v);
  return obj;
}

/** Fade helper for overlay groups: set opacity on every material of a text block. */
export function setInk(block, opacity, gain) {
  for (const w of block.words) {
    const m = w.mesh.material;
    m.opacity = opacity;
    w.mesh.visible = opacity > 0.003;
    if (gain !== undefined && m.userData.base) m.color.copy(m.userData.base).multiplyScalar(gain);
  }
}
void clamp;

const SCRIM_FRAG = /* glsl */ `uniform float uA; varying vec2 vUv;
void main(){ vec2 c = vUv * 2.0 - 1.0; float d = length(c); gl_FragColor = vec4(0.0, 0.0, 0.0, uA * (1.0 - smoothstep(0.25, 1.0, d))); }`;
/**
 * A soft dark patch behind a flat block of type, for shots where the picture under it is bright. It follows
 * the block's own visibility, so it arrives and leaves with the words. Call the returned function after block.update().
 */
export function scrim(S, block, strength = 0.5) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false, fragmentShader: SCRIM_FRAG,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.renderOrder = -5;
  S.flat.add(m);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const size = block.block?.size ?? block.size ?? 0.15;
  for (const w of block.words) {
    x0 = Math.min(x0, w.x); x1 = Math.max(x1, w.x + w.w);
    y0 = Math.min(y0, w.y - 0.25 * size); y1 = Math.max(y1, w.y + 0.8 * size);
  }
  return () => {
    const o = block.object, sc = o.scale.x;
    m.position.set(o.position.x + ((x0 + x1) / 2) * sc, o.position.y + ((y0 + y1) / 2) * sc, -5);
    m.scale.set((x1 - x0) * sc * 1.5 + 0.7, (y1 - y0) * sc * 1.7 + 0.6, 1);
    let a = 0;
    if (o.visible) for (const w of block.words) if (w.mesh.visible) a = Math.max(a, w.mesh.material.opacity ?? 1);
    mat.uniforms.uA.value = strength * a;
    m.visible = a > 0.003;
  };
}
