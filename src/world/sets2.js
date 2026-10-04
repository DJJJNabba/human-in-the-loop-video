// The other locations: the chart that becomes a place, the world outside at
// night, the same loop seen from the air at three scales, and the planet.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAL } from '../config.js';
import { ReflectiveFloor, glow, labelTexture, setGlow } from '../engine/look.js';
import { StageSet } from '../engine/set.js';
import { fonts } from '../engine/type.js';
import { clamp, ease, hash, mulberry32 } from '../engine/util.js';
import { buildOperator } from './kit.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();

// ============================================================== the chart

/** "It offered a chart. The chart was so large I could not find the start." */
export class ChartSet extends StageSet {
  constructor(engine, look) {
    super(engine, 'chart');
    const { M, tex, envs } = look;
    const sc = this.scene;
    sc.background = new THREE.Color('#030405');
    sc.fog = new THREE.FogExp2('#030405', 0.0052);
    sc.environment = envs.lit;
    sc.environmentIntensity = 0.9;
    this.floor = new ReflectiveFloor(tex, { size: 900, color: '#090a0c', roughness: 0.24, resolution: Math.min(1024, Math.round(engine.H / 2)), f0: 0.07 });
    sc.add(this.floor.mesh);
    // bars: each one e^0.09 taller than the last. The first is knee-high; the last is out of sight.
    const N = (this.N = 96);
    this.pitch = 1.9;
    this.h = Array.from({ length: N }, (_, i) => 0.35 * Math.exp(i * 0.088));
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.bars = new THREE.InstancedMesh(geo, M.lacquerWhite, N);
    this.bars.castShadow = this.bars.receiveShadow = true;
    this.bars.frustumCulled = false;
    this.caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.22, 0.05, 1.22), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    this.caps.frustumCulled = false;
    sc.add(this.bars, this.caps);
    // baseline rule on the floor, and ticks
    const rule = new THREE.Mesh(new THREE.PlaneGeometry(N * this.pitch + 40, 0.035), glow(PAL.white, 0.7));
    rule.rotation.x = -Math.PI / 2;
    rule.position.set((N * this.pitch) / 2 - 10, 0.006, 1.25);
    sc.add(rule);
    this.op = buildOperator(M);
    this.op.pose({ stand: 1, headPitch: 0.5 });
    sc.add(this.op.group);
    const sun = (this.sun = new THREE.DirectionalLight('#f2f6ff', 2.6));
    sun.position.set(-30, 60, 40);
    sun.target.position.set(40, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 220 });
    sun.shadow.bias = -0.001;
    sc.add(sun, sun.target, new THREE.HemisphereLight('#dfe8f5', '#0c0d0f', 0.55));
    this.green = new THREE.Color(PAL.green);
    this.onReset(() => {
      this.op.group.position.set(-1.6, 0, 3.4);
      this.op.group.rotation.set(0, -1.0, 0);
      this.op.pose({ stand: 1, headPitch: 0.45 });
    });
  }
  /** grow(i) 0..1 per bar. */
  setBars(grow) {
    for (let i = 0; i < this.N; i++) {
      const g = clamp(grow(i));
      const h = Math.max(0.001, this.h[i] * ease.outCubic(g));
      _p.set(i * this.pitch, 0, 0);
      _s.set(1.15, h, 1.15);
      _m.compose(_p, _q.identity(), _s);
      this.bars.setMatrixAt(i, _m);
      _m.makeTranslation(i * this.pitch, h + 0.025, 0);
      this.caps.setMatrixAt(i, _m);
      this.caps.setColorAt(i, _c.copy(this.green).multiplyScalar(g > 0.02 ? 2.2 : 0));
    }
    this.bars.instanceMatrix.needsUpdate = true;
    this.caps.instanceMatrix.needsUpdate = true;
    this.caps.instanceColor.needsUpdate = true;
  }
  prepare(f, renderer) {
    this.floor.capture(renderer, this.scene, this.camera);
  }
}

// =========================================================== the outside

function houseGeometry(w = 7, d = 8, wall = 4.2, roof = 2.6) {
  // gabled prism, ridge along Z
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, wall);
  s.lineTo(0, wall + roof);
  s.lineTo(-w / 2, wall);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

