/* =====================================================================
   Parametric 3D engine — instance based, deterministic.
   One EngineState in → one pose + appearance out. Used by the
   interactive app (src → app bundle) and by every video shot.

   Housings are closed solids with real cavities (bores, a hollow crankcase,
   ported heads, a hollow cam cover), so any clip plane shows a true section:
   each clipped solid carries a back-face "twin" that draws the cut face,
   hatched in world space on the plane that made the cut.
   ===================================================================== */
import * as THREE from 'three';
import { G, DEG, mod, clamp, lerp, pistonS, dsdphi, pressure, burnFrac, intakeLift, exhaustLift, IC, EC, VT, sweptFrac,
  deriveEngine, intakeLiftInt, exhaustLiftInt, injectInt, rng, hash01 } from '../core/sim';
import { PARTS_INFO } from '../core/content';

export type Colors = Record<'air'|'fuel'|'comp'|'power'|'exhaust'|'oil'|'brass'|'section', string>;
export type EngineState = {
  theta: number;
  explode?: number | Record<string, number>;   // 0..1 overall, or per layer (cover,cams,valves,head,gasket,pist,exh,crank,mb,pan,op,fw,tm,tcov,intake)
  view?: 'full'|'cutaway'|'xray';
  cut?: number;          // 0..1 cutaway sweep (1 = sliced through the cylinder axes)
  xray?: number;         // 0..1 housing transparency
  flow?: string; flowAmt?: number; flowDim?: number;   // flowDim: how much unrelated parts fade (defaults to flowAmt)
  fade?: Record<string, number>;                       // per-part opacity multiplier (e.g. hide the timing drive for a shot); 'part|key' fades one finish (e.g. 'timing|chain')
  sel?: string|null; hover?: string|null; isolate?: boolean; pulse?: number;
  hidden?: Set<string>|string[];
  focusCyl?: number; focus?: number;           // dim the other cylinders' moving parts
  slice?: { z: number; amount: number } | null; // transverse section at engine-z (removes everything in front of it)
  ghost?: { keep: string[]; amount: number } | null;
  glow?: { part: string; cyl?: number; amount: number; color?: string }[];
  charge?: { cyl: number; amount: number } | null;  // particle cloud of the trapped charge (fills on intake)
  gas?: number;          // 0..1 visibility of the in-cylinder gas volumes (default 1)
};
export const HOUSING = new Set(['block','liner','head','gasket','cover','pan','tcover']);
export const SEMI = new Set(['intake','exhaust','filter','throttle']);
export const FLOW_PARTS: Record<string,string[]> = {
  air:['filter','throttle','intake','intakevalve','piston'], fuel:['injector','piston'],
  exhaust:['exhaustvalve','exhaust','piston'], oil:['pan','oilpump','crank','mainbearing','rodbearing','camshaft','tappet'],
  power:['piston','rod','crank','flywheel','rodbearing','mainbearing'] };
const PER_CYL = new Set(['piston','rod','intakevalve','exhaustvalve','spring','tappet','plug','rodbearing']);
/** Default finishes [colour, metalness, roughness]: cast-aluminium housings, graphite cover, machined steel internals.
    Deliberately low-chroma so the functional accent colours (air, fuel, heat) own the saturation. */
export const PART_LOOK: Record<string,[string,number,number]> = {
  block:['#b9b5ad',.1,.7], liner:['#b9bab8',.5,.34], head:['#b1ada5',.1,.68], gasket:['#5d6166',.35,.5], cover:['#565b62',.12,.5],
  tcover:['#b3afa6',.1,.66], pan:['#a4a19a',.15,.6],
  piston:['#d3d2ce',.5,.34], rings:['#55595f',.6,.4], rod:['#8f959c',.55,.38], rodbearing:['#c7a462',.55,.4], crank:['#9ca2a9',.6,.34],
  mainbearing:['#c7a462',.55,.4], camshaft:['#a5aaaf',.6,.34], intakevalve:['#d6d7d6',.55,.3], exhaustvalve:['#b5a595',.45,.4],
  spring:['#5d6976',.45,.45], tappet:['#babdc0',.55,.32], timing:['#6c7177',.55,.42], plug:['#ede9e0',.04,.4], injector:['#4a4e54',.35,.45],
  intake:['#4b4f56',.05,.6], throttle:['#a4a8ac',.55,.38], filter:['#3b3e43',.04,.8], exhaust:['#7f7167',.5,.5],
  oilpump:['#8e9399',.45,.42], flywheel:['#6c7178',.55,.4] };
const lin = (hex: string) => new THREE.Color(hex).convertSRGBToLinear();
const V3 = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const zCyl=(r:number,len:number,seg=24,open=false)=>{ const g=new THREE.CylinderGeometry(r,r,len,seg,1,open); g.rotateX(Math.PI/2); return g; };
const yCyl=(r:number,len:number,seg=24,open=false)=>new THREE.CylinderGeometry(r,r,len,seg,1,open);
function rbox(w:number,h:number,d:number,r:number,rounded:boolean){
  if(!rounded) return new THREE.BoxGeometry(w,h,d);
  const b=Math.min(r*.5,.02), W=w-2*b, H=h-2*b, R=Math.min(r,W/2-.001,H/2-.001), s=new THREE.Shape();
  s.moveTo(-W/2+R,-H/2); s.lineTo(W/2-R,-H/2); s.quadraticCurveTo(W/2,-H/2,W/2,-H/2+R); s.lineTo(W/2,H/2-R); s.quadraticCurveTo(W/2,H/2,W/2-R,H/2);
  s.lineTo(-W/2+R,H/2); s.quadraticCurveTo(-W/2,H/2,-W/2,H/2-R); s.lineTo(-W/2,-H/2+R); s.quadraticCurveTo(-W/2,-H/2,-W/2+R,-H/2);
  const g=new THREE.ExtrudeGeometry(s,{depth:d-2*b,bevelEnabled:true,bevelSize:b,bevelThickness:b,bevelSegments:2,curveSegments:5});
  g.translate(0,0,-(d-2*b)/2); g.computeVertexNormals(); return g;
}
/* ---- 2D profile helpers (closed outlines → closed solids, so sections cap correctly) ---- */
/** Rounded rectangle outline from (x0,y0) to (x1,y1). */
function rrectPath(p:THREE.Path, x0:number,y0:number,x1:number,y1:number,r=0){ r=Math.min(r,(x1-x0)/2-1e-4,(y1-y0)/2-1e-4);
  if(r<=0){ p.moveTo(x0,y0); p.lineTo(x1,y0); p.lineTo(x1,y1); p.lineTo(x0,y1); p.lineTo(x0,y0); return p; }
  p.moveTo(x0+r,y0); p.lineTo(x1-r,y0); p.quadraticCurveTo(x1,y0,x1,y0+r); p.lineTo(x1,y1-r); p.quadraticCurveTo(x1,y1,x1-r,y1);
  p.lineTo(x0+r,y1); p.quadraticCurveTo(x0,y1,x0,y1-r); p.lineTo(x0,y0+r); p.quadraticCurveTo(x0,y0,x0+r,y0); return p; }
const rrect=(x0:number,y0:number,x1:number,y1:number,r=0)=>rrectPath(new THREE.Shape(),x0,y0,x1,y1,r) as THREE.Shape;
const hole=(x:number,y:number,r:number)=>{ const h=new THREE.Path(); h.absarc(x,y,r,0,Math.PI*2,true); return h; };
function polyShape(pts:number[][]){ const s=new THREE.Shape(); pts.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y)); s.closePath(); return s; }
const EXT=(depth:number,bevel:number,curve=24)=>({depth:Math.max(.001,depth-2*bevel),bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:curve});
/** Extrude an outline drawn in the XZ plane (shape y = −z) upward from y0 to y1. */
function slabY(shapes:THREE.Shape|THREE.Shape[],y0:number,y1:number,bevel=0){ const g=new THREE.ExtrudeGeometry(shapes,EXT(y1-y0,bevel)); g.rotateX(-Math.PI/2); g.translate(0,y0+bevel,0); return g; }
/** Extrude an outline drawn in the XY plane along z from z0 to z1. */
function slabZ(shapes:THREE.Shape|THREE.Shape[],z0:number,z1:number,bevel=0,curve=24){ const g=new THREE.ExtrudeGeometry(shapes,EXT(z1-z0,bevel,curve)); g.translate(0,0,z0+bevel); return g; }
/** Extrude an outline drawn in the (−z, y) plane along x from x0 to x1. */
function slabX(shapes:THREE.Shape|THREE.Shape[],x0:number,x1:number,bevel=0){ const g=new THREE.ExtrudeGeometry(shapes,EXT(x1-x0,bevel)); g.rotateY(Math.PI/2); g.translate(x0+bevel,0,0); return g; }

class Helix extends THREE.Curve<THREE.Vector3>{ r:number; t:number; constructor(r:number,t:number){super();this.r=r;this.t=t;}
  getPoint(u:number,tg=new THREE.Vector3()){ const a=u*this.t*Math.PI*2; return tg.set(Math.cos(a)*this.r,u,Math.sin(a)*this.r); } }
