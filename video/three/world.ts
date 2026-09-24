/* The video's 3D world. One instance per render tab. Everything it draws is a pure
   function of the FrameState handed to setFrame(), so any frame can be rendered alone.

   Render pipeline (all deterministic — no Math.random at render time):
     scene (HDR, MSAA, depth texture, coverage alpha)  →  SSAO (depth-reconstructed, seeded kernel) → depth-aware blur
     →  bloom (hot emissives only)  →  depth of field (depth-based gather, alpha carried)
     →  final: ACES tone map on the subject, composited over procedural drafting paper (contact AO + shadows land on
        the paper), then ink line work from the ID pass, paper grain and dither.
   post.shade fades the shaded subject in over its own line drawing (0 = pure ink drawing on paper). */
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createEngine, Engine } from '../../src/engine3d/engine';
import { InkIds, INK_GLSL } from '../../src/engine3d/ink';
import { PALETTE, RIG, INK } from '../film/theme';

export type CamState = { pos: THREE.Vector3; target: THREE.Vector3; fov: number; shift?: [number, number] };
export type Post = { ao: number; bloom: number; bloomRadius: number; dof: number; focus: number; exposure: number; key: number; fill: number; rim: number; shade: number; grid: number; ink: number };

function dot(): THREE.Texture | null {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); if (!x) return null;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.55, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
/** Soft rounded-rectangle blob (alpha) for the contact shadow under the engine. */
function contactTexture(): THREE.Texture | null {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); if (!x) return null;
  x.filter = 'blur(14px)'; x.fillStyle = '#fff'; x.beginPath(); (x as any).roundRect ? (x as any).roundRect(30, 30, 68, 68, 18) : x.rect(30, 30, 68, 68); x.fill();
  const t = new THREE.CanvasTexture(c); return t;
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
/* Depth-aware 4×4 blur of the raw AO. */
const AO_BLUR = `
  varying vec2 vUv; uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 res; uniform float strength;
  ${DEPTH_FN}
  void main(){
    float z0 = viewZ(texture2D(tDepth, vUv).x), s = 0., w = 0.;
    for (int x = -2; x < 2; x++) for (int y = -2; y < 2; y++) { vec2 o = (vec2(float(x), float(y)) + .5) / res;
      float z = viewZ(texture2D(tDepth, vUv + o).x); float k = 1. / (1. + 40. * abs(z - z0)); s += texture2D(tAO, vUv + o).x * k; w += k; }
    gl_FragColor = vec4(vec3(mix(1., s / w, strength)), 1.);
  }`;
/* Subject colour × AO (alpha = coverage, untouched). */
const AO_COMP = `
  varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tAOb;
  void main(){ vec4 c = texture2D(tColor, vUv); gl_FragColor = vec4(c.rgb * texture2D(tAOb, vUv).x, c.a); }`;
/* Depth of field: circle of confusion from depth, 64-tap golden-angle gather (scatter-as-gather weighting). Carries alpha. */
const DOF_FRAG = `
  varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res; uniform float focus; uniform float aperture;
  ${DEPTH_FN}
  float cocZ(float z){ return clamp(aperture * abs(1. - focus / z), 0., 11.); }
  void main(){
    vec4 c0 = texture2D(tColor, vUv); if (aperture < .01) { gl_FragColor = c0; return; }
    float z0 = viewZ(texture2D(tDepth, vUv).x), r0 = cocZ(z0); vec4 acc = c0; float wsum = 1.;
    for (int i = 1; i < 64; i++) {
      float fi = float(i), r = sqrt(fi / 64.) * 11., a = fi * 2.39996;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r / res;
      float zs = viewZ(texture2D(tDepth, uv).x), rs = cocZ(zs);
      float reach = zs > z0 ? min(rs, r0) : rs;
      float w = smoothstep(r - 1.5, r + 1., reach);
      acc += texture2D(tColor, uv) * w; wsum += w;
    }
    gl_FragColor = acc / wsum;
  }`;