/** A station platform and a street of houses, at night, in perfect order. */
export class OutsideSet extends StageSet {
  constructor(engine, look) {
    super(engine, 'outside');
    const { M, tex, envs } = look;
    const sc = this.scene;
    sc.background = new THREE.Color('#080b11');
    sc.fog = new THREE.FogExp2('#080b11', 0.011);
    sc.environment = envs.dark;
    sc.environmentIntensity = 0.7;
    this.floor = new ReflectiveFloor(tex, { size: 600, color: '#06070a', roughness: 0.33, resolution: Math.min(1024, Math.round(engine.H / 2)), f0: 0.06, strength: 0.9 });
    sc.add(this.floor.mesh);
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      sc.add(m);
      return m;
    };
    // --- station: platform along X, track on its north side
    box(160, 0.95, 5, M.concrete, 0, 0.475, 3.2);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(160, 0.12), glow(PAL.white, 0.55));
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(0, 0.956, 1.05);
    sc.add(edge);
    for (const z of [-0.3, -1.75]) box(400, 0.12, 0.07, M.steel, 0, 0.1, z);
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.06, 2.3), M.concrete, 260);
    for (let i = 0; i < 260; i++) { _m.makeTranslation((i - 130) * 0.7, 0.03, -1.02); sl.setMatrixAt(i, _m); }
    sc.add(sl);
    // canopy with a line of light, and the one platform lamp the lyric means
    box(60, 0.12, 4.6, M.lacquer, 0, 4.1, 3.3);
    for (let x = -26; x <= 26; x += 6.5) box(0.14, 3.1, 0.14, M.gunmetal, x, 2.5, 5.2);
    this.canopyMat = glow('#eef3ff', 3.2);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(56, 0.1), this.canopyMat);
    strip.rotation.x = Math.PI / 2;
    strip.position.set(0, 4.03, 2.3);
    sc.add(strip);
    const plat = (this.platLight = new THREE.SpotLight('#f1f5ff', 150, 60, 1.25, 0.6, 1.3));
    plat.position.set(0, 4.0, 2.3);
    plat.target.position.set(0, 0, 0.6);
    plat.castShadow = true;
    plat.shadow.mapSize.set(2048, 2048);
    plat.shadow.camera.near = 0.5;
    plat.shadow.camera.far = 40;
    plat.shadow.bias = -0.0006;
    sc.add(plat, plat.target);
    // departure board
    const board = new THREE.Group();
    const bb = new THREE.Mesh(new RoundedBoxGeometry(3.4, 0.9, 0.12, 2, 0.02), M.lacquer);
    const btex = labelTexture(1024, 256, (c, w, h) => {
      c.fillStyle = '#e8ece9';
      c.font = fonts.machine.css(46);
      c.textBaseline = 'middle';
      c.fillText('23:58   LOOP LINE', 44, 62);
      c.fillText('ALL STATIONS', 44, 130);
      c.fillStyle = PAL.green;
      c.fillText('ON TIME', 700, 62);
      c.fillStyle = '#7d8588';
      c.font = fonts.machineLight.css(30);
      c.fillText('PASSENGERS   0', 44, 204);
    });
    const bf = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.82), glow('#ffffff', 1.5, { map: btex, transparent: true }));
    bf.position.z = 0.065;
    board.add(bb, bf);
    board.position.set(-3.2, 3.2, 2.2);
    sc.add(board);
    this.board = board;
    // a bench under the canopy and a help point beside it: somewhere to wait, something to ask
    {
      const bx = 1.0, bz = 3.95, py = 0.95;
      const seat = box(1.9, 0.06, 0.48, M.darkAnodised, bx, py + 0.42, bz);
      void seat;
      for (const dx of [-0.8, 0.8]) box(0.05, 0.4, 0.42, M.gunmetal, bx + dx, py + 0.2, bz);
      const hp = new THREE.Group();
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.24, 1.55, 0.16, 3, 0.02), M.lacquer);
      body.position.y = 0.775;
      body.castShadow = true;
      this.helpRing = glow(PAL.green, 1.5, { side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.058, 48), this.helpRing);
      ring.position.set(0, 1.12, 0.081);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.02, 32), this.helpRing);
      dot.position.set(0, 1.12, 0.081);
      const htex = labelTexture(512, 256, (c, w, h) => {
        c.fillStyle = '#e8ece9';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = fonts.machineBold.css(58);
        c.fillText('HELP POINT', w / 2, 78);
        c.fillStyle = PAL.green;
        c.font = fonts.machine.css(46);
        c.fillText('CALLING ...', w / 2, 176);
      });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.095), glow('#ffffff', 1.5, { map: htex, transparent: true, side: THREE.DoubleSide }));
      face.position.set(0, 1.33, 0.081);
      // it stands at the platform edge and faces the bench
      hp.add(body, ring, dot, face);
      hp.position.set(bx + 1.25, py, 2.05);
      hp.rotation.y = -0.3;
      sc.add(hp);
      this.helpLight = new THREE.PointLight(PAL.green, 0, 3, 2);
      this.helpLight.position.set(bx + 1.2, py + 1.15, 2.5);
      sc.add(this.helpLight);
    }

    // --- the last train: three cars, lit and empty
    const train = (this.train = new THREE.Group());
    const carL = 19, carGap = 0.6;
    const winMat = glow(PAL.warm, 1.15);
    const seatMat = M.fabricSeat;
    for (let k = 0; k < 3; k++) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new RoundedBoxGeometry(carL, 2.9, 2.9, 4, 0.28), M.brushed);
      body.position.y = 2.0;
      body.castShadow = true;
      car.add(body);
      // window band on both sides: a warm interior behind dark glass
      for (const sz of [-1, 1]) {
        const band = new THREE.Mesh(new THREE.PlaneGeometry(carL - 2.2, 0.95), winMat);
        band.position.set(0, 2.45, sz * 1.455);
        band.rotation.y = sz > 0 ? 0 : Math.PI;
        car.add(band);
        // pillars between windows and empty seat backs seen through them
        for (let i = 0; i < 9; i++) {
          const pil = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.95), M.gunmetal);
          pil.position.set(-carL / 2 + 1.9 + i * ((carL - 3.8) / 8), 2.45, sz * 1.46);
          pil.rotation.y = sz > 0 ? 0 : Math.PI;
          car.add(pil);
        }
        for (let i = 0; i < 8; i++) {
          const seat = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.5), seatMat);
          seat.position.set(-carL / 2 + 2.9 + i * ((carL - 3.8) / 8), 2.2, sz * 1.458);
          seat.rotation.y = sz > 0 ? 0 : Math.PI;
          car.add(seat);
        }
      }
      const under = new THREE.Mesh(new THREE.BoxGeometry(carL - 1.5, 0.5, 2.4), M.rubber);
      under.position.y = 0.42;
      car.add(under);
      car.position.x = -k * (carL + carGap);
      train.add(car);
    }
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), glow(PAL.white, 2.5));
    tail.position.set(-2 * (carL + carGap) - carL / 2 - 0.01, 1.2, 0);
    tail.rotation.y = -Math.PI / 2;
    train.add(tail);
    train.position.set(0, 0, -1.02);
    sc.add(train);
    // warm light the train carries along the platform
    this.trainGlow = new THREE.PointLight(PAL.warm, 60, 26, 1.6);
    sc.add(this.trainGlow);

    // --- the street: two rows of houses facing each other, every window warm
    const rnd = mulberry32(31);
    const hg = houseGeometry();
    const n = 34;
    this.houses = new THREE.InstancedMesh(hg, M.wall, n);
    this.houses.castShadow = this.houses.receiveShadow = true;
    const wins = [];
    for (let i = 0; i < n; i++) {
      const row = i % 2, k = Math.floor(i / 2);
      const x = (k - 8) * 11.5 + (rnd() - 0.5) * 0.6;
      const z = row ? -44 : -26;
      const ry = row ? 0 : Math.PI; // doors face the street between the rows
      _p.set(x, 0, z);
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry + Math.PI / 2);
      _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      this.houses.setMatrixAt(i, _m);
      // windows on the long side that faces the street
      const face = row ? 1 : -1; // +z side of row 1 (z=-44) faces the street at z=-35
      for (const [dx, dy, w, h] of [[-2.4, 2.7, 1.3, 1.5], [0.4, 2.7, 1.3, 1.5], [2.6, 1.6, 0.9, 2.3], [-2.4, 0.9, 0.0, 0.0]]) {
        if (!w) continue;
        wins.push({ x: x + dx, y: dy, z: z + face * 3.52, face, w, h });
      }
      // the near row also has windows on its garden side, which is the side the station sees
      if (!row) for (const [dx, dy, w, h] of [[-1.9, 2.8, 1.2, 1.3], [1.5, 2.8, 1.2, 1.3], [1.5, 1.0, 1.2, 1.2]]) wins.push({ x: x + dx, y: dy, z: z + 3.52, face: 1, w, h });
    }
    sc.add(this.houses);
    const wg = new THREE.PlaneGeometry(1, 1);
    this.windows = new THREE.InstancedMesh(wg, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), wins.length);
    const warm = new THREE.Color(PAL.warm);
    wins.forEach((w, i) => {
      _p.set(w.x, w.y, w.z);
      _q.identity();
      _s.set(w.w, w.h, 1);
      _m.compose(_p, _q, _s);
      this.windows.setMatrixAt(i, _m);
      this.windows.setColorAt(i, _c.copy(warm).multiplyScalar(1.5 + hash(i, 5) * 0.9));
    });
    this.windows.frustumCulled = false;
    sc.add(this.windows);
    // warm spill on the street from each house front (no shadows: there is nobody to cast them)
    for (let k = 0; k < 6; k++) {
      const l = new THREE.PointLight(PAL.warm, 34, 22, 1.7);
      l.position.set((k - 2.5) * 22, 2.2, -35);
      sc.add(l);
    }
    // kerb lines and a row of small street lamps
    for (const z of [-31.4, -38.6]) {
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(220, 0.1), glow(PAL.white, 0.35));
      ln.rotation.x = -Math.PI / 2;
      ln.position.set(0, 0.012, z);
      sc.add(ln);
    }
    sc.add(new THREE.HemisphereLight('#aab8cf', '#0a0b0d', 0.4));
    this.op = buildOperator(M);
    this.op.group.visible = false;
    sc.add(this.op.group);
    this.onReset(() => {
      this.op.group.visible = false;
      train.position.x = 0;
      this.trainGlow.position.set(-19, 2.6, 0.6);
      setGlow(this.canopyMat, 3.2);
      setGlow(this.helpRing, 1.5);
      this.helpLight.intensity = 0.4;
    });
  }
  prepare(f, renderer) {
    this.floor.capture(renderer, this.scene, this.camera);
  }
}

