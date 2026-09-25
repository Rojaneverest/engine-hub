
/* =====================================================================
   RENDERER, CAMERA, INTERACTION
   ===================================================================== */
const $=(s,el=document)=>el.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const RM=(()=>{ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } })();
/* Engine speed, in crank rpm. Up to MODEL_MAX_RPM the model turns at exactly that speed and the sound follows it event by
   event. Faster than that the parts would only flicker, so the model holds MODEL_MAX_RPM and the sound plays a real engine. */
const MODEL_MAX_RPM=60;
const RPM_STOPS=[5,7.5,10,15,20,30,45,60, 700,800,900,1000,1200,1500,1800,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500];
const MODEL_STOPS=RPM_STOPS.filter(r=>r<=MODEL_MAX_RPM).length;
const modelRpm=()=>Math.min(S.rpm,MODEL_MAX_RPM), realSpeed=()=>S.rpm>MODEL_MAX_RPM;
const modelDps=()=>modelRpm()*6; // crank degrees per second
const canvas=$('#gl'), stage=$('#stage');
const CAM={target:V3(0,1.4,0),tTarget:V3(0,1.4,0),rad:9,tRad:9,az:135*DEG,tAz:135*DEG,pol:64*DEG,tPol:64*DEG};

/* The scene renders into a multisampled HDR target (alpha = coverage); a composite pass tone-maps it, draws the
   ink line work from the shared ID passes, and writes a transparent canvas over the CSS drafting-paper stage.
   Both ID passes render at 2x (as in the film) so outlines are antialiased; the drawing buffer is capped so those
   targets stay affordable on large high-density screens. */
const INK_SCALE=2, MAX_BUFFER_PX=3.2e6;
/* Small repeated parts (springs, chain, gear teeth) are toned lighter than the film's defaults so they read as
   machined steel under the ink instead of dark masses competing with the pistons and rods. */
const APP_LOOK={spring:['#8e99a4',.5,.38],timing:['#8f949a',.55,.4],'timing|chain':['#737a82',.55,.4],'timing|link':['#aab1b8',.55,.36],flywheel:['#8d9298',.55,.4]};
const COMP_FRAG=`
  #define INK_INNER .5
  varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res; uniform float cNear; uniform float cFar;
  uniform float exposure; uniform vec3 inkC; uniform float inkAmt; uniform float inkOutline; uniform float inkCrease; uniform float ghostAmt;
  ${INK_GLSL}
  ${GHOST_GLSL}
  vec3 aces(vec3 x){ x *= exposure / .78; mat3 m1 = mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777);
    mat3 m2 = mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
    vec3 v = m1 * x; vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return clamp(m2 * (a / b), 0., 1.); }
  vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
  void main(){
    vec4 s = texture2D(tColor, vUv); float a = clamp(s.a, 0., 1.);
    vec3 c = srgb(aces(s.rgb / max(a, 1e-3))) * a;
    vec2 e = inkEdges(vUv); float k = max(max(e.x * inkOutline, e.y * inkCrease), ghostEdges(vUv) * ghostAmt) * inkAmt;
    gl_FragColor = vec4(c * (1. - k) + inkC * k, a * (1. - k) + k);          // premultiplied
  }`;
let comp=null, contact=null;
function contactTexture(){ const c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d'); if(!x) return null;
  x.filter='blur(14px)'; x.fillStyle='#fff'; x.beginPath(); x.roundRect?x.roundRect(30,30,68,68,18):x.rect(30,30,68,68); x.fill(); return new THREE.CanvasTexture(c); }
