// The loop: a physical transport rail that carries request pulses from the
// machine, across the operator's desk, through the approval gate, and back.
//
// Geography (metres, seen from above, operator facing north / -Z):
//
//            NW ─────── MACHINE ─────── NE          z = Z_N
//            │                           │
//            │   piece A            piece B
//      ──────┼──────── chord C ──────────┼──────    z = Z_C   (the bypass, built later)
//            │                           │
//            │          piece S          │
//            SW ──── desk ── GATE ────── SE         z = Z_S   (the human)
//
// Travel: machine → A (west side, heading south) → S (across the desk, west to
// east, through the gate) → B (east side, heading north) → machine.
// Bypassed: machine → A → C → B → machine. S is never visited.
import * as THREE from 'three';
import { PAL } from '../config.js';
import { clamp } from '../engine/util.js';

export const LOOP = {
  A: 3.0, // half width
  R: 1.5, // corner radius
  Z_N: -9.0,
  Z_S: -0.22,
  Z_C: -3.3, // bypass chord
  RC: 0.8, // bypass corner radius
  Y: 0.795, // rail top (the desk surface is at 0.74)
  GATE_X: 0.36,
};

const MAXP = 14;

function arc(pts, cx, cz, r, a0, a1, step = 0.02) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r));
  }
}
function line(pts, x, z, step = 0.02) {
  const p = pts[pts.length - 1];
  const d = Math.hypot(x - p.x, z - p.z);
  const n = Math.max(1, Math.ceil(d / step));
  for (let i = 1; i <= n; i++) pts.push(new THREE.Vector3(p.x + ((x - p.x) * i) / n, 0, p.z + ((z - p.z) * i) / n));
}

/** A polyline in the XZ plane with arc-length lookup. */
export class Path {
  constructor(pts) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }
  /** Point at arc length s (clamped). Writes position into `out`, tangent into `tan` if given. */
  at(s, out = new THREE.Vector3(), tan = null) {
    s = clamp(s, 0, this.length);
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.cum[m] <= s) lo = m; else hi = m;
    }
    const a = this.pts[lo], b = this.pts[hi];
    const u = (s - this.cum[lo]) / Math.max(1e-9, this.cum[hi] - this.cum[lo]);
    out.lerpVectors(a, b, u);
    if (tan) tan.subVectors(b, a).normalize();
    return out;
  }
}

function makePaths() {
  const { A, R, Z_N, Z_S, Z_C, RC } = LOOP;
  const H = Math.PI / 2;
  // A: machine (0, Z_N) → west → NW corner → south along x = -A → west junction
  const a = [new THREE.Vector3(0, 0, Z_N)];
  line(a, -(A - R), Z_N);
  arc(a, -(A - R), Z_N + R, R, -H, -Math.PI); // from north point round to west point
  line(a, -A, Z_C - RC);
  // S: west junction → south → SW corner → east across the desk → SE corner → north to east junction
  const s = [new THREE.Vector3(-A, 0, Z_C - RC)];
  line(s, -A, Z_S - R);
  arc(s, -(A - R), Z_S - R, R, Math.PI, H);
  line(s, A - R, Z_S);
  arc(s, A - R, Z_S - R, R, H, 0);
  line(s, A, Z_C - RC);
  // C: west junction → turn east → chord → turn north → east junction
  const c = [new THREE.Vector3(-A, 0, Z_C - RC)];
  arc(c, -A + RC, Z_C - RC, RC, Math.PI, H);
  line(c, A - RC, Z_C);
  arc(c, A - RC, Z_C - RC, RC, H, 0);
  // B: east junction → north → NE corner → west to the machine
  const b = [new THREE.Vector3(A, 0, Z_C - RC)];
  line(b, A, Z_N + R);
  arc(b, A - R, Z_N + R, R, 0, -H);
  line(b, 0, Z_N);
  return { A: new Path(a), S: new Path(s), C: new Path(c), B: new Path(b) };
}

