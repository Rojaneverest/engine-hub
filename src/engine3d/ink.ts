/* =====================================================================
   Ink — technical-illustration line work for any three.js scene.

   An ID pass draws every inkable mesh in a flat colour that encodes its
   part (+ cylinder, + section-cap flag). The composite shader then draws
   ink where the ID changes (silhouettes, part boundaries, section outlines)
   and where depth bends sharply (creases and self-overlap within one part).
   Shared by the film (video/three/world.ts) and the app (app/ui.js).
   ===================================================================== */
import * as THREE from 'three';

function hash24(s: string) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h = (h ^ (h >>> 13)) >>> 0; return (h & 0xffffff) || 1; }
const idKey = (o: THREE.Object3D) => { const u = o.userData; return (u.inkKey ?? u.part ?? o.uuid) + (u.cyl != null ? '#' + u.cyl : '') + (u.twin ? '~cap' : ''); };

export class InkIds {
  rt: THREE.WebGLRenderTarget; scale: number;
  private hidden: THREE.Object3D[] = []; private swapped: [THREE.Mesh, THREE.Material][] = [];
  constructor(w: number, h: number, scale = 1) {
    this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(Math.round(w * scale), Math.round(h * scale), { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType });
  }
  setSize(w: number, h: number) { this.rt.setSize(Math.round(w * this.scale), Math.round(h * this.scale)); }
  private idMat(m: THREE.Mesh, ghost = 0) {
    const src: any = m.material, key = ghost > 0 ? 'inkGhostMat' : 'inkMat'; let im: any = m.userData[key];
    if (!im) { const c = new THREE.Color().setHex(hash24(idKey(m))); im = m.userData[key] = new THREE.MeshBasicMaterial({ color: c, toneMapped: false } as any); }
    if (ghost > 0) im.opacity = ghost;                                      // ghost strength rides in the alpha channel
    return this.sync(im, src);
  }
  private occluder(m: THREE.Mesh) {
    let om: any = m.userData.inkOcc; if (!om) om = m.userData.inkOcc = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false } as any);
    om.opacity = 0; return this.sync(om, m.material);
  }
  private sync(im: any, src: any) {
    im.side = src.side; im.polygonOffset = !!src.polygonOffset; im.polygonOffsetFactor = src.polygonOffsetFactor || 0; im.polygonOffsetUnits = src.polygonOffsetUnits || 0;
    const cp = src.clippingPlanes || null; if (im.clippingPlanes !== cp) { im.clippingPlanes = cp; im.needsUpdate = true; }
    return im;
  }
  /** Render the ID buffer. `include(obj)` picks the inkable meshes (everything else is hidden for the pass). */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, include: (o: THREE.Object3D) => boolean) {
    this.draw(renderer, scene, camera, (o: any) => {
      if (!include(o) || o.userData.noInk) return null;
      const src: any = o.material; if (Array.isArray(src) || src.opacity < .5 || src.blending === THREE.AdditiveBlending) return null;
      return this.idMat(o);
    });
  }
  /** Ghost pass: ghosted meshes (value = line strength 0..1) are drawn with their IDs, solid meshes occlude them
      (drawn as background), everything else is hidden — so faint outlines appear only where a ghost is actually seen. */
  renderGhosts(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, ghosts: Map<THREE.Object3D, number>, solid: (o: THREE.Object3D) => boolean) {
    this.draw(renderer, scene, camera, (o: any) => {
      const k = ghosts.get(o); if (k != null) return this.idMat(o, Math.max(k, 1 / 255));
      return solid(o) && !Array.isArray(o.material) ? this.occluder(o) : null;
    });
  }
  private draw(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, pick: (o: any) => THREE.Material | null) {
    this.hidden.length = 0; this.swapped.length = 0;
    scene.traverseVisible((o: any) => {
      if (o.isMesh) { const m = pick(o); if (m) { this.swapped.push([o, o.material]); o.material = m; } else this.hidden.push(o); return; }
      if (o.isPoints || o.isLine || o.isSprite) this.hidden.push(o);
    });
    for (const o of this.hidden) o.visible = false;
    const bg = scene.background, sm = renderer.shadowMap.autoUpdate, tm = renderer.toneMapping, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    scene.background = null; renderer.shadowMap.autoUpdate = false; renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.setClearColor(cc, ca); renderer.toneMapping = tm; renderer.shadowMap.autoUpdate = sm; scene.background = bg;
    for (const o of this.hidden) o.visible = true;
    for (const [o, m] of this.swapped) o.material = m;
  }
  dispose() { this.rt.dispose(); }
}

