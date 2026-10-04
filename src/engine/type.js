// Typography: font loading, vector glyph geometry, kerned layout, lyric blocks.
//
// Glyph outlines come from the font files (opentype.js) and are triangulated,
// so type is geometry: sharp at any size, lit, extrudable, and it takes part in
// depth of field and motion blur like every other object. Advances and kerning
// are taken from the browser's text shaper (canvas measureText) with the same
// font files, so spacing is what a typesetter would get.
import * as THREE from 'three';
import * as opentype from 'opentype.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FONTS, PAL } from '../config.js';
import { clamp, ease, prog, smoothstep } from './util.js';

export const fonts = {};
let mctx = null;
let blockCount = 0;
const M = 400; // measuring size in px

export async function loadFonts() {
  const parse = opentype.parse || opentype.default?.parse;
  await Promise.all(
    Object.entries(FONTS).map(async ([key, def]) => {
      const buf = await (await fetch('/assets/fonts/' + def.file)).arrayBuffer();
      const font = parse(buf);
      const face = new FontFace(def.css, buf.slice(0), { weight: String(def.weight), style: def.style });
      await face.load();
      document.fonts.add(face);
      const upem = font.unitsPerEm;
      fonts[key] = {
        key, font, def, upem,
        cap: (font.tables.os2?.sCapHeight || upem * 0.7) / upem,
        xh: (font.tables.os2?.sxHeight || upem * 0.5) / upem,
        asc: font.ascender / upem,
        desc: font.descender / upem,
        css: (px) => `${def.style} ${def.weight} ${px}px "${def.css}"`,
        shapes: new Map(),
        geo: new Map(),
      };
    }),
  );
  await document.fonts.ready;
  mctx = document.createElement('canvas').getContext('2d');
  mctx.fontKerning = 'normal';
}

