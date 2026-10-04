// World kit: the recurring objects, built from primitives and lathe profiles.
// Units are metres. The operator faces north (-Z); the desk top is at y = DESK_Y.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAL } from '../config.js';
import { glow, labelTexture, setGlow } from '../engine/look.js';
import { fonts } from '../engine/type.js';
import { clamp, ik2, lerp, spanY } from '../engine/util.js';
import { LOOP } from './loop.js';

export const DESK_Y = 0.74;
export const BUTTON = new THREE.Vector3(LOOP.GATE_X, DESK_Y, 0.07); // centre of the approval button on the desk top

const shadow = (m, cast = true, receive = true) => {
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
};
const lathe = (pts, segs = 64) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

// ------------------------------------------------------------------- desk

export function buildDesk(M, { w = 1.8, d = 0.8 } = {}) {
  const g = new THREE.Group();
  const top = shadow(new THREE.Mesh(new RoundedBoxGeometry(w, 0.022, d, 3, 0.005), M.deskTop));
  top.position.y = DESK_Y - 0.011;
  // brushed aluminium under-frame showing as a thin edge band
  const band = shadow(new THREE.Mesh(new RoundedBoxGeometry(w - 0.012, 0.012, d - 0.012, 2, 0.003), M.brushed));
  band.position.y = DESK_Y - 0.027;
  g.add(band);
  // slab legs set in from the ends, dark lacquer
  const legGeo = new RoundedBoxGeometry(0.028, DESK_Y - 0.032, d - 0.12, 2, 0.004);
  const l1 = shadow(new THREE.Mesh(legGeo, M.lacquer));
  const l2 = shadow(new THREE.Mesh(legGeo, M.lacquer));
  l1.position.set(-w / 2 + 0.1, (DESK_Y - 0.032) / 2, 0);
  l2.position.set(w / 2 - 0.1, (DESK_Y - 0.032) / 2, 0);
  // a thin brushed modesty rail ties the legs
  const rail = shadow(new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.05, 0.012), M.gunmetal));
  rail.position.set(0, DESK_Y - 0.1, -d / 2 + 0.08);
  g.add(top, l1, l2, rail);
  return { group: g, top, w, d };
}

// ------------------------------------------------- the approval console

/**
 * The human approval point: a machined plinth carrying the green button, a
 * one-line display and the gate arch the rail runs through.
 */
