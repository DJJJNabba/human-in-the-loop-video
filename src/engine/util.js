// Small deterministic maths toolbox. Nothing here reads a clock or Math.random.
import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (x - a) / (b - a);
export const remap = (x, a, b, c, d) => c + (d - c) * clamp((x - a) / (b - a));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const fract = (x) => x - Math.floor(x);
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  // critically damped settle with a single small overshoot: mechanical parts
  settle: (t) => 1 - Math.exp(-6.5 * t) * Math.cos(9 * t) * (1 - t) - 0 * t,
};

/** 0..1 progress of x across [a, b], optionally eased. */
export const prog = (x, a, b, e = ease.linear) => e(clamp((x - a) / (b - a)));

/** Keyframes: keys(t, [[t0, v0], [t1, v1, ease], ...]) — the ease belongs to the segment arriving at that key. Values: numbers or arrays. */
export function keys(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  const last = ks[ks.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < ks.length; i++) {
    if (t < ks[i][0]) {
      const [t0, v0] = ks[i - 1];
      const [t1, v1, e] = ks[i];
      const u = (e || ease.inOutCubic)((t - t0) / (t1 - t0));
      if (Array.isArray(v0)) return v0.map((v, k) => v + (v1[k] - v) * u);
      return v0 + (v1 - v0) * u;
    }
  }
  return last[1];
}

/** Rectangular pulse with soft edges: 0 → 1 over [a, a+fa], back to 0 over [b-fb, b]. */
export const window01 = (x, a, b, fa = 0.2, fb = fa) => smoothstep(a, a + fa, x) * (1 - smoothstep(b - fb, b, x));

/** Decaying impulse: 1 at t0, exp falloff with the given half-life (s); 0 before. */
export const impulse = (t, t0, halfLife = 0.12) => (t < t0 ? 0 : Math.pow(0.5, (t - t0) / halfLife));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash → [0,1). */
export function hash(...xs) {
  let h = 2166136261;
  for (const x of xs) {
    const v = Math.round(x * 1000) | 0;
    h ^= v & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >>> 24) & 0xff;
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1D value noise, C1, range [-1, 1]. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash(i, seed) * 2 - 1, b = hash(i + 1, seed) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export function halton(i, base) {
  let f = 1, r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
/** Place a unit-height (Y) mesh so that it spans from point a to point b. */
export function spanY(mesh, a, b, baseLen = 1) {
  _a.copy(b).sub(a);
  const len = _a.length();
  mesh.position.copy(a).addScaledVector(_a, 0.5);
  _b.copy(_a).normalize();
  mesh.quaternion.setFromUnitVectors(_up, _b);
  mesh.scale.y = len / baseLen;
  return len;
}

/** Two-bone IK. Returns the elbow position (out). pole = preferred elbow direction (world). */
export function ik2(shoulder, target, l1, l2, pole, out = new THREE.Vector3()) {
  const d = _a.copy(target).sub(shoulder);
  let dist = d.length();
  const maxD = (l1 + l2) * 0.999;
  if (dist > maxD) dist = maxD;
  d.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // pole component orthogonal to d
  const p = _b.copy(pole).addScaledVector(d, -pole.dot(d));
  if (p.lengthSq() < 1e-8) p.set(0, -1, 0).addScaledVector(d, d.y);
  p.normalize();
  return out.copy(shoulder).addScaledVector(d, a).addScaledVector(p, h);
}

export function setQuatLookDir(q, dir, up = _up) {
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, up);
  return q.setFromRotationMatrix(m);
}
void _q;