function lobeGeo(center:number,liftFn:(c:number)=>number){ const sh=new THREE.Shape();
  for(let i=0;i<=120;i++){ const psi=-180+i*3, rr=G.camBase+G.maxLift*liftFn(center+2*psi); const x=rr*Math.sin(psi*DEG), y=-rr*Math.cos(psi*DEG); i?sh.lineTo(x,y):sh.moveTo(x,y); }
  const g=new THREE.ExtrudeGeometry(sh,{depth:.12,bevelEnabled:false,curveSegments:4}); g.translate(0,0,-.06); return g; }
/** Crank web: pin boss plus a counterweight sector, chamfered. */
function webGeo(){ const r=G.r, sh=new THREE.Shape(); sh.moveTo(-.21,r); sh.absarc(0,r,.21,Math.PI,0,true);
  const a0=-24*DEG, a1=-156*DEG; sh.lineTo(.6*Math.cos(a0),.6*Math.sin(a0)); sh.absarc(0,0,.6,a0,a1,true); sh.lineTo(-.21,r);
  const g=new THREE.ExtrudeGeometry(sh,{depth:.06,bevelEnabled:true,bevelThickness:.014,bevelSize:.014,bevelSegments:2,curveSegments:16}); g.translate(0,0,-.03); return g; }
function rotorGeo(){ const sh=new THREE.Shape(); for(let i=0;i<=100;i++){ const a=i/100*Math.PI*2, rr=.17+.03*Math.cos(5*a); const x=rr*Math.cos(a), y=rr*Math.sin(a); i?sh.lineTo(x,y):sh.moveTo(x,y); }
  sh.holes.push(hole(0,0,.1)); const g=new THREE.ExtrudeGeometry(sh,{depth:.05,bevelEnabled:false}); g.translate(0,0,-.025); return g; }
/** Connecting rod as an I-beam: a flanged frame (eyes + rails) and a thin central web. Local origin = small end, big end at (0,−L). */
function rodGeos(){ const L=G.L, r1=.12, r2=.26, ny=(r2-r1)/L, nx=Math.sqrt(1-ny*ny), a=Math.atan2(ny,nx);
  const outline=(p:THREE.Path)=>{ p.moveTo(r1*nx,r1*ny); p.absarc(0,0,r1,a,Math.PI-a,false); p.lineTo(-r2*nx,-L+r2*ny); p.absarc(0,-L,r2,Math.PI-a,2*Math.PI+a,false); p.lineTo(r1*nx,r1*ny); return p; };
  // shank pocket: the region between the eyes, inset from the rails
  const t=.032, yT=-r1-.05, yB=-L+r2+.05, wT=(r1*nx+(r2*nx-r1*nx)*((-yT)/L))-t, wB=(r1*nx+(r2*nx-r1*nx)*((-yB)/L))-t;
  const pocket=[[-wT,yT],[wT,yT],[wB,yB],[-wB,yB]];
  const frame=outline(new THREE.Shape()) as THREE.Shape; frame.holes.push(hole(0,0,.078),hole(0,-L,.172));
  const ph=new THREE.Path(); pocket.slice().reverse().forEach(([x,y],i)=>i?ph.lineTo(x,y):ph.moveTo(x,y)); ph.closePath(); frame.holes.push(ph);
  const fg=new THREE.ExtrudeGeometry(frame,{depth:.07,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:1,curveSegments:14}); fg.translate(0,0,-.035);
  const wg=new THREE.ExtrudeGeometry(polyShape(pocket.map(([x,y])=>[x*1.02+(x>0?.004:-.004),y])),{depth:.026,bevelEnabled:false}); wg.translate(0,0,-.013);
  return { frame:fg, web:wg }; }
/** Piston: a turned cup (crown, ring lands and grooves, skirt), lathed about y. Origin = wrist-pin axis. */
function pistonGeo(){ const R=G.pistonR, top=G.crown, bot=-G.skirt;
  const p:[number,number][]=[[0,top+.012],[.2,top+.012],[R-.03,top],[R,top-.025],[R,.185],[R-.02,.185],[R-.02,.165],[R,.165],[R,.14],[R-.02,.14],[R-.02,.12],[R,.12],
    [R,.095],[R-.024,.095],[R-.024,.07],[R,.07],[R,.04],[R-.006,.02],[R-.006,bot+.03],[R-.02,bot],[R-.06,bot],[R-.06,top-.1],[0,top-.1]];
  const g=new THREE.LatheGeometry(p.slice().reverse().map(([x,y])=>new THREE.Vector2(x,y)),48); g.computeVertexNormals(); return g; }
/** Liner sleeve: a closed ring (inner = bore). */
function linerGeo(y0:number,y1:number){ const R=G.boreR, T=.035; const g=new THREE.LatheGeometry([[R,y0],[R+T,y0],[R+T,y1],[R,y1],[R,y0]].map(([x,y])=>new THREE.Vector2(x,y)),48); g.computeVertexNormals(); return g; }
function gearShape(n:number,r0:number,r1:number,holeR:number){ const s=new THREE.Shape();
  for(let i=0;i<n;i++){ const a=i/n*Math.PI*2, d=Math.PI*2/n; for(const [f,r] of [[0,r0],[.18,r1],[.5,r1],[.68,r0]] as [number,number][]){ const q=a+f*d; const x=r*Math.cos(q), y=r*Math.sin(q); i||f?s.lineTo(x,y):s.moveTo(x,y); } }
  s.closePath(); if(holeR>0) s.holes.push(hole(0,0,holeR)); return s; }
function hull2(pts:any[]){ pts=pts.slice().sort((a,b)=>a.x-b.x||a.y-b.y); const cr=(o:any,a:any,b:any)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lo:any[]=[],up:any[]=[]; for(const p of pts){ while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); }
  for(let i=pts.length-1;i>=0;i--){ const p=pts[i]; while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up); }
export function relatedSet(part?:string|null){ const s=new Set<string>(); if(!part||!PARTS_INFO[part]) return s; for(const r of PARTS_INFO[part].rel) s.add(r);
  for(const k in PARTS_INFO) if(PARTS_INFO[k].rel.includes(part)) s.add(k); return s; }
const CUT_SWEEP = 1.35;
const SLICE_PARTS = new Set(['block','liner','head','gasket','cover','pan','crank','mainbearing','tcover']);

/* ---- Section caps: a back-face twin of each clipped solid, drawn flat in the section colour and hatched
   in world space. The hatch is laid out on the clip plane the view ray actually crossed, so it stays
   glued to the cut face as the camera moves (no "shower-door" swimming). ---- */
const CAP_VERT_DECL = 'varying vec3 vCapWP;\n';
const CAP_FRAG = `
  varying vec3 vCapWP; uniform vec4 capPlanes[2]; uniform int capN; uniform vec3 capInk; uniform float capAmt; uniform float capSpacing;
  vec3 capHatch(vec3 base){
    if (capN == 0 || capAmt <= 0.) return base;
    vec3 d = vCapWP - cameraPosition; float best = -1e9; vec3 n = vec3(0., 0., 1.);
    for (int i = 0; i < 2; i++) { if (i >= capN) break; vec3 pn = capPlanes[i].xyz; float s = dot(pn, cameraPosition) + capPlanes[i].w; float dn = dot(pn, d);
      if (s < 0. && abs(dn) > 1e-5) { float t = -s / dn; if (t > best) { best = t; n = pn; } } }
    vec3 p = best > -1e8 ? cameraPosition + d * best : vCapWP;
    vec3 u = normalize(abs(n.y) < .9 ? cross(n, vec3(0., 1., 0.)) : cross(n, vec3(1., 0., 0.))), v = cross(n, u);
    float c = (dot(p, u) + dot(p, v)) / capSpacing, w = fwidth(c);
    float line = 1. - smoothstep(.16 - w, .16 + w, abs(fract(c) - .5) * 2. - .68);
    line *= clamp(1.6 - w * 3., 0., 1.);              // fade the hatch out where it would alias (far away)
    return mix(base, capInk, line * capAmt);
  }`;
function capMaterial(color:THREE.Color){
  const m:any=new THREE.MeshBasicMaterial({color,side:THREE.BackSide,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:4});
  const u={ capPlanes:{value:[new THREE.Vector4(),new THREE.Vector4()]}, capN:{value:0}, capInk:{value:new THREE.Color(0,0,0)}, capAmt:{value:.28}, capSpacing:{value:.034} };
  m.userData.capU=u;
  m.onBeforeCompile=(sh:any)=>{ Object.assign(sh.uniforms,u);
    sh.vertexShader=CAP_VERT_DECL+sh.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n  vCapWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader=CAP_FRAG+sh.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb = capHatch(gl_FragColor.rgb);\n#include <tonemapping_fragment>'); };
  m.customProgramCacheKey=()=>'engine-cap';
  return m; }

/** Softly illustrated fuel spray: dense at the nozzle, fading toward the charge, with a feathered silhouette and faint jet streaks. */
function softSprayMaterial(color:THREE.Color){
  const m:any=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.35,depthWrite:false,side:THREE.DoubleSide});
  m.onBeforeCompile=(sh:any)=>{
    sh.vertexShader='varying vec3 vSprayN; varying vec3 vSprayV; varying vec3 vSprayP;\n'+sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vSprayN = normalize(normalMatrix * normal); vSprayV = normalize(-mvPosition.xyz); vSprayP = position;');
    sh.fragmentShader='varying vec3 vSprayN; varying vec3 vSprayV; varying vec3 vSprayP;\n'+sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',
      `vec4 diffuseColor = vec4( diffuse, opacity );
      float sprayT = clamp(vSprayP.y / .45 + .5, 0., 1.);                                  // 0 at the open end, 1 at the nozzle
      float sprayRim = smoothstep(.05, .75, abs(dot(normalize(vSprayN), normalize(vSprayV))));
      float sprayJets = .72 + .28 * sin(atan(vSprayP.z, vSprayP.x) * 9.);
      diffuseColor.a *= sprayRim * sprayJets * smoothstep(0., .55, sprayT) * (1. - .45 * smoothstep(.8, 1., sprayT)) * 1.6;`); };
  m.customProgramCacheKey=()=>'engine-soft-spray';
  return m; }