export function buildConsole(M) {
  const g = new THREE.Group();
  g.position.set(BUTTON.x, DESK_Y, 0);
  // plinth: from the rail (z = Z_S) forward to the operator's side
  const plinth = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.018, 0.4, 3, 0.004), M.brushed));
  plinth.position.set(0, 0.009, -0.045);
  g.add(plinth);

  // button: lathe-turned bezel (brushing runs round it), a domed cap that lights from within
  const bz = BUTTON.z;
  const bezel = shadow(new THREE.Mesh(lathe([[0.0275, 0.0], [0.043, 0.0], [0.043, 0.012], [0.040, 0.0165], [0.0335, 0.0165], [0.031, 0.013], [0.0275, 0.013]]), M.brushedFine));
  bezel.position.set(0, 0.018, bz);
  const skirt = new THREE.Mesh(lathe([[0.0, 0.0], [0.0272, 0.0], [0.0272, 0.012], [0.0, 0.012]], 48), M.rubber);
  skirt.position.copy(bezel.position);
  const capMat = new THREE.MeshPhysicalMaterial({ color: '#d9ded9', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, emissive: new THREE.Color(PAL.green), emissiveIntensity: 0 });
  const capPts = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    capPts.push([Math.sin(a) * 0.0262, 0.008 + Math.cos(a) * 0.0058 * (1 - 0 * a)]);
  }
  capPts.push([0.0262, 0.0], [0.0, 0.0]);
  const cap = shadow(new THREE.Mesh(lathe(capPts.reverse(), 64), capMat), true, false);
  const capHome = 0.018 + 0.012;
  cap.position.set(0, capHome, bz);
  // light thrown by the lit button onto the hand, plinth and desk
  const btnLight = new THREE.PointLight(PAL.green, 0, 0.7, 2);
  btnLight.position.set(0, capHome + 0.05, bz);
  g.add(bezel, skirt, cap, btnLight);

  // display: a small smoked window with one line of machine type
  const dispTex = labelTexture(1024, 160, () => {});
  const dispMat = glow('#ffffff', 1.4, { map: dispTex, transparent: true });
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15 * (160 / 1024)), dispMat);
  disp.rotation.x = -Math.PI / 2 + 0.5;
  const housing = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.168, 0.016, 0.036, 2, 0.004), M.lacquer));
  housing.rotation.x = 0.5;
  housing.position.set(0, 0.03, -0.085);
  // 0.2 mm proud of the sloped face (its normal is (0, cos 0.5, sin 0.5))
  disp.position.set(0, 0.03 + 0.0082 * Math.cos(0.5), -0.085 + 0.0082 * Math.sin(0.5));
  g.add(housing, disp);
  let shown = null;
  const setDisplay = (text, color = PAL.white) => {
    const key = text + '|' + color;
    if (key === shown) return;
    shown = key;
    dispTex.userData.redraw((c, w, h) => {
      c.fillStyle = color;
      if ('letterSpacing' in c) c.letterSpacing = '6px';
      c.font = fonts.machine.css(74);
      const px = Math.min(74, (74 * w * 0.92) / Math.max(1, c.measureText(text).width));
      c.font = fonts.machine.css(px);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, w / 2, h / 2 + 4);
    });
  };

  // gate arch over the rail, with a status bar that the approval lights
  const gate = new THREE.Group();
  gate.position.set(0, 0, LOOP.Z_S);
  const pillarGeo = new RoundedBoxGeometry(0.016, 0.088, 0.05, 2, 0.003);
  const p1 = shadow(new THREE.Mesh(pillarGeo, M.brushed));
  const p2 = shadow(new THREE.Mesh(pillarGeo, M.brushed));
  // the rail runs along X here, so the arch straddles it in Z
  p1.position.set(0, 0.062, -0.04);
  p2.position.set(0, 0.062, 0.04);
  p1.rotation.y = p2.rotation.y = Math.PI / 2;
  const lintel = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.016, 0.112, 2, 0.003), M.brushed));
  lintel.position.set(0, 0.112, 0);
  const barMat = glow(PAL.white, 0.15);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.0525, 0.004, 0.07), barMat);
  bar.position.set(0, 0.1035, 0);
  gate.add(p1, p2, lintel, bar);
  g.add(gate);

  const api = {
    group: g, cap, capMat, bezel, plinth, gate, barMat, btnLight, setDisplay,
    /** level 0..1+ glow of the button (HDR), colour as hex/string. */
    setButton(level, color = PAL.green) {
      capMat.emissive.set(color);
      capMat.emissiveIntensity = level * 2.2;
      capMat.color.set('#d9ded9').lerp(new THREE.Color(color), clamp(level) * 0.55);
      btnLight.color.set(color);
      btnLight.intensity = level * 0.1;
    },
    /** 0 = up, 1 = fully pressed (4 mm of travel). */
    press(x) {
      cap.position.y = capHome - 0.004 * clamp(x);
    },
    /** gate status bar: level + colour */
    setGate(level, color = PAL.green) {
      setGlow(barMat, level, color);
    },
    reset() {
      api.setButton(0);
      api.press(0);
      api.setGate(0.15, PAL.white);
      setDisplay('');
      g.visible = true;
      g.position.y = DESK_Y;
    },
  };
  return api;
}

// ------------------------------------------------------------------ chair

