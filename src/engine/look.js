// The look library: procedural textures, physically based materials, studio
// lighting environments and the reflective floor. Everything is generated in
// code from seeded noise; there are no image assets.
import * as THREE from 'three';
import { PAL } from '../config.js';
import { mulberry32 } from './util.js';

// ---------------------------------------------------------------- textures

function canvasTex(w, h, draw, { repeat = true, srgb = false, aniso = 16 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Brushed-metal streaks running along U: long correlated scratches of varying depth. */
function streakTexture(seed = 1, w = 1024, h = 1024) {
  return canvasTex(w, h, (g) => {
    const rnd = mulberry32(seed);
    const img = g.createImageData(w, h);
    const row = new Float32Array(w);
    for (let y = 0; y < h; y++) {
      // each row: a base level plus a few low-frequency wobbles along the stroke
      const base = 0.5 + (rnd() - 0.5) * 0.55;
      const f1 = 1 + Math.floor(rnd() * 3), p1 = rnd() * 6.283, a1 = rnd() * 0.12;
      const f2 = 5 + Math.floor(rnd() * 9), p2 = rnd() * 6.283, a2 = rnd() * 0.06;
      for (let x = 0; x < w; x++) {
        const u = (x / w) * 6.283;
        row[x] = base + Math.sin(u * f1 + p1) * a1 + Math.sin(u * f2 + p2) * a2;
      }
      for (let x = 0; x < w; x++) {
        const v = Math.max(0, Math.min(255, row[x] * 255));
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // a few deeper individual scratches
    for (let k = 0; k < 90; k++) {
      g.globalAlpha = 0.05 + rnd() * 0.12;
      g.fillStyle = rnd() > 0.5 ? '#fff' : '#000';
      g.fillRect(rnd() * w, rnd() * h, 60 + rnd() * 700, 1);
    }
  });
}

/** Fine isotropic grain (orange peel of lacquer, micro-variation of stone). */
function grainTexture(seed = 2, w = 512, h = 512) {
  return canvasTex(w, h, (g) => {
    const rnd = mulberry32(seed);
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 90;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.5;
    g.filter = 'blur(1.2px)';
    g.drawImage(g.canvas, 0, 0);
  });
}

/** Large soft cloudy variation: polish wear on the floor. */
function cloudTexture(seed = 3, w = 512, h = 512) {
  return canvasTex(w, h, (g) => {
    const rnd = mulberry32(seed);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 260; k++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 110;
      const v = rnd() > 0.5 ? 255 : 0;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(${v},${v},${v},0.10)`);
        gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  });
}

export function makeTextures() {
  return { streak: streakTexture(11), streak2: streakTexture(29), grain: grainTexture(5), cloud: cloudTexture(7) };
}

/** A texture drawn with Canvas2D (labels, displays, badge faces). `draw(ctx, w, h)`; redraw with tex.userData.redraw(fn). */
export function labelTexture(w, h, draw) {
  const t = canvasTex(w, h, draw, { repeat: false, srgb: true });
  t.userData.redraw = (fn) => {
    const g = t.image.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    fn(g, w, h);
    t.needsUpdate = true;
  };
  return t;
}

// --------------------------------------------------------------- materials

const tile = (tex, u, v) => {
  const t = tex.clone();
  t.repeat.set(u, v);
  t.needsUpdate = true;
  return t;
};

export function makeMaterials(tex) {
  const P = THREE.MeshPhysicalMaterial, S = THREE.MeshStandardMaterial;
  const brushed = (color, rough = 0.36, u = 1, v = 6) =>
    new P({ color, metalness: 1, roughness: rough, roughnessMap: tile(tex.streak, u, v), bumpMap: tile(tex.streak2, u, v), bumpScale: 0.35, anisotropy: 0.85 });
  return {
    brushed: brushed(PAL.silver),
    brushedFine: brushed(PAL.silver, 0.3, 1, 14),
    gunmetal: brushed('#565b60', 0.42),
    darkAnodised: brushed('#1b1e21', 0.5, 1, 10),
    chrome: new P({ color: '#e6e8ea', metalness: 1, roughness: 0.07 }),
    steel: new P({ color: PAL.steel, metalness: 1, roughness: 0.3 }),
    lacquer: new P({ color: '#07080a', roughness: 0.5, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, bumpMap: tile(tex.grain, 6, 6), bumpScale: 0.02 }),
    lacquerWhite: new P({ color: '#e8eae8', roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.06 }),
    glass: new P({ color: '#101416', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }),
    glassClear: new P({ color: '#c8d4d6', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.14, clearcoat: 1, envMapIntensity: 1.8, depthWrite: false, side: THREE.DoubleSide }),
    rubber: new S({ color: '#0b0b0c', roughness: 0.92 }),
    plastic: new S({ color: '#17191b', roughness: 0.55 }),
    plasticWhite: new S({ color: '#e4e5e2', roughness: 0.5 }),
    paper: new S({ color: '#ecebe6', roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color('#ecebe6'), emissiveIntensity: 0.32 }),
    deskTop: new P({ color: '#2a2e32', roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35, bumpMap: tile(tex.grain, 8, 4), bumpScale: 0.006 }),
    fabric: new P({ color: '#23272b', roughness: 0.95, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color('#3a4046') }),
    fabricSeat: new P({ color: '#181b1e', roughness: 0.9, sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color('#2b3035') }),
    skin: new S({ color: '#bdb9b2', roughness: 0.62 }),
    concrete: new S({ color: '#4a4e52', roughness: 0.85, bumpMap: tile(tex.grain, 12, 12), bumpScale: 0.05 }),
    wall: new S({ color: '#33373b', roughness: 0.85 }),
  };
}

/** Unlit emitter. `gain` multiplies the colour into HDR so it blooms. */
export function glow(color, gain = 1, extra = {}) {
  const m = new THREE.MeshBasicMaterial({ color, fog: false, ...extra });
  m.userData.base = new THREE.Color(color);
  m.color.copy(m.userData.base).multiplyScalar(gain);
  return m;
}
export function setGlow(m, gain, color) {
  if (color) m.userData.base.set(color);
  m.color.copy(m.userData.base).multiplyScalar(gain);
}

// ------------------------------------------------------------ environments

/**
 * A photographic studio as an environment map: soft boxes and strip lights in
 * a dark room. These are what the brushed metal and lacquer actually reflect.
 *   key    overhead softbox      strips  tall side strips (the long streaks on metal)
 *   rim    low back strip        fill    ambient level of the room
 *   green  0..1 amount of approval green bounced from below (late in the film)
 */
export function makeStudioEnv(renderer, { key = 1, strips = 1, rim = 1, fill = 0.02, ceiling = 0, green = 0, warm = 0 } = {}) {
  const s = new THREE.Scene();
  const panel = (w, h, pos, rot, color, gain) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gain), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    s.add(m);
  };
  const room = new THREE.Mesh(new THREE.BoxGeometry(60, 30, 60), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(fill), side: THREE.BackSide }));
  s.add(room);
  if (key) panel(7, 3.2, [1.5, 9, 2], [Math.PI / 2, 0, 0.25], '#ffffff', 5.5 * key);
  if (strips) {
    panel(0.7, 9, [-11, 4, 3], [0, Math.PI / 2, 0], '#f2f6ff', 9 * strips);
    panel(0.35, 8, [12, 4, -4], [0, -Math.PI / 2, 0], '#ffffff', 7 * strips);
    panel(0.5, 7, [-6, 4, -12], [0, 0.5, 0], '#ffffff', 3.5 * strips);
  }
  if (rim) panel(14, 0.5, [0, 2.2, -13], [0, 0, 0], '#eaf2ff', 4 * rim);
  if (ceiling) for (let i = -3; i <= 3; i++) panel(0.45, 16, [i * 3.2, 10, 0], [Math.PI / 2, 0, 0], '#f6f9ff', 5 * ceiling);
  if (green) panel(18, 18, [0, -6, 0], [-Math.PI / 2, 0, 0], PAL.green, 0.9 * green);
  if (warm) panel(2.5, 2.5, [5, 3, 8], [0, Math.PI, 0], PAL.warm, 3 * warm);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.035, 0.1, 100);
  pm.dispose();
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt.texture;
}

// -------------------------------------------------------------- the floor

const _refl = {
  plane: new THREE.Plane(), normal: new THREE.Vector3(0, 1, 0), pos: new THREE.Vector3(), camPos: new THREE.Vector3(),
  rot: new THREE.Matrix4(), look: new THREE.Vector3(), view: new THREE.Vector3(), target: new THREE.Vector3(), clip: new THREE.Vector4(), q: new THREE.Vector4(),
};

/**
 * A polished dark floor with a real planar reflection of the scene (rendered
 * from the mirrored camera), softened by the surface roughness and faded by
 * Fresnel. Call floor.capture(renderer, scene, camera) once per sub-frame.
 */
export class ReflectiveFloor {
  constructor(tex, { size = 120, y = 0, color = '#08090a', roughness = 0.22, resolution = 1024, strength = 1, f0 = 0.05 } = {}) {
    this.y = y;
    this.rt = new THREE.WebGLRenderTarget(resolution * 2, resolution, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: true,
    });
    this.camera = new THREE.PerspectiveCamera();
    this.matrix = new THREE.Matrix4();
    this.uniforms = { tRefl: { value: this.rt.texture }, uReflMatrix: { value: this.matrix }, uReflStrength: { value: strength }, uReflF0: { value: f0 }, uReflBlur: { value: 2.2 } };
    const cloud = tex.cloud.clone();
    cloud.repeat.set(size / 9, size / 9);
    cloud.needsUpdate = true;
    const grain = tex.grain.clone();
    grain.repeat.set(size / 1.5, size / 1.5);
    grain.needsUpdate = true;
    // specularIntensity 0: no glare streaks from unseen spot lights; all mirror-like response comes from the planar reflection below
    const mat = (this.material = new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, roughnessMap: cloud, bumpMap: grain, bumpScale: 0.012, envMapIntensity: 0.1, specularIntensity: 0 }));
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uReflMatrix;\nvarying vec4 vReflCoord;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvReflCoord = uReflMatrix * (modelMatrix * vec4(transformed, 1.0));');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tRefl; uniform float uReflStrength; uniform float uReflF0; uniform float uReflBlur;\nvarying vec4 vReflCoord;')
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          {
            vec2 ruv = vReflCoord.xy / vReflCoord.w;
            // the bumpy normal nudges the lookup: reflections break up like on real polished stone
            ruv += (normal.xy - geometryNormal.xy * 0.0) * 0.004;
            float lod = uReflBlur * (0.4 + 2.2 * roughnessFactor);
            vec4 rf = textureLod(tRefl, ruv, lod) * 0.6 + textureLod(tRefl, ruv, lod + 1.2) * 0.4;
            float fres = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 5.0);
            float F = mix(uReflF0, 1.0, fres) * (1.0 - 0.55 * roughnessFactor);
            float cover = saturate(rf.a) * uReflStrength;
            reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, rf.rgb * F, cover);
          }`,
        );
    };
    const mesh = (this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    this.hide = []; // objects that must not appear in the mirror
  }

  capture(renderer, scene, camera) {
    const R = _refl;
    R.pos.set(0, this.y, 0);
    R.camPos.setFromMatrixPosition(camera.matrixWorld);
    if (R.camPos.y <= this.y + 1e-3) return; // camera under the floor: nothing to mirror
    R.rot.extractRotation(camera.matrixWorld);
    R.view.subVectors(R.pos, R.camPos).reflect(R.normal).negate().add(R.pos);
    R.look.set(0, 0, -1).applyMatrix4(R.rot).add(R.camPos);
    R.target.subVectors(R.pos, R.look).reflect(R.normal).negate().add(R.pos);
    const vc = this.camera;
    vc.position.copy(R.view);
    vc.up.set(0, 1, 0).applyMatrix4(R.rot).reflect(R.normal);
    vc.lookAt(R.target);
    vc.near = camera.near;
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    // the mirrored camera's x axis points the other way, so an off-axis frustum (sub-pixel jitter, lens shift) is mirrored too
    vc.projectionMatrix.elements[8] *= -1;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // oblique near plane = the floor, so nothing below it (retracted desks) is mirrored
    R.plane.setFromNormalAndCoplanarPoint(R.normal, R.pos).applyMatrix4(vc.matrixWorldInverse);
    R.clip.set(R.plane.normal.x, R.plane.normal.y, R.plane.normal.z, R.plane.constant);
    const pm = vc.projectionMatrix;
    R.q.x = (Math.sign(R.clip.x) + pm.elements[8]) / pm.elements[0];
    R.q.y = (Math.sign(R.clip.y) + pm.elements[9]) / pm.elements[5];
    R.q.z = -1;
    R.q.w = (1 + pm.elements[10]) / pm.elements[14];
    R.clip.multiplyScalar(2 / R.clip.dot(R.q));
    pm.elements[2] = R.clip.x;
    pm.elements[6] = R.clip.y;
    pm.elements[10] = R.clip.z + 1 - 0.003;
    pm.elements[14] = R.clip.w;

    const wasVisible = this.mesh.visible;
    this.mesh.visible = false;
    const hidden = this.hide.filter((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    const bg = scene.background;
    scene.background = null;
    const prevTarget = renderer.getRenderTarget();
    // this pass renders the shadow maps for the current state; the main pass then reuses them (see Engine.renderSample)
    renderer.shadowMap.autoUpdate = true;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(prevTarget);
    scene.background = bg;
    hidden.forEach((o) => (o.visible = true));
    this.mesh.visible = wasVisible;
  }
}