/** Typographic quotes for display type; the machine voice keeps typewriter marks. */
export const smart = (s) => s.replace(/(^|[\s(\[])"/g, '$1“').replace(/"/g, '”').replace(/(^|[\s(\[])'/g, '$1‘').replace(/'/g, '’');

/** Kerned x position of every character of `text` (em units) and the total width. */
export function layout(fontKey, text, tracking = 0) {
  const F = fonts[fontKey];
  if (!F) throw new Error(`unknown font ${fontKey}`);
  mctx.font = F.css(M);
  const xs = new Array(text.length);
  for (let i = 0; i < text.length; i++) xs[i] = mctx.measureText(text.slice(0, i)).width / M + tracking * i;
  const width = mctx.measureText(text).width / M + tracking * Math.max(0, text.length - 1);
  return { xs, width };
}

const pip = (pt, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** Shapes (with holes) of one glyph in em units, y up, origin on the baseline. Contours are nested by containment, not winding. */
function glyphShapes(F, ch) {
  if (F.shapes.has(ch)) return F.shapes.get(ch);
  const g = F.font.charToGlyph(ch);
  const cmds = g.getPath(0, 0, 1).commands;
  const contours = [];
  let cur = null;
  for (const c of cmds) {
    if (c.type === 'M') { cur = new THREE.Path(); cur.moveTo(c.x, -c.y); contours.push(cur); }
    else if (c.type === 'L') cur.lineTo(c.x, -c.y);
    else if (c.type === 'Q') cur.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') cur.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
    else if (c.type === 'Z') cur.closePath();
  }
  const info = contours
    .map((path) => {
      const pts = path.getPoints(6);
      return { path, pts, area: Math.abs(THREE.ShapeUtils.area(pts)) };
    })
    .filter((c) => c.pts.length > 2 && c.area > 1e-7);
  for (const c of info) c.depth = info.filter((o) => o !== c && o.area > c.area && pip(c.pts[0], o.pts)).length;
  const shapes = [];
  for (const c of info) {
    if (c.depth % 2 === 0) {
      const s = new THREE.Shape();
      s.curves = c.path.curves;
      s.currentPoint = c.path.currentPoint;
      c.shape = s;
      shapes.push(s);
    }
  }
  for (const c of info) {
    if (c.depth % 2 === 1) {
      const parents = info.filter((o) => o.shape && o.depth === c.depth - 1 && pip(c.pts[0], o.pts)).sort((a, b) => a.area - b.area);
      if (parents[0]) parents[0].shape.holes.push(c.path);
    }
  }
  F.shapes.set(ch, shapes);
  return shapes;
}

function glyphGeometry(F, ch, depth, bevel, segs) {
  const k = `${ch}|${depth}|${bevel}|${segs}`;
  if (F.geo.has(k)) return F.geo.get(k);
  const shapes = glyphShapes(F, ch);
  let geo = null;
  if (shapes.length) {
    geo = depth > 0
      ? new THREE.ExtrudeGeometry(shapes, { depth, curveSegments: segs, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, bevelOffset: -bevel })
      : new THREE.ShapeGeometry(shapes, segs);
    if (geo.index) geo = geo.toNonIndexed();
    geo.deleteAttribute('uv');
  }
  F.geo.set(k, geo);
  return geo;
}

/** Merged geometry for a run of text (em units, baseline origin), using positions from `xs`. */
export function runGeometry(fontKey, text, xs, { depth = 0, bevel = 0, segs = 8 } = {}) {
  const F = fonts[fontKey];
  const parts = [];
  for (let i = 0; i < text.length; i++) {
    const g = glyphGeometry(F, text[i], depth, bevel, segs);
    if (!g) continue;
    const c = g.clone();
    c.translate(xs[i], 0, 0);
    parts.push(c);
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Flat, unlit type material. `gain` > 1 pushes it into bloom. */
export function inkMaterial(color = PAL.white, gain = 1) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: true, alphaTest: 0.004, side: THREE.DoubleSide, fog: false });
  m.userData.base = new THREE.Color(color);
  m.userData.gain = gain;
  m.color.copy(m.userData.base).multiplyScalar(gain);
  return m;
}

/**
 * Build a block of text as one mesh per word.
 *   text      string, '\n' breaks lines
 *   font      key in FONTS;  size  cap-height-independent em size in world units
 *   align     'left' | 'center' | 'right'      leading  line distance in ems
 *   depth     extrusion in ems (0 = flat)      material  shared base material (cloned per word unless share=true)
 *   styles    { [wordIndex]: { font, material } } per-word overrides (a word in another voice)
 * Returns { object, words[], width, height, lineCount }. Origin: baseline of the first line; x per `align`.
 */
export function buildText(text, o = {}) {
  const {
    font = 'display', size = 1, tracking = 0, align = 'left', leading = 1.08, depth = 0, bevel = 0, segs = 8,
    material = null, share = false, styles = {}, wordGap = null, prop = false,
  } = o;
  const object = new THREE.Group();
  const words = [];
  const blockId = ++blockCount;
  const lines = text.split('\n');
  let maxW = 0, wi = 0;
  const space = wordGap ?? layout(font, 'n n').width - layout(font, 'nn').width + tracking;
  lines.forEach((ln, li) => {
    const toks = ln.split(' ').filter((s) => s.length);
    // lay the line out word by word so each word can carry its own font
    let x = 0;
    const row = [];
    toks.forEach((tok, k) => {
      const st = styles[wi] || {};
      const fk = st.font || font;
      const lay = layout(fk, tok, tracking);
      const scale = st.scale || 1;
      const geo = runGeometry(fk, tok, lay.xs, { depth, bevel, segs });
      const baseMat = st.material || material || inkMaterial();
      const mat = share ? baseMat : baseMat.clone();
      if (!share) { mat.userData = { ...baseMat.userData, base: baseMat.userData.base?.clone?.() ?? baseMat.color.clone() }; }
      const mesh = new THREE.Mesh(geo || new THREE.BufferGeometry(), mat);
      if (!prop) mesh.userData.text = { block: blockId, word: tok }; // for tools/render.mjs textcheck (labels on props are not lyric type)
      mesh.scale.set(size * scale, size * scale, size);
      const w = lay.width * size * scale;
      row.push({ mesh, text: tok, x, w, line: li, index: wi, y: -li * leading * size, font: fk });
      x += w + (k < toks.length - 1 ? space * size : 0);
      wi++;
    });
    const lineW = x;
    maxW = Math.max(maxW, lineW);
    const off = align === 'center' ? -lineW / 2 : align === 'right' ? -lineW : 0;
    for (const r of row) {
      r.x += off;
      r.mesh.position.set(r.x, r.y, 0);
      r.home = r.mesh.position.clone();
      r.lineW = lineW;
      object.add(r.mesh);
      words.push(r);
    }
  });
  return { object, words, width: maxW, height: (lines.length - 1) * leading * size + fonts[font].cap * size, lineCount: lines.length, size, font };
}

/**
 * A lyric line as physical type whose words arrive on the sung syllable.
 * `line` is an entry of data/lyrics.json; `text` may re-break or restyle it
 * (same number of words), otherwise the lyric text is used.
 */
export class LyricBlock {
  constructor(line, o = {}) {
    this.line = line;
    const raw = o.text ?? line.text;
    const txt = o.plain ? raw : smart(raw);
    this.block = buildText(o.upper ? txt.toUpperCase() : txt, o);
    this.object = this.block.object;
    this.words = this.block.words;
    if (this.words.length !== line.words.length) throw new Error(`lyric ${line.id}: layout has ${this.words.length} words, timing has ${line.words.length}`);
    this.words.forEach((w, i) => (w.timing = line.words[i]));
    this.o = { mode: 'rise', lead: 0.07, rise: 0.15, dim: 0.42, hot: 1.9, hold: 1.2, out: 0.35, dist: 0.28, ...o };
  }
  /**
   * Drive the block. Words start arriving 4 frames before their measured start, so they are nearly full by the syllable,
   * flash while being sung and settle; the block leaves `hold` s after the last word.
   *   k.gate  optional 0..1 master visibility      k.exit  absolute time at which to leave
   */
  update(t, k = {}) {
    const o = this.o;
    const exit = k.exit ?? this.line.end + o.hold;
    const outP = prog(t, exit, exit + o.out, ease.inCubic);
    const gate = (k.gate ?? 1) * (1 - outP);
    this.object.visible = gate > 0.001;
    for (const w of this.words) {
      const T = w.timing;
      const a = prog(t, T.start - o.lead, T.start - o.lead + o.rise, ease.outCubic);
      const sung = clamp((t - T.start) / Math.max(0.08, T.end - T.start));
      const after = smoothstep(T.end, T.end + 0.5, t);
      // brightness: hot while sung, then settles to full white (or dims if o.settle < 1)
      const hot = a * (1 - after);
      const level = o.mode === 'reveal' ? (t >= T.start - o.lead ? 1 : o.dim) : 1;
      const m = w.mesh.material;
      const base = m.userData.base;
      const gain = (m.userData.gain ?? 1) * (level * (1 + (o.hot - 1) * hot * (1 - sung * 0.5)));
      if (base) m.color.copy(base).multiplyScalar(gain);
      const vis = o.mode === 'reveal' ? 1 : a;
      if ('opacity' in m && m.transparent) m.opacity = vis * gate;
      w.mesh.visible = vis * gate > 0.003;
      const d = o.dist * this.block.size * (1 - a);
      w.mesh.position.copy(w.home);
      if (o.mode === 'rise') w.mesh.position.y -= d;
      else if (o.mode === 'drop') w.mesh.position.y += d;
      else if (o.mode === 'slide') w.mesh.position.x -= d;
      else if (o.mode === 'push') w.mesh.position.z -= d * 2;
      w.a = a; w.sung = sung; w.hot = hot;
    }
    return gate;
  }
}
