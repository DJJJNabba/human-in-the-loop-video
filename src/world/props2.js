// Set pieces for the second half: successors, the cage, the hired team, the
// card reader, the glass wall, the machine's own approval gate, the red button.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAL } from '../config.js';
import { glow, labelTexture, setGlow } from '../engine/look.js';
import { fonts } from '../engine/type.js';
import { clamp, ease, hash, smoothstep } from '../engine/util.js';
import { DESK_Y, buildConsole, buildMachine, buildOperator, buildChair } from './kit.js';
import { LOOP } from './loop.js';
import { InstancedGroup, bakeGroup } from './props.js';

const _m = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const shadow = (m) => { m.castShadow = m.receiveShadow = true; return m; };

// ------------------------------------------------------------ successors

/** Generation 2 and 3: each taller, slimmer and smoother than the one that built it. */
export function buildSuccessors(M) {
  const g2 = buildMachine(M, { w: 0.86, h: 3.0, d: 0.86, portal: false, mat: M.brushed });
  g2.group.position.set(-2.0, 0, LOOP.Z_N - 0.2);
  // generation 3: white lacquer, a single unbroken vertical line of light
  const g = new THREE.Group();
  const body = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.62, 3.6, 0.62, 4, 0.05), M.lacquerWhite));
  body.position.y = 1.8;
  const lineMat = glow(PAL.green, 2.4);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 3.1), lineMat);
  line.position.set(0, 1.8, 0.311);
  const light = new THREE.PointLight(PAL.green, 0.5, 5, 2);
  light.position.set(0, 1.8, 0.7);
  g.add(body, line, light);
  g.position.set(2.0, 0, LOOP.Z_N - 0.2);
  const g3 = { group: g, lineMat, set(level) { setGlow(lineMat, 2.4 * level); light.intensity = 0.5 * level; } };
  return { g2, g3 };
}

// ------------------------------------------------------------------ cage

/** A test cage round the newest machine: bars, three locks, a row of test lamps. */
export class Cage {
  constructor(M, { w = 1.5, d = 1.5, h = 4.0 } = {}) {
    this.group = new THREE.Group();
    const bars = [];
    const step = 0.125;
    for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) { bars.push([x, -d / 2], [x, d / 2]); }
    for (let z = -d / 2 + step; z < d / 2 - 1e-6; z += step) { bars.push([-w / 2, z], [w / 2, z]); }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.009, 0.009, h, 8), M.steel, bars.length);
    bars.forEach(([x, z], i) => { _m.makeTranslation(x, h / 2, z); im.setMatrixAt(i, _m); });
    im.castShadow = true;
    this.group.add(im);
    for (const y of [0.03, h * 0.5, h - 0.03]) {
      for (const [bw, bd, x, z] of [[w + 0.05, 0.04, 0, -d / 2], [w + 0.05, 0.04, 0, d / 2], [0.04, d + 0.05, -w / 2, 0], [0.04, d + 0.05, w / 2, 0]]) {
        const r = shadow(new THREE.Mesh(new THREE.BoxGeometry(bw, 0.05, bd), M.gunmetal));
        r.position.set(x, y, z);
        this.group.add(r);
      }
    }
    // three locks on the front face
    this.locks = [0.9, 1.6, 2.3].map((y) => {
      const g = new THREE.Group();
      const body = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.2, 0.07, 2, 0.012), M.brushed));
      const bolt = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 16), M.chrome));
      bolt.rotation.z = Math.PI / 2;
      const lampMat = glow(PAL.white, 0.3);
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.016, 20), lampMat);
      lamp.position.set(0, 0.05, 0.036);
      g.add(body, bolt, lamp);
      g.position.set(0.28, y, d / 2 + 0.04);
      this.group.add(g);
      return { bolt, lampMat };
    });
    // header: twelve test lamps
    const head = shadow(new THREE.Mesh(new RoundedBoxGeometry(w + 0.1, 0.16, 0.05, 2, 0.01), M.darkAnodised));
    head.position.set(0, h + 0.1, d / 2);
    this.group.add(head);
    this.tests = Array.from({ length: 12 }, (_, i) => {
      const mat = glow(PAL.white, 0.25);
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.02, 20), mat);
      l.position.set((i - 5.5) * 0.115, h + 0.1, d / 2 + 0.027);
      this.group.add(l);
      return mat;
    });
  }
  /** lock(i) 0..1 bolt thrown; test(i) 0..1 passed. */
  set(lock, test) {
    this.locks.forEach((l, i) => {
      const k = clamp(lock(i));
      l.bolt.position.x = -0.16 + 0.1 * ease.outBack(k);
      setGlow(l.lampMat, 0.3 + 2.4 * smoothstep(0.6, 1, k), k > 0.6 ? PAL.green : PAL.white);
    });
    this.tests.forEach((m, i) => {
      const k = clamp(test(i));
      setGlow(m, 0.25 + 2.6 * k, k > 0.01 ? PAL.green : PAL.white);
    });
  }
}

