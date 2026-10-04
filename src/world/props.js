// Set pieces that belong to particular moments of the film (as opposed to the
// permanent kit). All are built once and driven by closed-form parameters.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL } from '../config.js';
import { glow, labelTexture, setGlow } from '../engine/look.js';
import { buildText, fonts, inkMaterial } from '../engine/type.js';
import { clamp, ease, hash, mulberry32, smoothstep } from '../engine/util.js';
import { DESK_Y, buildChair, buildDesk, buildOperator, drawBadge } from './kit.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(), _c = new THREE.Color();

/** Flatten a posed group into one merged geometry per material (for instancing). */
export function bakeGroup(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const by = new Map();
  group.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || !o.visible) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld));
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(g);
  });
  const out = [];
  for (const [material, list] of by) out.push({ material, geometry: mergeGeometries(list, false) });
  return out;
}

/** N copies of a baked group, each with its own transform. */
export class InstancedGroup {
  constructor(baked, count, { cast = true } = {}) {
    this.group = new THREE.Group();
    this.count = count;
    this.meshes = baked.map(({ material, geometry }) => {
      const im = new THREE.InstancedMesh(geometry, material, count);
      im.castShadow = cast;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    });
  }
  setMatrix(i, m) {
    for (const im of this.meshes) im.setMatrixAt(i, m);
  }
  commit() {
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }
}

// ----------------------------------------------------------- colleagues

/**
 * The other desks on the floor: each with a person and a warm lamp pool.
 * They can be retracted into the floor one by one ("They moved all the desks").
 */