function initRenderer(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:true,premultipliedAlpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.localClippingEnabled=true;
  renderer.outputEncoding=THREE.LinearEncoding; renderer.toneMapping=THREE.NoToneMapping;   // the composite pass does both
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(34,1,.2,120);
  // soft illustration rig, matching the film: broad warm key high on the left, cool fill, gentle rim
  scene.add(new THREE.HemisphereLight(0xf4f1ea,0xb9b2a6,.3));
  const key=new THREE.DirectionalLight(0xfff1e0,1.45); key.position.set(-7,11,-6); scene.add(key);
  const fill=new THREE.DirectionalLight(0xe8eef8,.4); fill.position.set(8,3,6); scene.add(fill);
  const rim=new THREE.DirectionalLight(0xffffff,.7); rim.position.set(2,6,11); scene.add(rim);
  try{ // bright, neutral photo-studio environment so machined metal reads as polished, not black
    const pm=new THREE.PMREMGenerator(renderer), es=new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.BoxGeometry(30,30,30),new THREE.MeshBasicMaterial({color:0x6d6a64,side:THREE.BackSide})));
    const sb=(w,h,x,y,z,k,c=[1,1,1])=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(k*c[0],k*c[1],k*c[2]),side:THREE.DoubleSide})); m.position.set(x,y,z); m.lookAt(0,0,0); es.add(m); };
    sb(16,6,0,14,-2,1.55,[1,.96,.9]); sb(4,14,14,4,-7,1.05); sb(4,14,-14,4,7,.9,[.9,.95,1.05]); sb(26,3,0,1,-14,.7); sb(30,30,0,-14,0,.32,[1,.97,.92]);
    env=pm.fromScene(es,.04).texture; scene.environment=env;
  }catch(err){}
  contact=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:contactTexture()||undefined,color:0x4a3f33,transparent:true,opacity:.45,depthWrite:false}));
  contact.rotation.x=-Math.PI/2; scene.add(contact);
  const MS=THREE.WebGLMultisampleRenderTarget, hdr={type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter};
  const rt=renderer.capabilities.isWebGL2&&MS?new MS(1,1,hdr):new THREE.WebGLRenderTarget(1,1,hdr); rt.samples=4;
  rt.depthTexture=new THREE.DepthTexture(1,1); rt.depthTexture.type=THREE.UnsignedIntType;
  const ids=new InkIds(1,1,INK_SCALE), ghostIds=new InkIds(1,1,INK_SCALE);
  const mat=new THREE.ShaderMaterial({vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',fragmentShader:COMP_FRAG,depthTest:false,depthWrite:false,blending:THREE.NoBlending,
    uniforms:{tColor:{value:rt.texture},tDepth:{value:rt.depthTexture},tInkId:{value:ids.rt.texture},tGhostId:{value:ghostIds.rt.texture},inkIdScale:{value:INK_SCALE},res:{value:new THREE.Vector2(1,1)},cNear:{value:.2},cFar:{value:120},
      exposure:{value:1},inkC:{value:new THREE.Vector3()},inkAmt:{value:1},inkOutline:{value:.88},inkCrease:{value:.32},ghostAmt:{value:.45}}});
  const qs=new THREE.Scene(), q=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat); q.frustumCulled=false; qs.add(q);
  comp={rt,ids,ghostIds,mat,qs,qc:new THREE.OrthographicCamera(-1,1,1,-1,0,1)};
  applyTheme();
}
/* Faded parts (X-ray housings, isolation, flow focus, the phantom timing chain) dissolve their fill and are drawn as
   faint outlines where they are actually seen, instead of stacking translucent surfaces into a milky haze. */
const GHOSTS=new Map(), GHOST_RESTORE=[], GHOST_HID=[];
function render(){
  GHOSTS.clear(); GHOST_RESTORE.length=0; GHOST_HID.length=0;
  if(EN) EN.root.traverseVisible(o=>{ if(!o.isMesh||o.userData.twin||o.userData.noInk||Array.isArray(o.material)) return;
    const m=o.material, op=m.userData.ghostOp??m.opacity; if(op>=.999) return;
    if(m.userData.ghostOp==null){ m.userData.ghostOp=op; GHOST_RESTORE.push([m,op]); m.opacity=clamp((op-.5)/.5,0,1); }
    GHOSTS.set(o,(1-m.opacity)*clamp(op/.06,0,1)); if(m.opacity<.01){ o.visible=false; GHOST_HID.push(o); } });
  renderer.setClearColor(0x000000,0); renderer.setRenderTarget(comp.rt); renderer.clear(); renderer.render(scene,camera);
  comp.ids.render(renderer,scene,camera,o=>o.userData.part!=null);
  for(const o of GHOST_HID) o.visible=true;
  if(GHOSTS.size) comp.ghostIds.renderGhosts(renderer,scene,camera,GHOSTS,o=>o.userData.part!=null&&!GHOSTS.has(o)&&!o.userData.noInk&&o.material.opacity>=.5);
  for(const [m,op] of GHOST_RESTORE){ m.opacity=op; delete m.userData.ghostOp; }
  comp.mat.uniforms.ghostAmt.value=GHOSTS.size?.45:0;
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(comp.qs,comp.qc); }
function applyTheme(){ const dark=new THREE.Color(cssVar('--scene')||'#f1eee7').getHSL({h:0,s:0,l:0}).l<.5;
  const ink=new THREE.Color(cssVar('--ink')||'#23211e'); comp.mat.uniforms.inkC.value.set(ink.r,ink.g,ink.b); comp.mat.uniforms.inkAmt.value=dark?.62:1;
  comp.mat.uniforms.exposure.value=dark?.92:1; contact.material.opacity=dark?.7:.45; contact.material.color.set(dark?0x000000:0x4a3f33);
  if(EN){ EN.setColors(readColors()); EN.setHatch({color:cssVar('--hatch')||'#3a2e1c',amount:dark?.22:.38}); } }
