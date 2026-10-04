// Renderer core.
//
// One frame = the average of N sub-frames spread across the shutter (motion
// blur + temporal AA + sub-pixel AA) and across the lens aperture (depth of
// field), each of which is:
//     set.prepare → scene render (MSAA, HDR) → depth-of-field → overlay
// followed once per frame by bloom, tone mapping, grade, grain.
// Everything is a pure function of song time, so seeking, the live preview and
// the offline export all produce the same picture.
import * as THREE from 'three';
import { FPS } from '../config.js';
import { clamp, halton } from './util.js';

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

class Pass {
  constructor(fragmentShader, uniforms = {}, extra = {}) {
    this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, ...extra });
    this.u = this.material.uniforms;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  }
}

const DOF_FRAG = /* glsl */ `
#define TAPS_A 32
#define TAPS_B 18
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform vec2 uTexel; uniform float uNear; uniform float uFar; uniform float uFocus; uniform float uA; uniform float uMaxR; uniform float uRot;
varying vec2 vUv;
float viewZ(vec2 uv){ float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float cocR(float d){ return min(0.5 * uA * abs(d - uFocus) / d, uMaxR); }
// interleaved gradient noise: every pixel turns its tap pattern by a different angle, so a small bright
// highlight spreads into an even disc over the sub-frames instead of printing the pattern as a ring of dots
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  float d0 = viewZ(vUv); float r0 = cocR(d0);
  vec3 col = texture2D(tColor, vUv).rgb; float tot = 1.0;
  float rot = uRot + 6.2831853 * ign(gl_FragCoord.xy + uRot * 31.7);
  // A: the pixel's own blur disc
  float ra = max(r0, 0.75);
  for (int i = 0; i < TAPS_A; i++){
    float r = sqrt((float(i) + 0.5) / float(TAPS_A)) * ra;
    float a = float(i) * 2.39996323 + rot;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
    float d = viewZ(uv); float rs = cocR(d);
    if (d > d0) rs = min(rs, r0 * 2.0);
    float m = smoothstep(r - 0.6, r + 0.6, rs + 0.6);
    col += mix(col / tot, texture2D(tColor, uv).rgb, m); tot += 1.0;
  }
  // B: an outer ring that only catches blurrier things in front bleeding over this pixel
  for (int i = 0; i < TAPS_B; i++){
    float r = mix(ra, uMaxR, sqrt((float(i) + 0.5) / float(TAPS_B)));
    float a = float(i) * 2.39996323 + rot * 1.7 + 1.3;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
    float d = viewZ(uv); float rs = cocR(d);
    float m = (d < d0 - 0.02 * d0) ? smoothstep(r - 1.0, r + 1.0, rs) : 0.0;
    col += mix(col / tot, texture2D(tColor, uv).rgb, m); tot += 1.0;
  }
  gl_FragColor = vec4(col / tot, 1.0);
}`;

const COPY_FRAG = /* glsl */ `uniform sampler2D tSrc; uniform float uWeight; varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uWeight, uWeight); }`;

const DOWN_FRAG = /* glsl */ `
// 13-tap downsample (Jimenez 2014), optional soft-knee threshold on the first level
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee; varying vec2 vUv;
vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
vec3 pre(vec3 c){
  if (uThreshold <= 0.0) return c;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
  return c * max(soft, br - uThreshold) / max(br, 1e-4);
}
void main(){
  vec3 a = s(vec2(-2,2)), b = s(vec2(0,2)), c = s(vec2(2,2));
  vec3 d = s(vec2(-2,0)), e = s(vec2(0,0)), f = s(vec2(2,0));
  vec3 g = s(vec2(-2,-2)), h = s(vec2(0,-2)), i = s(vec2(2,-2));
  vec3 j = s(vec2(-1,1)), k = s(vec2(1,1)), l = s(vec2(-1,-1)), m = s(vec2(1,-1));
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(pre(col), 1.0);
}`;