export class Colleagues {
  constructor(M) {
    this.group = new THREE.Group();
    // layout: rows either side of the loop and behind the operator; nothing inside the loop
    const slots = [];
    for (const z of [-12.6, -9.4, -6.2, -3.0, 0.2, 3.4, 6.6, 9.8]) for (const x of [-17.5, -14, -10.5, -7, 7, 10.5, 14, 17.5]) slots.push([x, z]);
    for (const z of [3.4, 6.6, 9.8]) for (const x of [-3.5, 0, 3.5]) slots.push([x, z]);
    this.slots = slots.map(([x, z], i) => ({ x, z, i, r: hash(i, 3), dist: Math.hypot(x, z - 0.4) }));
    const n = (this.n = slots.length);

    // one posed colleague + chair + desk, baked
    const proto = new THREE.Group();
    const desk = buildDesk(M, { w: 1.6, d: 0.75 });
    const chair = buildChair(M);
    chair.group.position.set(0, 0, 0.67);
    const op = buildOperator(M);
    op.group.position.set(0, 0, 0.62);
    op.pose({ lean: 0.2, headPitch: -0.22 });
    // a small lamp head (unlit geometry; the light is the pool and strip below)
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 8), M.chrome);
    stem.position.set(-0.62, DESK_Y + 0.18, -0.05);
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.016, 0.05, 2, 0.006), M.darkAnodised);
    head.position.set(-0.36, DESK_Y + 0.365, -0.05);
    proto.add(desk.group, chair.group, op.group, stem, head);
    this.people = new InstancedGroup(bakeGroup(proto), n);
    this.group.add(this.people.group);

    // lamp strip + pool of warm light on each desk (emissive, per-instance level)
    this.strip = new THREE.InstancedMesh(new THREE.BoxGeometry(0.27, 0.004, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const poolTex = labelTexture(256, 256, (c, w, h) => {
      const g = c.createRadialGradient(w * 0.42, h * 0.5, 0, w * 0.42, h * 0.5, w * 0.5);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.42)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    const poolGeo = new THREE.PlaneGeometry(1.5, 0.74);
    poolGeo.rotateX(-Math.PI / 2);
    this.pool = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), n);
    // warm glow on the person's front (a soft card in front of the torso), so they read as lit by their lamp
    const faceGeo = new THREE.PlaneGeometry(0.5, 0.5);
    this.bounce = new THREE.InstancedMesh(faceGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), n);
    // floor plates: where each desk goes when it is retracted
    const plateGeo = new THREE.PlaneGeometry(2.0, 1.9);
    plateGeo.rotateX(-Math.PI / 2);
    this.plate = new THREE.InstancedMesh(plateGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; void main(){ vec2 d = min(vUv, 1.0 - vUv); float e = min(d.x * 2.0, d.y * 1.9); float w = fwidth(e) * 1.2;
        float line = smoothstep(0.012 + w, 0.012, e) ; gl_FragColor = vec4(vec3(0.16, 0.17, 0.18), line * 0.55); }`,
    }), n);
    const haloGeo = new THREE.PlaneGeometry(1.9, 1.25);
    this.halo = new THREE.InstancedMesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), n);
    for (const im of [this.strip, this.pool, this.bounce, this.halo, this.plate]) { im.frustumCulled = false; this.group.add(im); }
    this.slots.forEach((s) => {
      _m.makeTranslation(s.x, 0.003, s.z + 0.2);
      this.plate.setMatrixAt(s.i, _m);
    });
    this.plate.instanceMatrix.needsUpdate = true;
    this.warm = new THREE.Color(PAL.warm);
    this.set(() => 0);
  }
  /** Show only the floor plates: the slots where the desks used to be. */
  platesOnly(on = true) {
    for (const o of [this.people.group, this.strip, this.pool, this.bounce, this.halo]) o.visible = !on;
  }

  /**
   * retract(slot) → 0 (present) .. 1 (gone below the floor). `lampOf(slot)` optional lamp level 0..1.
   */
  set(retract, lampOf = null) {
    for (const s of this.slots) {
      const r = clamp(retract(s));
      const y = -1.62 * ease.inOutCubic(r);
      _m.makeTranslation(s.x, y, s.z);
      this.people.setMatrix(s.i, _m);
      const lamp = (lampOf ? lampOf(s) : 1) * (1 - smoothstep(0.0, 0.25, r)) * (0.85 + 0.3 * s.r);
      _m.makeTranslation(s.x - 0.36, y + DESK_Y + 0.356, s.z - 0.05);
      this.strip.setMatrixAt(s.i, _m);
      this.strip.setColorAt(s.i, _c.copy(this.warm).multiplyScalar(6 * lamp));
      _m.makeTranslation(s.x - 0.1, y + DESK_Y + 0.003, s.z);
      this.pool.setMatrixAt(s.i, _m);
      this.pool.setColorAt(s.i, _c.copy(this.warm).multiplyScalar(1.1 * lamp));
      _m.makeTranslation(s.x - 0.25, y + DESK_Y + 0.26, s.z - 0.16);
      this.halo.setMatrixAt(s.i, _m);
      this.halo.setColorAt(s.i, _c.copy(this.warm).multiplyScalar(0.3 * lamp));
      _m.makeTranslation(s.x - 0.05, y + 1.05, s.z + 0.38);
      this.bounce.setMatrixAt(s.i, _m);
      this.bounce.setColorAt(s.i, _c.copy(this.warm).multiplyScalar(0.11 * lamp));
    }
    this.people.commit();
    for (const im of [this.strip, this.pool, this.bounce, this.halo]) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
  }
}

// --------------------------------------------------------------- papers

/** A stream of paper sheets fed along an arc into the machine; one plan card comes back. */
export class Papers {
  constructor(M, n = 46) {
    this.n = n;
    const geo = new THREE.PlaneGeometry(0.32, 0.45, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, M.paper, n);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
  }
  /**
   * @param u      stream progress: sheet i is at parameter u - i * gap along the path
   * @param from   start point [x,y,z]   @param to   end point (the machine's slot)
   */
  set(u, from, to, { gap = 0.035, arc = 1.1 } = {}) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    for (let i = 0; i < this.n; i++) {
      const x = u - i * gap;
      const k = clamp(x);
      const e = ease.inOutSine(k);
      _p.lerpVectors(a, b, e);
      _p.y += Math.sin(Math.PI * e) * arc + (1 - k) * i * 0.0012 * (x < 0 ? 1 : 0);
      // resting sheets form a neat stack at `from`
      if (x <= 0) _p.set(a.x, a.y + (this.n - i) * 0.0011, a.z);
      const flutter = Math.sin(Math.PI * e);
      _e.set(flutter * (0.5 + hash(i, 1) * 0.9), (hash(i, 2) - 0.5) * 0.5 * flutter + 0.0, flutter * (hash(i, 4) - 0.5) * 0.7);
      _q.setFromEuler(_e);
      const sc = x >= 1 ? 0.0001 : 1;
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    _s.set(1, 1, 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------ the year

/** Twelve engraved month slabs standing in a row: a year of work. They fall in a second. */
export class Year {
  constructor(M) {
    this.group = new THREE.Group();
    const names = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    this.slabs = names.map((nm, i) => {
      const pivot = new THREE.Group();
      const slab = new THREE.Mesh(new RoundedBoxGeometry(0.62, 1.5, 0.07, 3, 0.012), M.brushed);
      slab.position.y = 0.75;
      slab.castShadow = slab.receiveShadow = true;
      const mat = inkMaterial(PAL.white, 0.9);
      const t = buildText(nm, { font: 'machineBold', size: 0.13, align: 'center', material: mat, share: true, prop: true });
      t.object.position.set(0, 1.18, 0.037);
      const num = buildText(String(i + 1).padStart(2, '0'), { font: 'machineLight', size: 0.07, align: 'center', material: mat, share: true, prop: true });
      num.object.position.set(0, 1.02, 0.037);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.012), glow(PAL.green, 0));
      bar.position.set(0, 0.2, 0.037);
      pivot.add(slab, t.object, num.object, bar);
      pivot.position.set((i - 5.5) * 0.74, 0, 0);
      this.group.add(pivot);
      return { pivot, mat, bar: bar.material };
    });
  }
  /** fall(i) → 0 standing .. 1 flat on its back.  done(i) → 0..1 green bar level */
  set(fall, done) {
    this.slabs.forEach((s, i) => {
      const f = clamp(fall(i));
      // a falling slab: accelerating, with one small bounce
      const a = f < 0.82 ? ease.inQuad(f / 0.82) : 1 - 0.05 * Math.sin(((f - 0.82) / 0.18) * Math.PI);
      s.pivot.rotation.x = -a * (Math.PI / 2 - 0.045);
      setGlow(s.bar, clamp(done(i)) * 3);
    });
  }
}

// --------------------------------------------------------- the artifact

// What the machine invents: an object with no obvious use and no visible seam. It is not a mesh: the surface is
// an implicit function (a gyroid lattice folded into a ball round a lit core, with three hair-thin rings in orbit)
// found by sphere tracing inside a proxy sphere. The shader writes real depth, so it sits in the scene, takes
// part in depth of field and is mirrored in the floor like everything else.
const ART_R = 0.3;
const ART_VERT = /* glsl */ `
varying vec3 vObj; varying vec3 vCam;
void main(){
  vObj = position;
  vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ART_FRAG = /* glsl */ `
uniform float uT; uniform float uGrow; uniform float uGlow; uniform float uSeed; uniform vec3 uGreen; uniform float uSteps;
uniform mat4 modelMatrix; uniform mat4 projectionMatrix;
varying vec3 vObj; varying vec3 vCam;
const float R = ${ART_R.toFixed(3)};
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdTorus(vec3 p, float r, float w){ return length(vec2(length(p.xz) - r, p.y)) - w; }
vec3 spin(vec3 p){ p.xz *= rot(uT * 0.31 + uSeed); p.xy *= rot(0.42 + 0.15 * sin(uT * 0.23)); return p; }
// the lattice ball: |gyroid| < thickness, inside a sphere; the lattice breathes and drifts through itself
float lattice(vec3 q){
  float sc = 88.0;
  vec3 a = q * sc + vec3(0.0, uT * 0.55, 0.0);
  float g = dot(sin(a), cos(a.zxy)) / sc;
  float g2 = dot(sin(a * 0.5 + 1.7), cos(a.yzx * 0.5)) / (sc * 0.5);
  float d = abs(g) - 0.0046 - 0.0022 * g2 * sc * 0.5;
  float rad = 0.132 * uGrow;
  d = max(d * 0.72, length(q) - rad);
  return max(d, 0.05 - length(q));               // hollow, so the core has a room to light
}
float ring(vec3 p, int i){
  float fi = float(i);
  p.yz *= rot(0.9 + fi * 1.05); p.xy *= rot(fi * 0.7 + uT * (0.21 + 0.08 * fi) + uSeed * 2.0);
  float r = 0.185 + 0.027 * fi;
  float d = sdTorus(p, r, 0.005);
  // the rings are drawn round as the object is made
  float sweep = clamp(uGrow * 1.5 - 0.25 - 0.1 * fi, 0.0, 1.0);
  float ang = atan(p.z, p.x) / 6.2831853 + 0.5;
  return max(d, (ang - sweep) * r * 6.2831853 * step(sweep, 0.9999));
}
vec2 map(vec3 p){
  vec3 q = spin(p);
  vec2 res = vec2(lattice(q), 1.0);
  float c = length(p) - 0.036 * smoothstep(0.0, 0.25, uGrow);
  if (c < res.x) res = vec2(c, 2.0);
  for (int i = 0; i < 3; i++){ float d = ring(p, i); if (d < res.x) res = vec2(d, 3.0 + float(i)); }
  return res;
}
vec3 normalAt(vec3 p){
  vec2 e = vec2(0.0006, 0.0);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}
// the studio it stands in, as the metal sees it: a soft box overhead, two tall strips, a low rim, a dark room
vec3 studio(vec3 r){
  float az = atan(r.z, r.x);
  vec3 c = vec3(0.012, 0.014, 0.017) + 0.05 * smoothstep(-0.3, 1.0, r.y);
  c += vec3(1.0, 1.02, 1.06) * 7.0 * smoothstep(0.78, 0.9, r.y) * smoothstep(0.55, 0.2, abs(r.x + 0.15));
  float h = smoothstep(-0.25, 0.0, r.y) * smoothstep(0.85, 0.55, r.y);
  c += vec3(0.95, 0.98, 1.05) * 9.0 * h * smoothstep(0.07, 0.03, abs(az - 2.6));
  c += vec3(1.0) * 6.0 * h * smoothstep(0.045, 0.02, abs(az + 0.5));
  c += vec3(0.9, 0.95, 1.05) * 3.0 * smoothstep(0.035, 0.012, abs(r.y - 0.08)) * smoothstep(0.9, 0.3, abs(az + 1.6));
  return c;
}
void main(){
  vec3 ro = vCam, rd = normalize(vObj - vCam);
  // enter the bounding sphere
  float b = dot(ro, rd), cc = dot(ro, ro) - R * R, disc = b * b - cc;
  if (disc < 0.0) discard;
  float sq = sqrt(disc), t = max(-b - sq, 0.0), tEnd = -b + sq;
  vec2 hit = vec2(1.0, 0.0);
  float glow = 0.0;
  for (int i = 0; i < 96; i++){
    if (float(i) >= uSteps) break;
    vec3 p = ro + rd * t;
    hit = map(p);
    float dc = length(p);
    glow += min(hit.x, 0.02) * 22.0 * exp(-dc * 30.0); // the core's light in the air round it
    if (hit.x < 0.0003 * (1.0 + t) || t > tEnd) break;
    t += hit.x * 0.9;
  }
  vec3 col = vec3(0.0);
  bool solid = hit.x < 0.0006 * (1.0 + t) && t <= tEnd;
  if (!solid) discard;
  vec3 p = ro + rd * t;
  if (solid) {
    vec3 n = normalAt(p);
    mat3 M3 = mat3(modelMatrix);
    vec3 nW = normalize(M3 * n), rdW = normalize(M3 * rd);
    vec3 rW = reflect(rdW, nW);
    float fres = pow(1.0 - clamp(dot(-rdW, nW), 0.0, 1.0), 5.0);
    // occlusion from the field itself: how quickly the surface gets crowded along its normal
    float ao = 0.0, w = 1.0;
    for (int i = 1; i <= 4; i++){ float h = 0.004 * float(i); ao += w * (h - map(p + n * h).x); w *= 0.6; }
    ao = clamp(1.0 - ao * 38.0, 0.0, 1.0);
    float dcore = length(p);
    vec3 toCore = -p / max(dcore, 1e-4);
    float lit = max(dot(n, toCore), 0.0) * 0.0032 / (0.0008 + dcore * dcore) * uGlow;
    if (hit.y < 1.5) {
      // lattice: polished metal, lit from inside by the core
      vec3 f0 = vec3(0.86, 0.88, 0.9);
      col = studio(rW) * mix(f0, vec3(1.0), fres) * (0.25 + 0.75 * ao);
      col += uGreen * lit * (0.5 + 0.5 * ao) * 2.0;
      // the making: a white-hot line where the lattice is still being laid down
      float front = smoothstep(0.012, 0.0, abs(dcore - 0.132 * uGrow)) * step(uGrow, 0.995);
      col += vec3(1.0, 1.0, 0.96) * front * 5.0;
    } else if (hit.y < 2.5) {
      col = uGreen * (2.2 + 2.0 * fres) * uGlow + vec3(0.6) * uGlow * 0.4;
    } else {
      // rings: chrome hairlines, each carrying a green signal round
      float fi = hit.y - 3.0;
      vec3 q = p; q.yz *= rot(0.9 + fi * 1.05); q.xy *= rot(fi * 0.7 + uT * (0.21 + 0.08 * fi) + uSeed * 2.0);
      float ang = atan(q.z, q.x) / 6.2831853 + 0.5;
      float sig = smoothstep(0.9, 1.0, fract(ang * 3.0 - uT * (0.5 + 0.13 * fi)));
      col = studio(rW) * mix(vec3(0.9), vec3(1.0), fres) + uGreen * sig * 3.2 * uGlow;
    }
    col += uGreen * glow * uGlow * 0.5;
    vec4 clip = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  } else {
    gl_FragDepth = gl_FragCoord.z;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function artifactMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: ART_VERT, fragmentShader: ART_FRAG,
    uniforms: { uT: { value: 0 }, uGrow: { value: 1 }, uGlow: { value: 1 }, uSeed: { value: o.seed ?? 0 }, uGreen: { value: new THREE.Color(PAL.green) }, uSteps: { value: o.steps ?? 96 } },
  });
}

/** One invented object. set({ t, grow 0..1, glow }) */
export function buildArtifact(M, o = {}) {
  const g = new THREE.Group();
  const mat = o.material ?? artifactMaterial(o);
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(ART_R * 1.02, 4), mat);
  mesh.frustumCulled = false;
  g.add(mesh);
  // its light on the plinth and the floor
  const light = new THREE.PointLight(PAL.green, 0, 2.2, 2);
  if (!o.material) g.add(light);
  return {
    group: g, mesh, mat, light,
    set({ t = 0, grow = 1, glow = 1 } = {}) {
      mat.uniforms.uT.value = t;
      mat.uniforms.uGrow.value = grow;
      mat.uniforms.uGlow.value = glow;
      light.intensity = 0.5 * glow * grow;
    },
  };
}

// ------------------------------------------------------- staff directory

/** A wall directory of the floor's staff. Names go out one by one. */
export class Directory {
  constructor(M, names) {
    this.group = new THREE.Group();
    const w = 1.5, h = 2.1;
    const board = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.03, 3, 0.008), M.darkAnodised);
    board.castShadow = board.receiveShadow = true;
    this.group.add(board);
    const head = buildText('OPERATIONS', { font: 'machineBold', size: 0.07, tracking: 0.12, material: inkMaterial(PAL.white, 1.0), prop: true });
    head.object.position.set(-w / 2 + 0.12, h / 2 - 0.2, 0.017);
    const sub = buildText('FLOOR 41   APPROVALS', { font: 'machineLight', size: 0.034, tracking: 0.1, material: inkMaterial(PAL.steel, 1.0), prop: true });
    sub.object.position.set(-w / 2 + 0.12, h / 2 - 0.28, 0.017);
    const rule = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.24, 0.004), glow(PAL.steel, 0.8));
    rule.position.set(0, h / 2 - 0.33, 0.017);
    this.group.add(head.object, sub.object, rule);
    this.rows = names.map((nm, i) => {
      const mat = inkMaterial(PAL.white, 1.0);
      const t = buildText(nm, { font: 'displayMed', size: 0.062, material: mat, share: true, prop: true });
      const y = h / 2 - 0.46 - i * 0.118;
      t.object.position.set(-w / 2 + 0.12, y, 0.017);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 20), glow(PAL.green, 2));
      dot.position.set(w / 2 - 0.16, y + 0.022, 0.017);
      const strike = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.005), glow(PAL.steel, 0.9));
      strike.position.set(-w / 2 + 0.12, y + 0.022, 0.018);
      strike.geometry.translate(0.5, 0, 0);
      strike.scale.x = 0.0001;
      this.group.add(t.object, dot, strike);
      return { mat, dot: dot.material, strike, width: t.width };
    });
  }
  /** gone(i) → 0 employed .. 1 removed (struck through, dimmed, light out) */
  set(gone) {
    this.rows.forEach((r, i) => {
      const g = clamp(gone(i));
      r.mat.color.copy(r.mat.userData.base).multiplyScalar(1 - 0.78 * smoothstep(0.3, 1, g));
      setGlow(r.dot, 2 * (1 - smoothstep(0.0, 0.25, g)));
      r.strike.scale.x = Math.max(0.0001, r.width * ease.outCubic(clamp(g / 0.45)));
    });
  }
}

// --------------------------------------------------------- hero badge

/** The badge for the close-up: staff on one side, VISITOR on the other. */
export function buildHeroBadge(M) {
  const g = new THREE.Group();
  const W = 0.058, H = 0.088;
  const front = labelTexture(1024, 1554, (c, w, h) => drawBadge(c, w, h, 'staff', 'OPERATOR'));
  const back = labelTexture(1024, 1554, (c, w, h) => drawBadge(c, w, h, 'visitor', 'Operator'));
  const mf = new THREE.MeshPhysicalMaterial({ map: front, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const mb = new THREE.MeshPhysicalMaterial({ map: back, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const card = new THREE.Mesh(new RoundedBoxGeometry(W, H, 0.0018, 3, 0.0008), [M.plasticWhite, M.plasticWhite, M.plasticWhite, M.plasticWhite, mf, mb]);
  card.position.y = -H / 2 - 0.012;
  card.castShadow = true;
  // clip and strap
  const clip = new THREE.Mesh(new RoundedBoxGeometry(0.014, 0.02, 0.004, 2, 0.0015), M.chrome);
  clip.position.y = -0.006;
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.5, 0.0012), M.rubber);
  strap.position.y = 0.25;
  g.add(card, clip, strap);
  return { group: g, card, strap };
}

// ------------------------------------------------------- lamp panel

/** A brushed panel of indicator lamps. All green is its only good state. */
export class LampPanel {
  constructor(M, { cols = 12, rows = 5, pitch = 0.085, legend = true } = {}) {
    this.group = new THREE.Group();
    this.cols = cols;
    this.rows = rows;
    const w = cols * pitch + 0.12, h = rows * pitch + 0.2;
    this.w = w;
    this.h = h;
    const plate = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.02, 3, 0.006), M.brushed);
    plate.castShadow = plate.receiveShadow = true;
    this.group.add(plate);
    const n = cols * rows;
    const bez = new THREE.LatheGeometry([[0.017, 0], [0.026, 0], [0.026, 0.006], [0.023, 0.009], [0.019, 0.009], [0.017, 0.006]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
    bez.rotateX(Math.PI / 2);
    this.bezel = new THREE.InstancedMesh(bez, M.chrome, n);
    const lens = new THREE.SphereGeometry(0.0185, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    lens.rotateX(Math.PI / 2);
    lens.scale(1, 1, 0.55);
    this.lens = new THREE.InstancedMesh(lens, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    this.pos = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = (c - (cols - 1) / 2) * pitch, y = ((rows - 1) / 2 - r) * pitch + 0.045;
      this.pos.push({ x, y, c, r, i });
      _m.makeTranslation(x, y, 0.01);
      this.bezel.setMatrixAt(i, _m);
      _m.makeTranslation(x, y, 0.013);
      this.lens.setMatrixAt(i, _m);
    }
    this.bezel.frustumCulled = this.lens.frustumCulled = false;
    this.group.add(this.bezel, this.lens);
    // legend, engraved under the lamps (lights up when all is well)
    this.legendMat = inkMaterial(PAL.white, 0.35);
    const legendText = buildText('NOTHING WRONG WITH THE MACHINE', { font: 'machine', size: 0.03, tracking: 0.12, align: 'center', material: this.legendMat, share: true, prop: true });
    legendText.object.position.set(0, -h / 2 + 0.045, 0.0105);
    if (legend) this.group.add(legendText.object);
    /** where a legend line sits on the plate (centre, baseline) */
    this.legendY = -h / 2 + 0.045;
    this.off = new THREE.Color('#0a1410');
    this.green = new THREE.Color(PAL.green);
    this.set(() => 0);
  }
  /** on(lamp) → 0..1 per lamp ({c, r, i}). */
  set(on, gain = 2.6) {
    for (const p of this.pos) {
      const v = clamp(on(p));
      _c.copy(this.off).lerp(this.green, v).multiplyScalar(1 + (gain - 1) * v);
      this.lens.setColorAt(p.i, _c);
    }
    this.lens.instanceColor.needsUpdate = true;
  }
}
void fonts;
void mulberry32;