export function createEngine(key: string, opts: { colors: Colors; rounded?: boolean; shadows?: boolean; dot?: THREE.Texture|null; seed?: number;
  /** Finish overrides [colour, metalness, roughness] by part, or by 'part|key' for one finish of a part (e.g. 'timing|chain'). */
  look?: Record<string,[string,number,number]>;
  /** Close-up detail for interactive viewing: denser spring, ring and chain geometry, rounded chain links, a soft fuel spray. */
  fine?: boolean;
  particleScale?: number; hatch?: { color?: string; amount?: number; spacing?: number } }) {
  const C: any = {}; for (const k in opts.colors) C[k] = lin((opts.colors as any)[k]);
  const rounded = opts.rounded !== false, fine = !!opts.fine, rand = rng(opts.seed ?? 7);
  const parts = new Map<string, {meshes:THREE.Mesh[]; mats:Set<THREE.Material>; op:number}>();
  const matCache = new Map<string, any>();
  const R: any = { cyl:[], banks:[], twins:[], twinMats:{}, layers:{} as Record<string,THREE.Group[]>, camSprockets:[], links:[], flows:{}, journals:[], anchors:{} };
  const P = (part:string) => { if(!parts.has(part)) parts.set(part,{meshes:[],mats:new Set(),op:1}); return parts.get(part)!; };
  function mat(part:string,key='',o:any={}){ const k=part+'|'+key; if(matCache.has(k)) return matCache.get(k);
    const lk=opts.look&&opts.look[k], [c,m,r]=lk||(opts.look&&opts.look[part])||PART_LOOK[part];
    const mt:any=new THREE.MeshStandardMaterial({color:lin(lk?c:o.color||c),metalness:lk?m:o.metal??m,roughness:lk?r:o.rough??r});
    mt.userData={part,key,clip:null,clipOn:false,cyl:o.cyl??null}; matCache.set(k,mt); P(part).mats.add(mt); return mt; }
  function mesh(geo:THREE.BufferGeometry,part:string,key:string,parent:THREE.Object3D,x=0,y=0,z=0,o?:any){
    const m=new THREE.Mesh(geo,mat(part,key,o)); m.position.set(x,y,z); m.userData.part=part; if(o&&o.cyl!=null) m.userData.cyl=o.cyl;
    if(opts.shadows){ m.castShadow=true; m.receiveShadow=true; } P(part).meshes.push(m); parent.add(m); return m; }
  const hatch={ color:opts.hatch?.color??'#2a2621', amount:opts.hatch?.amount??.3, spacing:opts.hatch?.spacing??.034 };
  function addTwin(m:any){ const pl=m.material.userData.clip; const k=pl?'p'+planes.indexOf(pl):'none';
    let tm=R.twinMats[k]; if(!tm){ tm=R.twinMats[k]=capMaterial(C.section); const u=tm.userData.capU; u.capInk.value.copy(lin(hatch.color)); u.capAmt.value=hatch.amount; u.capSpacing.value=hatch.spacing;
      tm.userData.clip=pl; tm.userData.clipOn=false; }
    const t=new THREE.Mesh(m.geometry,tm); t.userData.part=m.userData.part; t.userData.twin=true; t.visible=false; m.add(t); R.twins.push(t); return t; }
  /** A housing solid: mesh + section twin. */
  const solid=(geo:THREE.BufferGeometry,part:string,key:string,parent:THREE.Object3D,x=0,y=0,z=0,o?:any)=>{ const m=mesh(geo,part,key,parent,x,y,z,o); addTwin(m); return m; };
  const planes:THREE.Plane[]=[];
  function planeRemoving(dx:number,dy:number){ const p=new THREE.Plane(new THREE.Vector3(-dx,-dy,0).normalize(),0); planes.push(p); return p; }
  function bankPlane(bang:number){ const lx=Math.cos(bang*DEG), ly=-Math.sin(bang*DEG); const s=(lx*.64+ly*.42)>=0?1:-1; return planeRemoving(lx*s,ly*s); }
  function tube(points:THREE.Vector3[],r:number,part:string,key:string,parent:THREE.Object3D,seg=40,o?:any){ const cv=new THREE.CatmullRomCurve3(points,false,'centripetal');
    const t=mesh(new THREE.TubeGeometry(cv,seg,r,14,false),part,key,parent,0,0,0,o); const sg=new THREE.SphereGeometry(r,14,8);
    for(const p of [points[0],points[points.length-1]]){ const c=new THREE.Mesh(sg,t.material); c.position.copy(p); c.userData.part=part; if(opts.shadows){ c.castShadow=true; c.receiveShadow=true; } P(part).meshes.push(c); parent.add(c); }
    return t; }
  function marker(name:string,parent:THREE.Object3D,x:number,y:number,z:number){ const o=new THREE.Object3D(); o.position.set(x,y,z); parent.add(o); R.anchors[name]=o; return o; }
  const noInk=(o:THREE.Object3D)=>{ o.userData.noInk=true; return o; };

  const e:any = deriveEngine(key);
  const root = new THREE.Group(); root.position.z = -(e.zmin+e.zmax)/2;
  const zT=e.zT=e.zmin-.62, zmid=(e.zmin+e.zmax)/2, Lz=e.zmax-e.zmin+1;
  const isFlat=e.isFlat=e.banks.some((b:number)=>Math.abs(b)>=80), isV=e.isV=e.banks.length>1&&!isFlat, inline=!isFlat&&!isV;
  const cc=e.cc=isFlat?{hw:.72,top:.62,bot:-.62}:isV?{hw:1.05,top:.8,bot:-.35}:{hw:.78,top:.6,bot:-.35};
  const layer=(name:string,parent:THREE.Object3D,off:THREE.Vector3)=>{ const g=new THREE.Group(); g.userData.explode=off; g.userData.layer=name; parent.add(g); (R.layers[name]??=[]).push(g); return g; };
  const gPlane=planeRemoving(1,0);
  const slicePlane=new THREE.Plane(new THREE.Vector3(0,0,1),0); planes.push(slicePlane);
  const Z0=e.zmin-.5, Z1=e.zmax+.5;                                  // crankcase extent along the crank

  /* crankshaft (built first: the crankcase bulkheads sit on its main journals) */
  const crankL=layer('crank',root,V3(0,-1.6,0)); const crankRot=R.crankRot=new THREE.Group(); crankL.add(crankRot);
  const pins=e.cyls.map((c:any)=>({z:c.z,t:c.throw})).sort((a:any,b:any)=>a.z-b.z), groups:any[]=[];
  for(const p of pins){ const g=groups[groups.length-1]; if(g&&Math.abs(mod(g.t-p.t+180,360)-180)<1&&p.z-g.z1<.35) g.z1=p.z; else groups.push({t:p.t,z0:p.z,z1:p.z}); }
  const PH=.1, WT=.088, wg=webGeo();
  const spans=groups.map((g:any)=>{ const tr=g.t*DEG, px=G.r*Math.sin(tr), py=G.r*Math.cos(tr);
    solid(zCyl(.155,g.z1-g.z0+2*PH,28),'crank','',crankRot,px,py,(g.z0+g.z1)/2);
    for(const wz of [g.z0-PH-WT/2,g.z1+PH+WT/2]){ const w=solid(wg,'crank','',crankRot,0,0,wz); w.rotation.z=-tr; }
    return [g.z0-PH-WT,g.z1+PH+WT]; });
  const jr=[[e.zmin-.45,spans[0][0]]]; for(let i=0;i<spans.length-1;i++) jr.push([spans[i][1],spans[i+1][0]]); jr.push([spans[spans.length-1][1],e.zmax+.45]);
  const mbL=layer('mb',root,V3(0,-.9,0));
  for(const [a,b] of jr){ const len=b-a; if(len<=.001) continue; solid(zCyl(.19,len,28),'crank','',crankRot,0,0,(a+b)/2);
    const zc=(a+b)/2; R.journals.push(zc); mesh(zCyl(.205,Math.min(.16,len*.8),28,true),'mainbearing','',mbL,0,0,zc); }
  mat('mainbearing').side=THREE.DoubleSide;
  // nose (through the timing cover) with a harmonic-damper pulley, and the flywheel flange at the rear
  solid(zCyl(.13,(e.zmin-.45)-(zT-.3),20),'crank','',crankRot,0,0,((e.zmin-.45)+(zT-.3))/2);
  solid(zCyl(.27,.1,40),'crank','pulley',crankRot,0,0,zT-.27,{color:'#7d838a'}); solid(zCyl(.2,.05,32),'crank','pulley',crankRot,0,0,zT-.345,{color:'#7d838a'});
  mesh(new THREE.TorusGeometry(.27,.012,6,48),'crank','pulley',crankRot,0,0,zT-.25,{color:'#7d838a'});
  solid(zCyl(.15,.35,20),'crank','',crankRot,0,0,e.zmax+.62); solid(zCyl(.3,.06,36),'crank','',crankRot,0,0,e.zmax+.76);
  const cs=mesh(zCyl(.11,.06,24),'timing','',crankRot,0,0,zT); mesh(new THREE.BoxGeometry(.025,.07,.07),'timing','mark',cs,0,.075,0,{color:'#e8e4dc',metal:.1,rough:.5});
  marker('crank',crankL,0,0,zmid);

  /* crankcase: side walls, deck plate, end walls and main-bearing bulkheads — hollow, open to the sump */
  const blockG=layer('block',root,V3());
  mat('block','g').userData.clip=gPlane;
  { const wT=.09, hw=cc.hw, top=cc.top, bot=cc.bot, dk=.1;
    for(const sx of [-1,1]) solid(rbox(wT,top-bot,Z1-Z0,.03,rounded),'block','g',blockG,sx*(hw-wT/2),(top+bot)/2,(Z0+Z1)/2);
    const deck=rrect(-hw,-Z1,hw,-Z0,.05);
    if(inline) for(const c of e.cyls) deck.holes.push(hole(0,-c.z,G.boreR+.035));
    solid(slabY(deck,top-dk,top,.008),'block','g',blockG);
    const endW=(z0:number,z1:number)=>{ const s=rrect(-hw,bot,hw,top,.05); s.holes.push(hole(0,0,.2)); solid(slabZ(s,z0,z1,.01),'block','g',blockG); };
    endW(Z0,Z0+.14); endW(Z1-.14,Z1);
    for(let i=1;i<jr.length-1;i++){ const [a,b]=jr[i], zc=(a+b)/2, t=Math.min(.3,(b-a)*.6); if(t<.06) continue;
      const s=rrect(-(hw-wT),bot,hw-wT,top-dk+.01,0); s.holes.push(hole(0,0,.212)); solid(slabZ(s,zc-t/2,zc+t/2),'block','g',blockG); }
    // stiffening ribs and the pan-rail flange along both sides
    for(const sx of [-1,1]){ solid(new THREE.BoxGeometry(.05,.07,Z1-Z0),'block','g',blockG,sx*(hw+.02),bot+.035,(Z0+Z1)/2);
      for(const zc of R.journals) solid(new THREE.BoxGeometry(.035,(top-bot)*.7,.07),'block','g',blockG,sx*(hw+.012),bot+(top-bot)*.42,zc); }
  }
  /* sump: a pressed tray with a flange lip, open to the crankcase, with a drain plug */
  const panL=layer('pan',root,V3(0,-2.6,0)); mat('pan','g').userData.clip=gPlane;
  { const hw=cc.hw, b=cc.bot-.006, H=.85, t=.06, fl=.05;
    const prof=polyShape([[-hw,b],[-hw,b-fl],[-(hw-.05),b-fl],[-(hw-.05),b-H+.1],[-(hw-.15),b-H],[hw-.15,b-H],[hw-.05,b-H+.1],[hw-.05,b-fl],[hw,b-fl],[hw,b],
      [hw-.05-t,b],[hw-.05-t,b-H+.1+t*.4],[hw-.15-t*.4,b-H+t],[-(hw-.15-t*.4),b-H+t],[-(hw-.05-t),b-H+.1+t*.4],[-(hw-.05-t),b]]);
    const z0=Z0+.05, z1=Z1-.05; solid(slabZ(prof,z0+t,z1-t,0,4),'pan','g',panL);
    const cap=polyShape([[-hw,b],[-hw,b-fl],[-(hw-.05),b-fl],[-(hw-.05),b-H+.1],[-(hw-.15),b-H],[hw-.15,b-H],[hw-.05,b-H+.1],[hw-.05,b-fl],[hw,b-fl],[hw,b]]);
    solid(slabZ(cap,z0,z0+t,0,4),'pan','g',panL); solid(slabZ(cap,z1-t,z1,0,4),'pan','g',panL);
    mesh(yCyl(.045,.05,6),'pan','plug',panL,0,b-H-.02,z1-.35,{color:'#6f747a',metal:.6,rough:.35}); mat('pan','plug').userData.clip=gPlane;
    marker('pan',panL,0,b-.45,zmid); }

  /* flywheel: drilled disc with a starter ring gear */
  const fwL=layer('fw',root,V3(0,0,1.8)); const fw=R.fwRot=new THREE.Group(); fw.position.z=e.zmax+.84; fwL.add(fw);
  { const disc=new THREE.Shape(); disc.absarc(0,0,.98,0,Math.PI*2,false); disc.holes.push(hole(0,0,.12));
    for(let i=0;i<6;i++){ const a=(i+.5)/6*Math.PI*2; disc.holes.push(hole(.62*Math.cos(a),.62*Math.sin(a),.11)); }
    mesh(slabZ(disc,-.05,.05,.01,40),'flywheel','',fw);
    // curveSegments only affects the bore circle (teeth are straight segments); 2 collapses the bore to a slit
    mesh(slabZ(gearShape(96,.97,1.05,.94),-.06,.06,0,fine?64:2),'flywheel','',fw);
    for(let i=0;i<6;i++){ const a=i/6*Math.PI*2; mesh(zCyl(.04,.13,12),'flywheel','bolt',fw,.24*Math.cos(a),.24*Math.sin(a),0,{color:'#8c9197'}); }
    mesh(new THREE.BoxGeometry(.05,.1,.12),'flywheel','mark',fw,0,.86,0,{color:'#e8e4dc',metal:.1,rough:.5}); }
  marker('flywheel',fwL,0,.7,e.zmax+.84);
  /* oil pump on the crank nose, with its pickup into the sump */
  const opL=layer('op',root,V3(0,-2.1,-.6)); const zP=Z0-.035;
  mesh(zCyl(.3,.02,32),'oilpump','',opL,0,0,zP-.035);
  const rim=mesh(zCyl(.3,.06,32,true),'oilpump','rim',opL,0,0,zP); rim.material.side=THREE.DoubleSide;
  const rot=R.pumpRot=new THREE.Group(); rot.position.z=zP; opL.add(rot); mesh(rotorGeo(),'oilpump','rotor',rot,0,0,0,{color:'#b4bbc2'});
  tube([V3(0,-.28,zP),V3(0,cc.bot-.3,zP+.12),V3(0,cc.bot-.72,e.zmin+.25)],.04,'oilpump','',opL,20);
  mesh(yCyl(.14,.03,20),'oilpump','',opL,0,cc.bot-.74,e.zmin+.25);

  /* banks */
  const toEng=(b:any,x:number,y:number,z:number)=>V3(x,y,z).applyMatrix4(b.group.matrix);
  e.banks.forEach((bang:number,bi:number)=>buildBank(bi,bang));

  /* timing chain behind a cast timing cover */
  const tmL=layer('tm',root,V3(0,0,-1.6)); const circ:any[]=[], camPts:any[]=[];
  const addC=(arr:any[],x:number,y:number,r:number,n=24)=>{ for(let i=0;i<n;i++){ const a=i/n*Math.PI*2; arr.push({x:x+r*Math.cos(a),y:y+r*Math.sin(a)}); } };
  addC(circ,0,0,.135); for(const b of R.banks) for(const sd of [1,-1]){ const p=toEng(b,sd*G.valveX,G.camY,0); addC(circ,p.x,p.y,.25); camPts.push(p); }
  const hp=hull2(circ).map((p:any)=>V3(p.x,p.y,zT));
  const chain=R.chainCurve=new THREE.CatmullRomCurve3(hp,true,'centripetal'); R.chainLen=chain.getLength();
  mesh(new THREE.TubeGeometry(chain,fine?320:200,.018,fine?10:6,true),'timing','chain',tmL,0,0,0,{color:'#3c4249'});
  const lg=fine?rbox(.07,.03,.075,.012,true):new THREE.BoxGeometry(.07,.03,.075); const nL=Math.round(R.chainLen/.12);
  for(let i=0;i<nL;i++) R.links.push(mesh(lg,'timing','link',tmL,0,0,0,{color:'#8a929b'}));
  marker('timing',tmL,hp[0].x*.5,G.camY*.5,zT);
  const tcL=layer('tcov',root,V3(0,0,-2.6)); mat('tcover','g').userData.clip=gPlane;
  { const outer:any[]=[], inner:any[]=[]; addC(outer,0,0,.3,32); addC(inner,0,0,.25,32);
    for(const p of camPts){ addC(outer,p.x,p.y,.36,32); addC(inner,p.x,p.y,.31,32); }
    const ho=hull2(outer), hi=hull2(inner);
    const plate=polyShape(ho.map((p:any)=>[p.x,p.y])); plate.holes.push(hole(0,0,.15));
    solid(slabZ(plate,zT-.16,zT-.07,.02,6),'tcover','g',tcL);
    const ring=polyShape(ho.map((p:any)=>[p.x,p.y])); const ih=new THREE.Path(); hi.slice().reverse().forEach((p:any,i:number)=>i?ih.lineTo(p.x,p.y):ih.moveTo(p.x,p.y)); ih.closePath(); ring.holes.push(ih);
    solid(slabZ(ring,zT-.08,Z0+.01,0,6),'tcover','g',tcL);
    for(let i=0;i<ho.length;i+=Math.max(1,Math.round(ho.length/14))){ const p=ho[i], q=V3(p.x,p.y,0), c=q.clone().multiplyScalar(.93);
      mesh(zCyl(.028,.03,6),'tcover','bolt',tcL,c.x,c.y,zT-.172,{color:'#8a8f95',metal:.6,rough:.35}); }
    mat('tcover','bolt').userData.clip=gPlane;
    marker('tcover',tcL,0,G.camY*.45,zT-.16); }
  buildIntake(); buildFlows(); buildCharge();

  /* The cylinder charge: seeded particles that stream in past the intake valve as the piston sweeps volume. */
  function buildCharge(){ const N=150;
    for(const cy of R.cyl){ const pos=new Float32Array(N*3), geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      const po:any={size:.07*(opts.particleScale??1),color:C.air,transparent:true,depthWrite:false,opacity:.9}; if(opts.dot) po.map=opts.dot;
      const pts=new THREE.Points(geo,new THREE.PointsMaterial(po)); pts.visible=false; pts.frustumCulled=false; noInk(pts); cy.bankRef.group.add(pts);
      const seeds=[]; for(let k=0;k<N;k++) seeds.push({r:Math.sqrt(rand())*G.boreR*.9,a:rand()*Math.PI*2,h:rand(),o:k/N,w:.6+rand()*.8});
      cy.charge={pts,pos,seeds}; } }
  function poseCharge(cy:any,th:number,amt:number){ const ch=cy.charge, c=mod(th-cy.off,720);
    const fill=c<180?sweptFrac(c):c<540?1:Math.max(0,1-(c-540)/150);
    const crownY=pistonS(th+cy.throw-cy.bank)+G.crown, top=G.headBot-.02, vx=cy.is*G.valveX, spin=intakeLiftInt(th-cy.off)*.012;
    for(let k=0;k<ch.seeds.length;k++){ const q=ch.seeds[k]; let x,y,z;
      const inside=q.o<fill, entering=inside&&q.o>fill-.12&&c<200;
      if(!inside){ x=vx; y=top+.02; z=cy.z; }                                       // waiting at the intake port
      else { const a=q.a+spin*q.w, rr=q.r; x=rr*Math.cos(a); z=cy.z+rr*Math.sin(a); y=lerp(crownY+.03,top,q.h);
        if(entering){ const u=(fill-q.o)/.12; x=lerp(vx,x,u); z=lerp(cy.z,z,u); y=lerp(top,y,u); } }
      ch.pos[k*3]=x; ch.pos[k*3+1]=y; ch.pos[k*3+2]=z; }
    ch.pts.geometry.attributes.position.needsUpdate=true; ch.pts.material.opacity=.9*amt; }

  function buildBank(bi:number,bang:number){
    const bank=new THREE.Group(); bank.rotation.z=-bang*DEG; root.add(bank); bank.updateMatrix();
    const is=bang>0?-1:(bang<0?1:-1);
    const cyls=e.cyls.filter((c:any)=>c.b===bi); const zs=cyls.map((c:any)=>c.z).sort((a:number,b:number)=>a-b);
    const bz0=Math.min(...zs)-.5, bz1=Math.max(...zs)+.5, bMid=(bz0+bz1)/2, k='b'+bi;
    const plane=bankPlane(bang); for(const p of ['block','liner','head','gasket','cover']) mat(p,k).userData.clip=plane;
    for(const [p,kk] of [['head','bolt'+bi],['cover','rib'+bi],['cover','cap'+bi]]) mat(p,kk,{color:p==='head'?'#a3a6a9':p==='cover'&&kk.startsWith('rib')?'#62676e':'#2f3237',metal:p==='head'?.5:.12,rough:.45}).userData.clip=plane;
    const L:any={block:layer('block',bank,V3()), pist:layer('pist',bank,V3(0,2.7,0)), gasket:layer('gasket',bank,V3(0,3,0)), head:layer('head',bank,V3(0,3.35,0)),
      valves:layer('valves',bank,V3(0,4.3,0)), cams:layer('cams',bank,V3(0,5,0)), cover:layer('cover',bank,V3(0,6,0)), exh:layer('exh',bank,V3(-is*1.3,3.35,0))};
    const B={group:bank,is,L,bz0,bz1,bi,bang}; R.banks.push(B);
    const BW=.56, HW=.58, bore=G.boreR+.035;
    /* cylinder block: a real casting with bores (liners are pressed into them) and a deck flange */
    const bores=(s:THREE.Shape,r:number)=>{ for(const z of zs) s.holes.push(hole(0,-z,r)); return s; };
    solid(slabY(bores(rrect(-BW,-bz1,BW,-bz0,.05),bore),.55,G.deck-.07,.008),'block',k,L.block);
    solid(slabY(bores(rrect(-BW-.035,-bz1-.01,BW+.035,-bz0+.01,.06),bore),G.deck-.07,G.deck,.008),'block',k,L.block);
    for(let i=0;i<zs.length-1;i++) for(const sx of [-1,1]) solid(new THREE.BoxGeometry(.03,G.deck-.8,.07),'block',k,L.block,sx*(BW+.012),(.62+G.deck-.12)/2,(zs[i]+zs[i+1])/2);
    /* head gasket: a steel sheet with fire-ring holes */
    solid(slabY(bores(rrect(-HW+.02,-bz1+.01,HW-.02,-bz0-.01,.05),G.boreR+.012),G.deck,G.headBot),'gasket',k,L.gasket);
    /* cylinder head: ported segments over each cylinder (pent-roof chamber, curved intake/exhaust ports), solid bridges between */
    const B0=G.headBot, T=G.headTop, ch=.05, W=HW;
    const headOuter=()=>polyShape([[-W,B0],[W,B0],[W,T-ch],[W-ch,T],[-W+ch,T],[-W,T-ch]]);
    const sliver=(sg:number)=>{ const s=new THREE.Shape(); s.moveTo(sg*W,B0); s.lineTo(sg*.4,B0); s.lineTo(sg*.36,B0+.006); s.quadraticCurveTo(sg*.46,B0+.03,sg*W,2.25); s.closePath(); return s; };
    const portMain=()=>{ const s=new THREE.Shape(); s.moveTo(-W,2.42); s.lineTo(-W,T-ch); s.lineTo(-W+ch,T); s.lineTo(W-ch,T); s.lineTo(W,T-ch); s.lineTo(W,2.42);
      s.quadraticCurveTo(.3,2.4,.12,B0+.042); s.lineTo(0,B0+.06); s.lineTo(-.12,B0+.042); s.quadraticCurveTo(-.3,2.4,-W,2.42); s.closePath(); return s; };
    let cur=bz0; const segs:[number,number,boolean][]=[];
    for(const z of zs){ const a=Math.max(cur,z-.42), b=z+.42; if(a>cur+1e-3) segs.push([cur,a,false]); segs.push([a,b,true]); cur=b; }
    if(bz1>cur+1e-3) segs.push([cur,bz1,false]);
    for(const [a,b,ported] of segs) solid(slabZ(ported?[sliver(1),sliver(-1),portMain()]:headOuter(),a,b,0,6),'head',k,L.head);
    // side flanges with round port mouths (the runners bolt on here)
    for(const sx of [-1,1]){ const s=rrect(-bz1,2.2,-bz0,2.47,.03); for(const z of zs) s.holes.push(hole(-z,2.335,.085)); solid(slabX(s,sx>0?W-.005:-W-.05,sx>0?W+.05:-W+.005,.006),'head',k,L.head); }
    // head bolts on the exposed ledge beside the cover
    const boltZ=[bz0+.12,...zs.slice(0,-1).map((z:number,i:number)=>(z+zs[i+1])/2),bz1-.12];
    for(const sx of [-1,1]) for(const z of boltZ) mesh(yCyl(.024,.03,6),'head','bolt'+bi,L.head,sx*.553,T+.015,z,{color:'#a3a6a9',metal:.5,rough:.4});
    /* cam cover: a hollow shell (inverted U) with end walls, an oil filler cap and coil-pack wells */
    { const CW=.52, IW=.465, CT=G.coverTop-.008, r=.16;
      const u=new THREE.Shape(); u.moveTo(-CW,T+.004); u.lineTo(-CW,CT-r); u.quadraticCurveTo(-CW,CT,-CW+r,CT); u.lineTo(CW-r,CT); u.quadraticCurveTo(CW,CT,CW,CT-r); u.lineTo(CW,T+.004);
      u.lineTo(IW,T+.004); u.lineTo(IW,CT-.07-.1); u.quadraticCurveTo(IW,CT-.07,IW-.1,CT-.07); u.lineTo(-IW+.1,CT-.07); u.quadraticCurveTo(-IW,CT-.07,-IW,CT-.07-.1); u.lineTo(-IW,T+.004); u.closePath();
      solid(slabZ(u,bz0+.06,bz1-.06,0,6),'cover',k,L.cover);
      const end=new THREE.Shape(); end.moveTo(-CW,T+.004); end.lineTo(-CW,CT-r); end.quadraticCurveTo(-CW,CT,-CW+r,CT); end.lineTo(CW-r,CT); end.quadraticCurveTo(CW,CT,CW,CT-r); end.lineTo(CW,T+.004); end.closePath();
      solid(slabZ(end,bz0,bz0+.06,0,6),'cover',k,L.cover); solid(slabZ(end,bz1-.06,bz1,0,6),'cover',k,L.cover);
      for(const sx of [-1,1]) mesh(new THREE.BoxGeometry(.03,.025,bz1-bz0-.3),'cover','rib'+bi,L.cover,sx*.24,CT+.012,bMid);
      mesh(yCyl(.07,.05,24),'cover','cap'+bi,L.cover,-is*.3,CT+.025,bz1-.3); }
    if(bi===0){ marker('cover',L.cover,0,G.coverTop,bMid); marker('cams',L.cams,is*G.valveX,G.camY+.2,bMid); marker('valves',L.valves,-is*G.valveX,2.5,bMid);
      marker('head',L.head,-is*.4,G.headTop-.05,bMid); marker('gasket',L.gasket,0,G.deck+.02,bMid); marker('pistons',L.pist,0,1.55,bMid); marker('block',L.block,0,1.4,bMid); }
    const zTl=e.zT;
    for(const sd of [is,-is]){ const x=sd*G.valveX, a=zTl, b=bz1-.15;
      mesh(zCyl(.05,b-a,14),'camshaft','',L.cams,x,G.camY,(a+b)/2);
      const sp=new THREE.Group(); sp.position.set(x,G.camY,zTl); L.cams.add(sp); R.camSprockets.push(sp);
      mesh(slabZ(gearShape(36,.21,.235,.06),-.03,.03,0,fine?16:2),'timing','',sp); mesh(new THREE.BoxGeometry(.03,.1,.075),'timing','mark',sp,0,.16,0,{color:'#e8e4dc',metal:.1,rough:.5});
      // cam bearing caps between the cylinders and at the ends
      const capZ=[bz0+.14,...zs.slice(0,-1).map((z:number,i:number)=>(z+zs[i+1])/2),bz1-.2];
      for(const z of capZ) solid(rbox(.2,G.camY+.07-T,.1,.03,rounded),'head',k,L.cams,x,(T+G.camY+.07)/2,z); }
    mesh(zCyl(.04,bz1-bz0-.2,12),'injector','',L.head,is*.28,G.coverTop+.05,bMid);
    const springGeo=new THREE.TubeGeometry(new Helix(.075,6),fine?300:140,.012,fine?10:6,false), pGeo=pistonGeo(), rG=rodGeos(), lGeo=linerGeo(.75,G.deck);
    const ivL=lobeGeo(IC,intakeLift), evL=lobeGeo(EC,exhaustLift), colX=-is*1.1;
    for(const c of cyls){ const z=c.z, i=e.cyls.indexOf(c), ck='c'+i, co={cyl:i};
      solid(lGeo,'liner',k,L.block,0,0,z);
      const pg=new THREE.Group(); L.pist.add(pg);
      mesh(pGeo,'piston',ck,pg,0,0,0,co);
      const rg=new THREE.TorusGeometry(G.pistonR-.006,.011,fine?10:6,fine?72:48); rg.rotateX(Math.PI/2);
      for(const y of [.175,.13,.083]) mesh(rg,'rings','',pg,0,y,0);
      mesh(zCyl(.07,.62,16),'piston',ck,pg,0,0,0,co);
      marker('piston:'+i,pg,0,G.crown,0); marker('wristpin:'+i,pg,0,0,0);
      const rd=new THREE.Group(); L.pist.add(rd);
      mesh(rG.frame,'rod',ck,rd,0,0,0,co); mesh(rG.web,'rod',ck,rd,0,0,0,co).userData.inkKey='rodweb'+i;
      for(const sx of [-1,1]) mesh(yCyl(.028,.2,10),'rod',ck+'b',rd,sx*.215,-G.L-.04,0,{color:'#6f757c',metal:.6,rough:.35,cyl:i});
      mesh(zCyl(.168,.11,28,true),'rodbearing',ck,rd,0,-G.L,0,co).material.side=THREE.DoubleSide;
      marker('rod:'+i,rd,0,-G.L*.5,0);
      marker('crankpin:'+i,crankRot,G.r*Math.sin(c.throw*DEG),G.r*Math.cos(c.throw*DEG),z); marker('crankcenter:'+i,crankL,0,0,z);
      const valves:any[]=[];
      for(const [sd,part,lg,center,fn] of [[is,'intakevalve',ivL,IC,intakeLift],[-is,'exhaustvalve',evL,EC,exhaustLift]] as any[]){
        const x=sd*G.valveX, vg=new THREE.Group(); vg.position.set(x,G.headBot,z); L.valves.add(vg);
        mesh(yCyl(.15,.035,32),part,ck,vg,0,.0135,0,co); mesh(new THREE.CylinderGeometry(.03,.15,.07,32),part,ck,vg,0,.07,0,co);
        mesh(yCyl(.026,.62,10),part,ck,vg,0,.41,0,co); mesh(yCyl(.085,.02,20),'spring',ck,vg,0,.64,0,co);
        const sp=mesh(springGeo,'spring',ck,L.valves,x,G.headTop,z,co);
        const tp=mesh(yCyl(.1,G.tappetH,28),'tappet',ck,L.valves,x,G.stemTop+G.tappetH/2,z,co);
        const lb=mesh(lg,'camshaft','',L.cams,x,G.camY,z);
        marker((part==='intakevalve'?'ivalve:':'evalve:')+i,vg,0,-.01,0);
        valves.push({grp:vg,spring:sp,tappet:tp,lobe:lb,center,fn}); }
      const pl=new THREE.Group(); pl.position.set(0,G.headBot,z+.2); L.head.add(pl);
      const mo={color:'#9aa1a8',metal:.8,rough:.35,cyl:i};
      mesh(yCyl(.014,.04,8),'plug',ck+'m',pl,0,0,0,mo); mesh(yCyl(.045,.27,16),'plug',ck+'m',pl,0,.165,0,mo); mesh(yCyl(.075,.1,6),'plug',ck+'m',pl,0,.35,0,mo);
      mesh(yCyl(.04,.4,16),'plug',ck,pl,0,.6,0,co); mesh(yCyl(.062,.5,20),'plug',ck+'coil',pl,0,.98,0,{color:'#474b51',metal:.15,rough:.6,cyl:i});
      mesh(rbox(.2,.08,.24,.03,rounded),'plug',ck+'coil',pl,0,G.coverTop-G.headBot+.03,0,{color:'#474b51',metal:.15,rough:.6,cyl:i});
      mesh(new THREE.BoxGeometry(.06,.05,.08),'plug',ck+'conn',pl,.08,G.coverTop-G.headBot+.08,-.05,{color:'#6d7279',metal:.2,rough:.5,cyl:i});
      marker('plug:'+i,pl,0,0,0);
      const T0=V3(is*.05,2.16,z-.2), U=V3(is*.28,G.coverTop+.02,z-.2), d=U.clone().sub(T0), len=d.length();
      const ij=new THREE.Group(); ij.position.copy(T0); ij.rotation.z=-Math.asin(d.x/len); L.head.add(ij);
      mesh(yCyl(.028,len-.3,12),'injector','',ij,0,(len-.3)/2,0); mesh(yCyl(.05,.3,16),'injector','',ij,0,len-.15,0);
      const spray=new THREE.Mesh(new THREE.ConeGeometry(.17,.45,fine?40:20,1,true),fine?softSprayMaterial(C.fuel):new THREE.MeshBasicMaterial({color:C.fuel,transparent:true,opacity:.35,depthWrite:false,side:THREE.DoubleSide}));
      spray.position.y=-.225; spray.visible=false; noInk(spray); ij.add(spray);
      const gas=new THREE.Mesh(yCyl(.4,1,40),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.2,depthWrite:false}));
      gas.position.z=z; noInk(gas); bank.add(gas);
      const spark=new THREE.Mesh(new THREE.SphereGeometry(.055,12,10),new THREE.MeshBasicMaterial({color:lin('#ffd84a'),transparent:true,depthWrite:false}));
      spark.position.set(0,G.headBot-.02,z+.2); spark.visible=false; noInk(spark); bank.add(spark);
      tube([V3(-is*(W-.02),2.335,z),V3(-is*.8,2.3,z),V3(-is*1.05,1.8,z),V3(colX,1.28,z)],.085,'exhaust','',L.exh,30);
      R.cyl[i]=Object.assign(c,{i,bankRef:B,piston:pg,rod:rd,valves,gas,spark,spray,is,power:0});
    }
    tube([V3(colX,1.2,bz0+.3),V3(colX,1.2,bz1-.2),V3(colX,1.02,bz1+.2),V3(colX,.3,bz1+.35)],.12,'exhaust','',L.exh,40);
    if(bi===0) marker('exhaust',L.exh,colX,1.3,bMid);
  }

  function buildIntake(){
    const single=R.banks.length===1, b0=R.banks[0];
    const ports=e.cyls.map((c:any)=>{ const b=c.bankRef; return {c,b,P:toEng(b,b.is*.63,2.335,c.z),o:toEng(b,b.is,0,0).sub(toEng(b,0,0,0)),u:toEng(b,0,1,0).sub(toEng(b,0,0,0))}; });
    let px:number,py:number; if(single){ px=b0.is*1.25; py=3.15; } else { px=0; py=Math.max(...ports.map((p:any)=>p.P.y))+(isFlat?.95:.85); }
    const iL=layer('intake',root,single?V3(b0.is*1.5,3.2,0):V3(0,isFlat?3.8:6.8,0)); e.plen={x:px,y:py};
    const pz0=e.zmin-.35, pz1=e.zmax+.3;
    mesh(rbox(single?.5:.72,.45,pz1-pz0,.12,rounded),'intake','',iL,px,py,(pz0+pz1)/2);
    R.runners=[];
    for(const p of ports){ const a=p.P.clone().add(p.o.clone().multiplyScalar(.24)).add(p.u.clone().multiplyScalar(.06));
      const E=V3(px,py-.12,p.c.z); const M=a.clone().lerp(E,.5); M.y+=.25; M.x+=(single?0:(E.x-M.x)*.2);
      const pts=[p.P,a,M,E]; tube(pts,.085,'intake','',iL,30); R.runners[p.c.i]={pts,P:p.P};
      const fl=mesh(zCyl(.12,.03,24),'intake','flange',iL,0,0,0); fl.position.copy(p.P).add(p.o.clone().multiplyScalar(.015)); fl.quaternion.setFromUnitVectors(V3(0,0,1),p.o.clone().normalize()); }
    const tz=e.zmax+.47; mesh(zCyl(.2,.3,32),'throttle','',iL,px,py,tz);
    const plate=mesh(zCyl(.17,.012,24),'throttle','plate',iL,px,py,tz,{color:'#6f777f'}); plate.rotation.x=Math.PI/2.6;
    tube([V3(px,py,tz+.14),V3(px,py+.03,tz+.45),V3(px,py+.05,e.zmax+1)],.16,'intake','duct',iL,16);
    mesh(rbox(1,.5,.7,.08,rounded),'filter','',iL,px,py+.05,e.zmax+1.35);
    marker('intake',iL,px,py+.25,zmid);
    e.air={filter:V3(px,py+.05,e.zmax+1.35),throttle:V3(px,py,tz),plenumRear:V3(px,py,e.zmax+.2)};
  }

  function makeFlow(name:string,paths:any[],perPath:number,color:any,size=.09){
    const n=paths.length*perPath, pos=new Float32Array(n*3), geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const po:any={size:size*(opts.particleScale??1),color,transparent:true,depthWrite:false,opacity:.95}; if(opts.dot) po.map=opts.dot;
    const pts=new THREE.Points(geo,new THREE.PointsMaterial(po)); pts.visible=false; pts.frustumCulled=false; noInk(pts); root.add(pts);
    const ps:any[]=[]; paths.forEach((p:any,pi:number)=>{ for(let k=0;k<perPath;k++) ps.push({pi,u0:(k+rand()*.6)/perPath}); });
    R.flows[name]={pts,paths,parts:ps,pos};
  }
  function buildFlows(){
    const cv=(pts:THREE.Vector3[])=>new THREE.CatmullRomCurve3(pts,false,'centripetal');
    const air:any[]=[],exh:any[]=[],fuel:any[]=[],oil:any[]=[];
    for(const c of e.cyls){ const b=c.bankRef, is=b.is, z=c.z, run=R.runners[c.i];
      air.push({curve:cv([e.air.filter,e.air.throttle,e.air.plenumRear,V3(e.plen.x,e.plen.y,z+.01),...run.pts.slice().reverse().slice(1),toEng(b,is*.45,2.3,z),toEng(b,is*.24,2.08,z),toEng(b,is*.1,1.7,z)]),cyl:c,kind:'air'});
      const col=-is*1.1;
      exh.push({curve:cv([toEng(b,-is*.1,1.75,z),toEng(b,-is*.24,2.08,z),toEng(b,-is*.45,2.3,z),toEng(b,-is*.8,2.3,z),toEng(b,-is*1.05,1.8,z),toEng(b,col,1.25,z),toEng(b,col,1.2,b.bz1-.2),toEng(b,col,1.02,b.bz1+.2),toEng(b,col,.3,b.bz1+.35)]),cyl:c,kind:'exh'});
      fuel.push({curve:cv([toEng(b,is*.28,G.coverTop+.05,b.bz1+.1),toEng(b,is*.28,G.coverTop+.05,z-.2+.02),toEng(b,is*.27,G.coverTop-.02,z-.2),toEng(b,is*.05,2.2,z-.2),toEng(b,is*.02,1.85,z-.1)]),cyl:c,kind:'fuel'}); }
    const gx=isV?0:(isFlat?0:.52), gy=isV?.72:(isFlat?.45:.34);
    const pick=V3(0,cc.bot-.72,e.zmin+.25), pump=V3(0,-.3,zP), gal0=V3(gx,gy,e.zmin-.45);
    for(const zj of R.journals) oil.push({curve:cv([pick,V3(0,cc.bot-.35,e.zmin-.2),pump,gal0,V3(gx,gy,zj),V3(0,.22,zj)]),kind:'oil'});
    for(const b of R.banks){ const is=b.is;
      oil.push({curve:cv([pick,V3(0,cc.bot-.35,e.zmin-.2),pump,gal0,toEng(b,-is*.45,1,b.bz0+.25),toEng(b,-is*.45,2.45,b.bz0+.25),toEng(b,is*G.valveX,G.camY-.13,b.bz0+.3),toEng(b,is*G.valveX,G.camY-.13,b.bz1-.25)]),kind:'oil'});
      oil.push({curve:cv([toEng(b,0,2.62,b.bz1-.2),toEng(b,is*.3,1.8,b.bz1-.2),toEng(b,is*.35,.8,b.bz1-.2),V3(0,cc.bot-.3,e.zmax+.2),V3(0,cc.bot-.72,e.zmax)]),kind:'oil'}); }
    makeFlow('air',air,14,C.air); makeFlow('exhaust',exh,14,C.exhaust,.1); makeFlow('fuel',fuel,9,C.fuel,.075); makeFlow('oil',oil,16,C.oil,.08);
  }

  /* Flow particles are a closed-form function of crank angle (no per-frame integration). */
  const TV=new THREE.Vector3(), TC=new THREE.Color();
  function poseFlow(name:string,theta:number){ const f=R.flows[name]; if(!f) return;
    for(let k=0;k<f.parts.length;k++){ const q=f.parts[k], p=f.paths[q.pi]; let u:number;
      if(p.kind==='air') u=q.u0+.0004*theta+.0042*intakeLiftInt(theta-p.cyl.off);
      else if(p.kind==='exh') u=q.u0+.0003*theta+.0045*exhaustLiftInt(theta-p.cyl.off);
      else if(p.kind==='fuel') u=q.u0+.0003*theta+.009*injectInt(theta-p.cyl.off);
      else u=q.u0+.0014*theta;
      p.curve.getPointAt(mod(u,1),TV); f.pos[k*3]=TV.x; f.pos[k*3+1]=TV.y; f.pos[k*3+2]=TV.z; }
    f.pts.geometry.attributes.position.needsUpdate=true; }

  const layerVal=(st:EngineState,name:string)=>{ const x=st.explode; if(x==null) return 0; if(typeof x==='number') return x; return x[name]??0; };

  function update(st: EngineState){
    const th=st.theta;
    for(const name in R.layers){ const v=layerVal(st,name); for(const g of R.layers[name]) g.position.copy(g.userData.explode).multiplyScalar(v); }
    R.crankRot.rotation.z=-th*DEG; R.fwRot.rotation.z=-th*DEG; R.pumpRot.rotation.z=-th*DEG;
    for(const s of R.camSprockets) s.rotation.z=-th*DEG/2;
    const u0=th*DEG*.135/R.chainLen, nL=R.links.length;
    for(let i=0;i<nL;i++){ const u=mod(i/nL-u0,1), l=R.links[i]; R.chainCurve.getPointAt(u,l.position); R.chainCurve.getTangentAt(u,TV); l.rotation.z=Math.atan2(TV.y,TV.x); }
    const gasLayers=Math.max(layerVal(st,'pist'),layerVal(st,'head')), gasVis=(st.gas??1)*(gasLayers<.03?1:0), fc=st.focusCyl, fA=st.focus??0;
    for(const cy of R.cyl){
      const c=mod(th-cy.off,720), phi=th+cy.throw-cy.bank, s=pistonS(phi), p=phi*DEG;
      cy.piston.position.set(0,s,cy.z);
      const dx=G.r*Math.sin(p), dy=G.r*Math.cos(p)-s; cy.rod.position.set(0,s,cy.z); cy.rod.rotation.z=Math.atan2(dx,-dy);
      for(const v of cy.valves){ const Lf=v.fn(c)*G.maxLift; v.grp.position.y=G.headBot-Lf; v.tappet.position.y=G.stemTop+G.tappetH/2-Lf;
        v.spring.scale.y=(G.headBot+.63-Lf)-G.headTop; v.lobe.rotation.z=-(c-v.center)/2*DEG; }
      const crownY=s+G.crown, h=Math.max(.01,G.headBot-crownY);
      const gv=gasVis*(fc!=null&&fA>0&&cy.i!==fc?1-fA:1);
      cy.gas.visible=gv>.01; cy.gas.position.y=crownY+h/2; cy.gas.scale.y=h;
      const gm=cy.gas.material, pr=pressure(c), ph=Math.floor(c/180);
      if(ph===0){ gm.color.copy(C.air); const f=c>VT.INJ0?clamp((c-VT.INJ0)/80,0,1):0; gm.color.lerp(C.fuel,f*.45); gm.opacity=.12+.06*f; }
      else if(ph===1){ gm.color.copy(C.air).lerp(C.comp,.6); gm.opacity=clamp(.12+pr/60,.12,.45); if(c>VT.SPARK){ gm.color.lerp(C.power,burnFrac(c)); gm.opacity=.5; } }
      else if(ph===2){ const b=burnFrac(c); gm.color.copy(C.power).lerp(C.exhaust,clamp((c-400)/140,0,1)); gm.opacity=clamp(.2+.55*b*(pr/30),.18,.75); }
      else { gm.color.copy(C.exhaust); gm.opacity=.22*(1-(c-540)/260); }
      gm.opacity*=gv;
      const sk=c>=VT.SPARK&&c<VT.SPARK+12; cy.spark.visible=sk&&gv>.5; if(sk) cy.spark.scale.setScalar(1+hash01(th*3.1+cy.i)*.8);
      const inj=c>=VT.INJ0&&c<=VT.INJ1; cy.spray.visible=inj&&layerVal(st,'head')<.5&&gv>.5&&((st.fade&&st.fade.injector!=null)?st.fade.injector:1)>.5; if(inj) cy.spray.material.opacity=.18+.2*Math.sin((c-VT.INJ0)/(VT.INJ1-VT.INJ0)*Math.PI);
      cy.power=clamp(Math.max(0,(pr-1)*(-dsdphi(phi)))/6,0,1);
    }
    for(const cy of R.cyl){ const on=!!st.charge&&st.charge.cyl===cy.i&&st.charge.amount>.01&&gasLayers<.03; cy.charge.pts.visible=on; if(on) poseCharge(cy,th,st.charge!.amount); }
    const flow=st.flow&&st.flow!=='off'?st.flow:null;
    for(const k in R.flows){ const on=k===flow; R.flows[k].pts.visible=on&&(st.flowAmt??1)>.01; if(on){ R.flows[k].pts.material.opacity=.95*(st.flowAmt??1); poseFlow(k,th); } }
    appearance(st);
  }

  function appearance(st: EngineState){
    const cut=st.cut??(st.view==='cutaway'?1:0), xr=st.xray??(st.view==='xray'?1:0);
    const fl=st.flow&&st.flow!=='off'?FLOW_PARTS[st.flow]:null, flA=st.flowAmt??1;
    const rel=relatedSet(st.sel), hid=st.hidden instanceof Set?st.hidden:new Set(st.hidden||[]);
    const fc=st.focusCyl, fA=st.focus??0, gh=st.ghost;
    const clipOn=cut>.001, k=(1-cut)*CUT_SWEEP; for(const pl of planes) if(pl!==slicePlane) pl.constant=k;
    const sl=st.slice&&st.slice.amount>.001?st.slice:null;
    if(sl){ const zw=lerp(e.zmin-3.5,sl.z,sl.amount)+root.position.z; slicePlane.constant=-zw; }
    for(const [part,Pp] of parts){
      let base=1;
      if(HOUSING.has(part)) base=lerp(1,part==='liner'?.16:.09,xr); else if(SEMI.has(part)) base=lerp(1,.3,xr);
      if(fl&&!fl.includes(part)) base=Math.min(base,lerp(1,HOUSING.has(part)?.05:.12,st.flowDim??flA));
      if(st.fade&&st.fade[part]!=null) base=Math.min(base,st.fade[part]);
      if(st.isolate&&st.sel&&part!==st.sel&&!rel.has(part)) base=Math.min(base,.05);
      if(gh&&gh.amount>0&&!gh.keep.includes(part)) base=Math.min(base,lerp(1,HOUSING.has(part)?.06:.1,gh.amount));
      let pmax=0;
      for(const m of Pp.mats as Set<any>){
        let op=base; if(fA>0&&fc!=null&&m.userData.cyl!=null&&m.userData.cyl!==fc&&PER_CYL.has(part)) op=Math.min(op,lerp(1,.08,fA));
        const mf=st.fade&&st.fade[part+'|'+m.userData.key]; if(mf!=null) op=Math.min(op,mf);
        m.opacity=op; m.transparent=op<.999; m.depthWrite=op>=.999; pmax=Math.max(pmax,op);
        const want:THREE.Plane[]=[]; if(clipOn&&m.userData.clip) want.push(m.userData.clip); if(sl&&SLICE_PARTS.has(part)) want.push(slicePlane);
        const key=want.length?want.map(q=>planes.indexOf(q)).join(','):''; if(key!==m.userData.clipOn){ m.clippingPlanes=want; m.clipShadows=true; m.userData.clipOn=key; m.needsUpdate=true; } }
      Pp.op=pmax; const h=hid.has(part)||pmax<.01; for(const m of Pp.meshes) m.visible=!h;
    }
    for(const kk in R.twinMats){ const tm=R.twinMats[kk]; const want:THREE.Plane[]=[]; if(clipOn&&tm.userData.clip) want.push(tm.userData.clip); if(sl) want.push(slicePlane);
      const key=want.length?want.map(q=>planes.indexOf(q)).join(','):''; if(key!==tm.userData.clipOn){ tm.clippingPlanes=want; tm.userData.clipOn=key; tm.needsUpdate=true; }
      const u=tm.userData.capU; u.capN.value=want.length; want.forEach((q,i)=>u.capPlanes.value[i].set(q.normal.x,q.normal.y,q.normal.z,q.constant)); }
    for(const t of R.twins){ const Pp=parts.get(t.userData.part)!, tm=t.material as any; t.visible=tm.clippingPlanes&&tm.clippingPlanes.length>0&&Pp.op>.5&&!hid.has(t.userData.part); }
    // emissive: selection / hover / related / glow list / power flow
    const pw=st.flow==='power'; let avg=0; if(pw){ for(const c of R.cyl) avg+=c.power; avg/=R.cyl.length; }
    const relA=st.sel&&!st.isolate?rel:null, pulse=st.pulse??0;
    for(const [part,Pp] of parts){ let h=0; if(part===st.sel) h=.42+.08*pulse; else if(part===st.hover) h=.3; else if(relA&&relA.has(part)) h=.1;
      for(const m of Pp.mats as Set<any>){ if(!m.emissive) continue; m.emissive.copy(C.brass).multiplyScalar(h);
        if(pw){ if(m.userData.cyl!=null&&(part==='piston'||part==='rod')) m.emissive.add(TC.copy(C.power).multiplyScalar(R.cyl[m.userData.cyl].power*1.1*flA));
          else if(part==='crank'||part==='flywheel') m.emissive.add(TC.copy(C.power).multiplyScalar((.12+.5*avg)*flA)); } } }
    if(st.glow) for(const g of st.glow){ const Pp=parts.get(g.part); if(!Pp) continue; const col=g.color?lin(g.color):C.brass;
      for(const m of Pp.mats as Set<any>){ if(!m.emissive) continue; if(g.cyl!=null&&m.userData.cyl!=null&&m.userData.cyl!==g.cyl) continue; m.emissive.add(TC.copy(col).multiplyScalar(g.amount)); } }
  }

  function anchor(name:string, out=new THREE.Vector3()){ const o=R.anchors[name]; if(!o) return null; root.updateMatrixWorld(true); return o.getWorldPosition(out); }
  function setColors(cols: Partial<Colors>){ for(const k in cols) C[k]=lin((cols as any)[k]);
    for(const kk in R.twinMats) R.twinMats[kk].color.copy(C.section);
    for(const k of ['air','exhaust','fuel','oil']) if(R.flows[k]) R.flows[k].pts.material.color.copy(C[k]);
    for(const c of R.cyl){ c.spray.material.color.copy(C.fuel); c.charge.pts.material.color.copy(C.air); } }
  /** Section hatch ink / strength (e.g. light ink on a dark theme). */
  function setHatch(h:{ color?: string; amount?: number; spacing?: number }){ Object.assign(hatch,h);
    for(const kk in R.twinMats){ const u=R.twinMats[kk].userData.capU; if(h.color) u.capInk.value.copy(lin(h.color)); if(h.amount!=null) u.capAmt.value=h.amount; if(h.spacing!=null) u.capSpacing.value=h.spacing; } }
  function dispose(){ root.traverse((o:any)=>{ if(o.geometry) o.geometry.dispose(); }); for(const m of matCache.values()) m.dispose(); for(const k in R.twinMats) R.twinMats[k].dispose(); }

  return { key, e, root, parts, R, cyl: R.cyl as any[], update, anchor, setColors, setHatch, dispose, planes };
}
export type Engine = ReturnType<typeof createEngine>;