/** GLSL: ink coverage at uv. Needs uniforms tInkId (ID target), tDepth (scene depth), res (output px), inkIdScale, cNear, cFar.
    Returns vec2(outline, crease) in 0..1. */
export const INK_GLSL = `
  uniform sampler2D tInkId; uniform float inkIdScale;
  float inkViewZ(float d){ float z = d * 2. - 1.; return 2. * cNear * cFar / (cFar + cNear - z * (cFar - cNear)); }
  vec3 inkId(vec2 uv){ return texture2D(tInkId, uv).rgb; }
  float inkDiff(vec3 a, vec3 b){ vec3 d = abs(a - b); return step(.001, d.r + d.g + d.b); }
  vec2 inkEdges(vec2 uv){
    // outlines: ID changes, evaluated on the (supersampled) ID target → antialiased coverage
    vec2 px = 1. / (res * inkIdScale); float cov = 0., sil = 0.; float n = 0.;
    for (int sx = 0; sx < 2; sx++) for (int sy = 0; sy < 2; sy++) {
      vec2 p = uv + (vec2(float(sx), float(sy)) - .5) * px * (inkIdScale > 1.5 ? 1. : 0.);
      vec3 c = inkId(p), r = inkId(p + vec2(px.x * 1.5, 0.)), u = inkId(p + vec2(0., px.y * 1.5)), l = inkId(p - vec2(px.x * 1.5, 0.)), d = inkId(p - vec2(0., px.y * 1.5));
      float e = max(max(inkDiff(c, r), inkDiff(c, u)), max(inkDiff(c, l), inkDiff(c, d)));
      float bgc = step(dot(c, vec3(1.)), .0001), bgn = step(dot(r, vec3(1.)), .0001) + step(dot(u, vec3(1.)), .0001) + step(dot(l, vec3(1.)), .0001) + step(dot(d, vec3(1.)), .0001);
      cov += e; sil += e * step(.5, bgc + bgn); n += 1.;
    }
    cov /= n; sil /= n;
    // creases: sharp bends in 1/z (planes are linear in screen space, so flat faces never ink)
    vec3 c0 = inkId(uv); float crease = 0.;
    if (dot(c0, vec3(1.)) > .0001) {
      vec2 q = 1. / res; float w = 1. / inkViewZ(texture2D(tDepth, uv).x);
      float wl = 1. / inkViewZ(texture2D(tDepth, uv - vec2(q.x, 0.)).x), wr = 1. / inkViewZ(texture2D(tDepth, uv + vec2(q.x, 0.)).x);
      float wd = 1. / inkViewZ(texture2D(tDepth, uv - vec2(0., q.y)).x), wu = 1. / inkViewZ(texture2D(tDepth, uv + vec2(0., q.y)).x);
      float lap = (abs(wl + wr - 2. * w) + abs(wd + wu - 2. * w)) / w;
      crease = smoothstep(.004, .012, lap);
    }
    return vec2(max(cov * .62, sil), crease);
  }`;

/** GLSL: faint outlines of ghosted parts from an InkIds.renderGhosts target (needs uniforms tGhostId, res, inkIdScale). */
export const GHOST_GLSL = `
  uniform sampler2D tGhostId;
  float ghostEdges(vec2 uv){
    vec2 px = 1.5 / (res * inkIdScale);
    vec4 c = texture2D(tGhostId, uv), r = texture2D(tGhostId, uv + vec2(px.x, 0.)), u = texture2D(tGhostId, uv + vec2(0., px.y)),
         l = texture2D(tGhostId, uv - vec2(px.x, 0.)), d = texture2D(tGhostId, uv - vec2(0., px.y));
    float e = max(max(inkDiff(c.rgb, r.rgb), inkDiff(c.rgb, u.rgb)), max(inkDiff(c.rgb, l.rgb), inkDiff(c.rgb, d.rgb)));
    return e * max(max(c.a, max(r.a, u.a)), max(l.a, d.a));
  }`;