/* Final: tone-mapped subject over drafting paper, ink, grain, dither. */
const FINAL_FRAG = `
  varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tAOb; uniform sampler2D tDepth; uniform float exposure; uniform vec2 res;
  uniform float shade; uniform float grid; uniform float inkOutline; uniform float inkCrease; uniform float inkAmt;
  uniform vec3 paperC; uniform vec3 paperEdge; uniform vec3 inkC; uniform vec3 gridC;
  ${DEPTH_FN}
  ${INK_GLSL}
  vec3 aces(vec3 x){ x *= exposure / .78; mat3 m1 = mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777);
    mat3 m2 = mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
    vec3 v = m1 * x; vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return clamp(m2 * (a / b), 0., 1.); }
  vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 paper(vec2 uv){
    vec2 q = (uv - vec2(.5, .47)) * vec2(res.x / res.y, 1.);
    vec3 c = mix(paperC, paperEdge, smoothstep(.25, 1.25, length(q)));
    // drafting dot grid (screen-fixed, like the sheet the drawing sits on), fading toward the edges
    vec2 g = gl_FragCoord.xy / (res.y / 1080.) / 28.; vec2 f = abs(fract(g) - .5) * 28.;
    float d = 1. - smoothstep(.7, 1.6, length(f));
    return mix(c, gridC, d * grid * .10 * (1. - smoothstep(.45, 1.1, length(q))));
  }
  void main(){
    vec4 s = texture2D(tColor, vUv); float a = clamp(s.a, 0., 1.);
    vec3 subj = srgb(aces(s.rgb / max(a, 1e-3)));
    vec3 pap = paper(vUv) * mix(1., texture2D(tAOb, vUv).x, .9);
    vec3 c = mix(pap, subj, a * shade);
    vec2 e = inkEdges(vUv); float k = max(e.x * inkOutline, e.y * inkCrease) * inkAmt;
    c = mix(c, inkC, k);
    c += (hash(gl_FragCoord.xy * .37) - .5) * .018;                 // paper tooth
    c += (hash(gl_FragCoord.xy) - .5) / 255.;
    gl_FragColor = vec4(c, 1.);
  }`;

