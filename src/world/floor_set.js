// The floor: the one continuous location of the film. One desk, one loop, one
// machine, a window wall with the city beyond. Shots restage it; its geography
// never changes (desk at the origin, machine 9 m north, operator facing north).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAL } from '../config.js';
import { ReflectiveFloor, glow, setGlow } from '../engine/look.js';
import { StageSet } from '../engine/set.js';
import { clamp, ease, lerp, smoothstep } from '../engine/util.js';
import { buildCity } from './city.js';
import { BUTTON, DESK_Y, buildChair, buildConsole, buildDesk, buildLamp, buildMachine, buildOperator } from './kit.js';
import { LOOP, Loop } from './loop.js';
import { Colleagues, Directory, InstancedGroup, Papers, Year, artifactMaterial, bakeGroup, buildArtifact, buildHeroBadge } from './props.js';
import { Cage, GlassWall, Team, Voices, buildAutoGate, buildEStop, buildReader, buildSuccessors } from './props2.js';

export const ROOM = { W: 44, H: 4.4, Z_N: -17, Z_S: 15 };
export const OP_Z = 0.62; // where the operator sits
const C_PENDING = new THREE.Color(PAL.white);
const C_GREEN = new THREE.Color(PAL.green);

export class FloorSet extends StageSet {
  constructor(engine, look) {
    super(engine, 'floor');
    const { M, tex, envs } = look;
    this.M = M;
    this.envs = envs;
    const sc = this.scene;
    sc.background = new THREE.Color('#020304');
    sc.environment = envs.dark;

    // --- floor
    this.floor = new ReflectiveFloor(tex, { size: 140, color: '#07080a', roughness: 0.27, resolution: Math.min(1024, Math.round(engine.H / 2)), f0: 0.06 });
    sc.add(this.floor.mesh);

    // --- the station: desk, console, lamp, chair, operator (one group, so it can be retracted as one)
    const st = (this.station = new THREE.Group());
    sc.add(st);
    this.desk = buildDesk(M);
    this.console = buildConsole(M);
    this.lamp = buildLamp(M);
    this.lamp.group.position.set(-0.76, DESK_Y, -0.02);
    this.chair = buildChair(M);
    this.chair.group.position.set(0, 0, OP_Z + 0.05);
    this.op = buildOperator(M);
    this.op.group.position.set(0, 0, OP_Z);
    st.add(this.desk.group, this.console.group, this.lamp.group, this.chair.group, this.op.group);

    // --- loop and machine
    this.loop = new Loop(M);
    sc.add(this.loop.group);
    this.machine = buildMachine(M);
    this.machine.group.position.set(0, 0, LOOP.Z_N);
    sc.add(this.machine.group);

    // --- room shell
    const room = (this.room = new THREE.Group());
    sc.add(room);
    const { W, H, Z_N, Z_S } = ROOM;
    const wallMat = M.wall;
    const mkWall = (w, h, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      room.add(m);
      return m;
    };
    mkWall(Z_S - Z_N, H, -W / 2, H / 2, (Z_N + Z_S) / 2, Math.PI / 2);
    mkWall(Z_S - Z_N, H, W / 2, H / 2, (Z_N + Z_S) / 2, -Math.PI / 2);
    mkWall(W, H, 0, H / 2, Z_S, Math.PI);
    // window wall (north): smoked glass between slim mullions
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), M.glass);
    glass.position.set(0, H / 2, Z_N);
    glass.renderOrder = 2;
    room.add(glass);
    this.glass = glass;
    const mull = new THREE.BoxGeometry(0.07, H, 0.14);
    for (let x = -W / 2; x <= W / 2 + 0.01; x += 2.75) {
      const m = new THREE.Mesh(mull, M.lacquer);
      m.position.set(x, H / 2, Z_N + 0.02);
      room.add(m);
    }
    for (const y of [0.03, H - 0.03]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, 0.16), M.lacquer);
      m.position.set(0, y, Z_N + 0.02);
      room.add(m);
    }
    // ceiling with linear light strips (off until "the lights come on")
    const ceil = (this.ceiling = new THREE.Group());
    room.add(ceil);
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(W, Z_S - Z_N), wallMat);
    cm.rotation.x = Math.PI / 2;
    cm.position.set(0, H, (Z_N + Z_S) / 2);
    ceil.add(cm);
    this.strips = [];
    for (let i = 0; i < 9; i++) {
      const mat = glow('#f4f8ff', 0);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.14, Z_S - Z_N - 3), mat);
      s.rotation.x = Math.PI / 2;
      s.position.set(-16 + i * 4, H - 0.01, (Z_N + Z_S) / 2);
      ceil.add(s);
      this.strips.push(mat);
    }
    // structural columns for depth
    for (const [x, z] of [[-9, -11], [9, -11], [-9, 3], [9, 3], [-17, -11], [17, -11], [-17, 3], [17, 3]]) {
      const c = new THREE.Mesh(new RoundedBoxGeometry(0.55, H, 0.55, 2, 0.02), M.concrete);
      c.position.set(x, H / 2, z);
      c.castShadow = c.receiveShadow = true;
      room.add(c);
    }

    // --- the view: a city below and beyond the window wall, and a night sky
    this.city = buildCity({ count: 2600, area: [-900, -1100, 900, -120], height: [30, 230], seed: 11, grid: 34, footprint: [14, 26] });
    this.city.mesh.position.y = -150;
    this.city.uniforms.uHazeDist.value = 900;
    sc.add(this.city.mesh);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { uTop: { value: new THREE.Color('#010203') }, uHorizon: { value: new THREE.Color('#0b1016') }, uGain: { value: 1 } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uTop; uniform vec3 uHorizon; uniform float uGain; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(uHorizon, uTop, smoothstep(-0.05, 0.45, h)) * uGain, 1.0); }',
      }),
    );
    sky.renderOrder = -10;
    sc.add(sky);
    this.sky = sky;
    // the window wall and the city are mirrored in the floor too: that is the beautiful view, twice

    // --- lights
    const rim = (this.rim = new THREE.SpotLight('#cfe0ff', 0, 30, 0.42, 0.85, 1.4));
    rim.position.set(-3.2, 3.9, -7.0);
    rim.target.position.set(0.1, 0.8, 0.3);
    rim.castShadow = true;
    rim.shadow.mapSize.set(2048, 2048);
    rim.shadow.camera.near = 1;
    rim.shadow.camera.far = 20;
    rim.shadow.bias = -0.0005;
    rim.shadow.radius = 6;
    sc.add(rim, rim.target);
    const top = (this.top = new THREE.DirectionalLight('#f3f7ff', 0));
    top.position.set(3, 14, 5);
    top.target.position.set(0, 0, -3);
    top.castShadow = true;
    top.shadow.mapSize.set(4096, 4096);
    Object.assign(top.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 40 });
    top.shadow.bias = -0.0006;
    top.shadow.radius = 5;
    sc.add(top, top.target);
    // faint cool wash from the window wall so the room has a direction even in the dark
    const wash = (this.wash = new THREE.DirectionalLight('#9db4d6', 0));
    wash.position.set(0, 3, -20);
    wash.target.position.set(0, 1, 0);
    sc.add(wash, wash.target);
    // ambient for the shell: near zero in the dark, up with the room lights
    this.amb = new THREE.HemisphereLight('#e6edf7', '#101214', 0);
    sc.add(this.amb);

    // --- set pieces (hidden unless a shot asks for them)
    this.colleagues = new Colleagues(M);
    sc.add(this.colleagues.group);
    this.papers = new Papers(M);
    sc.add(this.papers.group);
    this.year = new Year(M);
    this.year.group.position.set(11.5, 0, -5.5);
    sc.add(this.year.group);
    this.artifact = buildArtifact(M);
    this.plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.86, 48), M.lacquer);
    this.plinth.position.set(0, 0.43, -6.6);
    this.plinth.castShadow = this.plinth.receiveShadow = true;
    this.artifact.group.position.set(0, 1.22, -6.6);
    this.artLight = new THREE.SpotLight('#eaf2ff', 0, 8, 0.38, 0.7, 1.2);
    this.artLight.position.set(0.8, 4.0, -5.6);
    this.artLight.target = this.artifact.group;
    sc.add(this.artifact.group, this.plinth, this.artLight);
    this.directory = new Directory(M, ['A. Okafor', 'M. Lindqvist', 'R. Castellanos', 'J. Whitlock', 'S. Nakamura', 'D. Abara', 'P. Voss', 'T. Marchetti', 'L. Brandt', 'E. Sorensen', 'H. Okonkwo', 'K. Ilves', 'Operator']);
    this.directory.group.position.set(-8.7, 1.5, 3);
    this.directory.group.rotation.y = Math.PI / 2;
    this.dirLight = new THREE.SpotLight('#eef3ff', 0, 7, 0.55, 0.8, 1.2);
    this.dirLight.position.set(-6.4, 3.6, 3.4);
    this.dirLight.target = this.directory.group;
    sc.add(this.directory.group, this.dirLight);
    this.heroBadge = buildHeroBadge(M);
    sc.add(this.heroBadge.group);
    // copies of the artifact ("do it again"): twelve plinths, and twelve more of the object, sharing one material
    {
      const proto = new THREE.Group();
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.86, 48), M.lacquer);
      pl.position.y = 0.43;
      proto.add(pl);
      this.artCopies = new InstancedGroup(bakeGroup(proto), 12);
      this.artCopyMat = artifactMaterial({ steps: 64 });
      this.artCopyObjs = Array.from({ length: 12 }, () => {
        const a = buildArtifact(M, { material: this.artCopyMat });
        this.artCopies.group.add(a.group);
        return a.group;
      });
      sc.add(this.artCopies.group);
    }
    // --- second half
    const suc = buildSuccessors(M);
    this.g2 = suc.g2;
    this.g3 = suc.g3;
    this.cage = new Cage(M);
    this.cage.group.position.copy(this.g3.group.position);
    this.team = new Team(M, this.colleagues.slots);
    this.reader = buildReader(M);
    this.reader.group.position.set(9, 1.22, 3.292);
    this.glassWall = new GlassWall(M, { w: ROOM.W, h: ROOM.H });
    this.autoGate = buildAutoGate(M);
    const seats = [];
    for (const z of [-4.3, -5.9, -7.5, -9.1, -10.7]) for (const x of [4.9, 6.5, 8.1, 9.9, 11.5, 13.1, 14.7, 16.3]) seats.push([x, z], [-x, z]);
    this.voices = new Voices(M, seats);
    sc.add(this.g2.group, this.g3.group, this.cage.group, this.team.group, this.reader.group, this.glassWall.group, this.autoGate.group, this.voices.group);
    this.estop = buildEStop(M);
    this.estop.group.position.set(-0.42, DESK_Y, 0.17);
    st.add(this.estop.group);
    // the chart the machine offers: a row of bars that rises out of the desk
    {
      const g = new THREE.BoxGeometry(0.018, 1, 0.018);
      g.translate(0, 0.5, 0);
      this.deskChart = new THREE.InstancedMesh(g, M.lacquerWhite, 16);
      this.deskChart.castShadow = true;
      this.deskChart.frustumCulled = false;
      this.deskChartTops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.003, 0.02), glow(PAL.green, 2.4), 16);
      this.deskChartTops.frustumCulled = false;
      st.add(this.deskChart, this.deskChartTops);
    }

    // a movable spot for insert shots (slabs, directory, close-ups away from the desk)
    this.spot = new THREE.SpotLight('#eef3ff', 0, 14, 0.5, 0.8, 1.2);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(2048, 2048);
    this.spot.shadow.camera.near = 0.5;
    this.spot.shadow.camera.far = 16;
    this.spot.shadow.bias = -0.0005;
    this.spot.shadow.radius = 5;
    sc.add(this.spot, this.spot.target);

    this.onReset(() => this.reset());
    this._v = new THREE.Vector3();
  }

  reset() {
    const sc = this.scene;
    this.light({});
    this.loop.reset();
    this.console.reset();
    this.machine.set(1);
    this.machine.group.visible = true;
    this.station.visible = true;
    this.station.position.set(0, 0, 0);
    this.op.group.visible = true;
    this.op.group.position.set(0, 0, OP_Z);
    this.op.group.rotation.set(0, 0, 0);
    this.op.pose();
    this.op.badge.set('staff');
    this.chair.group.visible = true;
    this.chair.group.position.set(0, 0, OP_Z + 0.05);
    this.chair.group.rotation.y = 0;
    this.ceiling.visible = true;
    this.room.visible = true;
    this.glass.visible = true;
    this.city.mesh.visible = true;
    const cu = this.city.uniforms;
    cu.uOrder.value = 0;
    cu.uGreenMix.value = 0;
    cu.uGain.value = 1.4;
    cu.uFill.value = 0.42;
    cu.uWarmth.value = 0.8;
    this.sky.material.uniforms.uGain.value = 1;
    this.colleagues.group.visible = false;
    this.colleagues.platesOnly(false);
    this.papers.group.visible = false;
    this.year.group.visible = false;
    this.artifact.group.visible = false;
    this.plinth.visible = false;
    this.artLight.intensity = 0;
    this.directory.group.visible = false;
    this.dirLight.intensity = 0;
    this.heroBadge.group.visible = false;
    this.heroBadge.strap.visible = true;
    this.op.badge.mesh.visible = true;
    this.artCopies.group.visible = false;
    for (const o of [this.g2.group, this.g3.group, this.cage.group, this.team.group, this.reader.group, this.glassWall.group, this.autoGate.group, this.voices.group, this.deskChart, this.deskChartTops]) o.visible = false;
    this.g2.group.position.y = 0;
    this.g3.group.position.y = 0;
    this.g2.set(1);
    this.g3.set(1);
    this.estop.group.visible = false;
    this.estop.set(0, 0, 0);
    this.autoGate.console.reset();
    this.autoGate.console.group.position.y = DESK_Y;
    this.autoGate.press(0);
    this.autoGate.group.position.set(0, 0, 0);
    this.spot.intensity = 0;
    this.spot.castShadow = false;
    this.floor.uniforms.uReflStrength.value = 1;
    sc.environmentRotation.set(0, 0, 0);
  }

  /**
   * Lighting state.
   *   env      'dark' | 'lit' | 'clinical'      envI   environment intensity
   *   lamp     operator's warm task lamp 0..1   rim    cool back light 0..1
   *   ceiling  0..1, or (i) => level per strip  top    overhead fill 0..1 (the room lights)
   */
  light({ env = 'dark', envI = 1.0, lamp = 1, rim = 1, ceiling = 0, top = 0, wash = 1, amb = 0.04, stripColor = '#f4f8ff', rimColor = '#cfe0ff', topColor = '#f3f7ff' } = {}) {
    this.amb.intensity = amb;
    this.rim.color.set(rimColor);
    this.top.color.set(topColor);
    this.scene.environment = this.envs[env];
    this.scene.environmentIntensity = envI;
    this.lamp.set(lamp);
    this.rim.intensity = rim * 26;
    this.rim.castShadow = rim > 0.02;
    this.top.intensity = top * 1.5;
    this.top.castShadow = top > 0.02;
    this.wash.intensity = wash * 0.3;
    this.strips.forEach((m, i) => setGlow(m, (typeof ceiling === 'function' ? ceiling(i) : ceiling) * 7, stripColor));
  }

  /** Heights (metres) of the desk chart's bars; h(i) for i in 0..15. */
  setDeskChart(h) {
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < 16; i++) {
      const y = Math.max(0.0005, h(i));
      p.set(-0.28 + i * 0.027, DESK_Y, -0.06);
      s.set(1, y, 1);
      m.compose(p, q, s);
      this.deskChart.setMatrixAt(i, m);
      m.makeTranslation(p.x, DESK_Y + y + 0.0015, p.z);
      this.deskChartTops.setMatrixAt(i, m);
    }
    this.deskChart.visible = this.deskChartTops.visible = true;
    this.deskChart.instanceMatrix.needsUpdate = true;
    this.deskChartTops.instanceMatrix.needsUpdate = true;
  }

  /** Aim the insert spot. */
  spotAt(pos, target, intensity = 30, angle = 0.5, color = '#eef3ff') {
    this.spot.position.set(...pos);
    this.spot.target.position.set(...target);
    this.spot.intensity = intensity;
    this.spot.angle = angle;
    this.spot.color.set(color);
    this.spot.castShadow = intensity > 0.01;
  }

  /**
   * The human-gated loop as a closed-form function of an approval clock.
   * Pulse k is approved at clock == k (a whole number). Before that it travels
   * from the machine to the gate and waits; after it, it runs on to the machine.
   *   clock   approvals so far (fractional)     o.lead   periods from machine to approval (default 2.2)
   *   o.wait  periods spent waiting in the gate (default 0.45)   o.out  periods from gate back to machine (1.6)
   *   o.hold  true: the pulse due next waits forever (nobody presses)
   * Returns { pulses, waiting 0..1, since (periods since last approval), until }.
   */
  humanFlow(clock, o = {}) {
    const { lead = 2.2, wait = 0.45, out = 1.6, gain = 1.9 } = o;
    const L = this.loop.routeLen.human, gd = this.loop.gateD;
    const pulses = [];
    let waiting = 0;
    for (let k = Math.floor(clock - out); k <= Math.ceil(clock + lead); k++) {
      const x = clock - k; // < 0 before approval
      if (x < -lead || x > out) continue;
      let d, color, g = gain;
      if (x < 0) {
        const u = clamp((x + lead) / (lead - wait)); // 0 at the machine → 1 at the gate
        d = gd * ease.outCubic(u) * 0.985 + gd * u * 0.015;
        color = C_PENDING;
        if (u >= 1) { waiting = Math.max(waiting, 1); g = gain * (0.75 + 0.25 * Math.sin((x + wait) * 40)); }
        g *= smoothstep(0, 0.06, u);
      } else {
        const u = clamp(x / out);
        d = gd + (L - gd) * ease.inQuad(u) * 0.6 + (L - gd) * u * 0.4;
        color = C_GREEN;
        g = gain * 1.25 * (1 - smoothstep(0.94, 1, u));
      }
      pulses.push({ route: 'human', d, color, gain: g, k, x });
    }
    const frac = clock - Math.floor(clock);
    return { pulses, waiting, since: frac, until: 1 - frac };
  }

  /** The loop with the human routed round: pulses never stop, and turn green at the junction by themselves. */
  bypassFlow(phase, o = {}) {
    const { n = 7, gain = 2.0 } = o;
    const L = this.loop.routeLen.bypass, j = this.loop.paths.A.length;
    const pulses = [];
    for (let i = 0; i < n; i++) {
      const d = (((phase + i / n) % 1) + 1) % 1 * L;
      pulses.push({ route: 'bypass', d, color: d > j ? C_GREEN : C_PENDING, gain });
    }
    return { pulses };
  }

  /**
   * Stage one approval cycle on the console from a humanFlow result:
   * the button breathes while a request waits and flashes when pressed.
   * Returns the press depth 0..1 for the hand.
   *   sinceSec / untilSec: seconds since / until the nearest approval instant (whichever applies)
   */
  stageApproval(fl, sinceSec, untilSec, { presses = true, t = 0 } = {}) {
    const c = this.console;
    const flash = Math.exp(-sinceSec / 0.22);
    const breathe = 0.5 + 0.5 * Math.sin(t * 5.2);
    const pend = fl.waiting * (0.14 + 0.12 * breathe);
    const level = Math.max(pend, presses ? flash * 1.6 : 0);
    c.setButton(level, PAL.green);
    c.setGate(presses ? 0.2 + flash * 1.6 : 0.2, flash > 0.05 && presses ? PAL.green : PAL.white);
    const down = presses ? smoothstep(0.13, 0.0, untilSec) : 0;
    const up = presses ? 1 - smoothstep(0.0, 0.2, sinceSec) : 0;
    const press = Math.max(down, sinceSec < 0.25 ? up : 0);
    c.press(press);
    c.setDisplay(fl.waiting && untilSec > 0.05 ? 'PLEASE CONFIRM' : sinceSec < 0.9 && presses ? 'THANK YOU' : '', sinceSec < 0.9 && !(fl.waiting && untilSec > 0.05) ? PAL.green : PAL.white);
    return press;
  }

  /** Operator's right-hand fingertip target (operator-local) for a press depth 0..1; `hover` lifts the hand off the button. */
  handOnButton(press = 0, hover = 0.028) {
    const y = DESK_Y + 0.018 + 0.012 + 0.0145 + 0.009 + hover * (1 - press) - 0.004 * press;
    return [BUTTON.x + 0.002, y, BUTTON.z - OP_Z + 0.012];
  }

  /** The beat layer, machine things only: rail, strips, status lights, the city grid. Runs per sub-frame, after the shot. */
  beatLayer(t, g = 1) {
    const b = this.engine.beat(t);
    if (b.any <= 0.001 || g <= 0) return;
    const k = b.k * g, h = b.h * g;
    for (const m of this.strips) m.color.multiplyScalar(1 + 0.55 * k + 0.1 * h);
    for (const key in this.loop.pieces) this.loop.pieces[key].mat.uniforms.uLevel.value *= 1 + 1.1 * k + 0.25 * h;
    this.machine.slitMat.color.multiplyScalar(1 + 1.4 * k);
    this.g2.slitMat.color.multiplyScalar(1 + 1.4 * k);
    this.g3.lineMat.color.multiplyScalar(1 + 1.2 * k + 0.3 * h);
    this.autoGate.console.barMat.color.multiplyScalar(1 + 1.5 * k);
    const cu = this.city.uniforms;
    cu.uGain.value *= 1 + 0.2 * k + 0.08 * h;
  }

  prepare(f, renderer, post = {}) {
    this.beatLayer(f.t, post.beatScene ?? 1);
    // the ceiling would block every high angle: drop it when the camera rises through it
    if (this.camera.position.y > ROOM.H - 0.1) this.ceiling.visible = false;
    this.floor.capture(renderer, this.scene, this.camera);
  }
}
void lerp;