export function buildChair(M) {
  const g = new THREE.Group();
  const seat = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.07, 0.46, 4, 0.03), M.fabricSeat));
  seat.position.set(0, 0.45, 0);
  const back = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.52, 0.055, 4, 0.026), M.fabricSeat));
  back.position.set(0, 0.78, 0.235);
  back.rotation.x = 0.1;
  const spine = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.018), M.gunmetal));
  spine.position.set(0, 0.6, 0.265);
  spine.rotation.x = 0.1;
  const stem = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.34, 20), M.chrome));
  stem.position.set(0, 0.25, 0);
  g.add(seat, back, spine, stem);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const arm = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.3), M.gunmetal));
    arm.position.set(Math.sin(a) * 0.15, 0.075, Math.cos(a) * 0.15);
    arm.rotation.y = a;
    const wheel = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 10), M.rubber));
    wheel.position.set(Math.sin(a) * 0.3, 0.028, Math.cos(a) * 0.3);
    g.add(arm, wheel);
  }
  return { group: g, seat, back };
}

// ------------------------------------------------------------------- lamp

/** The operator's task lamp: the one warm light in the building. */
export function buildLamp(M) {
  const g = new THREE.Group();
  const base = shadow(new THREE.Mesh(lathe([[0, 0], [0.07, 0], [0.07, 0.008], [0.064, 0.014], [0, 0.014]], 48), M.gunmetal));
  const stem = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 12), M.chrome));
  stem.position.y = 0.19;
  const arm = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 12), M.chrome));
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.17, 0.37, 0);
  const head = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.016, 0.05, 2, 0.006), M.darkAnodised));
  head.position.set(0.3, 0.365, 0);
  const stripMat = glow(PAL.warm, 0);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.03), stripMat);
  strip.rotation.x = Math.PI / 2;
  strip.position.set(0.3, 0.3565, 0);
  const light = new THREE.SpotLight(PAL.warm, 0, 5, 1.0, 0.75, 1.6);
  light.position.set(0.3, 0.35, 0);
  light.target.position.set(0.62, -0.37, 0.12);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.near = 0.05;
  light.shadow.camera.far = 4;
  light.shadow.bias = -0.0004;
  light.shadow.radius = 5;
  g.add(base, stem, arm, head, strip, light, light.target);
  const api = {
    group: g, light, stripMat,
    set(level) {
      setGlow(stripMat, level * 7);
      light.intensity = level * 11;
      light.castShadow = level > 0.02;
    },
  };
  return api;
}

// ---------------------------------------------------------------- machine

/** The machine: a dark lacquer monolith with one polite line of status light and a portal for the rail. */
export function buildMachine(M, { w = 1.1, h = 2.3, d = 0.95, portal = true, mat = M.lacquer } = {}) {
  const g = new THREE.Group();
  const ph = 0.2, py = LOOP.Y - 0.07; // portal opening
  const pw = 0.22;
  const mk = (bw, bh, bd, x, y, z) => {
    const m = shadow(new THREE.Mesh(new RoundedBoxGeometry(bw, bh, bd, 3, 0.012), mat));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (portal) {
    // the rail passes through along X: build the body around a tunnel
    mk(w, py, d, 0, py / 2, 0);
    mk(w, h - py - ph, d, 0, py + ph + (h - py - ph) / 2, 0);
    mk(w, ph, (d - pw) / 2, 0, py + ph / 2, -(pw / 2 + (d - pw) / 4));
    mk(w, ph, (d - pw) / 2, 0, py + ph / 2, pw / 2 + (d - pw) / 4);
  } else mk(w, h, d, 0, h / 2, 0);
  // status slit across the south face (towards the operator)
  const slitMat = glow(PAL.green, 2.2);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.62, 0.012), slitMat);
  slit.position.set(0, h * 0.72, d / 2 + 0.001);
  // thin brushed trim line under the slit
  const trim = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.62, 0.003), M.brushed);
  trim.position.set(0, h * 0.72 - 0.03, d / 2 + 0.001);
  g.add(slit, trim);
  const glowL = new THREE.PointLight(PAL.green, 0.5, 4, 2);
  glowL.position.set(0, h * 0.72, d / 2 + 0.35);
  g.add(glowL);
  return {
    group: g, slit, slitMat, w, h, d,
    set(level, color = PAL.green) {
      setGlow(slitMat, level * 2.2, color);
      glowL.color.set(color);
      glowL.intensity = level * 0.5;
    },
  };
}