/* Manual light/dark toggle. A stored choice wins; with none, the app follows the system setting. */
const THEME_KEY='engine-lab-theme';
function systemDark(){ try{ return matchMedia('(prefers-color-scheme: dark)').matches; }catch(e){ return false; } }
function currentTheme(){ const t=document.documentElement.dataset.theme; return t==='light'||t==='dark'?t:(systemDark()?'dark':'light'); }
function syncThemeButton(){ const dark=currentTheme()==='dark',b=$('#themeToggle'),label=dark?'Switch to light mode':'Switch to dark mode';
  b.setAttribute('aria-pressed',dark); b.setAttribute('aria-label',label); b.title=label; }
function setTheme(theme){ document.documentElement.dataset.theme=theme; try{ localStorage.setItem(THEME_KEY,theme); }catch(e){} syncThemeButton(); if(renderer&&comp)applyTheme(); }
try{ const t=localStorage.getItem(THEME_KEY); if(t==='light'||t==='dark') document.documentElement.dataset.theme=t; }catch(e){}
$('#themeToggle').onclick=()=>setTheme(currentTheme()==='dark'?'light':'dark'); syncThemeButton();
try{ matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{ syncThemeButton(); if(renderer&&comp)applyTheme(); }); }catch(e){}
try{ new MutationObserver(()=>{ syncThemeButton(); if(renderer&&comp)applyTheme(); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']}); }catch(e){}

let stageAspect=null;
function resize(){ if(!renderer)return; const w=stage.clientWidth||1, h=stage.clientHeight||1; const aspect=w/h;if(stage.clientWidth>0){const fit=a=>Math.max(1,1/a);if(stageAspect!==null){const ratio=fit(aspect)/fit(stageAspect);CAM.rad*=ratio;CAM.tRad*=ratio;}stageAspect=aspect;}const pr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(MAX_BUFFER_PX/(w*h))); if(renderer.getPixelRatio()!==pr) renderer.setPixelRatio(pr);
  renderer.setSize(w,h,false); camera.aspect=aspect; camera.updateProjectionMatrix();
  const b=renderer.getDrawingBufferSize(new THREE.Vector2()); comp.rt.setSize(b.x,b.y);
  comp.ids.setSize(b.x,b.y); comp.ghostIds.setSize(b.x,b.y); comp.mat.uniforms.res.value.copy(b); }
function defaultView(){ const e=EN.e; const len=e.zmax-e.zmin;
  return {target:V3(0,e.isFlat?.4:1.45,0),rad:8+.55*len+(e.N===1?1.6:0)+(e.isV?1.4:0)+(e.isFlat?1.6:0),az:135*DEG,pol:(e.isFlat?58:64)*DEG}; }
function resetView(instant){ const d=defaultView(); CAM.tTarget.copy(d.target); CAM.tRad=d.rad*(S.explode?1.55:1)*Math.max(1,(stage.clientHeight||1)/(stage.clientWidth||1)); CAM.tAz=d.az; CAM.tPol=d.pol;
  if(instant||RM){ CAM.target.copy(CAM.tTarget); CAM.rad=CAM.tRad; CAM.az=CAM.tAz; CAM.pol=CAM.tPol; } S.follow=false; syncTools(); }
function updateCamera(dt){
  if(S.follow&&EN.cyl[S.focusCyl]){ EN.cyl[S.focusCyl].piston.getWorldPosition(TMPV2); CAM.tTarget.copy(TMPV2); CAM.tTarget.y+=.2; }
  const k=RM?1:1-Math.exp(-dt*9);
  CAM.az+=(CAM.tAz-CAM.az)*k; CAM.pol+=(CAM.tPol-CAM.pol)*k; CAM.rad+=(CAM.tRad-CAM.rad)*k; CAM.target.lerp(CAM.tTarget,k);
  const t=CAM.target; camera.position.set(t.x+CAM.rad*Math.sin(CAM.pol)*Math.sin(CAM.az),t.y+CAM.rad*Math.cos(CAM.pol),t.z+CAM.rad*Math.sin(CAM.pol)*Math.cos(CAM.az));
  camera.lookAt(t);
  if(contact&&EN){ contact.position.y=EN.e.cc.bot-.91-(S.explode?2.6*smooth(S.explodeT):0); contact.scale.set(EN.e.cc.hw*2+1.1,EN.e.zmax-EN.e.zmin+2.6,1); }
}

/* ---- pointer: orbit / pan / zoom / pick */
const ray=new THREE.Raycaster(), ptr=new Map(); let drag=null, pinch=null;
function visibleChain(o){ while(o){ if(!o.visible) return false; o=o.parent; } return true; }
function pick(cx,cy){
  const r=canvas.getBoundingClientRect(); const nd=new THREE.Vector2((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1);
  ray.setFromCamera(nd,camera);
  for(const h of ray.intersectObject(EN.root,true)){ const o=h.object, part=o.userData.part; if(!part||!visibleChain(o)) continue;
    const Pp=EN.parts.get(part); if(!Pp||Pp.op<.2) continue;
    const cp=o.material.clippingPlanes; if(cp?.some(plane=>plane.distanceToPoint(h.point)<0)) continue;
    return {part,point:h.point,cylinder:o.userData.cyl??o.material.userData?.cyl??null}; }
  return null;
}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{ canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptr.size===1) drag={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,pan:e.button===2||e.shiftKey,moved:false};
  else if(ptr.size===2){ const [a,b]=[...ptr.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2}; drag=null; } });
function panBy(dx,dy){ const s=CAM.rad*.0016; const right=V3().setFromMatrixColumn(camera.matrix,0), up=V3().setFromMatrixColumn(camera.matrix,1);
  CAM.tTarget.addScaledVector(right,-dx*s).addScaledVector(up,dy*s); S.follow=false; syncTools(); }
canvas.addEventListener('pointermove',e=>{
  if(ptr.has(e.pointerId)) ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&ptr.size===2){ const [a,b]=[...ptr.values()], d=Math.hypot(a.x-b.x,a.y-b.y), mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    CAM.tRad=clamp(CAM.tRad*pinch.d/d,2,40); panBy(mx-pinch.mx,my-pinch.my); pinch={d,mx,my}; return; }
  if(drag){ const dx=e.clientX-drag.x, dy=e.clientY-drag.y; drag.x=e.clientX; drag.y=e.clientY;
    if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>4) drag.moved=true;
    if(drag.moved){ canvas.classList.add('dragging'); $('#tip').hidden=true;
      if(drag.pan) panBy(dx,dy); else { CAM.tAz-=dx*.006; CAM.tPol=clamp(CAM.tPol-dy*.006,.12,Math.PI-.12); } }
    return; }
  hoverAt=[e.clientX,e.clientY];
});
canvas.addEventListener('pointerup',e=>{ ptr.delete(e.pointerId); canvas.classList.remove('dragging');
  if(drag&&drag.moved) S.hintDone=true;
  if(drag&&!drag.moved&&e.button!==2){ const h=pick(e.clientX,e.clientY); if(h&&!S.hintDone) S.hintDone=true; select(h?h.part:null,h?.cylinder??null); }
  if(ptr.size<2) pinch=null; if(ptr.size===0) drag=null; });