export class World {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  engines = new Map<string, Engine>(); engine: Engine | null = null; dotTex: THREE.Texture | null;
  floorY = -1.5; floor: THREE.Group; w: number; h: number;
  key: THREE.DirectionalLight; fill: THREE.DirectionalLight; rim: THREE.DirectionalLight; amb: THREE.HemisphereLight;
  sceneRT: THREE.WebGLRenderTarget; rtA: THREE.WebGLRenderTarget; rtB: THREE.WebGLRenderTarget; aoRT: THREE.WebGLRenderTarget; aoBRT: THREE.WebGLRenderTarget;
  quad: THREE.Mesh; quadScene = new THREE.Scene(); quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  mats: Record<string, THREE.ShaderMaterial> = {}; bloom: UnrealBloomPass; ink: InkIds; contact: THREE.Mesh;
  post: Post = { ao: 1, bloom: .2, bloomRadius: .5, dof: 0, focus: 10, exposure: 1, key: 1, fill: 1, rim: 1, shade: 1, grid: 1, ink: 1 };
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(w, h, false);
    r.localClippingEnabled = true; r.outputEncoding = THREE.LinearEncoding; r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;             // PCF honours shadow.radius → soft contact shadows
    r.domElement.style.width = '100%'; r.domElement.style.height = '100%';
    this.camera = new THREE.PerspectiveCamera(30, w / h, .2, 120);
    this.dotTex = dot();
    const s = this.scene;
    // Soft three-point rig; positions are set per frame relative to the camera (see rig()).
    const L = (hex: string, i: number) => { const l = new THREE.DirectionalLight(new THREE.Color(hex), i); s.add(l); s.add(l.target); return l; };
    this.amb = new THREE.HemisphereLight(0xf4f1ea, 0xb9b2a6, RIG.ambient); s.add(this.amb);
    this.key = L(RIG.key.color, RIG.key.intensity); this.fill = L(RIG.fill.color, RIG.fill.intensity); this.rim = L(RIG.rim.color, RIG.rim.intensity);
    const key = this.key; key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -.0004; key.shadow.normalBias = .02; key.shadow.radius = 9;
    Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 90 });
    try {
      // bright, neutral photo-studio environment: a pale room with broad soft-boxes, so metal reads as polished, not black
      const pm = new THREE.PMREMGenerator(r), es = new THREE.Scene();
      es.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x6d6a64, side: THREE.BackSide })));
      const sb = (w: number, h: number, x: number, y: number, z: number, k: number, c = [1, 1, 1]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k * c[0], k * c[1], k * c[2]), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
      const k = RIG.env; sb(16, 6, 0, 14, -2, 2.2 * k, [1, .96, .9]); sb(4, 14, 14, 4, -7, 1.5 * k); sb(4, 14, -14, 4, 7, 1.3 * k, [.9, .95, 1.05]); sb(26, 3, 0, 1, -14, 1 * k); sb(30, 30, 0, -14, 0, .45 * k, [1, .97, .92]);
      s.environment = pm.fromScene(es, .04).texture;
    } catch (e) { /* no environment on very old GL */ }
    // Floor: an invisible shadow catcher (the paper itself is drawn in the final pass).
    const fl = this.floor = new THREE.Group(); s.add(fl);
    // (no depth write: the paper has no horizon and takes no SSAO; grounding comes from the shadow and a soft contact blob)
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .16, color: new THREE.Color('#4a3f33'), depthWrite: false } as any)); catcher.rotation.x = -Math.PI / 2; catcher.position.y = .002; catcher.receiveShadow = true; fl.add(catcher);
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: contactTexture() || undefined, color: new THREE.Color('#4a3f33'), transparent: true, opacity: .5, depthWrite: false }));
    this.contact.rotation.x = -Math.PI / 2; this.contact.position.y = .004; fl.add(this.contact);
    // --- post-processing targets ---
    const hdr = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    const MS = (THREE as any).WebGLMultisampleRenderTarget;
    this.sceneRT = r.capabilities.isWebGL2 && MS ? new MS(w, h, hdr) : new THREE.WebGLRenderTarget(w, h, hdr);
    (this.sceneRT as any).samples = 4;
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h); this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    this.rtA = new THREE.WebGLRenderTarget(w, h, hdr); this.rtB = new THREE.WebGLRenderTarget(w, h, hdr);
    this.aoRT = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.aoBRT = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.ink = new InkIds(w, h, INK.idScale);
    const rand = mulberry(20260924), kernel: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) { const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * .9 + .1).normalize(); let sc = i / 16; sc = .1 + .9 * sc * sc; kernel.push(v.multiplyScalar(sc * (.3 + .7 * rand()))); }
    const common = () => ({ res: { value: new THREE.Vector2(w, h) }, cNear: { value: .2 }, cFar: { value: 120 }, tDepth: { value: this.sceneRT.depthTexture } });
    const SM = (frag: string, u: any) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms: { ...common(), ...u }, depthTest: false, depthWrite: false });
    this.mats.ao = SM(AO_FRAG, { projInv: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() }, kernel: { value: kernel }, radius: { value: .34 } });
    this.mats.aoBlur = SM(AO_BLUR, { tAO: { value: this.aoRT.texture }, strength: { value: 1 } });
    this.mats.aoComp = SM(AO_COMP, { tColor: { value: null }, tAOb: { value: this.aoBRT.texture } });
    this.mats.dof = SM(DOF_FRAG, { tColor: { value: null }, focus: { value: 10 }, aperture: { value: 0 } });
    const P = PALETTE;
    this.mats.final = SM(FINAL_FRAG, { tColor: { value: null }, tAOb: { value: this.aoBRT.texture }, exposure: { value: 1 }, shade: { value: 1 }, grid: { value: 1 },
      inkOutline: { value: INK.outline }, inkCrease: { value: INK.crease }, inkAmt: { value: 1 }, tInkId: { value: this.ink.rt.texture }, inkIdScale: { value: INK.idScale },
      paperC: { value: hexVec(P.paper) }, paperEdge: { value: hexVec(P.paperEdge) }, inkC: { value: hexVec(P.ink) }, gridC: { value: hexVec(P.grid) } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mats.final); this.quad.frustumCulled = false; this.quadScene.add(this.quad);
    // Bloom only what is genuinely hot: threshold on the peak channel, so combustion glows bloom while lit metal does not.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), .2, .5, 2.2);
    const hp: any = (this.bloom as any).materialHighPassFilter;
    hp.fragmentShader = `uniform sampler2D tDiffuse; uniform vec3 defaultColor; uniform float defaultOpacity; uniform float luminosityThreshold; uniform float smoothWidth; varying vec2 vUv;
      void main(){ vec4 t = texture2D(tDiffuse, vUv); float v = max(t.r, max(t.g, t.b));
        gl_FragColor = mix(vec4(defaultColor, defaultOpacity), vec4(t.rgb, 0.), smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v)); }`;
    hp.uniforms.smoothWidth.value = .7; hp.needsUpdate = true;
    // the glow adds light, never coverage: keep the subject's alpha untouched so the paper composite stays exact
    Object.assign((this.bloom as any).materialCopy, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, needsUpdate: true });
  }
  useEngine(arch: string) {
    let e = this.engines.get(arch);
    if (!e) { e = createEngine(arch, { colors: PALETTE.flow as any, shadows: true, dot: this.dotTex, seed: 11, particleScale: 1.5, hatch: { color: PALETTE.hatch, amount: .38, spacing: .032 } }); e.root.visible = false; this.scene.add(e.root); this.engines.set(arch, e); }
    if (this.engine !== e) { if (this.engine) this.engine.root.visible = false; e.root.visible = true; this.engine = e; }
    this.floorY = e.e.cc.bot - .85 - .06;
    const E = e.e; this.contact.scale.set(E.cc.hw * 2 + 1.1, E.zmax - E.zmin + 2.6, 1); this.contact.position.z = 0; return e;
  }
  /** Resolve a camera target: an [x,y,z] array or a named 3D anchor ("piston:0", "crank", ...). */
  resolve(t: any, out = new THREE.Vector3()) { if (Array.isArray(t)) return out.set(t[0], t[1], t[2]); const a = this.engine?.anchor(t, out); return a || out.set(0, 1.4, 0); }
  setCamera(c: CamState) { const cam = this.camera; cam.fov = c.fov; cam.aspect = this.w / this.h; cam.position.copy(c.pos); cam.lookAt(c.target); cam.updateProjectionMatrix();
    // lens shift (off-axis projection): subject moves by shift × frame size, perspective unchanged
    const sh = c.shift ?? [0, 0]; if (sh[0] || sh[1]) { const e = cam.projectionMatrix.elements; e[8] = -2 * sh[0]; e[9] = -2 * sh[1]; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert(); }
    cam.updateMatrixWorld(true); this.rig(c.target); }
  /** Place key / fill / rim relative to the current view, so the rim always sits behind the subject. */
  rig(target: THREE.Vector3) {
    const cam = this.camera, fwd = target.clone().sub(cam.position); fwd.normalize();
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
  /** Screen-space bounding box of the engine's visible, opaque meshes (for laying out callouts beside it). */
  screenBox() {
    const bb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; if (!this.engine) return bb;
    const box = new THREE.Box3(), v = new THREE.Vector3(); this.engine.root.updateMatrixWorld(true);
    this.engine.root.traverseVisible((o: any) => { if (!o.isMesh || o.userData.noInk || o.userData.twin || (o.material && o.material.opacity < .5)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      for (let i = 0; i < 8; i++) { v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(this.camera);
        const x = (v.x * .5 + .5) * this.w, y = (-v.y * .5 + .5) * this.h; bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.y0 = Math.min(bb.y0, y); bb.y1 = Math.max(bb.y1, y); } });
    return bb;
  }
  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.quadScene, this.quadCam); }
  render() {
    const r = this.renderer, cam = this.camera, P = this.post, M = this.mats;
    r.setClearColor(0x000000, 0); r.setRenderTarget(this.sceneRT); r.clear(); r.render(this.scene, cam);
    this.ink.render(r, this.scene, cam, o => o.userData.part != null);
    // AO
    M.ao.uniforms.proj.value.copy(cam.projectionMatrix); M.ao.uniforms.projInv.value.copy(cam.projectionMatrixInverse);
    this.pass(M.ao, this.aoRT); M.aoBlur.uniforms.strength.value = P.ao; this.pass(M.aoBlur, this.aoBRT);
    M.aoComp.uniforms.tColor.value = this.sceneRT.texture; this.pass(M.aoComp, this.rtA);
    // bloom (adds into rtA)
    this.bloom.strength = P.bloom; this.bloom.radius = P.bloomRadius;
    if (P.bloom > .001) this.bloom.render(r, null as any, this.rtA, 0, false);
    // DoF
    M.dof.uniforms.tColor.value = this.rtA.texture; M.dof.uniforms.focus.value = P.focus; M.dof.uniforms.aperture.value = P.dof; this.pass(M.dof, this.rtB);
    // final
    const F = M.final.uniforms; F.tColor.value = this.rtB.texture; F.exposure.value = P.exposure; F.shade.value = P.shade; F.grid.value = P.grid; F.inkAmt.value = P.ink;
    this.pass(M.final, null);
  }
}
let W: World | null = null;
export function getWorld(w: number, h: number) { if (!W || W.w !== w || W.h !== h) W = new World(w, h); return W; }