// ================================================================ the air

const AERIAL_FRAG = /* glsl */ `
uniform float uT; uniform float uH; uniform vec3 uWhite; uniform vec3 uGreen; uniform float uGreenMix; uniform float uGain; uniform float uHole; uniform vec3 uShape;
varying vec3 vW;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// one loop: outline + pulses running round it. p in loop units (half extents 3 x 4.4, radius 1.5)
vec3 loopAt(vec2 p, float px, float seed, float speed){
  float d = abs(sdRR(p, uShape.xy, uShape.z));
  float w = max(0.03, px * 1.1);
  float line = smoothstep(w, w * 0.25, d);
  float a = atan(p.x, -p.y) / 6.2831853 + 0.5;         // 0..1 round the loop
  float ph = fract(a * 7.0 - uT * speed + seed);
  float pulse = smoothstep(0.86, 1.0, ph) * smoothstep(w * 3.5, w * 0.4, d);
  vec3 col = mix(uWhite, uGreen, uGreenMix) * line * 0.34;
  col += uGreen * pulse * 2.4;
  return col;
}
void main(){
  vec2 P = vW.xz;
  float px = uH * 0.0011;                                  // metres per pixel-ish at this height
  vec3 col = vec3(0.0);
  // level 0: the floor of loops (pitch 14 x 17 m)
  {
    vec2 pitch = vec2(14.0, 17.0);
    vec2 id = floor(P / pitch + 0.5);
    vec2 q = P - id * pitch;
    float inDistrict = step(sdRR(P, vec2(270.0, 400.0), 120.0), 0.0);
    float fade = smoothstep(900.0, 160.0, uH);
    float own = (abs(id.x) + abs(id.y) < 0.5) ? uHole : 1.0; // the hero loop is real geometry
    col += loopAt(q, px, h21(id), 0.55) * fade * inDistrict * own;
    // from higher up the individual loops merge into an even field of lit cells
    float cell = smoothstep(0.42, 0.3, max(abs(q.x) / pitch.x, abs(q.y) / pitch.y));
    col += mix(uWhite, uGreen, max(uGreenMix, 0.35)) * cell * 0.16 * inDistrict * smoothstep(60.0, 500.0, uH) * smoothstep(40000.0, 6000.0, uH);
  }
  // level 1: districts (x100): the same loop is the ring line of a district; districts tile the city
  {
    vec2 pitch = vec2(1400.0, 1700.0);
    vec2 id = floor(P / pitch + 0.5);
    vec2 q = (P - id * pitch) / 100.0;
    float fade = smoothstep(120.0, 700.0, uH) * smoothstep(90000.0, 30000.0, uH);
    col += loopAt(q, px / 100.0, h21(id + 7.0), 0.22) * fade * 1.5;
    // streets inside every district: ordered lights
    vec2 g = P / 34.0; vec2 gi = floor(g); vec2 gf = fract(g) - 0.5;
    float inD = step(sdRR(P - id * pitch, vec2(270.0, 400.0), 120.0), -20.0);
    float dotL = smoothstep(0.22, 0.08, length(gf)) * step(0.25, h21(gi));
    col += mix(vec3(1.0, 0.86, 0.66), uGreen, uGreenMix) * dotL * 0.5 * inD * smoothstep(150.0, 600.0, uH) * smoothstep(9000.0, 2500.0, uH);
  }
  // level 2: the region (x10000)
  {
    vec2 q = P / 10000.0;
    float fade = smoothstep(9000.0, 40000.0, uH);
    col += loopAt(q, px / 10000.0, 0.37, 0.09) * fade * 2.2;
  }
  gl_FragColor = vec4(col * uGain, 1.0);
}`;

