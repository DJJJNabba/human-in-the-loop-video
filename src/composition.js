// The composition: loads timing + fonts, builds the look and the sets, registers every shot.
import { DURATION } from './config.js';
import { Timeline } from './engine/engine.js';
import { makeMaterials, makeStudioEnv, makeTextures } from './engine/look.js';
import { loadTiming } from './engine/timing.js';
import { loadFonts } from './engine/type.js';
import { makeBeat } from './engine/beat.js';
import { FloorSet } from './world/floor_set.js';
import registerLookdev from './shots/lookdev.js';
import registerThumb from './shots/thumb.js';
import registerOpen from './shots/a_open.js';
import registerChorus1 from './shots/b_chorus1.js';
import { PanelSet } from './world/panel_set.js';
import registerVerse2 from './shots/c_verse2.js';
import registerBridge from './shots/d_bridge.js';
import registerFinal from './shots/e_final.js';
import { AerialSet, ChartSet, OutsideSet, PlanetSet } from './world/sets2.js';

export async function buildComposition(engine, opts = {}) {
  const [{ lyrics, audio }] = await Promise.all([loadTiming(), loadFonts()]);
  engine.lyrics = lyrics;
  engine.audio = audio;
  engine.beat = makeBeat(audio);

  const tex = makeTextures();
  const M = makeMaterials(tex);
  const r = engine.renderer;
  const envs = {
    dark: makeStudioEnv(r, { key: 0.55, strips: 1, rim: 1, fill: 0.03 }),
    lit: makeStudioEnv(r, { key: 0.8, strips: 0.8, rim: 0.6, fill: 0.06, ceiling: 1 }),
    clinical: makeStudioEnv(r, { key: 1.2, strips: 0.6, rim: 0.4, fill: 0.16, ceiling: 1.4, green: 0.06 }),
  };
  const look = { tex, M, envs };
  const sets = {
    floor: new FloorSet(engine, look),
    panel: new PanelSet(engine, look),
    chart: new ChartSet(engine, look),
    outside: new OutsideSet(engine, look),
    aerial: new AerialSet(engine),
    planet: new PlanetSet(engine),
  };
  engine.sets = sets;

  const tl = new Timeline();
  if (opts.only === 'lookdev') registerLookdev(tl, sets, engine);
  else if (opts.only === 'thumb') registerThumb(tl, sets, engine);
  else {
    registerOpen(tl, sets, engine);
    registerChorus1(tl, sets, engine);
    registerVerse2(tl, sets, engine);
    registerBridge(tl, sets, engine);
    registerFinal(tl, sets, engine);
  }
  tl.seal(DURATION);
  engine.timeline = tl;
}
