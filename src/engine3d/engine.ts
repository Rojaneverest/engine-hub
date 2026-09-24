/* =====================================================================
   Parametric 3D engine — instance based, deterministic.
   One EngineState in → one pose + appearance out. Used by the
   interactive app (src → app bundle) and by every video shot.
   ===================================================================== */
import * as THREE from 'three';
import { G, DEG, mod, clamp, lerp, pistonS, dsdphi, pressure, burnFrac, intakeLift, exhaustLift, IC, EC, VT, sweptFrac,
  deriveEngine, intakeLiftInt, exhaustLiftInt, injectInt, rng, hash01 } from '../core/sim';
import { PARTS_INFO } from '../core/content';

export type Colors = Record<'air'|'fuel'|'comp'|'power'|'exhaust'|'oil'|'brass'|'section', string>;
export type EngineState = {
  theta: number;
  explode?: number | Record<string, number>;   // 0..1 overall, or per layer (cover,cams,valves,head,gasket,pist,exh,crank,mb,pan,op,fw,tm,intake)
  view?: 'full'|'cutaway'|'xray';
  cut?: number;          // 0..1 cutaway sweep (1 = sliced through the cylinder axes)
  xray?: number;         // 0..1 housing transparency
  flow?: string; flowAmt?: number; flowDim?: number;   // flowDim: how much unrelated parts fade (defaults to flowAmt)
  fade?: Record<string, number>;                       // per-part opacity multiplier (e.g. hide the timing drive for a shot)
  sel?: string|null; hover?: string|null; isolate?: boolean; pulse?: number;
  hidden?: Set<string>|string[];
  focusCyl?: number; focus?: number;           // dim the other cylinders' moving parts
  slice?: { z: number; amount: number } | null; // transverse section at engine-z (removes everything in front of it)
  ghost?: { keep: string[]; amount: number } | null;
  glow?: { part: string; cyl?: number; amount: number; color?: string }[];
  charge?: { cyl: number; amount: number } | null;  // particle cloud of the trapped charge (fills on intake)
};
export const HOUSING = new Set(['block','liner','head','gasket','cover','pan']);
export const SEMI = new Set(['intake','exhaust','filter','throttle']);
export const FLOW_PARTS: Record<string,string[]> = {
  air:['filter','throttle','intake','intakevalve','piston'], fuel:['injector','piston'],
  exhaust:['exhaustvalve','exhaust','piston'], oil:['pan','oilpump','crank','mainbearing','rodbearing','camshaft','tappet'],
  power:['piston','rod','crank','flywheel','rodbearing','mainbearing'] };
const PER_CYL = new Set(['piston','rod','intakevalve','exhaustvalve','spring','tappet','plug','rodbearing']);
const PART_LOOK: any = {
  block:['#8b939b',.35,.62], liner:['#a9afb5',.5,.45], head:['#9aa2aa',.35,.55], gasket:['#5d656e',.6,.45], cover:['#2c323a',.35,.55],
  piston:['#cfd4d9',.65,.33], rings:['#5a6068',.8,.35], rod:['#88909a',.8,.32], rodbearing:['#c89b5b',.85,.3], crank:['#a0a8b0',.9,.26],
  mainbearing:['#c89b5b',.85,.3], camshaft:['#9199a2',.85,.3], intakevalve:['#cfd6de',.85,.28], exhaustvalve:['#a8876a',.75,.35],
  spring:['#6f8397',.7,.4], tappet:['#b4bbc2',.85,.28], timing:['#5a6068',.8,.4], plug:['#ebe7df',.05,.35], injector:['#3b4149',.6,.4],
  intake:['#2d3238',.1,.7], throttle:['#a0a7ae',.8,.35], filter:['#24282d',.05,.8], exhaust:['#7e6555',.55,.6], pan:['#4c535b',.5,.5],
  oilpump:['#7e868f',.7,.4], flywheel:['#555c64',.8,.35] };
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
class Helix extends THREE.Curve<THREE.Vector3>{ r:number; t:number; constructor(r:number,t:number){super();this.r=r;this.t=t;}
  getPoint(u:number,tg=new THREE.Vector3()){ const a=u*this.t*Math.PI*2; return tg.set(Math.cos(a)*this.r,u,Math.sin(a)*this.r); } }
function lobeGeo(center:number,liftFn:(c:number)=>number){ const sh=new THREE.Shape();
  for(let i=0;i<=120;i++){ const psi=-180+i*3, rr=G.camBase+G.maxLift*liftFn(center+2*psi); const x=rr*Math.sin(psi*DEG), y=-rr*Math.cos(psi*DEG); i?sh.lineTo(x,y):sh.moveTo(x,y); }
  const g=new THREE.ExtrudeGeometry(sh,{depth:.12,bevelEnabled:false,curveSegments:4}); g.translate(0,0,-.06); return g; }
