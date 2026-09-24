/* The video's 3D world. One instance per render tab. Everything it draws is a pure
   function of the FrameState handed to setFrame(), so any frame can be rendered alone.

   Render pipeline (all deterministic — no Math.random at render time):
     scene (HDR, MSAA, depth texture)  →  SSAO (depth-reconstructed, seeded kernel) + blur
     →  bloom (UnrealBloomPass, HDR threshold)  →  depth of field (depth-based gather)
     →  ACES tone map + sRGB + vignette + dither  →  canvas                                   */
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createEngine, Engine } from '../../src/engine3d/engine';
import { PALETTE, LOOK, RIG } from '../film/theme';

export type CamState = { pos: THREE.Vector3; target: THREE.Vector3; fov: number };
export type Post = { ao: number; bloom: number; bloomRadius: number; dof: number; focus: number; exposure: number; key: number; fill: number; rim: number };

function dot(): THREE.Texture | null {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); if (!x) return null;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.65)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function floorTexture(): THREE.Texture | null {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); if (!x) return null;
  const g = x.createRadialGradient(256, 256, 0, 256, 256, 256); g.addColorStop(0, 'rgba(148,163,184,.10)'); g.addColorStop(.55, 'rgba(100,116,139,.04)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512); return new THREE.CanvasTexture(c);
}
/** Small seeded PRNG so post-processing kernels are identical in every render tab. */
function mulberry(a: number) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hexVec = (h: string) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };  // sRGB 0..1

const FS_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
const DEPTH_FN = `
  uniform float cNear; uniform float cFar;
  float viewZ(float d){ float z = d * 2. - 1.; return 2. * cNear * cFar / (cFar + cNear - z * (cFar - cNear)); }`;

/* Screen-space ambient occlusion from the depth buffer alone (normals reconstructed from depth). */
const AO_FRAG = `
  varying vec2 vUv; uniform sampler2D tDepth; uniform mat4 projInv; uniform mat4 proj; uniform vec2 res;
  uniform vec3 kernel[16]; uniform float radius;
  ${DEPTH_FN}
  vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = projInv * vec4(uv * 2. - 1., d * 2. - 1., 1.); return p.xyz / p.w; }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    float d = texture2D(tDepth, vUv).x; if (d >= .99999) { gl_FragColor = vec4(1.); return; }
    vec3 P = viewPos(vUv);
    vec3 px = viewPos(vUv + vec2(1. / res.x, 0.)) - P, py = viewPos(vUv + vec2(0., 1. / res.y)) - P;
    vec3 N = normalize(cross(px, py));
    float a = hash(gl_FragCoord.xy) * 6.2831853; vec3 rv = vec3(cos(a), sin(a), 0.);
    vec3 T = normalize(rv - N * dot(rv, N)), B = cross(N, T); mat3 TBN = mat3(T, B, N);
    float occ = 0.;
    for (int i = 0; i < 16; i++) {
      vec3 S = P + TBN * kernel[i] * radius;
      vec4 o = proj * vec4(S, 1.); vec2 suv = o.xy / o.w * .5 + .5;
      float sd = viewPos(suv).z;
      float range = smoothstep(0., 1., radius / abs(P.z - sd));
      occ += (sd >= S.z + .02 ? 1. : 0.) * range;
    }
    gl_FragColor = vec4(vec3(1. - occ / 16.), 1.);
  }`;
/* Composite: scene colour × blurred AO (4×4 box, depth-aware). */
const AO_COMP = `
  varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 res; uniform float strength;
  ${DEPTH_FN}
  void main(){
    vec4 c = texture2D(tColor, vUv); float z0 = viewZ(texture2D(tDepth, vUv).x), s = 0., w = 0.;
    for (int x = -2; x < 2; x++) for (int y = -2; y < 2; y++) { vec2 o = (vec2(float(x), float(y)) + .5) / res;
      float z = viewZ(texture2D(tDepth, vUv + o).x); float k = 1. / (1. + 40. * abs(z - z0)); s += texture2D(tAO, vUv + o).x * k; w += k; }
    float ao = mix(1., s / w, strength);
    gl_FragColor = vec4(c.rgb * ao, c.a);
  }`;