const UP_FRAG = /* glsl */ `
// 9-tap tent upsample, added to the next larger level
uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 uTexel; uniform float uRadius; uniform float uMix; varying vec2 vUv;
void main(){
  vec2 o = uTexel * uRadius;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += (texture2D(tSrc, vUv + vec2(o.x,0)).rgb + texture2D(tSrc, vUv - vec2(o.x,0)).rgb + texture2D(tSrc, vUv + vec2(0,o.y)).rgb + texture2D(tSrc, vUv - vec2(0,o.y)).rgb) * 2.0;
  c += texture2D(tSrc, vUv + o).rgb + texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + vec2(o.x,-o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x,o.y)).rgb;
  c /= 16.0;
  gl_FragColor = vec4(mix(texture2D(tBase, vUv).rgb, c, uMix), 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tColor; uniform sampler2D tBloom;
uniform vec2 uRes; uniform float uPx; uniform float uExposure; uniform float uBloom; uniform float uVignette; uniform float uGrain;
uniform float uSeed; uniform float uFade; uniform vec3 uFadeColor; uniform float uCA; uniform float uContrast; uniform float uSat;
uniform vec3 uTint; uniform float uFlip; uniform float uHalation; uniform float uZoom;
varying vec2 vUv;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// Khronos PBR Neutral: keeps base colours where they are, compresses only the top end.
vec3 neutral(vec3 color){
  const float startCompression = 0.76; const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 uv = vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlip));
  uv = (uv - 0.5) / uZoom + 0.5;
  vec2 c = uv - 0.5;
  vec3 col;
  if (uCA > 0.0) {
    float k = uCA * dot(c, c);
    col.r = texture2D(tColor, uv + c * k).r; col.g = texture2D(tColor, uv).g; col.b = texture2D(tColor, uv - c * k).b;
  } else col = texture2D(tColor, uv).rgb;
  vec3 bl = texture2D(tBloom, uv).rgb;
  col += bl * uBloom;
  // halation: the widest glow leans warm-white, like light scattering in the film base
  col += bl * uHalation * vec3(1.0, 0.86, 0.74) * 0.5;
  col *= uExposure * uTint;
  vec2 vc = c * vec2(uRes.x / uRes.y, 1.0); if (uRes.x < uRes.y) vc = c * vec2(1.0, uRes.y / uRes.x);
  float vig = smoothstep(1.05, 0.22, length(vc));
  col *= mix(1.0, vig, uVignette);
  col = neutral(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
  col = mix(col, uFadeColor, uFade);
  col = toSRGB(col);
  // grain in logical pixels (identical look at 1080p and 4K), strongest in the mid-darks
  vec2 gp = floor(gl_FragCoord.xy / uPx);
  float g = (h21(gp + uSeed * 17.31) + h21(gp * 1.37 + uSeed * 5.77 + 91.7) - 1.0);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col += g * uGrain * mix(1.0, 0.35, smoothstep(0.25, 0.9, lum));
  // triangular dither per physical pixel against banding in the graphite gradients
  col += (h21(gl_FragCoord.xy + uSeed * 3.7) + h21(gl_FragCoord.xy * 1.9 + uSeed + 7.0) - 1.0) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const BLIT_FRAG = /* glsl */ `uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`;

// Export packing: sRGB frame -> planar YUV 4:2:0 (BT.709, limited range), laid out so that
// one RGBA readPixels of a (W/4) x (3H/2) target returns exactly ffmpeg's `yuv420p` byte stream,
// top row first: H rows of Y, then H/4 rows holding the U plane, then H/4 rows holding the V plane.
// Chroma is left-sited (1-2-1 across, 2 rows down), which is what H.264 decoders assume.
const YUV_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uSize;
const vec3 K = vec3(0.2126, 0.7152, 0.0722);
vec3 src(float x, float yTop){ return texture2D(tSrc, vec2(x / uSize.x, 1.0 - yTop / uSize.y)).rgb; }
float luma(float x, float yTop){ return (16.0 + 219.0 * dot(src(x, yTop), K)) / 255.0; }
float chroma(float b, float r, bool isV){
  float hw = uSize.x * 0.5;
  float row = 2.0 * r + (b >= hw ? 1.0 : 0.0);
  float col = b >= hw ? b - hw : b;
  float yT = 2.0 * row + 1.0;
  vec3 c = 0.5 * (src(2.0 * col, yT) + src(2.0 * col + 1.0, yT));
  float y = dot(c, K);
  float v = isV ? (c.r - y) / 1.5748 : (c.b - y) / 1.8556;
  return (128.0 + 224.0 * v) / 255.0;
}
void main(){
  vec2 p = floor(gl_FragCoord.xy);
  float H = uSize.y;
  float x0 = 4.0 * p.x;
  if (p.y < H) {
    float yT = p.y + 0.5;
    gl_FragColor = vec4(luma(x0 + 0.5, yT), luma(x0 + 1.5, yT), luma(x0 + 2.5, yT), luma(x0 + 3.5, yT));
  } else {
    bool isV = p.y >= H + H * 0.25;
    float r = p.y - H - (isV ? H * 0.25 : 0.0);
    gl_FragColor = vec4(chroma(x0, r, isV), chroma(x0 + 1.0, r, isV), chroma(x0 + 2.0, r, isV), chroma(x0 + 3.0, r, isV));
  }
}`;