/** Rail body: a small machined profile swept along a path. u runs along the rail (for the brushing). */
function sweep(path, profile, y, closedEnds = true) {
  const n = path.pts.length, m = profile.length;
  const pos = new Float32Array(n * m * 3), uv = new Float32Array(n * m * 2);
  const idx = [];
  const tan = new THREE.Vector3(), nrm = new THREE.Vector3();
  let plen = 0;
  const pl = [0];
  for (let j = 1; j < m; j++) { plen += Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]); pl.push(plen); }
  for (let i = 0; i < n; i++) {
    const p = path.pts[i];
    const a = path.pts[Math.max(0, i - 1)], b = path.pts[Math.min(n - 1, i + 1)];
    tan.subVectors(b, a).normalize();
    nrm.set(-tan.z, 0, tan.x); // right-hand side of travel
    for (let j = 0; j < m; j++) {
      const k = i * m + j;
      pos[k * 3] = p.x + nrm.x * profile[j][0];
      pos[k * 3 + 1] = y + profile[j][1];
      pos[k * 3 + 2] = p.z + nrm.z * profile[j][0];
      uv[k * 2] = path.cum[i] * 0.6;
      uv[k * 2 + 1] = pl[j] * 14;
    }
    if (i < n - 1) for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % m;
      const k0 = i * m + j, k1 = i * m + j1, k2 = (i + 1) * m + j, k3 = (i + 1) * m + j1;
      idx.push(k0, k2, k1, k1, k2, k3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  // hard edges on the profile: split normals by converting to non-indexed
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  void closedEnds;
  return flat;
}

/** The light channel on top of the rail: a ribbon whose `aS` attribute is arc length along its piece. */
function ribbon(path, y, w) {
  const n = path.pts.length;
  const pos = new Float32Array(n * 2 * 3), as = new Float32Array(n * 2), ax = new Float32Array(n * 2);
  const idx = [];
  const tan = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = path.pts[i];
    const a = path.pts[Math.max(0, i - 1)], b = path.pts[Math.min(n - 1, i + 1)];
    tan.subVectors(b, a).normalize();
    const nx = -tan.z, nz = tan.x;
    for (let j = 0; j < 2; j++) {
      const k = i * 2 + j, o = (j ? 1 : -1) * w * 0.5;
      pos[k * 3] = p.x + nx * o;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = p.z + nz * o;
      as[k] = path.cum[i];
      ax[k] = j ? 1 : -1;
    }
    if (i < n - 1) idx.push(i * 2, (i + 1) * 2, i * 2 + 1, i * 2 + 1, (i + 1) * 2, (i + 1) * 2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(as, 1));
  g.setAttribute('aX', new THREE.BufferAttribute(ax, 1));
  g.setIndex(idx);
  return g;
}

const CHANNEL_VERT = /* glsl */ `attribute float aS; attribute float aX; varying float vS; varying float vX;
void main(){ vS = aS; vX = aX; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CHANNEL_FRAG = /* glsl */ `
#define MAXP ${MAXP}
uniform vec4 uPulse[MAXP]; // x: position along this piece (may lie beyond its ends), yzw: colour
uniform int uCount; uniform float uTrail; uniform vec3 uIdle; uniform float uLevel; uniform float uFrom; uniform float uTo;
varying float vS; varying float vX;
void main(){
  if (vS < uFrom || vS > uTo) discard;
  vec3 col = uIdle;
  for (int i = 0; i < MAXP; i++) {
    if (i >= uCount) break;
    float d = uPulse[i].x - vS; // > 0: this point is behind the pulse
    float trail = d >= 0.0 ? exp(-d / uTrail) : exp(d / 0.05);
    col += uPulse[i].yzw * trail;
  }
  float edge = 1.0 - vX * vX * 0.55;
  gl_FragColor = vec4(col * edge * uLevel, 1.0);
}`;

export class Loop {
  constructor(M) {
    this.group = new THREE.Group();
    this.paths = makePaths();
    this.pieces = {};
    const Y = LOOP.Y;
    // profile: 44 mm wide, 26 mm tall rail with chamfered shoulders and a recessed top channel
    const prof = [[-0.022, -0.026], [0.022, -0.026], [0.022, -0.006], [0.016, 0], [0.008, 0], [0.008, -0.003], [-0.008, -0.003], [-0.008, 0], [-0.016, 0], [-0.022, -0.006]];
    for (const key of ['A', 'S', 'C', 'B']) {
      const path = this.paths[key];
      const g = new THREE.Group();
      const body = new THREE.Mesh(sweep(path, prof, Y), M.brushedFine);
      body.castShadow = true;
      body.receiveShadow = true;
      const mat = new THREE.ShaderMaterial({
        vertexShader: CHANNEL_VERT, fragmentShader: CHANNEL_FRAG, side: THREE.DoubleSide,
        uniforms: {
          uPulse: { value: Array.from({ length: MAXP }, () => new THREE.Vector4()) }, uCount: { value: 0 }, uTrail: { value: 0.7 },
          uIdle: { value: new THREE.Color(0.02, 0.022, 0.024) }, uLevel: { value: 1 }, uFrom: { value: -1 }, uTo: { value: 1e6 },
        },
      });
      const chan = new THREE.Mesh(ribbon(path, Y - 0.0025, 0.0155), mat);
      // the same channel traced on the floor, wide enough to read from overhead (the map shots)
      const map = new THREE.Mesh(ribbon(path, 0.006, 0.14), mat);
      map.visible = false;
      // posts every ~1.4 m (none where the rail lies on the desk)
      const posts = new THREE.Group();
      const postGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 12);
      const footGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.012, 24);
      const p = new THREE.Vector3();
      const count = Math.max(2, Math.round(path.length / 1.4));
      for (let i = 0; i <= count; i++) {
        path.at((path.length * (i + 0.5)) / (count + 1), p);
        if (key === 'S' && Math.abs(p.x) < 1.05 && p.z > -0.7) continue;
        const post = new THREE.Mesh(postGeo, M.steel);
        post.scale.y = Y - 0.026;
        post.position.set(p.x, (Y - 0.026) / 2, p.z);
        post.castShadow = true;
        const foot = new THREE.Mesh(footGeo, M.gunmetal);
        foot.position.set(p.x, 0.006, p.z);
        posts.add(post, foot);
      }
      g.add(body, chan, map, posts);
      this.group.add(g);
      this.pieces[key] = { key, path, group: g, body, chan, map, posts, mat };
    }

    // pulses: small machined carriers with a glowing core
    this.pulses = [];
    const capGeo = new THREE.CapsuleGeometry(0.0125, 0.085, 6, 16);
    capGeo.rotateZ(Math.PI / 2); // long axis along X
    for (let i = 0; i < MAXP; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(capGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.pulses.push({ mesh, mat });
    }
    // two travelling lights so a pulse actually lights the desk and the operator as it passes
    this.lights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xffffff, 0, 2.6, 2);
      this.group.add(l);
      return l;
    });
    this.gate = new THREE.Vector3(LOOP.GATE_X, Y, LOOP.Z_S);
    // arc length of the gate along piece S
    const ps = this.paths.S;
    let best = 0, bd = 1e9;
    for (let i = 0; i < ps.pts.length; i++) {
      const d = ps.pts[i].distanceTo(new THREE.Vector3(LOOP.GATE_X, 0, LOOP.Z_S));
      if (d < bd) { bd = d; best = ps.cum[i]; }
    }
    this.gateS = best;
    this.routes = {
      human: ['A', 'S', 'B'].map((k) => this.pieces[k]),
      bypass: ['A', 'C', 'B'].map((k) => this.pieces[k]),
    };
    this.routeLen = { human: 0, bypass: 0 };
    for (const r of ['human', 'bypass']) this.routeLen[r] = this.routes[r].reduce((s, p) => s + p.path.length, 0);
    /** Route distance (human route) at which a pulse sits in the approval gate. */
    this.gateD = this.paths.A.length + this.gateS;
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.group.visible = true;
    for (const k in this.pieces) {
      const pc = this.pieces[k];
      pc.group.visible = k !== 'C';
      pc.group.position.set(0, 0, 0);
      pc.mat.uniforms.uCount.value = 0;
      pc.mat.uniforms.uLevel.value = 1;
      pc.mat.uniforms.uTrail.value = 0.7;
      pc.mat.uniforms.uIdle.value.setRGB(0.02, 0.022, 0.024);
      pc.mat.uniforms.uFrom.value = -1;
      pc.mat.uniforms.uTo.value = 1e6;
      pc.body.visible = true;
      pc.posts.visible = true;
      pc.map.visible = false;
    }
    for (const p of this.pulses) p.mesh.visible = false;
    for (const l of this.lights) l.intensity = 0;
  }

  /** Show the floor trace of the loop (for overhead shots). */
  showMap(on = true) {
    for (const k in this.pieces) this.pieces[k].map.visible = on;
  }

  /** Resting glow of the light channel (HDR) — raise it in wide shots so the whole loop reads as a line of light. */
  setIdle(gain, color = PAL.white) {
    const c = new THREE.Color(color).multiplyScalar(gain);
    for (const k in this.pieces) this.pieces[k].mat.uniforms.uIdle.value.copy(c);
  }

  /**
   * Place pulses. Each: { route: 'human' | 'bypass', d: distance along the route (m, wraps),
   *                       color: THREE.Color | hex, gain: HDR brightness }.
   */
  setPulses(list, { trail = 0.7, lightGain = 1 } = {}) {
    const counts = { A: 0, S: 0, C: 0, B: 0 };
    const col = new THREE.Color();
    let li = 0;
    list.slice(0, MAXP).forEach((q, i) => {
      const route = this.routes[q.route];
      const L = this.routeLen[q.route];
      const d = ((q.d % L) + L) % L;
      col.set(q.color ?? PAL.white);
      const gain = q.gain ?? 3;
      // locate
      let acc = 0, piece = route[0], local = d;
      for (const pc of route) {
        if (d < acc + pc.path.length || pc === route[route.length - 1]) { piece = pc; local = d - acc; break; }
        acc += pc.path.length;
      }
      piece.path.at(local, this._p, this._t);
      const P = this.pulses[i];
      P.mesh.visible = gain > 0.001;
      P.mesh.position.set(this._p.x, LOOP.Y + 0.011, this._p.z);
      P.mesh.rotation.set(0, Math.atan2(-this._t.z, this._t.x), 0);
      P.mat.color.copy(col).multiplyScalar(gain);
      // trail on every piece of this route (position expressed in that piece's own arc length)
      let start = 0;
      for (const pc of route) {
        const u = pc.mat.uniforms;
        for (const off of [0, -L, L]) {
          const v = d + off - start;
          if (v > -0.3 && v < pc.path.length + trail * 6) {
            const k = counts[pc.key]++;
            if (k < MAXP) u.uPulse.value[k].set(v, col.r * gain * 0.42, col.g * gain * 0.42, col.b * gain * 0.42);
          }
        }
        start += pc.path.length;
      }
      // light the surroundings from the pulses nearest the desk
      if (li < 2 && piece.key === 'S' && Math.abs(this._p.x) < 2.2 && gain > 0.2) {
        const l = this.lights[li++];
        l.position.set(this._p.x, LOOP.Y + 0.06, this._p.z);
        l.color.copy(col);
        l.intensity = 0.16 * gain * lightGain;
      }
    });
    for (const k in this.pieces) {
      const u = this.pieces[k].mat.uniforms;
      u.uCount.value = Math.min(MAXP, counts[k]);
      u.uTrail.value = trail;
    }
  }
}