// --------------------------------------------------------------- operator

const BADGE_W = 0.058, BADGE_H = 0.088;

/** Draw a badge face. kind: 'staff' | 'visitor'. */
export function drawBadge(c, w, h, kind, name = 'OPERATOR') {
  c.fillStyle = '#f1f1ee';
  c.fillRect(0, 0, w, h);
  // slot
  c.fillStyle = '#1a1c1e';
  c.beginPath();
  c.roundRect(w / 2 - w * 0.13, h * 0.045, w * 0.26, h * 0.028, h * 0.014);
  c.fill();
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const pad = w * 0.09;
  if (kind === 'visitor') {
    c.fillStyle = '#0c0d0e';
    c.fillRect(0, h * 0.13, w, h * 0.3);
    c.fillStyle = '#f1f1ee';
    c.font = fonts.displayBlack.css(h * 0.19);
    const tw = c.measureText('VISITOR').width;
    c.save();
    c.translate(pad, h * 0.355);
    c.scale((w - pad * 2) / tw, 1);
    c.fillText('VISITOR', 0, 0);
    c.restore();
    c.fillStyle = '#0c0d0e';
    c.font = fonts.machine.css(h * 0.036);
    c.fillText('NAME', pad, h * 0.52);
    c.font = fonts.doubt.css(h * 0.085);
    c.fillText(name, pad, h * 0.62);
    c.fillRect(pad, h * 0.645, w - pad * 2, h * 0.004);
    c.font = fonts.machine.css(h * 0.036);
    c.fillText('ACCESS', pad, h * 0.74);
    c.fillText('ESCORTED', pad, h * 0.795);
    c.fillText('VALID', pad, h * 0.885);
    c.fillText('TODAY ONLY', pad, h * 0.94);
  } else {
    c.fillStyle = '#0c0d0e';
    c.font = fonts.machine.css(h * 0.036);
    c.fillText('OPERATIONS', pad, h * 0.17);
    c.font = fonts.displayBlack.css(h * 0.1);
    c.fillText(name, pad, h * 0.36);
    c.fillStyle = PAL.greenDeep;
    c.fillRect(pad, h * 0.42, w - pad * 2, h * 0.012);
    c.fillStyle = '#0c0d0e';
    c.font = fonts.machine.css(h * 0.036);
    c.fillText('ROLE', pad, h * 0.54);
    c.font = fonts.display.css(h * 0.062);
    c.fillText('Approver', pad, h * 0.62);
    c.font = fonts.machine.css(h * 0.036);
    c.fillText('ACCESS', pad, h * 0.74);
    c.font = fonts.display.css(h * 0.062);
    c.fillText('All areas', pad, h * 0.82);
  }
}

export function buildBadge(M) {
  const tex = labelTexture(512, 777, (c, w, h) => drawBadge(c, w, h, 'staff'));
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  const card = shadow(new THREE.Mesh(new RoundedBoxGeometry(BADGE_W, BADGE_H, 0.0016, 2, 0.0007), [M.plasticWhite, M.plasticWhite, M.plasticWhite, M.plasticWhite, face, M.plasticWhite]));
  let kind = 'staff';
  return {
    mesh: card, tex,
    set(k, name) {
      if (k === kind) return;
      kind = k;
      tex.userData.redraw((c, w, h) => drawBadge(c, w, h, k, name));
    },
  };
}

/**
 * The operator: a calm mannequin read by silhouette — headset, jacket, lanyard.
 * No face. Local frame: origin on the floor under the hips, facing -Z.
 */