// Depth of field. With several sub-frames the lens is sampled for real: every sub-frame looks through a
// different point of the aperture (camera shifted, projection sheared about the focus plane), so things in
// front of the focus plane blur over what is behind them and highlights open into discs. The gather pass
// then only has to fill the gaps between those aperture points (LENS_FILL of the full circle of confusion).
// The aperture is capped so the far background never blurs by more than DOF_MAX_R logical pixels: beyond
// that sixteen points cannot be joined up, and the old hard clamp made mid-ground and horizon equally soft.
const SENSOR_H = 0.024;
const DOF_MAX_R = 64;
const lensFill = (N) => (N > 1 ? clamp(1.6 / Math.sqrt(N), 0.38, 1) : 1);
const _lx = new THREE.Vector3(), _ly = new THREE.Vector3();

/** Post defaults; a shot's update() may return any subset to override them for that frame. */
export const POST_DEFAULTS = {
  exposure: 1.0,
  bloom: 0.42,
  bloomThreshold: 0.9,
  bloomKnee: 0.5,
  halation: 0.12,
  vignette: 0.55,
  grain: 0.022,
  ca: 0.0035,
  contrast: 0.18,
  sat: 1.0,
  tint: [1, 1, 1],
  fade: 0,
  fadeColor: [0, 0, 0],
  beat: 1, // how much of the drum accent layer this shot takes (0 = none)
};