/** One plane, one shader: the loop, then a floor of loops, then a city of them, then a region. */
export class AerialSet extends StageSet {
  constructor(engine) {
    super(engine, 'aerial');
    const sc = this.scene;
    sc.background = new THREE.Color('#010202');
    this.uniforms = {
      uT: { value: 0 }, uH: { value: 20 }, uWhite: { value: new THREE.Color(PAL.white) }, uGreen: { value: new THREE.Color(PAL.green) },
      uGreenMix: { value: 0 }, uGain: { value: 1 }, uHole: { value: 1 }, uShape: { value: new THREE.Vector3(3.0, 2.85, 1.2) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: AERIAL_FRAG,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.scale.set(4e5, 4e5, 1);
    plane.frustumCulled = false;
    sc.add(plane);
    this.onReset(() => {
      this.uniforms.uGreenMix.value = 0;
      this.uniforms.uGain.value = 1;
      this.uniforms.uHole.value = 1;
    });
  }
  prepare(f, renderer, post = {}) {
    const b = this.engine.beat(f.t), g = post.beatScene ?? 1;
    this.uniforms.uGain.value *= 1 + 0.35 * b.k * g + 0.1 * b.h * g;
  }
  /** Camera straight down from height h (metres) over (cx, cz), rolled by `roll` degrees. */
  look(h, t, roll = 0, cx = 0, cz = 0, fov = 36) {
    this.uniforms.uH.value = h;
    this.uniforms.uT.value = t;
    this.rig.set({ pos: [cx, h, cz + h * 0.0015], look: [cx, 0, cz], fov, roll, near: Math.max(0.5, h * 0.05), far: h * 40 + 500 });
  }
}

// ============================================================= the planet

const NOISE3 = /* glsl */ `
float h31(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vn3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn3(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ s += a * vn3(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

const PLANET_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vP; varying vec3 vW;
void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const PLANET_FRAG = /* glsl */ `
uniform float uT; uniform vec3 uGreen; uniform vec3 uWarm; uniform vec3 uWhite; uniform float uGreenMix; uniform vec3 uSun; uniform float uLights;
uniform vec3 uLoopC; uniform vec3 uLoopX; uniform vec3 uLoopY; uniform float uLoop; uniform float uCloudTurn;
varying vec3 vN; varying vec3 vP; varying vec3 vW;
${NOISE3}
float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  vec3 p = normalize(vP), n = normalize(vN), v = normalize(cameraPosition - vW), sun = normalize(uSun);
  float fwP = length(fwidth(p));
  // --- land: warped fractal continents, with one under the place the camera rose from
  vec3 wq = p + 0.22 * (vec3(fbm3(p * 2.1 + 7.0), fbm3(p * 2.1 + 13.0), fbm3(p * 2.1 + 29.0)) - 0.5);
  float hgt = fbm(wq * 1.9 + 3.1) + 0.2 * smoothstep(0.45, 0.0, distance(p, uLoopC));
  float land = smoothstep(0.5, 0.515, hgt);
  float lat = asin(clamp(p.y, -1.0, 1.0)), lon = atan(p.z, p.x);
  float ice = smoothstep(0.83, 0.9, abs(p.y) + 0.07 * (fbm3(p * 7.0) - 0.5));
  float relief = fbm3(p * 14.0);
  // --- day side
  float day = dot(n, sun);
  vec3 ocean = vec3(0.010, 0.026, 0.050);
  vec3 ground = mix(vec3(0.040, 0.050, 0.044), vec3(0.105, 0.100, 0.086), smoothstep(0.515, 0.72, hgt)) * (0.75 + 0.5 * relief);
  vec3 albedo = mix(mix(ocean, ground, land), vec3(0.72, 0.78, 0.84), ice);
  vec3 col = albedo * (0.012 + 2.8 * max(day, 0.0));
  float glint = pow(max(dot(n, normalize(sun + v)), 0.0), 70.0) * (1.0 - land) * (1.0 - ice);
  col += vec3(1.0, 0.96, 0.88) * glint * 1.4;
  // --- weather: a slower shell of cloud, turning at its own rate
  float ct = uCloudTurn, cs = sin(ct), cc = cos(ct);
  vec3 cp = vec3(cc * p.x - cs * p.z, p.y, cs * p.x + cc * p.z);
  float cl = fbm(cp * 3.1 + 0.55 * fbm3(cp * 5.0 + uT * 0.01) + vec3(0.0, uT * 0.003, 0.0));
  float cloud = smoothstep(0.5, 0.74, cl) * 0.9;
  col = mix(col, vec3(0.86, 0.9, 0.95) * (0.01 + 2.2 * max(day + 0.05, 0.0)), cloud);
  // --- night side: every light on, on a grid of meridians and parallels. Nothing organic is left.
  float night = smoothstep(0.1, -0.2, day);
  float lights = 0.0;
  vec2 g0 = vec2(lon, lat) * 60.0;
  float sc = 1.0;
  for (int k = 0; k < 3; k++){
    vec2 g = g0 * sc; float fw = fwP * 60.0 * sc;                   // cells per pixel at this level
    vec2 gf = fract(g) - 0.5;
    float cov = smoothstep(0.19 + fw, 0.19 - fw, length(gf));
    cov = mix(cov, 0.11, smoothstep(0.16, 0.5, fw));                  // sub-pixel dots become an even glow, not a shimmer
    float vis = smoothstep(0.012, 0.04, fw) * (k == 0 ? 1.0 : smoothstep(0.6, 0.25, fw));
    lights += cov * vis * (k == 0 ? 1.0 : 0.55);
    sc *= 8.0;
  }
  vec2 t10 = abs(fract(g0 / 10.0) - 0.5);
  float fwT = fwP * 6.0;
  float trunk = smoothstep(0.02 + fwT, 0.02 - fwT * 0.5, min(t10.x, t10.y)) * (1.0 - smoothstep(0.03, 0.12, fwT));
  lights = (lights * 1.25 + trunk * 0.3) * land * (1.0 - ice) * cos(lat);
  // the green arrives as a front crossing the night side, not as a fade
  float front = dot(p, normalize(vec3(0.6, 0.25, -0.76))) * 0.5 + 0.5 + 0.09 * (fbm3(p * 4.0) - 0.5);
  float gm = smoothstep(front - 0.04, front + 0.04, uGreenMix * 1.12 - 0.04);
  vec3 lc = mix(uWarm, uGreen, max(gm, 0.6 * uLoop));
  col += lc * lights * night * uLights * (1.0 - 0.75 * cloud) * (1.0 + 0.5 * gm);
  col += lc * night * cloud * land * 0.035 * uLights;               // the glow of the grid under cloud
  // --- the loop we rose out of, drawn on the ground where we left it (only close up)
  if (uLoop > 0.001) {
    vec3 d = p - uLoopC;
    vec2 q = vec2(dot(d, uLoopX), dot(d, uLoopY)) * 637.1;          // units of 10 km
    float px = length(fwidth(q));
    float dd = abs(sdRR(q, vec2(3.0, 2.85), 1.2));
    float w = max(0.03, px * 1.1);
    float line = smoothstep(w, w * 0.25, dd);
    float a = atan(q.x, -q.y) / 6.2831853 + 0.5;
    float pulse = smoothstep(0.86, 1.0, fract(a * 7.0 - uT * 0.09 + 0.37)) * smoothstep(w * 3.5, w * 0.4, dd);
    col += (mix(uWhite, uGreen, 0.55) * line * 0.75 + uGreen * pulse * 5.3) * uLoop;
  }
  // --- air: a thin bright limb, blue by day, green once the grid is
  float rim = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 3.2); // clamped: a dot product a hair over 1 made NaN pixels, which the bloom spread into dark frames
  vec3 air = mix(vec3(0.22, 0.42, 0.75), uGreen, gm * 0.65);
  col += air * rim * (0.07 + 0.95 * smoothstep(-0.25, 0.35, day));
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

const ATMO_FRAG = /* glsl */ `
uniform vec3 uSun; uniform vec3 uGreen; uniform float uGreenMix;
varying vec3 vW;
void main(){
  // how close this line of sight passes to the planet, and whether the air there is in sunlight
  vec3 rd = normalize(vW - cameraPosition);
  float tca = dot(-cameraPosition, rd);
  vec3 pc = cameraPosition + rd * tca;
  float d = length(pc);
  float glow = exp(-max(d - 1.0, 0.0) * 62.0) * step(1.0, d) * step(0.0, tca);
  float lit = smoothstep(-0.35, 0.45, dot(normalize(pc), normalize(uSun)));
  vec3 air = mix(vec3(0.25, 0.48, 0.9), uGreen, uGreenMix * 0.65);
  gl_FragColor = vec4(air * glow * (0.05 + 1.1 * lit), 1.0);
}`;

const RING_FRAG = /* glsl */ `
uniform float uT; uniform vec3 uGreen; uniform vec3 uWhite; uniform float uGreenMix; uniform float uGain; uniform float uBeat;
varying vec2 vQ;
void main(){
  float r = length(vQ), a = atan(vQ.y, vQ.x) / 6.2831853 + 0.5;
  float fw = fwidth(r);
  vec3 col = vec3(0.0);
  // three rails: the loop, at the largest scale there is
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float rr = 1.6 + 0.022 * fi;
    float w = 0.0022 + fw;
    float line = smoothstep(w, w * 0.3, abs(r - rr));
    float ph = fract(a * (18.0 + 6.0 * fi) - uT * (0.2 - 0.045 * fi) + fi * 0.37);
    float pulse = smoothstep(0.8, 1.0, ph);
    col += (mix(uWhite, uGreen, max(uGreenMix, 0.4)) * 0.42 + uGreen * pulse * 2.6) * line;
  }
  // a beat goes round once a bar instead of flashing the whole ring
  float sweep = smoothstep(0.12, 0.0, abs(fract(a - uT * 0.5292 + 0.5) - 0.5));
  col *= 1.0 + 1.6 * uBeat * sweep;
  gl_FragColor = vec4(col * uGain, 1.0);
}`;

/** A planet without people: every light on, on a grid, and the loop running round it. */
export class PlanetSet extends StageSet {
  constructor(engine) {
    super(engine, 'planet');
    const sc = this.scene;
    sc.background = new THREE.Color('#000102');
    this.uniforms = {
      uT: { value: 0 }, uGreen: { value: new THREE.Color(PAL.green) }, uWarm: { value: new THREE.Color('#ffd9a8') }, uWhite: { value: new THREE.Color(PAL.white) },
      uGreenMix: { value: 0 }, uSun: { value: new THREE.Vector3(-1, 0.25, -0.55) }, uLights: { value: 1 },
      uLoopC: { value: new THREE.Vector3(0, 0, 1) }, uLoopX: { value: new THREE.Vector3(1, 0, 0) }, uLoopY: { value: new THREE.Vector3(0, 1, 0) }, uLoop: { value: 0 },
      uCloudTurn: { value: 0 },
    };
    const globe = (this.globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 256, 192),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG }),
    ));
    sc.add(globe);
    // the air beyond the limb
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.09, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { uSun: this.uniforms.uSun, uGreen: this.uniforms.uGreen, uGreenMix: this.uniforms.uGreenMix },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: ATMO_FRAG, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    sc.add(atmo);
    // the ring: a flat band of three rails, antialiased in the shader so it does not crawl
    const ring = (this.ring = new THREE.Group());
    this.ringR = 1.62;
    this.ringMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uGreen: this.uniforms.uGreen, uWhite: this.uniforms.uWhite, uGreenMix: this.uniforms.uGreenMix, uGain: { value: 1 }, uBeat: { value: 0 } },
      vertexShader: 'varying vec2 vQ; void main(){ vQ = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: RING_FRAG, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const band = new THREE.Mesh(new THREE.RingGeometry(1.57, 1.68, 360, 1), this.ringMat);
    band.rotation.x = Math.PI / 2;
    ring.add(band);
    ring.rotation.set(0.38, 0, 0.16);
    sc.add(ring);
    // stars: a few hundred soft points of different sizes; they do not move, so they do not twinkle
    const rnd = mulberry32(5);
    const N = 1400;
    const sp = new Float32Array(N * 3), ss = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      sp[i * 3] = r * Math.cos(a) * 60; sp[i * 3 + 1] = u * 60; sp[i * 3 + 2] = r * Math.sin(a) * 60;
      ss[i] = Math.pow(rnd(), 6);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sgeo.setAttribute('aS', new THREE.BufferAttribute(ss, 1));
    this.stars = new THREE.Points(sgeo, new THREE.ShaderMaterial({
      uniforms: { uPx: { value: engine.px } },
      vertexShader: 'attribute float aS; uniform float uPx; varying float vS; void main(){ vS = aS; gl_PointSize = (2.2 + 3.2 * aS) * uPx; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vS; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 5.0); gl_FragColor = vec4(vec3(0.62, 0.68, 0.78) * a * (0.22 + 1.5 * vS), 1.0); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.stars.frustumCulled = false;
    sc.add(this.stars);
    this.onReset(() => {
      this.uniforms.uGreenMix.value = 0;
      this.uniforms.uLights.value = 1;
      this.uniforms.uLoop.value = 0;
      this.ringMat.uniforms.uGain.value = 1;
    });
  }
  prepare(f, renderer, post = {}) {
    // the kick goes round the ring as a brighter stretch; nothing on the planet flashes
    const b = this.engine.beat(f.t), g = post.beatScene ?? 1;
    this.ringMat.uniforms.uBeat.value = b.heavy * g;
  }
  static SPIN = 0.03;
  spin(t) {
    this.uniforms.uT.value = t;
    this.ringMat.uniforms.uT.value = t;
    this.globe.rotation.y = t * PlanetSet.SPIN;
    this.uniforms.uCloudTurn.value = t * 0.011;
  }
  /**
   * Mark the place the camera rises from: a surface direction (world space, as of time t0) and how the frame
   * is turned there. The loop is drawn on the ground at that spot.
   */
  anchor(dirWorld, t0, landscape) {
    const a = -t0 * PlanetSet.SPIN;
    const c = new THREE.Vector3(...dirWorld).normalize();
    const east = new THREE.Vector3(0, 1, 0).cross(c).normalize(), north = c.clone().cross(east).normalize();
    const toObj = (v) => v.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    this.uniforms.uLoopC.value.copy(toObj(c.clone()));
    this.uniforms.uLoopX.value.copy(toObj(landscape ? north : east));
    this.uniforms.uLoopY.value.copy(toObj(landscape ? east : north));
  }
}
void setGlow;
