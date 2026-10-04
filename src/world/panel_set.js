// The status panel: a product shot of the machine's only opinion about itself.
// A small hero panel for the first refrain, a wall of the same lamps for the
// later ones. Staged like a studio still life: black cyclorama, one soft key.
import * as THREE from 'three';
import { StageSet } from '../engine/set.js';
import { LampPanel } from './props.js';

export class PanelSet extends StageSet {
  constructor(engine, look) {
    super(engine, 'panel');
    const { M, envs } = look;
    const sc = this.scene;
    sc.background = new THREE.Color('#020303');
    sc.environment = envs.dark;
    this.envs = envs;
    this.hero = new LampPanel(M, { cols: 12, rows: 5, pitch: 0.085, legend: false });
    this.wall = new LampPanel(M, { cols: 46, rows: 20, pitch: 0.085, legend: false });
    sc.add(this.hero.group, this.wall.group);
    const key = (this.key = new THREE.SpotLight('#f1f5ff', 0, 12, 0.6, 0.9, 1.2));
    key.position.set(-1.6, 1.4, 2.6);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.3;
    key.shadow.camera.far = 12;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    sc.add(key, key.target);
    // the lamps light the plate around them a little: one soft green fill from the front
    this.fill = new THREE.PointLight('#12e27a', 0, 6, 2);
    this.fill.position.set(0, 0, 0.9);
    sc.add(this.fill);
    this.onReset(() => {
      this.hero.lens.material.color.setScalar(1);
      this.wall.lens.material.color.setScalar(1);
      this.hero.group.visible = true;
      this.wall.group.visible = false;
      this.hero.set(() => 0);
      sc.environment = envs.dark;
      sc.environmentIntensity = 1.2;
      key.intensity = 9;
      key.position.set(-1.6, 1.4, 2.6);
      this.fill.intensity = 0;
      this.fill.position.set(0, 0, 0.9);
    });
  }
  prepare(f, renderer, post = {}) {
    const b = this.engine.beat(f.t), g = post.beatScene ?? 1;
    const k = b.k * g, h = b.h * g;
    for (const P of [this.hero, this.wall]) P.lens.material.color.multiplyScalar(1 + 0.35 * k + 0.12 * h);
    this.fill.intensity *= 1 + 1.6 * k;
  }
}
