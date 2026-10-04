// A StageSet is one built location (scene graph + camera rig + flat overlay).
// Shots are staged in a set: before every sub-frame the set is reset to its
// defaults, then the active shot states exactly what it needs. Nothing leaks
// from one shot (or one seek) into the next.
import * as THREE from 'three';
import { LyricBlock, buildText } from './type.js';

const _t = new THREE.Vector3();

export class Rig {
  constructor(aspect) {
    this.aspect = aspect;
    this.portrait = aspect < 1;
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.05, 3000);
    this.lens = { focus: 5, fstop: 0 };
  }
  /**
   * Pose the camera.
   *   pos, look  [x,y,z]            fov   vertical FOV of the landscape frame (deg);
   *                                       in portrait the sensor is rotated, so the same lens is used
   *   roll       degrees            focus distance in metres (default: distance to `look`)
   *   fstop      aperture (0/undefined = everything sharp)
   */
  set({ pos, look, fov = 35, roll = 0, focus, fstop = 0, near = 0.05, far = 3000 }) {
    const c = this.camera;
    c.position.set(pos[0], pos[1], pos[2]);
    c.up.set(0, 1, 0);
    _t.set(look[0], look[1], look[2]);
    c.lookAt(_t);
    if (roll) c.rotateZ((roll * Math.PI) / 180);
    const half = Math.tan((fov * Math.PI) / 360);
    c.fov = this.portrait ? (Math.atan(half / this.aspect) * 360) / Math.PI : fov;
    c.near = near;
    c.far = far;
    c.updateProjectionMatrix();
    this.lens.focus = focus ?? c.position.distanceTo(_t);
    this.lens.fstop = fstop;
  }
}

export class StageSet {
  constructor(engine, name) {
    this.engine = engine;
    this.name = name;
    this.scene = new THREE.Scene();
    this.rig = new Rig(engine.aspect);
    this.camera = this.rig.camera;
    // Flat overlay: orthographic, y in [-1, 1], x in [-aspect, aspect]. Drawn after depth of field.
    this.overlay = new THREE.Scene();
    const a = engine.aspect;
    this.overlayCamera = new THREE.OrthographicCamera(-a, a, 1, -1, -10, 10);
    this.resetters = [];
    this.groups = [];
  }
  /** Register a function that restores part of the set to its default state. */
  onReset(fn) {
    this.resetters.push(fn);
    return fn;
  }
  begin(f, shot) {
    for (const fn of this.resetters) fn(f);
    for (const g of this.groups) g.visible = g.userData.shot === shot;
  }
  /** Hook: per-sub-frame work that needs the final camera (planar reflections, uniforms). */
  prepare(/* f, renderer, post */) {}
}

/**
 * Define a shot. `build(S)` runs once at load, creates the shot's own objects
 * and returns its per-frame update function `(f) => postOverrides`.
 *   S.group    Group in the set's world (visible only while this shot is on)
 *   S.flat     Group in the set's flat overlay (same rule)
 *   S.lyric(id, opts)        LyricBlock added to S.group (or S.flat with opts.flat)
 *   S.text(string, opts)     static text block, same placement rule
 */
export function defineShot(timeline, set, id, start, build) {
  const shot = { id, start, end: start, set };
  const group = new THREE.Group();
  const flat = new THREE.Group();
  group.userData.shot = flat.userData.shot = shot;
  group.visible = flat.visible = false;
  set.scene.add(group);
  set.overlay.add(flat);
  set.groups.push(group, flat);
  const { lyrics, audio } = set.engine;
  // type attached to a set piece (o.parent) still belongs to this shot: wrap it so it is hidden in every other shot
  const place = (obj, o) => {
    if (o.flat) flat.add(obj);
    else if (o.parent) {
      const holder = new THREE.Group();
      holder.userData.shot = shot;
      holder.visible = false;
      holder.add(obj);
      o.parent.add(holder);
      set.groups.push(holder);
    } else group.add(obj);
  };
  const S = {
    shot, set, group, flat, lyrics, audio, engine: set.engine,
    lyric(lineId, o = {}) {
      const b = new LyricBlock(lyrics.line(lineId), o);
      place(b.object, o);
      return b;
    },
    text(str, o = {}) {
      const b = buildText(str, o);
      place(b.object, o);
      return b;
    },
  };
  shot.update = build(S);
  shot.group = group;
  shot.flat = flat;
  timeline.add(shot);
  return shot;
}