function webGeo(){ const r=G.r, sh=new THREE.Shape(); sh.moveTo(-.21,r); sh.absarc(0,r,.21,Math.PI,0,true);
  const a0=-20*DEG, a1=-160*DEG; sh.lineTo(.62*Math.cos(a0),.62*Math.sin(a0)); sh.absarc(0,0,.62,a0,a1,true); sh.lineTo(-.21,r);
  const g=new THREE.ExtrudeGeometry(sh,{depth:.08,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:1,curveSegments:14}); g.translate(0,0,-.04); return g; }
function rotorGeo(){ const sh=new THREE.Shape(); for(let i=0;i<=100;i++){ const a=i/100*Math.PI*2, rr=.17+.03*Math.cos(5*a); const x=rr*Math.cos(a), y=rr*Math.sin(a); i?sh.lineTo(x,y):sh.moveTo(x,y); }
  const hole=new THREE.Path(); hole.absarc(0,0,.1,0,Math.PI*2,true); sh.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(sh,{depth:.08,bevelEnabled:false}); g.translate(0,0,-.04); return g; }
function hull2(pts:any[]){ pts=pts.slice().sort((a,b)=>a.x-b.x||a.y-b.y); const cr=(o:any,a:any,b:any)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lo:any[]=[],up:any[]=[]; for(const p of pts){ while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); }
  for(let i=pts.length-1;i>=0;i--){ const p=pts[i]; while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up); }
export function relatedSet(part?:string|null){ const s=new Set<string>(); if(!part||!PARTS_INFO[part]) return s; for(const r of PARTS_INFO[part].rel) s.add(r);
  for(const k in PARTS_INFO) if(PARTS_INFO[k].rel.includes(part)) s.add(k); return s; }
const CUT_SWEEP = 1.35;
const SLICE_PARTS = new Set(['block','liner','head','gasket','cover','pan','crank','mainbearing']);