// -------------------------------------------------------------- the team

/** The team it hired: a machine unit in every slot a desk used to occupy. */
export class Team {
  constructor(M, slots) {
    this.slots = slots;
    const proto = new THREE.Group();
    const unit = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.8, 1.5, 0.7, 3, 0.03), M.lacquerWhite));
    unit.position.y = 0.75;
    // a dark plinth, a shadow gap under the lid and a vent grille: enough seams to read as built things
    const foot = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.05, 0.64), M.plastic));
    foot.position.y = 0.025;
    unit.scale.y = 1.44 / 1.5;
    unit.position.y = 0.05 + 0.72;
    const gap = new THREE.Mesh(new THREE.BoxGeometry(0.81, 0.012, 0.71), M.plastic);
    gap.position.y = 1.3;
    proto.add(unit, foot, gap);
    for (let i = 0; i < 7; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.008, 0.004), M.plastic);
      v.position.set(0, 0.3 + i * 0.03, 0.351);
      proto.add(v);
    }
    this.units = new InstancedGroup(bakeGroup(proto), slots.length);
    this.slit = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.54, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff }), slots.length);
    this.slit.frustumCulled = false;
    // the light each status line throws on the floor in front of its unit
    const poolTex = labelTexture(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, w * 0.62);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.3)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    const pg = new THREE.PlaneGeometry(1.5, 1.7);
    pg.rotateX(-Math.PI / 2);
    this.pool = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff, map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), slots.length);
    this.pool.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.units.group, this.slit, this.pool);
    this.green = new THREE.Color(PAL.green);
  }
  /** Override each unit's status-slit level (HDR). Call after set(). */
  glow(level) {
    for (const s of this.slots) {
      const l = level(s);
      this.slit.setColorAt(s.i, _c.copy(this.green).multiplyScalar(l));
      this.pool.setColorAt(s.i, _c.copy(this.green).multiplyScalar(0.05 * l));
    }
    this.slit.instanceColor.needsUpdate = true;
    this.pool.instanceColor.needsUpdate = true;
  }

  /** rise(slot) 0 below the floor .. 1 in place. */
  set(rise) {
    for (const s of this.slots) {
      const r = clamp(rise(s));
      const y = -1.6 * (1 - ease.outCubic(r));
      _m.makeTranslation(s.x, y, s.z + 0.2);
      this.units.setMatrix(s.i, _m);
      _m.makeTranslation(s.x, y + 1.12, s.z + 0.2 + 0.352);
      this.slit.setMatrixAt(s.i, _m);
      this.slit.setColorAt(s.i, _c.copy(this.green).multiplyScalar(2.2 * smoothstep(0.85, 1, r)));
      _m.makeTranslation(s.x, 0.004, s.z + 0.2 + 1.0);
      this.pool.setMatrixAt(s.i, _m);
      this.pool.setColorAt(s.i, _c.copy(this.green).multiplyScalar(0.11 * smoothstep(0.85, 1, r)));
    }
    this.pool.instanceMatrix.needsUpdate = true;
    this.pool.instanceColor.needsUpdate = true;
    this.units.commit();
    this.slit.instanceMatrix.needsUpdate = true;
    this.slit.instanceColor.needsUpdate = true;
  }
}

// ----------------------------------------------------------- card reader