export class Engine {
  /**
   * @param canvas   target canvas
   * @param o.width / o.height  physical render size in pixels
   * @param o.samples           default sub-frames per frame
   */
  constructor(canvas, o) {
    this.canvas = canvas;
    this.W = o.width;
    this.H = o.height;
    this.aspect = this.W / this.H;
    this.portrait = this.aspect < 1;
    this.logicalH = this.portrait ? 1920 : 1080;
    this.px = this.H / this.logicalH; // physical pixels per logical pixel
    this.samples = o.samples ?? 1;
    this.shutter = o.shutter ?? 0.5;
    this.flipY = false; // export reads pixels bottom-up; flip in the final pass instead of in ffmpeg
    this.errors = [];

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: true }));
    r.setPixelRatio(1);
    r.setSize(this.W, this.H, false);
    r.autoClear = true;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.info.autoReset = false;
    const gl = r.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    this.floatBlend = !!gl.getExtension('EXT_float_blend') && !!gl.getExtension('EXT_color_buffer_float');

    const { W, H } = this;
    const hdr = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    this.rtScene = new THREE.WebGLRenderTarget(W, H, { ...hdr, samples: 4, depthBuffer: true });
    this.rtScene.depthTexture = new THREE.DepthTexture(W, H);
    this.rtScene.depthTexture.type = THREE.UnsignedIntType;
    this.rtScene.depthTexture.minFilter = this.rtScene.depthTexture.magFilter = THREE.NearestFilter;
    this.rtComp = new THREE.WebGLRenderTarget(W, H, { ...hdr, samples: 4, depthBuffer: false });
    this.rtAccum = new THREE.WebGLRenderTarget(W, H, { ...hdr, type: this.floatBlend ? THREE.FloatType : THREE.HalfFloatType, depthBuffer: false });
    this.rtOut = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });

    // bloom pyramid: always built from the same logical base size, so 1080p and 4K glow alike
    const bw = this.portrait ? 540 : 960, bh = this.portrait ? 960 : 540;
    this.rtHalf = W > bw * 2 ? new THREE.WebGLRenderTarget(W >> 1, H >> 1, { ...hdr, depthBuffer: false }) : null;
    this.bloomDown = [];
    this.bloomUp = [];
    for (let i = 0, w = bw, h = bh; i < 7 && h >= 4; i++, w = Math.max(2, w >> 1), h = Math.max(2, h >> 1)) {
      this.bloomDown.push(new THREE.WebGLRenderTarget(w, h, { ...hdr, depthBuffer: false }));
      this.bloomUp.push(new THREE.WebGLRenderTarget(w, h, { ...hdr, depthBuffer: false }));
    }

    this.dof = new Pass(DOF_FRAG, {
      tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2(1 / W, 1 / H) },
      uNear: { value: 0.1 }, uFar: { value: 100 }, uFocus: { value: 5 }, uA: { value: 0 }, uMaxR: { value: 20 }, uRot: { value: 0 },
    });
    this.copy = new Pass(COPY_FRAG, { tSrc: { value: null }, uWeight: { value: 1 } });
    this.accum = new Pass(COPY_FRAG, { tSrc: { value: null }, uWeight: { value: 1 } }, {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, transparent: true,
    });
    this.down = new Pass(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 }, uKnee: { value: 0.5 } });
    this.up = new Pass(UP_FRAG, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 }, uMix: { value: 0.5 } });
    this.final = new Pass(FINAL_FRAG, {
      tColor: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2(W, H) }, uPx: { value: this.px },
      uExposure: { value: 1 }, uBloom: { value: 0.5 }, uVignette: { value: 0.5 }, uGrain: { value: 0.02 }, uSeed: { value: 0 },
      uFade: { value: 0 }, uFadeColor: { value: new THREE.Vector3() }, uCA: { value: 0 }, uContrast: { value: 0 }, uSat: { value: 1 },
      uTint: { value: new THREE.Vector3(1, 1, 1) }, uFlip: { value: 0 }, uHalation: { value: 0 }, uZoom: { value: 1 },
    });
    this.blit = new Pass(BLIT_FRAG, { tSrc: { value: this.rtOut.texture } });

    this.timeline = null; // set by the composition
    this.lastShot = null;
    this.stats = { samples: 0, ms: 0 };
  }

  /** Render the frame for song time t to the canvas (and to rtOut). Returns the shot that was drawn. */
  renderFrame(t, opts = {}) {
    const N = Math.max(1, opts.samples ?? this.samples);
    const shutter = opts.shutter ?? this.shutter;
    const r = this.renderer;
    const shot = this.timeline.at(t);
    this.lastShot = shot;
    r.info.reset();

    r.setRenderTarget(this.rtAccum);
    r.setClearColor(0x000000, 0);
    r.clear();

    let post = null;
    const mid = N >> 1;
    for (let i = 0; i < N; i++) {
      // sub-frame time: evenly spread over the shutter, centred on t, never crossing a cut
      const dt = N > 1 ? ((i + 0.5) / N - 0.5) * (shutter / FPS) : 0;
      const ts = clamp(t + dt, shot.start, shot.end - 1e-4);
      const jx = N > 1 ? halton(i + 1, 2) - 0.5 : 0;
      const jy = N > 1 ? halton(i + 1, 3) - 0.5 : 0;
      const p = this.renderSample(shot, ts, jx, jy, i, N, 1 / N);
      if (i === mid) post = p;
    }
    this.finish(post, t);
    return shot;
  }

  renderSample(shot, t, jx, jy, i, N, weight) {
    const r = this.renderer;
    const set = shot.set;
    const f = this.frame(shot, t);
    f.sample = i;
    f.nSamples = N;
    set.begin(f, shot);
    let post;
    try {
      post = shot.update(f) || {};
    } catch (e) {
      const msg = `[${shot.id}] ${e.stack || e}`;
      if (!this.errors.includes(msg)) { this.errors.push(msg); console.error(msg); }
      post = {};
    }
    const cam = set.camera;
    if (this.beat && (post.beat ?? 1) > 0) {
      const b = this.beat(t);
      if (b.s > 0.001) { cam.rotateZ((b.sn % 2 ? 1 : -1) * 0.0024 * b.s * (post.beat ?? 1)); }
    }
    if (jx || jy) cam.setViewOffset(this.W, this.H, jx, jy, this.W, this.H);
    else cam.clearViewOffset();
    cam.updateMatrixWorld(true);
    // the lens: circle of confusion of a point at infinity (diameter, output pixels), and this sub-frame's place in the aperture
    const lens = set.rig.lens;
    let coc = 0, fill = 1;
    if (lens.fstop && lens.fstop > 0) {
      const focal = SENSOR_H / 2 / Math.tan((cam.fov * Math.PI) / 360);
      coc = Math.min(((focal * focal) / (lens.fstop * Math.max(0.01, lens.focus - focal)) / SENSOR_H) * this.H, 2 * DOF_MAX_R * this.px);
      fill = lensFill(N);
      if (N > 1) {
        // Vogel disc, visited in an order that is unrelated to the order of the shutter times
        const j = (i * 7 + 3) % N;
        const rr = Math.sqrt((j + 0.5) / N) * Math.sqrt(1 - fill * fill), an = j * 2.39996323 + 0.7;
        const ap = ((coc / 2) * lens.focus * SENSOR_H) / (focal * this.H); // aperture radius in metres
        const dx = Math.cos(an) * rr * ap, dy = Math.sin(an) * rr * ap;
        const e = cam.matrixWorld.elements;
        cam.position.addScaledVector(_lx.set(e[0], e[1], e[2]), dx).addScaledVector(_ly.set(e[4], e[5], e[6]), dy);
        cam.updateMatrixWorld(true);
        const pm = cam.projectionMatrix.elements;
        pm[8] -= (pm[0] * dx) / lens.focus;
        pm[9] -= (pm[5] * dy) / lens.focus;
        cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      }
    }
    r.shadowMap.autoUpdate = true; // a reflection pass in prepare() may render them first and switch this off
    set.prepare(f, r, post);

    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(set.scene, cam);
    r.shadowMap.autoUpdate = true;

    let src = this.rtScene;
    const hasOverlay = set.overlay && set.overlay.children.some((c) => c.visible);
    if (coc > 0) {
      const u = this.dof.u;
      u.tColor.value = this.rtScene.texture;
      u.tDepth.value = this.rtScene.depthTexture;
      u.uNear.value = cam.near;
      u.uFar.value = cam.far;
      u.uFocus.value = lens.focus;
      u.uA.value = coc * fill;
      u.uMaxR.value = 30 * this.px;
      u.uRot.value = (i * 2.39996323 * 0.61803) % 6.2831853 + (N > 1 ? 0 : 0.0);
      this.dof.render(r, this.rtComp);
      src = this.rtComp;
    } else if (hasOverlay) {
      this.copy.u.tSrc.value = this.rtScene.texture;
      this.copy.u.uWeight.value = 1;
      this.copy.render(r, this.rtComp);
      src = this.rtComp;
    }
    if (hasOverlay) {
      const oc = set.overlayCamera;
      if (jx || jy) oc.setViewOffset(this.W, this.H, jx, jy, this.W, this.H);
      else oc.clearViewOffset();
      r.setRenderTarget(this.rtComp);
      r.autoClear = false;
      r.render(set.overlay, oc);
      r.autoClear = true;
    }
    cam.clearViewOffset();

    this.accum.u.tSrc.value = src.texture;
    this.accum.u.uWeight.value = weight;
    r.autoClear = false;
    this.accum.render(r, this.rtAccum);
    r.autoClear = true;
    return post;
  }

  finish(postIn, t) {
    const r = this.renderer;
    const post = { ...POST_DEFAULTS, ...(postIn || {}) };
    let zoom = 1;
    if (this.beat && post.beat > 0) {
      const b = this.beat(t), g = post.beat;
      post.exposure *= 1 + 0.045 * b.k * g;
      post.bloom += 0.1 * b.k * g;
      post.ca += 0.004 * b.s * g;
      post.grain += 0.004 * b.h * g;
      zoom = 1 + 0.005 * b.k * g;
    }
    // bloom
    let src = this.rtAccum;
    if (this.rtHalf) {
      this.copy.u.tSrc.value = src.texture;
      this.copy.u.uWeight.value = 1;
      this.copy.render(r, this.rtHalf);
      src = this.rtHalf;
    }
    for (let i = 0; i < this.bloomDown.length; i++) {
      const dst = this.bloomDown[i];
      this.down.u.tSrc.value = src.texture;
      this.down.u.uTexel.value.set(1 / src.width, 1 / src.height);
      this.down.u.uThreshold.value = i === 0 ? post.bloomThreshold : 0;
      this.down.u.uKnee.value = post.bloomKnee;
      this.down.render(r, dst);
      src = dst;
    }
    let up = this.bloomDown[this.bloomDown.length - 1];
    for (let i = this.bloomDown.length - 2; i >= 0; i--) {
      const dst = this.bloomUp[i];
      this.up.u.tSrc.value = up.texture;
      this.up.u.tBase.value = this.bloomDown[i].texture;
      this.up.u.uTexel.value.set(1 / up.width, 1 / up.height);
      this.up.u.uMix.value = 0.5;
      this.up.render(r, dst);
      up = dst;
    }
    const u = this.final.u;
    u.tColor.value = this.rtAccum.texture;
    u.tBloom.value = up.texture;
    u.uExposure.value = post.exposure;
    u.uBloom.value = post.bloom;
    u.uHalation.value = post.halation;
    u.uVignette.value = post.vignette;
    u.uGrain.value = post.grain;
    u.uSeed.value = Math.round(t * FPS) % 4093;
    u.uFade.value = post.fade;
    u.uFadeColor.value.fromArray(post.fadeColor);
    u.uCA.value = post.ca;
    u.uContrast.value = post.contrast;
    u.uSat.value = post.sat;
    u.uTint.value.fromArray(post.tint);
    u.uFlip.value = this.flipY ? 1 : 0;
    u.uZoom.value = zoom;
    this.final.render(r, this.rtOut);
    this.blit.render(r, null);
  }

  frame(shot, t) {
    return {
      t,
      lt: t - shot.start,
      dur: shot.end - shot.start,
      p: (t - shot.start) / (shot.end - shot.start),
      start: shot.start,
      end: shot.end,
      aspect: this.aspect,
      portrait: this.portrait,
      engine: this,
      lyrics: this.lyrics,
      audio: this.audio,
      shot,
    };
  }

  /** Read the last frame (RGBA8, sRGB). Row order follows engine.flipY. */
  async readPixels(buf) {
    await this.renderer.readRenderTargetPixelsAsync(this.rtOut, 0, 0, this.W, this.H, buf);
    return buf;
  }

  /** Bytes per frame of the yuv420p export stream. */
  get yuvSize() {
    return (this.W * this.H * 3) / 2;
  }

  /** Read the last frame as ffmpeg `yuv420p` (BT.709 limited range, top row first). Blocks until the GPU is done. */
  readYuv(buf) {
    const { W, H } = this;
    if (W % 8 || H % 4) throw new Error(`yuv export needs width % 8 == 0 and height % 4 == 0 (got ${W}x${H})`);
    if (!this.rtYuv) {
      this.rtYuv = new THREE.WebGLRenderTarget(W / 4, (H * 3) / 2, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      this.yuv = new Pass(YUV_FRAG, { tSrc: { value: this.rtOut.texture }, uSize: { value: new THREE.Vector2(W, H) } });
    }
    this.yuv.render(this.renderer, this.rtYuv);
    this.renderer.readRenderTargetPixels(this.rtYuv, 0, 0, W / 4, (H * 3) / 2, buf);
    return buf;
  }
}

/** Ordered list of shots. A shot owns [start, end) and names the set it is staged in. */
export class Timeline {
  constructor() {
    this.shots = [];
  }
  add(shot) {
    this.shots.push(shot);
    return shot;
  }
  /** Sort, close gaps (a shot runs until the next one starts) and validate. */
  seal(duration) {
    this.shots.sort((a, b) => a.start - b.start);
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i];
      const next = this.shots[i + 1];
      s.end = next ? next.start : duration;
      s.index = i;
      if (!(s.end > s.start)) throw new Error(`shot ${s.id} has no duration`);
    }
    if (this.shots[0].start > 0) this.shots[0].start = 0;
  }
  at(t) {
    const S = this.shots;
    let lo = 0, hi = S.length - 1, r = 0;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (S[m].start <= t) { r = m; lo = m + 1; } else hi = m - 1;
    }
    return S[r];
  }
}