export function createEngine(key: string, opts: { colors: Colors; rounded?: boolean; shadows?: boolean; dot?: THREE.Texture|null; seed?: number; look?: Record<string,[string,number,number]>; particleScale?: number }) {
  const C: any = {}; for (const k in opts.colors) C[k] = lin((opts.colors as any)[k]);
  const rounded = opts.rounded !== false, rand = rng(opts.seed ?? 7);
  const parts = new Map<string, {meshes:THREE.Mesh[]; mats:Set<THREE.Material>; op:number}>();
  const matCache = new Map<string, any>();
  const R: any = { cyl:[], banks:[], twins:[], twinMats:{}, layers:{} as Record<string,THREE.Group[]>, camSprockets:[], links:[], flows:{}, journals:[], anchors:{} };
  const P = (part:string) => { if(!parts.has(part)) parts.set(part,{meshes:[],mats:new Set(),op:1}); return parts.get(part)!; };
  function mat(part:string,key='',o:any={}){ const k=part+'|'+key; if(matCache.has(k)) return matCache.get(k);
    const [c,m,r]=(opts.look&&opts.look[part])||PART_LOOK[part]; const mt:any=new THREE.MeshStandardMaterial({color:lin(o.color||c),metalness:o.metal??m,roughness:o.rough??r,side:part==='liner'?THREE.DoubleSide:THREE.FrontSide});
    mt.userData={part,clip:null,clipOn:false,cyl:o.cyl??null}; matCache.set(k,mt); P(part).mats.add(mt); return mt; }
  function mesh(geo:THREE.BufferGeometry,part:string,key:string,parent:THREE.Object3D,x=0,y=0,z=0,o?:any){
    const m=new THREE.Mesh(geo,mat(part,key,o)); m.position.set(x,y,z); m.userData.part=part; if(o&&o.cyl!=null) m.userData.cyl=o.cyl;
    if(opts.shadows){ m.castShadow=true; m.receiveShadow=true; } P(part).meshes.push(m); parent.add(m); return m; }
  function addTwin(m:any){ const pl=m.material.userData.clip; const k=pl?pl.normal.x.toFixed(3)+','+pl.normal.y.toFixed(3):'none';
    let tm=R.twinMats[k]; if(!tm){ tm=R.twinMats[k]=new THREE.MeshBasicMaterial({color:C.section,side:THREE.BackSide,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:4}); tm.userData={clip:pl,clipOn:false}; }
    const t=new THREE.Mesh(m.geometry,tm); t.userData.part=m.userData.part; t.userData.twin=true; t.visible=false; m.add(t); R.twins.push(t); return t; }
  const planes:THREE.Plane[]=[];
  function planeRemoving(dx:number,dy:number){ const p=new THREE.Plane(new THREE.Vector3(-dx,-dy,0).normalize(),0); planes.push(p); return p; }
  function bankPlane(bang:number){ const lx=Math.cos(bang*DEG), ly=-Math.sin(bang*DEG); const s=(lx*.64+ly*.42)>=0?1:-1; return planeRemoving(lx*s,ly*s); }
  function tube(points:THREE.Vector3[],r:number,part:string,key:string,parent:THREE.Object3D,seg=40,o?:any){ const cv=new THREE.CatmullRomCurve3(points,false,'centripetal'); return mesh(new THREE.TubeGeometry(cv,seg,r,10,false),part,key,parent,0,0,0,o); }
  function marker(name:string,parent:THREE.Object3D,x:number,y:number,z:number){ const o=new THREE.Object3D(); o.position.set(x,y,z); parent.add(o); R.anchors[name]=o; return o; }

  const e:any = deriveEngine(key);
  const root = new THREE.Group(); root.position.z = -(e.zmin+e.zmax)/2;
  const zT=e.zT=e.zmin-.62, zmid=(e.zmin+e.zmax)/2, Lz=e.zmax-e.zmin+1;
  const isFlat=e.isFlat=e.banks.some((b:number)=>Math.abs(b)>=80), isV=e.isV=e.banks.length>1&&!isFlat;
  const cc=e.cc=isFlat?{hw:.62,top:.62,bot:-.62}:isV?{hw:1.05,top:.8,bot:-.35}:{hw:.78,top:.6,bot:-.35};
  const layer=(name:string,parent:THREE.Object3D,off:THREE.Vector3)=>{ const g=new THREE.Group(); g.userData.explode=off; g.userData.layer=name; parent.add(g); (R.layers[name]??=[]).push(g); return g; };
  const gPlane=planeRemoving(1,0);
  const slicePlane=new THREE.Plane(new THREE.Vector3(0,0,1),0); planes.push(slicePlane);

  /* crankcase & sump */
  const blockG=layer('block',root,V3());
  mat('block','g').userData.clip=gPlane;
  addTwin(mesh(rbox(cc.hw*2,cc.top-cc.bot,Lz-.016,.06,rounded),'block','g',blockG,0,(cc.top+cc.bot)/2,zmid));
  const panL=layer('pan',root,V3(0,-2.6,0)); mat('pan','g').userData.clip=gPlane;
  addTwin(mesh(rbox(cc.hw*2-.1,.85,Lz-.1,.1,rounded),'pan','g',panL,0,cc.bot-.006-.425,zmid));
  marker('pan',panL,0,cc.bot-.45,zmid);

  /* crankshaft */
  const crankL=layer('crank',root,V3(0,-1.6,0)); const crankRot=R.crankRot=new THREE.Group(); crankL.add(crankRot);
  const pins=e.cyls.map((c:any)=>({z:c.z,t:c.throw})).sort((a:any,b:any)=>a.z-b.z), groups:any[]=[];
  for(const p of pins){ const g=groups[groups.length-1]; if(g&&Math.abs(mod(g.t-p.t+180,360)-180)<1&&p.z-g.z1<.35) g.z1=p.z; else groups.push({t:p.t,z0:p.z,z1:p.z}); }
  const PH=.1, WT=.08, wg=webGeo();
  const spans=groups.map((g:any)=>{ const tr=g.t*DEG, px=G.r*Math.sin(tr), py=G.r*Math.cos(tr);
    mesh(zCyl(.155,g.z1-g.z0+2*PH,20),'crank','',crankRot,px,py,(g.z0+g.z1)/2);
    for(const wz of [g.z0-PH-WT/2,g.z1+PH+WT/2]){ const w=mesh(wg,'crank','',crankRot,0,0,wz); w.rotation.z=-tr; }
    return [g.z0-PH-WT,g.z1+PH+WT]; });
  const jr=[[e.zmin-.45,spans[0][0]]]; for(let i=0;i<spans.length-1;i++) jr.push([spans[i][1],spans[i+1][0]]); jr.push([spans[spans.length-1][1],e.zmax+.45]);
  const mbL=layer('mb',root,V3(0,-.9,0));
  for(const [a,b] of jr){ const len=b-a; if(len<=.001) continue; mesh(zCyl(.19,len,22),'crank','',crankRot,0,0,(a+b)/2);
    const zc=(a+b)/2; R.journals.push(zc); mesh(zCyl(.205,Math.min(.16,len*.8),24,true),'mainbearing','',mbL,0,0,zc); }
  mat('mainbearing').side=THREE.DoubleSide;
  mesh(zCyl(.13,(e.zmin-.45)-(zT-.08),18),'crank','',crankRot,0,0,((e.zmin-.45)+(zT-.08))/2);
  mesh(zCyl(.15,.35,18),'crank','',crankRot,0,0,e.zmax+.62); mesh(zCyl(.3,.06,28),'crank','',crankRot,0,0,e.zmax+.76);
  const cs=mesh(zCyl(.11,.06,24),'timing','',crankRot,0,0,zT); mesh(new THREE.BoxGeometry(.025,.07,.07),'timing','mark',cs,0,.075,0,{color:'#e8e4dc',metal:.1,rough:.5});
  marker('crank',crankL,0,0,zmid);

  /* flywheel, oil pump */
  const fwL=layer('fw',root,V3(0,0,1.8)); const fw=R.fwRot=new THREE.Group(); fw.position.z=e.zmax+.84; fwL.add(fw);
  mesh(zCyl(1.02,.09,56),'flywheel','',fw); mesh(new THREE.TorusGeometry(1.05,.045,8,72),'flywheel','',fw);
  for(let i=0;i<6;i++){ const a=i/6*Math.PI*2; mesh(zCyl(.07,.1,12),'flywheel','mark',fw,.62*Math.cos(a),.62*Math.sin(a),0,{color:i?'#2a2f35':'#e8e4dc'}); }
  marker('flywheel',fwL,0,.7,e.zmax+.84);
  const opL=layer('op',root,V3(0,-2.1,-.6)); const zP=e.zmin-.45;
  mesh(zCyl(.3,.03,32),'oilpump','',opL,0,0,zP+.06);
  mesh(zCyl(.3,.12,32,true),'oilpump','rim',opL,0,0,zP).material.side=THREE.DoubleSide;
  const rot=R.pumpRot=new THREE.Group(); rot.position.z=zP; opL.add(rot); mesh(rotorGeo(),'oilpump','rotor',rot,0,0,0,{color:'#b4bbc2'});
  tube([V3(0,-.28,zP),V3(0,cc.bot-.3,zP+.1),V3(0,cc.bot-.72,e.zmin+.25)],.04,'oilpump','',opL,20);
  mesh(yCyl(.14,.03,20),'oilpump','',opL,0,cc.bot-.74,e.zmin+.25);

  /* banks */
  const toEng=(b:any,x:number,y:number,z:number)=>V3(x,y,z).applyMatrix4(b.group.matrix);
  e.banks.forEach((bang:number,bi:number)=>buildBank(bi,bang));

  /* timing chain */
  const tmL=layer('tm',root,V3(0,0,-1.6)); const circ:any[]=[];
  const addC=(x:number,y:number,r:number)=>{ for(let i=0;i<24;i++){ const a=i/24*Math.PI*2; circ.push({x:x+r*Math.cos(a),y:y+r*Math.sin(a)}); } };
  addC(0,0,.135); for(const b of R.banks) for(const sd of [1,-1]){ const p=toEng(b,sd*G.valveX,G.camY,0); addC(p.x,p.y,.25); }
  const hp=hull2(circ).map((p:any)=>V3(p.x,p.y,zT));
  const chain=R.chainCurve=new THREE.CatmullRomCurve3(hp,true,'centripetal'); R.chainLen=chain.getLength();
  mesh(new THREE.TubeGeometry(chain,200,.018,6,true),'timing','chain',tmL,0,0,0,{color:'#3c4249'});
  const lg=new THREE.BoxGeometry(.07,.03,.075); const nL=Math.round(R.chainLen/.12);
  for(let i=0;i<nL;i++) R.links.push(mesh(lg,'timing','link',tmL,0,0,0,{color:'#8a929b'}));
  marker('timing',tmL,hp[0].x*.5,G.camY*.5,zT);
  buildIntake(); buildFlows(); buildCharge();

  /* The cylinder charge: seeded particles that stream in past the intake valve as the piston sweeps volume. */
  function buildCharge(){ const N=150;
    for(const cy of R.cyl){ const pos=new Float32Array(N*3), geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      const po:any={size:.075*(opts.particleScale??1),color:C.air,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.9}; if(opts.dot) po.map=opts.dot;
      const pts=new THREE.Points(geo,new THREE.PointsMaterial(po)); pts.visible=false; pts.frustumCulled=false; cy.bankRef.group.add(pts);
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
    const cyls=e.cyls.filter((c:any)=>c.b===bi); const zs=cyls.map((c:any)=>c.z);
    const bz0=Math.min(...zs)-.5, bz1=Math.max(...zs)+.5, bLen=bz1-bz0, bMid=(bz0+bz1)/2, k='b'+bi;
    const plane=bankPlane(bang); for(const p of ['block','liner','head','gasket','cover']) mat(p,k).userData.clip=plane;
    const L:any={block:layer('block',bank,V3()), pist:layer('pist',bank,V3(0,2.7,0)), gasket:layer('gasket',bank,V3(0,3,0)), head:layer('head',bank,V3(0,3.35,0)),
      valves:layer('valves',bank,V3(0,4.3,0)), cams:layer('cams',bank,V3(0,5,0)), cover:layer('cover',bank,V3(0,6,0)), exh:layer('exh',bank,V3(-is*1.3,3.35,0))};
    const B={group:bank,is,L,bz0,bz1,bi,bang}; R.banks.push(B);
    addTwin(mesh(rbox(1.12,G.deck-.55,bLen,.05,rounded),'block',k,L.block,0,(.55+G.deck)/2,bMid));
    mesh(new THREE.BoxGeometry(1.12,.024,bLen-.01),'gasket',k,L.gasket,0,G.deck+.015,bMid);
    addTwin(mesh(rbox(1.16,G.headTop-G.headBot,bLen,.05,rounded),'head',k,L.head,0,(G.headBot+G.headTop)/2,bMid));
    addTwin(mesh(rbox(1.16,G.coverTop-G.headTop-.008,bLen+.012,.16,rounded),'cover',k,L.cover,0,(G.headTop+G.coverTop)/2+.004,bMid));
    if(bi===0){ marker('cover',L.cover,0,G.coverTop,bMid); marker('cams',L.cams,is*G.valveX,G.camY+.2,bMid); marker('valves',L.valves,-is*G.valveX,2.5,bMid);
      marker('head',L.head,0,G.headTop-.05,bMid); marker('gasket',L.gasket,0,G.deck+.02,bMid); marker('pistons',L.pist,0,2.1,bMid); marker('block',L.block,0,1.4,bMid); }
    const zTl=e.zT;
    for(const sd of [is,-is]){ const x=sd*G.valveX, a=zTl, b=bz1-.15;
      mesh(zCyl(.05,b-a,14),'camshaft','',L.cams,x,G.camY,(a+b)/2);
      const sp=new THREE.Group(); sp.position.set(x,G.camY,zTl); L.cams.add(sp); R.camSprockets.push(sp);
      mesh(zCyl(.22,.06,36),'timing','',sp); mesh(new THREE.BoxGeometry(.03,.1,.075),'timing','mark',sp,0,.16,0,{color:'#e8e4dc',metal:.1,rough:.5}); }
    mesh(zCyl(.04,bLen,12),'injector','',L.head,is*.13,3.5,bMid);
    const springGeo=new THREE.TubeGeometry(new Helix(.075,6),140,.012,6,false);
    const ivL=lobeGeo(IC,intakeLift), evL=lobeGeo(EC,exhaustLift), colX=-is*1.1;
    for(const c of cyls){ const z=c.z, i=e.cyls.indexOf(c), ck='c'+i, co={cyl:i};
      mesh(yCyl(G.boreR,G.deck-.75,36,true),'liner',k,L.block,0,(.75+G.deck)/2,z);
      const pg=new THREE.Group(); L.pist.add(pg);
      mesh(yCyl(G.pistonR,G.crown+G.skirt,40),'piston',ck,pg,0,(G.crown-G.skirt)/2,0,co);
      const rg=new THREE.TorusGeometry(G.pistonR+.004,.011,6,40); rg.rotateX(Math.PI/2);
      for(const y of [.17,.12,.075]) mesh(rg,'rings','',pg,0,y,0);
      mesh(zCyl(.07,.5,14),'piston',ck,pg,0,0,0,co);
      marker('piston:'+i,pg,0,G.crown,0); marker('wristpin:'+i,pg,0,0,0);
      const rd=new THREE.Group(); L.pist.add(rd);
      mesh(new THREE.TorusGeometry(.085,.035,10,24),'rod',ck,rd,0,0,0,co);
      mesh(new THREE.BoxGeometry(.1,G.L-.3,.08),'rod',ck,rd,0,-G.L/2,0,co);
      mesh(new THREE.TorusGeometry(.2,.045,10,30),'rod',ck,rd,0,-G.L,0,co);
      mesh(zCyl(.168,.11,24,true),'rodbearing',ck,rd,0,-G.L,0,co).material.side=THREE.DoubleSide;
      marker('rod:'+i,rd,0,-G.L*.5,0);
      marker('crankpin:'+i,crankRot,G.r*Math.sin(c.throw*DEG),G.r*Math.cos(c.throw*DEG),z); marker('crankcenter:'+i,crankL,0,0,z);
      const valves:any[]=[];
      for(const [sd,part,lg,center,fn] of [[is,'intakevalve',ivL,IC,intakeLift],[-is,'exhaustvalve',evL,EC,exhaustLift]] as any[]){
        const x=sd*G.valveX, vg=new THREE.Group(); vg.position.set(x,G.headBot,z); L.valves.add(vg);
        mesh(yCyl(.15,.035,28),part,ck,vg,0,.0135,0,co); mesh(new THREE.CylinderGeometry(.03,.15,.07,24),part,ck,vg,0,.07,0,co);
        mesh(yCyl(.026,.62,10),part,ck,vg,0,.41,0,co); mesh(yCyl(.085,.02,20),'spring',ck,vg,0,.64,0,co);
        const sp=mesh(springGeo,'spring',ck,L.valves,x,G.headTop,z,co);
        const tp=mesh(yCyl(.1,G.tappetH,24),'tappet',ck,L.valves,x,G.stemTop+G.tappetH/2,z,co);
        const lb=mesh(lg,'camshaft','',L.cams,x,G.camY,z);
        marker((part==='intakevalve'?'ivalve:':'evalve:')+i,vg,0,-.01,0);
        valves.push({grp:vg,spring:sp,tappet:tp,lobe:lb,center,fn}); }
      const pl=new THREE.Group(); pl.position.set(0,G.headBot,z+.2); L.head.add(pl);
      const mo={color:'#9aa1a8',metal:.8,rough:.35,cyl:i};
      mesh(yCyl(.014,.04,8),'plug',ck+'m',pl,0,0,0,mo); mesh(yCyl(.045,.27,16),'plug',ck+'m',pl,0,.165,0,mo); mesh(yCyl(.075,.1,6),'plug',ck+'m',pl,0,.35,0,mo);
      mesh(yCyl(.04,.55,16),'plug',ck,pl,0,.675,0,co); mesh(yCyl(.07,.5,20),'plug',ck+'coil',pl,0,1.2,0,{color:'#23272d',metal:.2,rough:.6,cyl:i});
      marker('plug:'+i,pl,0,0,0);
      const T0=V3(is*.05,2.16,z-.2), U=V3(is*.13,3.46,z-.2), d=U.clone().sub(T0), len=d.length();
      const ij=new THREE.Group(); ij.position.copy(T0); ij.rotation.z=-Math.asin(d.x/len); L.head.add(ij);
      mesh(yCyl(.03,.9,12),'injector','',ij,0,.45,0); mesh(yCyl(.055,.4,16),'injector','',ij,0,len-.2,0);
      const spray=new THREE.Mesh(new THREE.ConeGeometry(.17,.45,20,1,true),new THREE.MeshBasicMaterial({color:C.fuel,transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
      spray.position.y=-.225; spray.visible=false; ij.add(spray);
      const gas=new THREE.Mesh(yCyl(.4,1,32),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.2,depthWrite:false}));
      gas.position.z=z; bank.add(gas);
      const spark=new THREE.Mesh(new THREE.SphereGeometry(.055,12,10),new THREE.MeshBasicMaterial({color:lin('#fff4c8'),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
      spark.position.set(0,G.headBot-.02,z+.2); spark.visible=false; bank.add(spark);
      tube([V3(-is*.5,2.33,z),V3(-is*.8,2.3,z),V3(-is*1.05,1.8,z),V3(colX,1.28,z)],.085,'exhaust','',L.exh,30);
      R.cyl[i]=Object.assign(c,{i,bankRef:B,piston:pg,rod:rd,valves,gas,spark,spray,is,power:0});
    }
    tube([V3(colX,1.2,bz0+.3),V3(colX,1.2,bz1-.2),V3(colX,1.02,bz1+.2),V3(colX,.3,bz1+.35)],.12,'exhaust','',L.exh,40);
    if(bi===0) marker('exhaust',L.exh,colX,1.3,bMid);
  }

  function buildIntake(){
    const single=R.banks.length===1, b0=R.banks[0];
    const ports=e.cyls.map((c:any)=>{ const b=c.bankRef; return {c,b,P:toEng(b,b.is*.56,2.33,c.z),o:toEng(b,b.is,0,0).sub(toEng(b,0,0,0)),u:toEng(b,0,1,0).sub(toEng(b,0,0,0))}; });
    let px:number,py:number; if(single){ px=b0.is*1.2; py=3.15; } else { px=0; py=Math.max(...ports.map((p:any)=>p.P.y))+(isFlat?.95:.85); }
    const iL=layer('intake',root,single?V3(b0.is*1.5,3.2,0):V3(0,isFlat?3.8:6.8,0)); e.plen={x:px,y:py};
    const pz0=e.zmin-.35, pz1=e.zmax+.3;
    mesh(rbox(single?.5:.72,.45,pz1-pz0,.12,rounded),'intake','',iL,px,py,(pz0+pz1)/2);
    R.runners=[];
    for(const p of ports){ const a=p.P.clone().add(p.o.clone().multiplyScalar(.28)).add(p.u.clone().multiplyScalar(.06));
      const E=V3(px,py-.12,p.c.z); const M=a.clone().lerp(E,.5); M.y+=.25; M.x+=(single?0:(E.x-M.x)*.2);
      const pts=[p.P,a,M,E]; tube(pts,.085,'intake','',iL,30); R.runners[p.c.i]={pts,P:p.P}; }
    const tz=e.zmax+.47; mesh(zCyl(.2,.3,28),'throttle','',iL,px,py,tz);
    const plate=mesh(zCyl(.17,.012,24),'throttle','plate',iL,px,py,tz,{color:'#6f777f'}); plate.rotation.x=Math.PI/2.6;
    tube([V3(px,py,tz+.14),V3(px,py+.03,tz+.45),V3(px,py+.05,e.zmax+1)],.16,'intake','duct',iL,16);
    mesh(rbox(1,.5,.7,.08,rounded),'filter','',iL,px,py+.05,e.zmax+1.35);
    marker('intake',iL,px,py+.25,zmid);
    e.air={filter:V3(px,py+.05,e.zmax+1.35),throttle:V3(px,py,tz),plenumRear:V3(px,py,e.zmax+.2)};
  }

  function makeFlow(name:string,paths:any[],perPath:number,color:any,size=.09){
    const n=paths.length*perPath, pos=new Float32Array(n*3), geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const po:any={size:size*(opts.particleScale??1),color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.95}; if(opts.dot) po.map=opts.dot;
    const pts=new THREE.Points(geo,new THREE.PointsMaterial(po)); pts.visible=false; pts.frustumCulled=false; root.add(pts);
    const ps:any[]=[]; paths.forEach((p:any,pi:number)=>{ for(let k=0;k<perPath;k++) ps.push({pi,u0:(k+rand()*.6)/perPath}); });
    R.flows[name]={pts,paths,parts:ps,pos};
  }
  function buildFlows(){
    const cv=(pts:THREE.Vector3[])=>new THREE.CatmullRomCurve3(pts,false,'centripetal');
    const air:any[]=[],exh:any[]=[],fuel:any[]=[],oil:any[]=[];
    for(const c of e.cyls){ const b=c.bankRef, is=b.is, z=c.z, run=R.runners[c.i];
      air.push({curve:cv([e.air.filter,e.air.throttle,e.air.plenumRear,V3(e.plen.x,e.plen.y,z+.01),...run.pts.slice().reverse().slice(1),toEng(b,is*.24,2.05,z),toEng(b,is*.1,1.7,z)]),cyl:c,kind:'air'});
      const col=-is*1.1;
      exh.push({curve:cv([toEng(b,-is*.1,1.75,z),toEng(b,-is*.24,2.08,z),toEng(b,-is*.5,2.33,z),toEng(b,-is*.8,2.3,z),toEng(b,-is*1.05,1.8,z),toEng(b,col,1.25,z),toEng(b,col,1.2,b.bz1-.2),toEng(b,col,1.02,b.bz1+.2),toEng(b,col,.3,b.bz1+.35)]),cyl:c,kind:'exh'});
      fuel.push({curve:cv([toEng(b,is*.13,3.5,b.bz1+.1),toEng(b,is*.13,3.5,z-.2+.02),toEng(b,is*.13,3.44,z-.2),toEng(b,is*.05,2.2,z-.2),toEng(b,is*.02,1.85,z-.1)]),cyl:c,kind:'fuel'}); }
    const gx=isV?0:(isFlat?0:.52), gy=isV?.72:(isFlat?.45:.34);
    const pick=V3(0,cc.bot-.72,e.zmin+.25), pump=V3(0,-.3,e.zmin-.45), gal0=V3(gx,gy,e.zmin-.45);
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
    const gasLayers=Math.max(layerVal(st,'pist'),layerVal(st,'head')), showGas=gasLayers<.03;
    for(const cy of R.cyl){
      const c=mod(th-cy.off,720), phi=th+cy.throw-cy.bank, s=pistonS(phi), p=phi*DEG;
      cy.piston.position.set(0,s,cy.z);
      const dx=G.r*Math.sin(p), dy=G.r*Math.cos(p)-s; cy.rod.position.set(0,s,cy.z); cy.rod.rotation.z=Math.atan2(dx,-dy);
      for(const v of cy.valves){ const Lf=v.fn(c)*G.maxLift; v.grp.position.y=G.headBot-Lf; v.tappet.position.y=G.stemTop+G.tappetH/2-Lf;
        v.spring.scale.y=(G.headBot+.63-Lf)-G.headTop; v.lobe.rotation.z=-(c-v.center)/2*DEG; }
      const crownY=s+G.crown, h=Math.max(.01,G.headBot-crownY);
      cy.gas.visible=showGas; cy.gas.position.y=crownY+h/2; cy.gas.scale.y=h;
      const gm=cy.gas.material, pr=pressure(c), ph=Math.floor(c/180);
      if(ph===0){ gm.color.copy(C.air); const f=c>VT.INJ0?clamp((c-VT.INJ0)/80,0,1):0; gm.color.lerp(C.fuel,f*.45); gm.opacity=.12+.06*f; }
      else if(ph===1){ gm.color.copy(C.air).lerp(C.comp,.6); gm.opacity=clamp(.12+pr/60,.12,.45); if(c>VT.SPARK){ gm.color.lerp(C.power,burnFrac(c)); gm.opacity=.5; } }
      else if(ph===2){ const b=burnFrac(c); gm.color.copy(C.power).lerp(C.exhaust,clamp((c-400)/140,0,1)); gm.opacity=clamp(.2+.55*b*(pr/30),.18,.75); }
      else { gm.color.copy(C.exhaust); gm.opacity=.22*(1-(c-540)/260); }
      const sk=c>=VT.SPARK&&c<VT.SPARK+12; cy.spark.visible=sk&&showGas; if(sk) cy.spark.scale.setScalar(1+hash01(th*3.1+cy.i)*.8);
      const inj=c>=VT.INJ0&&c<=VT.INJ1; cy.spray.visible=inj&&layerVal(st,'head')<.5&&((st.fade&&st.fade.injector!=null)?st.fade.injector:1)>.5; if(inj) cy.spray.material.opacity=.18+.2*Math.sin((c-VT.INJ0)/(VT.INJ1-VT.INJ0)*Math.PI);
      cy.power=clamp(Math.max(0,(pr-1)*(-dsdphi(phi)))/6,0,1);
    }
    for(const cy of R.cyl){ const on=!!st.charge&&st.charge.cyl===cy.i&&st.charge.amount>.01&&showGas; cy.charge.pts.visible=on; if(on) poseCharge(cy,th,st.charge!.amount); }
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
        m.opacity=op; m.transparent=op<.999; m.depthWrite=op>=.999; pmax=Math.max(pmax,op);
        const want:THREE.Plane[]=[]; if(clipOn&&m.userData.clip) want.push(m.userData.clip); if(sl&&SLICE_PARTS.has(part)) want.push(slicePlane);
        const key=want.length?want.map(q=>planes.indexOf(q)).join(','):''; if(key!==m.userData.clipOn){ m.clippingPlanes=want; m.clipShadows=true; m.userData.clipOn=key; m.needsUpdate=true; } }
      Pp.op=pmax; const h=hid.has(part)||pmax<.01; for(const m of Pp.meshes) m.visible=!h;
    }
    for(const kk in R.twinMats){ const tm=R.twinMats[kk]; const want:THREE.Plane[]=[]; if(clipOn&&tm.userData.clip) want.push(tm.userData.clip); if(sl) want.push(slicePlane);
      const key=want.length?want.map(q=>planes.indexOf(q)).join(','):''; if(key!==tm.userData.clipOn){ tm.clippingPlanes=want; tm.userData.clipOn=key; tm.needsUpdate=true; } }
    for(const t of R.twins){ const Pp=parts.get(t.userData.part)!; t.visible=(clipOn||!!sl)&&Pp.op>.5&&!hid.has(t.userData.part); }
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
    for(const c of R.cyl) c.spray.material.color.copy(C.fuel); }
  function dispose(){ root.traverse((o:any)=>{ if(o.geometry) o.geometry.dispose(); }); for(const m of matCache.values()) m.dispose(); for(const k in R.twinMats) R.twinMats[k].dispose(); }

  return { key, e, root, parts, R, cyl: R.cyl as any[], update, anchor, setColors, dispose, planes };
}
export type Engine = ReturnType<typeof createEngine>;