export function buildReader(M) {
  const g = new THREE.Group();
  const body = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.2, 0.03, 3, 0.008), M.lacquer));
  const tex = labelTexture(512, 256, () => {});
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.086, 0.043), glow('#ffffff', 1.5, { map: tex, transparent: true }));
  disp.position.set(0, 0.05, 0.0155);
  const ledMat = glow(PAL.white, 1.2);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.004), ledMat);
  led.position.set(0, -0.005, 0.0155);
  // contactless mark: three arcs
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.0225, 32), glow('#5a6064', 1));
  ring.position.set(0, -0.055, 0.0155);
  g.add(body, disp, led, ring);
  let shown = null;
  return {
    group: g, ledMat,
    show(lines, color = PAL.white) {
      const key = lines.join('|') + color;
      if (key === shown) return;
      shown = key;
      tex.userData.redraw((c, w, h) => {
        c.fillStyle = color;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = fonts.machine.css(46);
        lines.forEach((ln, i) => c.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 66));
      });
    },
  };
}

// ------------------------------------------------------------ glass wall

/** The partition that closes between the desk and the machines. Two leaves slide in from the sides. */
export class GlassWall {
  constructor(M, { z = -2.45, w = 44, h = 4.4 } = {}) {
    this.group = new THREE.Group();
    this.z = z;
    this.half = w / 2;
    this.leaves = [-1, 1].map((sx) => {
      const g = new THREE.Group();
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w / 2, h), M.glassClear);
      pane.position.set((sx * w) / 4, h / 2, 0);
      pane.renderOrder = 3;
      // leading-edge frame and a slim bottom rail
      const edge = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.035, h, 0.05), M.gunmetal));
      edge.position.set(sx * 0.018, h / 2, 0);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(w / 2, 0.03, 0.06), M.gunmetal);
      sill.position.set((sx * w) / 4, 0.015, 0);
      g.add(pane, edge, sill);
      g.position.z = z;
      this.group.add(g);
      return g;
    });
    // lock bar where the leaves meet
    this.lockMat = glow(PAL.white, 0);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.26, 0.06), this.lockMat);
    lock.position.set(0, 1.25, z + 0.001);
    this.group.add(lock);
  }
  /** closed 0 (open, leaves parked at the walls) .. 1 (shut). */
  set(closed, lockLevel = 0, color = PAL.white) {
    const k = ease.inOutCubic(clamp(closed));
    const gap = (1 - k) * this.half * 0.72;
    this.leaves[0].position.x = -gap;
    this.leaves[1].position.x = gap;
    setGlow(this.lockMat, lockLevel, color);
  }
}

// ------------------------------------------- the machine's own approval

/** A copy of the operator's console on the bypass, with an arm that presses it. */
export function buildAutoGate(M) {
  const g = new THREE.Group();
  const cons = buildConsole(M);
  // the console is built to straddle a rail at local z = Z_S: put that on the chord
  cons.group.position.set(0, DESK_Y, LOOP.Z_C - LOOP.Z_S);
  const ped = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.3, DESK_Y, 0.52, 3, 0.015), M.lacquer));
  ped.position.set(0, DESK_Y / 2, LOOP.Z_C - LOOP.Z_S - 0.045);
  g.add(cons.group, ped);
  // the arm: a post behind the button, an upper link, a finger with a soft pad
  const bx = 0, bz = LOOP.Z_C - LOOP.Z_S + 0.07; // button centre
  const base = new THREE.Group();
  base.position.set(bx + 0.085, DESK_Y + 0.018, bz + 0.02);
  const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.1, 16), M.chrome));
  post.position.y = 0.05;
  const shoulder = new THREE.Group();
  shoulder.position.y = 0.1;
  const link = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.012, 0.016, 2, 0.004), M.brushed));
  link.position.x = -0.045;
  const elbow = new THREE.Group();
  elbow.position.x = -0.088;
  const finger = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.05, 14), M.chrome));
  finger.position.y = -0.025;
  const pad = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.0095, 16, 12), M.rubber));
  pad.position.y = -0.052;
  elbow.add(finger, pad);
  shoulder.add(link, elbow);
  base.add(post, shoulder);
  // a lens that watches: small, glassy, pointed at the operator's hand
  const eye = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 20), M.lacquer));
  eye.rotation.x = Math.PI / 2;
  eye.position.set(bx - 0.11, DESK_Y + 0.14, bz - 0.2);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.008, 20), glow('#9fb6c9', 0.8));
  iris.position.set(bx - 0.11, DESK_Y + 0.14, bz - 0.2 + 0.0105);
  g.add(base, eye, iris);
  return {
    group: g, console: cons, base,
    /** press 0..1: the finger comes down onto the button. */
    press(x) {
      const k = clamp(x);
      shoulder.rotation.z = 0.35 - 0.4 * k;
      elbow.rotation.z = -0.35 + 0.4 * k;
      shoulder.position.y = 0.1 - 0.018 * k;
      cons.press(k);
    },
  };
}