/* Depth of field: circle of confusion from depth, 64-tap golden-angle gather (scatter-as-gather weighting). */
const DOF_FRAG = `
  varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res; uniform float focus; uniform float aperture;
  ${DEPTH_FN}
  float cocZ(float z){ return clamp(aperture * abs(1. - focus / z), 0., 11.); }
  void main(){
    vec4 c0 = texture2D(tColor, vUv); if (aperture < .01) { gl_FragColor = c0; return; }
    float z0 = viewZ(texture2D(tDepth, vUv).x), r0 = cocZ(z0); vec3 acc = c0.rgb; float wsum = 1.;
    for (int i = 1; i < 64; i++) {
      float fi = float(i), r = sqrt(fi / 64.) * 11., a = fi * 2.39996;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r / res;
      float zs = viewZ(texture2D(tDepth, uv).x), rs = cocZ(zs);
      // a sample contributes if its blur disc reaches this pixel; farther samples can't bleed over a sharper foreground
      float reach = zs > z0 ? min(rs, r0) : rs;
      float w = smoothstep(r - 1.5, r + 1., reach);
      acc += texture2D(tColor, uv).rgb * w; wsum += w;
    }
    gl_FragColor = vec4(acc / wsum, c0.a);
  }`;
/* Final: exposure, ACES filmic, sRGB, vignette, dither. */
const FINAL_FRAG = `
  varying vec2 vUv; uniform sampler2D tColor; uniform float exposure; uniform vec2 res;
  vec3 aces(vec3 x){ x *= exposure / .6; mat3 m1 = mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777);
    mat3 m2 = mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
    vec3 v = m1 * x; vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return clamp(m2 * (a / b), 0., 1.); }
  vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec3 c = srgb(aces(texture2D(tColor, vUv).rgb));
    vec2 q = (vUv - .5) * vec2(res.x / res.y, 1.); c *= mix(1., .78, smoothstep(.45, 1.15, length(q)));
    c += (hash(gl_FragCoord.xy) - .5) / 255.;
    gl_FragColor = vec4(c, 1.);
  }`;