canvas.addEventListener('pointerleave',()=>{ hoverAt=null; S.hover=null; $('#tip').hidden=true; canvas.classList.remove('hovering'); });
canvas.addEventListener('dblclick',e=>{ const h=pick(e.clientX,e.clientY); if(h){ CAM.tTarget.copy(h.point); CAM.tRad=Math.max(2.4,CAM.tRad*.55); S.follow=false; syncTools(); } });
canvas.addEventListener('wheel',e=>{ e.preventDefault(); CAM.tRad=clamp(CAM.tRad*Math.exp(e.deltaY*.0011),2,40); },{passive:false});
let hoverAt=null;
function doHover(){ if(!hoverAt||drag) return; const [x,y]=hoverAt; hoverAt=null; const h=pick(x,y), tip=$('#tip');
  S.hover=h?h.part:null; canvas.classList.toggle('hovering',!!h);
  if(h){ const r=stage.getBoundingClientRect(), d=PARTS_INFO[h.part]; tip.innerHTML=esc(d.name)+'<small>'+esc(d.moves)+'</small>'; tip.hidden=false;tip.style.left=clamp(x-r.left+12,8,Math.max(8,r.width-(tip.offsetWidth||220)-8))+'px';tip.style.top=clamp(y-r.top+12,8,Math.max(8,r.height-(tip.offsetHeight||42)-8))+'px'; }
  else tip.hidden=true; }