// ------------------------------------------------------------ red button

/** The shutdown button: a real one, under a smoked cover. The only red in the film. */
export function buildEStop(M) {
  const g = new THREE.Group();
  const base = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.022, 0.15, 3, 0.005), M.brushed));
  base.position.y = 0.011;
  const collar = shadow(new THREE.Mesh(new THREE.LatheGeometry([[0.026, 0], [0.04, 0], [0.04, 0.01], [0.034, 0.016], [0.026, 0.016]].map(([r, y]) => new THREE.Vector2(r, y)), 48), M.chrome));
  collar.position.y = 0.022;
  const capMat = new THREE.MeshPhysicalMaterial({ color: '#b3170f', roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, emissive: new THREE.Color(PAL.red), emissiveIntensity: 0.25 });
  const pts = [[0, 0], [0.024, 0], [0.024, 0.012], [0.039, 0.012], [0.039, 0.02]];
  for (let i = 1; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2); pts.push([0.039 * Math.cos(a), 0.02 + 0.014 * Math.sin(a)]); }
  const cap = shadow(new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 48), capMat));
  const capY = 0.034;
  cap.position.y = capY;
  const light = new THREE.PointLight(PAL.red, 0, 1.6, 2);
  light.position.set(0, 0.11, 0);
  // smoked cover hinged along the back edge
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.024, -0.07);
  const coverMat = M.glass.clone();
  coverMat.opacity = 0.5;
  const cover = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.085, 0.14, 3, 0.012), coverMat);
  cover.position.set(0, 0.0425, 0.07);
  cover.renderOrder = 4;
  const hingeBar = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 12), M.chrome));
  hingeBar.rotation.z = Math.PI / 2;
  hinge.add(cover, hingeBar);
  g.add(base, collar, cap, light, hinge);
  return {
    group: g, cap, hinge,
    /** open 0..1 cover lifted; press 0..1; level = red glow (HDR). */
    set(open, press, level) {
      hinge.rotation.x = -1.75 * ease.inOutCubic(clamp(open));
      cap.position.y = capY - 0.008 * clamp(press);
      capMat.emissiveIntensity = level * 1.8;
      light.intensity = level * 0.5;
    },
  };
}

// ------------------------------------------------- voices like mine

/** Rows of seated figures identical to the operator: the chorus that answers. */
export class Voices {
  constructor(M, seats) {
    this.group = new THREE.Group();
    const proto = new THREE.Group();
    const op = buildOperator(M);
    op.badge.mesh.visible = false;
    op.pose({ lean: 0.08, headPitch: -0.02, lHand: [-0.2, 0.62, -0.28], rHand: [0.2, 0.62, -0.28], lDip: 0.3, rDip: 0.3 });
    const chair = buildChair(M);
    chair.group.position.z = 0.05;
    proto.add(op.group, chair.group);
    const n = seats.length;
    this.people = new InstancedGroup(bakeGroup(proto), n);
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    this.dots.frustumCulled = false;
    this.group.add(this.people.group, this.dots);
    // they face south: towards the desk, towards whoever is asking
    this.seats = seats.map(([x, z], i) => ({ i, x, z, h: hash(i, 9), d: Math.hypot(x, z + 2) }));
    this.rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    this.green = new THREE.Color(PAL.green);
    this.set(() => 1, () => 1);
  }
  /** present(seat) 0..1 (rises from the floor); talk(seat) 0..1 headset light. */
  set(present, talk) {
    for (const s of this.seats) {
      const p = clamp(present(s));
      const y = -1.7 * (1 - ease.outCubic(p));
      _m.compose(_v.set(s.x, y, s.z), this.rot, _one);
      this.people.setMatrix(s.i, _m);
      _m.makeTranslation(s.x + 0.066, y + 1.166, s.z + 0.108);
      this.dots.setMatrixAt(s.i, _m);
      this.dots.setColorAt(s.i, _c.copy(this.green).multiplyScalar(3.2 * clamp(talk(s)) * p));
    }
    this.people.commit();
    this.dots.instanceMatrix.needsUpdate = true;
    this.dots.instanceColor.needsUpdate = true;
  }
}