export class World {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  engines = new Map<string, Engine>(); engine: Engine | null = null; dotTex: THREE.Texture | null;
  floorY = -1.5; floor: THREE.Group; w: number; h: number;
  key: THREE.DirectionalLight; fill: THREE.DirectionalLight; rim: THREE.DirectionalLight; amb: THREE.HemisphereLight;
  sceneRT: THREE.WebGLRenderTarget; rtA: THREE.WebGLRenderTarget; rtB: THREE.WebGLRenderTarget; aoRT: THREE.WebGLRenderTarget;
  quad: THREE.Mesh; quadScene = new THREE.Scene(); quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  mats: Record<string, THREE.ShaderMaterial> = {}; bloom: UnrealBloomPass;
  post: Post = { ao: 1, bloom: .45, bloomRadius: .55, dof: 0, focus: 10, exposure: 1, key: 1, fill: 1, rim: 1 };
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(w, h, false);
    r.localClippingEnabled = true; r.outputEncoding = THREE.LinearEncoding; r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;             // PCF honours shadow.radius → soft, stair-free contact shadows
    r.domElement.style.width = '100%'; r.domElement.style.height = '100%';
    this.camera = new THREE.PerspectiveCamera(30, w / h, .2, 120);
    this.dotTex = dot();
    const s = this.scene;
    s.background = this.backdrop();
    // Three-point studio rig; positions are set per frame relative to the camera (see rig()).
    const L = (hex: string, i: number) => { const l = new THREE.DirectionalLight(new THREE.Color(hex), i); s.add(l); s.add(l.target); return l; };
    this.amb = new THREE.HemisphereLight(0xcbd5e1, 0x0b0f17, RIG.ambient); s.add(this.amb);
    this.key = L(RIG.key.color, RIG.key.intensity); this.fill = L(RIG.fill.color, RIG.fill.intensity); this.rim = L(RIG.rim.color, RIG.rim.intensity);
    const key = this.key; key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -.0004; key.shadow.normalBias = .02; key.shadow.radius = 7;
    Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 90 });
    try {
      const pm = new THREE.PMREMGenerator(r), es = new THREE.Scene();
      es.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x0c1220, side: THREE.BackSide })));
      const sb = (w: number, h: number, x: number, y: number, z: number, k: number, c = [1, 1, 1]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k * c[0], k * c[1], k * c[2]), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
      // long soft-boxes give brushed-steel parts clean highlight streaks
      const k = RIG.env; sb(8, 3, 0, 14, -2, 2.4 * k, [1, .93, .86]); sb(3, 12, 14, 4, -7, 1.6 * k); sb(3, 12, -14, 4, 7, 1.2 * k, [.85, .92, 1.1]); sb(22, 1, 0, 2, -14, .8 * k);
      s.environment = pm.fromScene(es, .035).texture;
    } catch (e) { /* no environment on very old GL */ }
    // Floor: a faint light pool plus a shadow catcher.
    const fl = this.floor = new THREE.Group(); s.add(fl);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: floorTexture() || undefined, transparent: true, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; fl.add(pool);
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: .55 })); catcher.rotation.x = -Math.PI / 2; catcher.position.y = .002; catcher.receiveShadow = true; fl.add(catcher);
    // --- post-processing targets ---
    const hdr = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    const MS = (THREE as any).WebGLMultisampleRenderTarget;
    this.sceneRT = r.capabilities.isWebGL2 && MS ? new MS(w, h, hdr) : new THREE.WebGLRenderTarget(w, h, hdr);
    (this.sceneRT as any).samples = 4;
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h); this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    this.rtA = new THREE.WebGLRenderTarget(w, h, hdr); this.rtB = new THREE.WebGLRenderTarget(w, h, hdr);
    this.aoRT = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const rand = mulberry(20260924), kernel: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) { const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * .9 + .1).normalize(); let sc = i / 16; sc = .1 + .9 * sc * sc; kernel.push(v.multiplyScalar(sc * (.3 + .7 * rand()))); }
    const common = () => ({ res: { value: new THREE.Vector2(w, h) }, cNear: { value: .2 }, cFar: { value: 120 }, tDepth: { value: this.sceneRT.depthTexture } });
    const SM = (frag: string, u: any) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms: { ...common(), ...u }, depthTest: false, depthWrite: false });
    this.mats.ao = SM(AO_FRAG, { projInv: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() }, kernel: { value: kernel }, radius: { value: .32 } });
    this.mats.aoComp = SM(AO_COMP, { tColor: { value: null }, tAO: { value: this.aoRT.texture }, strength: { value: 1 } });
    this.mats.dof = SM(DOF_FRAG, { tColor: { value: null }, focus: { value: 10 }, aperture: { value: 0 } });
    this.mats.final = SM(FINAL_FRAG, { tColor: { value: null }, exposure: { value: 1 } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mats.final); this.quad.frustumCulled = false; this.quadScene.add(this.quad);
    // Bloom only what is genuinely hot: threshold on the peak channel (not luma), so saturated
    // combustion orange / intake cyan glows bloom while broadly lit steel does not.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), .45, .55, 2.0);
    const hp: any = (this.bloom as any).materialHighPassFilter;
    hp.fragmentShader = `uniform sampler2D tDiffuse; uniform vec3 defaultColor; uniform float defaultOpacity; uniform float luminosityThreshold; uniform float smoothWidth; varying vec2 vUv;
      void main(){ vec4 t = texture2D(tDiffuse, vUv); float v = max(t.r, max(t.g, t.b));
        gl_FragColor = mix(vec4(defaultColor, defaultOpacity), t, smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v)); }`;
    hp.uniforms.smoothWidth.value = .7; hp.needsUpdate = true;
  }
  /** Slate backdrop with a soft radial key glow, pre-compensated for the ACES tone map so it lands on the exact palette. */
  backdrop() {
    const W = 960, H = 540, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!;
    const img = x.createImageData(W, H), g0 = hexVec(PALETTE.bg0), g1 = hexVec(PALETTE.bg1), gg = hexVec(PALETTE.bgGlow);
    // inverse of (ACES → sRGB) for one channel, via bisection on the forward curve
    const toLin = (v: number) => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
    const fwd = (l: number) => { const x = l / .6, a = x * (x + .0245786) - .000090537, b = x * (.983729 * x + .432951) + .238081; return Math.max(0, a / b); };
    const inv = (srgb: number) => { const t = toLin(srgb); let lo = 0, hi = 4; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; fwd(m) < t ? lo = m : hi = m; } return lo; };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = (i / W - .5) * (W / H), v = j / H - .44, rr = Math.sqrt(u * u + v * v);
      const base = g1.clone().lerp(g0, Math.min(1, Math.max(0, (rr - .15) / .85)));                  // #0F172A centre → #020617 edge
      const glow = Math.exp(-(u * u / .09 + v * v / .06));                                            // soft key light behind the subject
      base.lerp(gg, glow * .75);
      const k = (j * W + i) * 4; img.data[k] = base.x * 255; img.data[k + 1] = base.y * 255; img.data[k + 2] = base.z * 255; img.data[k + 3] = 255;
    }
    // store linear values pre-inverted through the tone curve (8-bit sRGB container; decoded by three as sRGB)
    const lut = new Float32Array(256); for (let v = 0; v < 256; v++) lut[v] = inv(v / 255);
    for (let k = 0; k < img.data.length; k += 4) for (let ch = 0; ch < 3; ch++) { const lin = lut[img.data[k + ch]]; img.data[k + ch] = Math.round(255 * (lin <= .0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - .055)); }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.minFilter = THREE.LinearFilter; return t;
  }
  useEngine(arch: string) {
    let e = this.engines.get(arch);
    if (!e) { e = createEngine(arch, { colors: PALETTE.flow as any, shadows: true, dot: this.dotTex, seed: 11, look: LOOK, particleScale: 1.7 }); e.root.visible = false; this.scene.add(e.root); this.engines.set(arch, e); }
    if (this.engine !== e) { if (this.engine) this.engine.root.visible = false; e.root.visible = true; this.engine = e; }
    this.floorY = e.e.cc.bot - .85 - .06; return e;
  }
  /** Resolve a camera target: an [x,y,z] array or a named 3D anchor ("piston:0", "crank", ...). */
  resolve(t: any, out = new THREE.Vector3()) { if (Array.isArray(t)) return out.set(t[0], t[1], t[2]); const a = this.engine?.anchor(t, out); return a || out.set(0, 1.4, 0); }
  setCamera(c: CamState) { const cam = this.camera; cam.fov = c.fov; cam.aspect = this.w / this.h; cam.position.copy(c.pos); cam.lookAt(c.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); this.rig(c.target); }
  /** Place key / fill / rim relative to the current view, so the rim always sits behind the subject. */
  rig(target: THREE.Vector3) {
    const cam = this.camera, fwd = target.clone().sub(cam.position); const dist = fwd.length(); fwd.normalize();
    const baseAz = Math.atan2(-fwd.x, -fwd.z);                                        // azimuth of the camera as seen from the subject
    const place = (l: THREE.DirectionalLight, spec: { az: number; el: number }) => {
      const a = baseAz + spec.az * Math.PI / 180, e = spec.el * Math.PI / 180, R = 30;
      l.position.set(target.x + R * Math.cos(e) * Math.sin(a), target.y + R * Math.sin(e), target.z + R * Math.cos(e) * Math.cos(a)); l.target.position.copy(target); l.target.updateMatrixWorld();
    };
    place(this.key, RIG.key); place(this.fill, RIG.fill); place(this.rim, RIG.rim);
    this.key.intensity = RIG.key.intensity * this.post.key; this.fill.intensity = RIG.fill.intensity * this.post.fill; this.rim.intensity = RIG.rim.intensity * this.post.rim;
  }
  setFloor(dropBelow = 0) { this.floor.position.y = this.floorY - dropBelow; }
  setPost(p: Partial<Post>) { Object.assign(this.post, p); }
  /** Project a world point / anchor to pixel coordinates in the output frame. */
  project(p: THREE.Vector3 | string) {
    const v = typeof p === 'string' ? (this.engine?.anchor(p, new THREE.Vector3()) ?? null) : p.clone(); if (!v) return null;
    v.project(this.camera); return { x: (v.x * .5 + .5) * this.w, y: (-v.y * .5 + .5) * this.h, visible: v.z < 1 };
  }
  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.quadScene, this.quadCam); }
  render() {
    const r = this.renderer, cam = this.camera, P = this.post, M = this.mats;
    r.setRenderTarget(this.sceneRT); r.clear(); r.render(this.scene, cam);
    // AO
    M.ao.uniforms.proj.value.copy(cam.projectionMatrix); M.ao.uniforms.projInv.value.copy(cam.projectionMatrixInverse);
    this.pass(M.ao, this.aoRT);
    M.aoComp.uniforms.tColor.value = this.sceneRT.texture; M.aoComp.uniforms.strength.value = P.ao; this.pass(M.aoComp, this.rtA);
    // bloom (adds into rtA)
    this.bloom.strength = P.bloom; this.bloom.radius = P.bloomRadius;
    if (P.bloom > .001) this.bloom.render(r, null as any, this.rtA, 0, false);
    // DoF
    M.dof.uniforms.tColor.value = this.rtA.texture; M.dof.uniforms.focus.value = P.focus; M.dof.uniforms.aperture.value = P.dof; this.pass(M.dof, this.rtB);
    // final
    M.final.uniforms.tColor.value = this.rtB.texture; M.final.uniforms.exposure.value = P.exposure; this.pass(M.final, null);
  }
}
let W: World | null = null;
export function getWorld(w: number, h: number) { if (!W || W.w !== w || W.h !== h) W = new World(w, h); return W; }
