// Procedural city: instanced blocks whose lit windows are computed in the
// shader. Used as the view from the operator's floor and as the aerial city.
import * as THREE from 'three';
import { PAL } from '../config.js';
import { mulberry32 } from '../engine/util.js';

const VERT = /* glsl */ `
attribute vec3 aDim; attribute float aSeed;
varying vec3 vLocal; varying vec3 vNormalL; varying vec3 vDim; varying float vSeed; varying float vDist; varying vec3 vWorld;
void main(){
  vLocal = position * aDim; vNormalL = normal; vDim = aDim; vSeed = aSeed;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uWarm; uniform vec3 uCool; uniform vec3 uGreen; uniform vec3 uHaze; uniform vec3 uBody;
uniform float uOrder;   // 0: lived-in, irregular windows.  1: every window on, identical.
uniform float uGreenMix; uniform float uGain; uniform float uHazeDist; uniform float uFill; uniform float uTime; uniform float uWarmth;
varying vec3 vLocal; varying vec3 vNormalL; varying vec3 vDim; varying float vSeed; varying float vDist; varying vec3 vWorld;
float h1(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
void main(){
  vec3 n = abs(vNormalL);
  vec3 col = uBody;
  if (n.y < 0.5) {
    // side faces: window grid in metres
    float u = n.x > 0.5 ? vLocal.z : vLocal.x;
    float face = n.x > 0.5 ? (vNormalL.x > 0.0 ? 1.0 : 2.0) : (vNormalL.z > 0.0 ? 3.0 : 4.0);
    vec2 cellSize = vec2(1.9, 3.4);
    vec2 g = vec2(u + 400.0, vLocal.y + vDim.y * 0.5) / cellSize;
    vec2 id = floor(g); vec2 f = fract(g);
    // anti-aliased window rectangle
    vec2 fw = fwidth(g);
    vec2 a = smoothstep(vec2(0.2, 0.3) - fw, vec2(0.2, 0.3) + fw, f) * (1.0 - smoothstep(vec2(0.8, 0.74) - fw, vec2(0.8, 0.74) + fw, f));
    float win = a.x * a.y;
    // far away, windows blur into an even glow instead of aliasing
    float lod = clamp(max(fw.x, fw.y) * 1.6, 0.0, 1.0);
    win = mix(win, 0.26, lod);
    float r = h1(vec3(id, vSeed * 91.0 + face * 7.0));
    float r2 = h1(vec3(id.yx + 5.0, vSeed * 53.0 + face));
    float litRandom = step(1.0 - uFill, r);
    float lit = mix(litRandom, 1.0, uOrder);
    lit = mix(lit, mix(uFill, 1.0, uOrder), lod * 0.85);
    float level = mix(0.35 + 0.65 * r2, 0.8, uOrder);
    vec3 tone = mix(uCool, uWarm, mix(step(0.45, r2) * uWarmth, uWarmth, uOrder * 0.0));
    tone = mix(tone, uGreen, uGreenMix);
    // top floors lost in the dark; ground floor closed
    float top = smoothstep(vDim.y * 0.5, vDim.y * 0.5 - 2.0, vLocal.y);
    col = uBody * (0.6 + 0.4 * f.y) + tone * win * lit * level * uGain * top;
  }
  float haze = 1.0 - exp(-vDist / uHazeDist);
  col = mix(col, uHaze, haze);
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * @param o.count     number of blocks        @param o.area  [x0, z0, x1, z1]
 * @param o.keepOut   (x, z) => true to leave that spot empty
 * @param o.height    [min, max]              @param o.seed
 * @param o.grid      street grid pitch in metres (blocks snap to it)
 */
export function buildCity(o = {}) {
  const { count = 600, area = [-200, -260, 200, -30], height = [18, 90], seed = 7, grid = 26, keepOut = null, footprint = [12, 22] } = o;
  const rnd = mulberry32(seed);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const dims = new Float32Array(count * 3), seeds = new Float32Array(count);
  const uniforms = {
    uWarm: { value: new THREE.Color(PAL.warm) }, uCool: { value: new THREE.Color('#dfe9f5') }, uGreen: { value: new THREE.Color(PAL.green) },
    uHaze: { value: new THREE.Color('#06080a') }, uBody: { value: new THREE.Color('#050607') },
    uOrder: { value: 0 }, uGreenMix: { value: 0 }, uGain: { value: 1.4 }, uHazeDist: { value: 260 }, uFill: { value: 0.42 }, uTime: { value: 0 }, uWarmth: { value: 0.8 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const used = new Set();
  let n = 0, guard = 0;
  const blocks = [];
  while (n < count && guard++ < count * 40) {
    const gx = Math.round((area[0] + rnd() * (area[2] - area[0])) / grid), gz = Math.round((area[1] + rnd() * (area[3] - area[1])) / grid);
    const key = gx + ',' + gz;
    if (used.has(key)) continue;
    const x = gx * grid, z = gz * grid;
    if (keepOut && keepOut(x, z)) continue;
    used.add(key);
    const w = footprint[0] + rnd() * (footprint[1] - footprint[0]), d = footprint[0] + rnd() * (footprint[1] - footprint[0]);
    const t = rnd();
    const h = height[0] + (height[1] - height[0]) * t * t;
    p.set(x, h / 2, z);
    s.set(w, h, d);
    m.compose(p, q, s);
    mesh.setMatrixAt(n, m);
    dims[n * 3] = w; dims[n * 3 + 1] = h; dims[n * 3 + 2] = d;
    seeds[n] = rnd();
    blocks.push({ x, z, w, h, d });
    n++;
  }
  mesh.count = n;
  geo.setAttribute('aDim', new THREE.InstancedBufferAttribute(dims, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return { mesh, uniforms, blocks };
}