export function buildOperator(M) {
  const g = new THREE.Group();
  const upper = new THREE.Group(); // pivots at the hips for the lean
  g.add(upper);
  const cap = (r, len) => shadow(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), M.fabric));

  // torso: lathe profile, flattened front to back
  const torso = shadow(new THREE.Mesh(lathe([[0.0, 0.0], [0.142, 0.0], [0.158, 0.06], [0.156, 0.2], [0.186, 0.36], [0.198, 0.44], [0.165, 0.5], [0.07, 0.535], [0.0, 0.54]], 40), M.fabric));
  torso.scale.z = 0.62;
  upper.add(torso);
  const neck = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.05, 0.08, 20), M.skin));
  neck.position.y = 0.562;
  upper.add(neck);
  const collar = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.014, 10, 28), M.fabric));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.535;
  upper.add(collar);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.592;
  upper.add(headPivot);
  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.104, 40, 28), M.skin));
  head.scale.set(0.9, 1.1, 1.0);
  head.position.y = 0.105;
  headPivot.add(head);
  // headset: band over the crown, two cups, a boom
  const band = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.008, 10, 40, Math.PI), M.plastic));
  band.position.y = 0.12;
  headPivot.add(band);
  for (const sx of [-1, 1]) {
    const cup = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.026, 28), M.plastic));
    cup.rotation.z = Math.PI / 2;
    cup.position.set(sx * 0.103, 0.115, 0);
    const pad = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 24), M.rubber));
    pad.rotation.y = Math.PI / 2;
    pad.position.set(sx * 0.091, 0.115, 0);
    headPivot.add(cup, pad);
  }
  const boom = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 1, 8), M.plastic));
  spanY(boom, new THREE.Vector3(-0.108, 0.105, -0.01), new THREE.Vector3(-0.07, 0.045, -0.105));
  const mic = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.016, 4, 10), M.rubber));
  mic.position.set(-0.066, 0.042, -0.108);
  mic.rotation.z = 1.1;
  headPivot.add(boom, mic);

  // lanyard and badge on the chest
  const lanyard = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.004, 6, 28), M.rubber);
  lanyard.rotation.x = Math.PI / 2 + 0.5;
  lanyard.position.set(0, 0.5, -0.03);
  upper.add(lanyard);
  const strapMat = M.rubber;
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 1, 0.002), strapMat);
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 1, 0.002), strapMat);
  spanY(s1, new THREE.Vector3(-0.05, 0.49, -0.085), new THREE.Vector3(0, 0.345, -0.118));
  spanY(s2, new THREE.Vector3(0.05, 0.49, -0.085), new THREE.Vector3(0, 0.345, -0.118));
  upper.add(s1, s2);
  const badge = buildBadge(M);
  badge.mesh.position.set(0, 0.295, -0.122);
  badge.mesh.rotation.set(0.1, Math.PI, 0);
  upper.add(badge.mesh);

  // arms
  const L1 = 0.29, L2 = 0.26;
  const arms = [-1, 1].map((sx) => {
    const sh = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.064, 20, 14), M.fabric));
    sh.position.set(sx * 0.205, 0.458, 0);
    const up = cap(0.047, L1), fore = cap(0.04, L2);
    const cuff = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.03, 16), M.fabric));
    const hand = new THREE.Group();
    const palm = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.078, 0.026, 0.09, 3, 0.012), M.skin));
    palm.position.z = -0.045;
    hand.add(palm);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const f = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.062, 4, 10), M.skin));
      f.rotation.x = Math.PI / 2;
      f.position.set((i - 1.5) * 0.019, -0.002, -0.125);
      hand.add(f);
      fingers.push(f);
    }
    const thumb = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.045, 4, 10), M.skin));
    thumb.rotation.set(Math.PI / 2, 0, -sx * 0.7);
    thumb.position.set(-sx * 0.047, -0.004, -0.06);
    hand.add(thumb);
    upper.add(sh, up, fore, cuff, hand);
    return { sx, sh, up, fore, cuff, hand, fingers, shoulder: sh.position };
  });

  // legs (in the root frame, they do not lean)
  const legs = [-1, 1].map((sx) => {
    const thigh = cap(0.075, 0.44), shin = cap(0.058, 0.44);
    const foot = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.095, 0.07, 0.25, 3, 0.03), M.rubber));
    g.add(thigh, shin, foot);
    return { sx, thigh, shin, foot };
  });
  const hips = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), M.fabric));
  hips.scale.set(1.0, 0.62, 0.8);
  g.add(hips);

  const _s = new THREE.Vector3(), _e = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Vector3(), _d = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
  const _hip = new THREE.Vector3(), _knee = new THREE.Vector3(), _ank = new THREE.Vector3();

  const api = {
    group: g, upper, headPivot, badge, arms,
    /**
     * Pose (all optional):
     *   stand 0..1 (0 seated, 1 standing)     lean   forward lean of the torso (rad)
     *   headYaw / headPitch / headRoll (rad)  twist  torso yaw (rad)
     *   rHand / lHand   [x,y,z] fingertip targets in the operator's local frame
     *   rDip / lDip     extra downward pitch of that hand (rad)
     */
    pose(p = {}) {
      const stand = p.stand ?? 0;
      const hipY = lerp(0.53, 0.93, stand);
      upper.position.set(0, hipY, 0);
      upper.rotation.set(-(p.lean ?? 0.12), p.twist ?? 0, 0);
      hips.position.set(0, hipY - 0.01, 0.01);
      headPivot.rotation.set(-(p.headPitch ?? -0.05) + (p.lean ?? 0.12) * 0.6, p.headYaw ?? 0, p.headRoll ?? 0);
      upper.updateMatrix();
      _m.copy(upper.matrix);
      _inv.copy(_m).invert();
      const rest = [[-0.2, 0.775, -0.36], [0.2, 0.775, -0.36]];
      const hang = [[-0.24, hipY - 0.33, 0.02], [0.24, hipY - 0.33, 0.02]];
      arms.forEach((a, i) => {
        const tgt = (i ? p.rHand : p.lHand) ?? (stand > 0.5 ? hang[i] : rest[i]);
        const dip = (i ? p.rDip : p.lDip) ?? (stand > 0.5 ? 1.35 : 0.12);
        // fingertip target → wrist: the hand is 0.156 long, pitched down by `dip`
        _t.set(tgt[0], tgt[1], tgt[2]).applyMatrix4(_inv);
        const handLen = 0.156;
        _d.set(0, -Math.sin(dip), -Math.cos(dip)); // hand pointing direction in the upper frame (approx.)
        _w.copy(_t).addScaledVector(_d, -handLen);
        _s.copy(a.shoulder);
        _pole.set(a.sx * 0.55, -1, 0.35);
        ik2(_s, _w, L1, L2, _pole, _e);
        // if the target is out of reach, pull the wrist in along the line
        const reach = _w.distanceTo(_s);
        if (reach > (L1 + L2) * 0.999) _w.sub(_s).multiplyScalar(((L1 + L2) * 0.999) / reach).add(_s);
        spanY(a.up, _s, _e, L1 + 0.047 * 2);
        spanY(a.fore, _e, _w, L2 + 0.04 * 2);
        a.up.scale.x = a.up.scale.z = 1;
        a.cuff.position.copy(_w).addScaledVector(_d.clone().subVectors(_e, _w).normalize(), 0.012);
        a.cuff.quaternion.copy(a.fore.quaternion);
        a.hand.position.copy(_w);
        a.hand.rotation.set(-dip, 0, 0);
      });
      // legs
      legs.forEach((l) => {
        _hip.set(l.sx * 0.095, hipY - 0.02, 0);
        const seatedAnk = _ank.set(l.sx * 0.115, 0.085, -0.4);
        if (stand > 0) seatedAnk.lerp(_t.set(l.sx * 0.1, 0.085, 0.0), stand);
        _pole.set(0, lerp(0.6, 0, stand), -1);
        ik2(_hip, _ank, 0.44, 0.44, _pole, _knee);
        spanY(l.thigh, _hip, _knee, 0.44 + 0.075 * 2);
        spanY(l.shin, _knee, _ank, 0.44 + 0.058 * 2);
        l.foot.position.set(_ank.x, 0.035, _ank.z - 0.07);
      });
    },
  };
  api.pose();
  return api;
}
