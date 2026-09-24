
/* =====================================================================
   RENDERER, CAMERA, INTERACTION
   ===================================================================== */
const $=(s,el=document)=>el.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const RM=(()=>{ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } })();
const BASE_DPS=180; // 1× = one full 720° cycle every 4 s (≈30 rpm)
const canvas=$('#gl'), stage=$('#stage');
const CAM={target:V3(0,1.4,0),tTarget:V3(0,1.4,0),rad:9,tRad:9,az:135*DEG,tAz:135*DEG,pol:64*DEG,tPol:64*DEG};

/* The scene renders into a multisampled HDR target (alpha = coverage); a composite pass tone-maps it, draws the
   ink line work from the shared ID pass, and writes a transparent canvas over the CSS drafting-paper stage. */
const COMP_FRAG=`
  varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res; uniform float cNear; uniform float cFar;
  uniform float exposure; uniform vec3 inkC; uniform float inkAmt; uniform float inkOutline; uniform float inkCrease;
  ${INK_GLSL}
  vec3 aces(vec3 x){ x *= exposure / .78; mat3 m1 = mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777);
    mat3 m2 = mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
    vec3 v = m1 * x; vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return clamp(m2 * (a / b), 0., 1.); }
  vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
  void main(){
    vec4 s = texture2D(tColor, vUv); float a = clamp(s.a, 0., 1.);
    vec3 c = srgb(aces(s.rgb / max(a, 1e-3))) * a;
    vec2 e = inkEdges(vUv); float k = max(e.x * inkOutline, e.y * inkCrease) * inkAmt;
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
  const ids=new InkIds(1,1,1);
  const mat=new THREE.ShaderMaterial({vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',fragmentShader:COMP_FRAG,depthTest:false,depthWrite:false,blending:THREE.NoBlending,
    uniforms:{tColor:{value:rt.texture},tDepth:{value:rt.depthTexture},tInkId:{value:ids.rt.texture},inkIdScale:{value:1},res:{value:new THREE.Vector2(1,1)},cNear:{value:.2},cFar:{value:120},
      exposure:{value:1},inkC:{value:new THREE.Vector3()},inkAmt:{value:1},inkOutline:{value:.88},inkCrease:{value:.42}}});
  const qs=new THREE.Scene(), q=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat); q.frustumCulled=false; qs.add(q);
  comp={rt,ids,mat,qs,qc:new THREE.OrthographicCamera(-1,1,1,-1,0,1)};
  applyTheme();
}
function render(){
  renderer.setClearColor(0x000000,0); renderer.setRenderTarget(comp.rt); renderer.clear(); renderer.render(scene,camera);
  comp.ids.render(renderer,scene,camera,o=>o.userData.part!=null);
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(comp.qs,comp.qc); }
function applyTheme(){ const dark=new THREE.Color(cssVar('--scene')||'#f1eee7').getHSL({h:0,s:0,l:0}).l<.5;
  const ink=new THREE.Color(cssVar('--ink')||'#23211e'); comp.mat.uniforms.inkC.value.set(ink.r,ink.g,ink.b); comp.mat.uniforms.inkAmt.value=dark?.62:1;
  comp.mat.uniforms.exposure.value=dark?.92:1; contact.material.opacity=dark?.7:.45; contact.material.color.set(dark?0x000000:0x4a3f33);
  if(EN){ EN.setColors(readColors()); EN.setHatch({color:cssVar('--hatch')||'#3a2e1c',amount:dark?.22:.38}); } }
try{ matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{ applyTheme(); drawTimelineBase(); }); }catch(e){}
try{ new MutationObserver(()=>{ applyTheme(); drawTimelineBase(); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']}); }catch(e){}

function resize(){ const w=stage.clientWidth||1, h=stage.clientHeight||1; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
  const b=renderer.getDrawingBufferSize(new THREE.Vector2()); comp.rt.setSize(b.x,b.y);
  comp.ids.setSize(b.x,b.y); comp.mat.uniforms.res.value.copy(b); drawTimelineBase(); }
function defaultView(){ const e=EN.e; const len=e.zmax-e.zmin;
  return {target:V3(0,e.isFlat?.4:1.45,0),rad:8+.55*len+(e.N===1?1.6:0)+(e.isV?1.4:0)+(e.isFlat?1.6:0),az:135*DEG,pol:(e.isFlat?58:64)*DEG}; }
function resetView(instant){ const d=defaultView(); CAM.tTarget.copy(d.target); CAM.tRad=d.rad*(S.explode?1.55:1); CAM.tAz=d.az; CAM.tPol=d.pol;
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
    const cp=o.material.clippingPlanes; if(cp&&cp.length&&cp[0].distanceToPoint(h.point)<0) continue;
    return {part,point:h.point}; }
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
  if(drag&&drag.moved&&!S.hintDone) dismissHint();
  if(drag&&!drag.moved&&e.button!==2){ const h=pick(e.clientX,e.clientY); if(h&&!S.hintDone) S.hintDone=true; select(h?h.part:null); if($('#engineView').classList.contains('clean')) $('#info').hidden=true; }
  if(ptr.size<2) pinch=null; if(ptr.size===0) drag=null; });
canvas.addEventListener('pointerleave',()=>{ hoverAt=null; S.hover=null; $('#tip').hidden=true; canvas.classList.remove('hovering'); });
canvas.addEventListener('dblclick',e=>{ const h=pick(e.clientX,e.clientY); if(h){ CAM.tTarget.copy(h.point); CAM.tRad=Math.max(2.4,CAM.tRad*.55); S.follow=false; syncTools(); } });
canvas.addEventListener('wheel',e=>{ e.preventDefault(); CAM.tRad=clamp(CAM.tRad*Math.exp(e.deltaY*.0011),2,40); },{passive:false});
let hoverAt=null;
function doHover(){ if(!hoverAt||drag) return; const [x,y]=hoverAt; hoverAt=null; const h=pick(x,y), tip=$('#tip');
  S.hover=h?h.part:null; canvas.classList.toggle('hovering',!!h);
  if(h){ const r=stage.getBoundingClientRect(), d=PARTS_INFO[h.part]; tip.innerHTML=esc(d.name)+'<small>'+esc(d.moves)+'</small>'; tip.style.left=(x-r.left)+'px'; tip.style.top=(y-r.top)+'px'; tip.hidden=false; }
  else tip.hidden=true; }

/* =====================================================================
   ENGINE VIEW UI
   ===================================================================== */
function setArch(key){ S.arch=key; if(EN){ scene.remove(EN.root); EN.dispose(); } EN=createEngine(key,{colors:readColors(),dot:dotTexture()}); scene.add(EN.root); applyTheme(); S.focusCyl=0; S.hidden.clear();
  if(S.sel&&!EN.parts.has(S.sel)) select(null);
  document.querySelectorAll('#archSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.arch===key));
  renderArchLine(); renderCylChips(); drawTimelineBase(); applyVisual(); resetView(false); EN.update(engineState(0));
  if($('#drawer').classList.contains('open')) renderDrawer(); syncHidden(); }
function renderArchLine(){ const a=ARCHS[S.arch], e=EN.e;
  $('#archLine').innerHTML=`<span><b>${esc(a.full)}</b>, ${e.N} cylinder${e.N>1?'s':''}${e.N>1?', firing order '+a.firing.join('-'):''}</span><button class="link" id="aboutBtn">Why this layout?</button>`;
  $('#aboutBtn').onclick=()=>openDrawer(true); }
function select(part){ S.sel=part; S.isolate=S.isolate&&!!part; const info=$('#info');
  if(part){ info.hidden=false; $('#hint').hidden=true; renderInfo(); } else { info.hidden=true; $('#hint').hidden=S.hintDone||window.innerWidth<980; }
  $('#isoBtn').setAttribute('aria-pressed',S.isolate); applyVisual(); }
function renderInfo(){ const d=PARTS_INFO[S.sel]; if(!d) return;
  $('#infoTitle').textContent=d.name; $('#infoTag').textContent=d.moves;
  const lv=[['simple','Simple'],['technical','Technical'],['deep','Deep dive']];
  $('#infoBody').innerHTML=`<div class="levels" role="group" aria-label="Explanation depth">${lv.map(([k,n])=>`<button data-lv="${k}" aria-pressed="${S.level===k}">${n}</button>`).join('')}</div>
    <p class="lead">${esc(d[S.level])}</p>
    <h3>Why it's needed</h3><p>${esc(d.why)}</p>
    <h3>During the cycle</h3><p>${esc(d.cycle)}</p>
    <h3>If it fails</h3><p>${esc(d.fails)}</p>
    <h3>Connected to</h3><div class="chips">${d.rel.filter(r=>EN.parts.has(r)).map(r=>`<button class="chip" data-rel="${r}">${esc(PARTS_INFO[r].name)}</button>`).join('')}</div>`;
  $('#infoBody').querySelectorAll('[data-lv]').forEach(b=>b.onclick=()=>{ S.level=b.dataset.lv; renderInfo(); });
  $('#infoBody').querySelectorAll('[data-rel]').forEach(b=>b.onclick=()=>select(b.dataset.rel)); }
function focusPart(part){ const bb=new THREE.Box3(); let any=false;
  for(const m of EN.parts.get(part).meshes){ if(!m.visible) continue; bb.expandByObject(m); any=true; }
  if(!any) return; const c=bb.getCenter(V3()), s=bb.getSize(V3()).length();
  CAM.tTarget.copy(c); CAM.tRad=clamp(s*1.9+1.4,2.4,30); S.follow=false; syncTools(); }
$('#infoClose').onclick=()=>select(null);
$('#isoBtn').onclick=()=>{ S.isolate=!S.isolate; $('#isoBtn').setAttribute('aria-pressed',S.isolate); applyVisual(); };
$('#hideBtn').onclick=()=>{ if(!S.sel) return; S.hidden.add(S.sel); select(null); syncHidden(); };
$('#focusBtn').onclick=()=>S.sel&&focusPart(S.sel);
$('#showAll').onclick=()=>{ S.hidden.clear(); applyVisual(); syncHidden(); };
function syncHidden(){ const b=$('#showAll'); b.hidden=!S.hidden.size; b.textContent=`Show hidden parts (${S.hidden.size})`; }

function setView(v){ S.view=v; applyVisual(); syncTools(); }
function setExplode(on){ S.explode=on; if(on&&S.flow!=='off'&&S.flow!=='power') setFlow('off'); const d=defaultView(); if(!S.follow) CAM.tRad=d.rad*(on?1.55:1); if(on) CAM.tTarget.set(0,EN.e.isFlat?.4:2,0); syncTools(); }
function setFlow(f){ S.flow=f; if(f!=='off'&&f!=='power'&&S.explode) S.explode=false; applyVisual(); syncTools(); $('#powerpath').classList.toggle('on',f==='power'); }
function setSpeed(x){ S.speed=x; renderSpeeds(); }
function play(on){ S.playing=on; $('#playIcon').innerHTML=on?'<path d="M3 2h4v12H3zM9 2h4v12H9z"/>':'<path d="M4 2l10 6-10 6z"/>'; $('#playBtn').setAttribute('aria-label',on?'Pause':'Play'); }
function setTheta(c){ const cy=EN.cyl[S.focusCyl]; const cur=mod(S.theta-cy.off,720); S.theta+=mod(c-cur+360,720)-360; }
function syncTools(){
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===S.view));
  document.querySelectorAll('[data-flow]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.flow===S.flow));
  $('#explodeBtn').setAttribute('aria-pressed',S.explode); $('#explodeBtn').textContent=S.explode?'Assemble':'Explode';
  $('#followBtn').setAttribute('aria-pressed',S.follow);
  const fb=$('#flowsBtn'); fb.setAttribute('aria-pressed',S.flow!=='off'); $('#flowsLbl').textContent=S.flow==='off'?'Flows':'Flow: '+S.flow[0].toUpperCase()+S.flow.slice(1);
  $('#flowsDot').style.display=S.flow==='off'?'none':''; fb.style.setProperty('--c',S.flow==='off'?'':`var(--${S.flow})`); }
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelectorAll('[data-flow]').forEach(b=>b.onclick=()=>setFlow(b.dataset.flow));
$('#explodeBtn').onclick=()=>setExplode(!S.explode);
$('#followBtn').onclick=()=>{ S.follow=!S.follow; if(S.follow) CAM.tRad=Math.min(CAM.tRad,4.5); else resetView(false); syncTools(); };
$('#resetView').onclick=()=>resetView(false);
function setNowMin(min){ const n=$('#now'); n.classList.toggle('min',min); $('#nowMin').textContent=min?'Explain':'Hide'; $('#nowMin').setAttribute('aria-expanded',!min); }
$('#nowMin').onclick=()=>setNowMin(!$('#now').classList.contains('min'));
function setTransport(full){ const t=$('#transport'); t.classList.toggle('compact',!full); $('#engineView').classList.toggle('tfull',full);
  $('#tExpand').setAttribute('aria-expanded',full); $('#tExpand').setAttribute('aria-label',full?'Collapse controls':'Show full timeline'); requestAnimationFrame(drawTimelineBase); }
$('#tExpand').onclick=()=>setTransport($('#transport').classList.contains('compact'));
function setFlowsOpen(o){ $('#flowRow').hidden=!o; $('#flowsBtn').setAttribute('aria-expanded',o); $('#engineView').classList.toggle('flowsopen',o); }
$('#flowsBtn').onclick=()=>setFlowsOpen($('#flowRow').hidden);
let preClean=null;
function setClean(on){ const ev=$('#engineView'); if(on===ev.classList.contains('clean')) return;
  if(on){ preClean=!$('#transport').classList.contains('compact'); setTransport(false); $('#tip').hidden=true; }
  else if(preClean) setTransport(true);
  ev.classList.toggle('clean',on); $('#cleanBtn').setAttribute('aria-pressed',on); $('#cleanBtn').textContent=on?'Exit clean view':'Clean view'; }
$('#cleanBtn').onclick=()=>{ showTab('engine'); setClean(!$('#engineView').classList.contains('clean')); };
$('#cleanExit').onclick=()=>setClean(false);
function dismissHint(){ $('#hint').hidden=true; S.hintDone=true; }
$('#hintX').onclick=dismissHint;

/* ---- transport */
const SPEEDS=[.1,.25,.5,1,2,4];
function renderSpeeds(){ $('#spdBtn').textContent=S.speed+'×'; $('#speeds').innerHTML=SPEEDS.map(s=>`<button data-sp="${s}" aria-pressed="${s===S.speed}">${s}×</button>`).join('');
  $('#speeds').querySelectorAll('button').forEach(b=>b.onclick=()=>setSpeed(+b.dataset.sp));
  const rpm=S.speed*30; $('#rate').textContent=`One cycle every ${(4/S.speed).toFixed(S.speed>=1?1:0)} s (${rpm<10?rpm.toFixed(1):Math.round(rpm)} rpm). A real engine idles about ${Math.round(750/rpm)}× faster.`; }
$('#playBtn').onclick=()=>play(!S.playing);
$('#spdBtn').onclick=()=>setSpeed(SPEEDS[(SPEEDS.indexOf(S.speed)+1)%SPEEDS.length]);
$('#stepFwd').onclick=()=>{ play(false); S.theta+=10; };
$('#stepBack').onclick=()=>{ play(false); S.theta-=10; };
function renderCylChips(){ const e=EN.e, a=ARCHS[S.arch];
  $('#cyls').innerHTML=e.N>1?e.cyls.map((c,i)=>`<button class="cyl" data-cy="${i}" aria-pressed="${i===S.focusCyl}" style="--c:var(--air)"><i></i><b>${c.n}</b><span></span></button>`).join(''):'';
  $('#cyls').querySelectorAll('.cyl').forEach(b=>b.onclick=()=>{ S.focusCyl=+b.dataset.cy; renderCylChips(); drawTimelineBase(); });
  $('#firing').innerHTML=e.N>1?'<span>Firing order</span>'+a.firing.map((n,i)=>`${i?'<span class="ar">→</span>':''}<span class="n" data-fn="${n}">${n}</span>`).join('')+`<span class="small">one every ${720/e.N}°</span>`:'<span class="small">One cylinder: one power stroke every 720°, two full crank turns.</span>'; }
let lastChip=0;
function updateChips(){ const th=S.theta; let firing=null,best=1e9;
  EN.cyl.forEach((c,i)=>{ const cc=mod(th-c.off,720), ph=phaseOf(cc), b=$('#cyls').children[i];
    if(b){ b.style.setProperty('--c',`var(${ph.color})`); b.querySelector('span').textContent=ph.name; }
    const since=mod(cc-VT.SPARK,720); if(since<best){ best=since; firing=c.n; } });
  $('#firing').querySelectorAll('.n').forEach(n=>n.classList.toggle('on',+n.dataset.fn===firing&&best<180)); }

/* ---- timeline (SVG): phases, valve lift, spark, injection, 0–720° with two crank turns */
const TL=$('#timeline'); let TLW=600, TLH=96, TLhead=null;
const xOf=c=>8+c/720*(TLW-16);
function drawTimelineBase(){ if(!TL||!EN) return; TLW=TL.clientWidth||600; TLH=TL.clientHeight||96; const k=TLH/96, y=v=>v*k;
  TL.setAttribute('viewBox',`0 0 ${TLW} ${TLH}`); let s='';
  if(TLH<50){ const m=TLH/2;
    for(const p of PHASES){ const w=xOf(p.to)-xOf(p.from)-2; s+=`<rect x="${xOf(p.from)+1}" y="${m-9}" width="${w}" height="18" rx="4" fill="var(${p.color})" opacity=".2"/>`+(w>70?`<text x="${(xOf(p.from)+xOf(p.to))/2}" y="${m+4}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(${p.color})">${p.name}</text>`:''); }
    s+=`<g id="tlHead"><line y1="1" y2="${TLH-1}" stroke="var(--brass)" stroke-width="2"/><circle cy="${m}" r="4.5" fill="var(--brass)"/></g>`;
    TL.innerHTML=s; TLhead=TL.querySelector('#tlHead'); return; }
  for(const p of PHASES){ s+=`<rect x="${xOf(p.from)}" y="${y(2)}" width="${xOf(p.to)-xOf(p.from)-1}" height="${y(16)}" rx="3" fill="var(${p.color})" opacity=".22"/>
    <text x="${(xOf(p.from)+xOf(p.to))/2}" y="${y(14)}" text-anchor="middle" font-size="12" font-weight="600" fill="var(${p.color})">${p.name}</text>`; }
  const path=(fn)=>{ let d=''; for(let c=0;c<=720;c+=3) d+=(c?'L':'M')+xOf(c).toFixed(1)+','+(y(58)-fn(c)*y(30)).toFixed(1); return d; };
  s+=`<path d="${path(intakeLift)} L${xOf(720)},${y(58)} L${xOf(0)},${y(58)}Z" fill="var(--air)" opacity=".13"/><path d="${path(intakeLift)}" fill="none" stroke="var(--air)" stroke-width="1.6"/>`;
  s+=`<path d="${path(exhaustLift)} L${xOf(720)},${y(58)} L${xOf(0)},${y(58)}Z" fill="var(--exhaust)" opacity=".15"/><path d="${path(exhaustLift)}" fill="none" stroke="var(--exhaust)" stroke-width="1.6"/>`;
  if(TLW>520){ s+=`<text x="${xOf(IC)}" y="${y(24)}" text-anchor="middle" font-size="11" fill="var(--air)">intake valve lift</text><text x="${xOf(EC)}" y="${y(24)}" text-anchor="middle" font-size="11" fill="var(--exhaust)">exhaust valve lift</text>`; }
  s+=`<rect x="${xOf(VT.INJ0)}" y="${y(60)}" width="${xOf(VT.INJ1)-xOf(VT.INJ0)}" height="${y(4)}" rx="2" fill="var(--fuel)"/><text x="${xOf(VT.INJ1)+4}" y="${y(64.5)}" font-size="10.5" fill="var(--fuel)">fuel</text>`;
  s+=`<path d="M${xOf(VT.SPARK)},${y(30)} l-3,${y(9)} h5 l-3,${y(9)}" fill="none" stroke="var(--power)" stroke-width="1.6"/><text x="${xOf(VT.SPARK)-5}" y="${y(36)}" text-anchor="end" font-size="10.5" fill="var(--power)">spark</text>`;
  s+=`<line x1="${xOf(0)}" x2="${xOf(720)}" y1="${y(68)}" y2="${y(68)}" stroke="var(--line2)"/>`;
  [[0,'0° TDC'],[180,'180° BDC'],[360,'360° TDC'],[540,'540° BDC'],[720,'720°']].forEach(([c,l])=>{ s+=`<line x1="${xOf(c)}" x2="${xOf(c)}" y1="${y(64)}" y2="${y(72)}" stroke="var(--line2)"/><text x="${xOf(c)}" y="${y(81)}" text-anchor="${c===0?'start':c===720?'end':'middle'}" font-size="11" fill="var(--muted)">${l}</text>`; });
  s+=`<path d="M${xOf(2)},${y(86)} v${y(4)} H${xOf(358)} v${-y(4)} M${xOf(362)},${y(86)} v${y(4)} H${xOf(718)} v${-y(4)}" fill="none" stroke="var(--faint)"/>
    <text x="${xOf(180)}" y="${y(95)}" text-anchor="middle" font-size="10.5" fill="var(--faint)">crank turn 1</text><text x="${xOf(540)}" y="${y(95)}" text-anchor="middle" font-size="10.5" fill="var(--faint)">crank turn 2 (camshaft completes 1 turn)</text>`;
  s+=`<g id="tlHead"><line y1="0" y2="${y(72)}" stroke="var(--brass)" stroke-width="2"/><circle cy="${y(68)}" r="6" fill="var(--brass)"/></g>`;
  TL.innerHTML=s; TLhead=TL.querySelector('#tlHead'); }
function updateTimelineHead(){ if(!TLhead) return; const c=mod(S.theta-EN.cyl[S.focusCyl].off,720); TLhead.setAttribute('transform',`translate(${xOf(c)},0)`); }
let scrub=null;
TL.addEventListener('pointerdown',e=>{ TL.setPointerCapture(e.pointerId); scrub={was:S.playing}; play(false); scrubTo(e); });
TL.addEventListener('pointermove',e=>{ if(scrub) scrubTo(e); });
TL.addEventListener('pointerup',()=>{ if(scrub&&scrub.was) play(true); scrub=null; });
function scrubTo(e){ const r=TL.getBoundingClientRect(); const c=clamp((e.clientX-r.left)/r.width*TLW-8,0,TLW-16)/(TLW-16)*720; setTheta(Math.min(c,719.5)); }

/* ---- "What is actually happening?" narration */
function describe(c){
  const li=intakeLift(c), le=exhaustLift(c), b=[], m=mod(c,360);
  if(li>.003&&le>.003) b.push('Both valves are slightly open: valve overlap. Outgoing exhaust helps pull fresh air in.');
  else if(li>.003) b.push(`Intake valve open (${Math.round(li*12)} mm of a 12 mm maximum lift).`);
  else if(le>.003) b.push(`Exhaust valve open (${Math.round(le*12)} mm lift).`);
  else b.push('Both valves are closed. The cylinder is sealed.');
  if(m<7||m>353) b.push('Piston at top dead centre (TDC): momentarily stopped as it reverses.');
  else if(Math.abs(m-180)<7) b.push('Piston at bottom dead centre (BDC): momentarily stopped as it reverses.');
  else b.push(m<180?'Piston moving down.':'Piston moving up.');
  if(c<VT.INJ0) b.push('The falling piston lowers cylinder pressure and air rushes in.');
  else if(c<=VT.INJ1) b.push('The injector sprays fuel straight into the swirling air, where it mixes and evaporates.');
  else if(c<180) b.push('The cylinder keeps filling as the piston nears the bottom.');
  else if(c<VT.IVC) b.push('Already rising, but the intake valve stays open ~40° past BDC: the moving air\u2019s momentum keeps packing the cylinder.');
  else if(c<VT.SPARK) b.push('The mixture is squeezed: pressure and temperature rise. The spark hasn\u2019t fired yet.');
  else if(c<360) b.push('Spark! It fires ~15° before TDC because the flame needs time to spread; peak pressure should arrive just after TDC.');
  else if(c<420) b.push('Combustion drives pressure to its peak. The gas pushes the piston down and the rod turns the crank: this is the only stroke that makes work.');
  else if(c<VT.EVO) b.push('The gas expands and cools but keeps pushing the piston.');
  else if(c<540) b.push('The exhaust valve opens before BDC: leftover pressure blows most of the exhaust out on its own (blowdown).');
  else if(c<VT.IVO) b.push('The rising piston pushes the remaining exhaust out.');
  else b.push('The intake valve starts opening before TDC so it is well open when the piston starts down.');
  return b;
}
let lastNow=-1;
function updateNow(){ const cy=EN.cyl[S.focusCyl], c=mod(S.theta-cy.off,720), key=Math.round(c*2); if(key===lastNow) return; lastNow=key;
  const ph=phaseOf(c), pr=pressure(c);
  $('#nowAngle').innerHTML=`${Math.floor(c)}<small>°</small>`;
  $('#nowSub').innerHTML=`${EN.e.N>1?'Cylinder '+cy.n+' cycle angle':'Cycle angle'}<br>Crank turn ${c<360?1:2} of 2, camshaft at ${Math.floor(c/2)}°`;
  const pe=$('#nowPhase'); pe.style.color=`var(${ph.color})`; pe.querySelector('span').textContent=ph.name+(c>=VT.SPARK&&c<420&&ph.key!=='intake'?' (combustion)':'');
  $('#nowList').innerHTML=describe(c).map(t=>`<li>${esc(t)}</li>`).join('');
  $('#pbar').style.width=clamp(pr/40*100,1,100)+'%'; $('#pval').textContent=`~${pr<2?pr.toFixed(1):Math.round(pr)} bar`; }

/* ---- keyboard */
document.addEventListener('keydown',e=>{ if(e.target.closest&&e.target.closest('input,textarea,select')) return; if(e.key===' '&&e.target.closest&&e.target.closest('button')) return; if($('#engineView').hidden) return;
  const k=e.key.toLowerCase();
  if(k===' '){ e.preventDefault(); play(!S.playing); }
  else if(k==='arrowright'){ play(false); S.theta+=e.shiftKey?1:10; }
  else if(k==='arrowleft'){ play(false); S.theta-=e.shiftKey?1:10; }
  else if(k==='e') setExplode(!S.explode); else if(k==='c') setView(S.view==='cutaway'?'full':'cutaway');
  else if(k==='x') setView(S.view==='xray'?'full':'xray'); else if(k==='r') resetView(false);
  else if(k==='h') setClean(!$('#engineView').classList.contains('clean'));
  else if(k==='t') setTransport($('#transport').classList.contains('compact'));
  else if(k==='escape'){ if($('#drawer').classList.contains('open')) openDrawer(false); else if($('#engineView').classList.contains('clean')) setClean(false); else select(null); } });

/* ---- architecture drawer */
function openDrawer(on){ const d=$('#drawer'); if(on) renderDrawer(); d.classList.toggle('open',on); }
let cmpKey=null;
function renderDrawer(){ const a=ARCHS[S.arch], e=EN.e;
  if(cmpKey===S.arch) cmpKey=null;
  const facts=[['Cylinders',e.N],['Layout',a.layout],['Crankshaft',a.crank],['Firing order shown',a.firing.join('-')],['Firing interval',a.interval],['Balance',a.balance],['Packaging',a.packaging],['Character',a.character],['Common uses',a.uses]];
  $('#drawer').innerHTML=`<button class="x" id="dx" aria-label="Close">×</button><h2>${esc(a.full)}</h2><p class="lede">${esc(a.tagline)}</p>
  <div class="facts">${facts.map(([k,v])=>`<div>${k}</div><div>${esc(v)}</div>`).join('')}</div>
  ${a.note?`<p class="small" style="margin-top:8px">${esc(a.note)}</p>`:''}
  <h3>Why this design exists</h3><div class="qa">${a.why.map(([q,t],i)=>`<details ${i?'':'open'}><summary>${esc(q)}</summary><p>${esc(t)}</p></details>`).join('')}</div>
  <h3>How smooth is it? Power pulses over one cycle</h3>
  <p style="margin:0 0 6px;font-size:14.5px;max-width:62ch">Each thin line is one cylinder\u2019s push on the crankshaft; the thick line is their sum. Dips below zero are compression strokes taking energy back. The flatter the thick line, the smoother the engine.</p>
  <div class="cmp"><span class="small" style="align-self:center">Compare with</span>${ARCH_ORDER.filter(k=>k!==S.arch).map(k=>`<button class="btn sm" data-cmp="${k}" aria-pressed="${k===cmpKey}">${ARCHS[k].name}</button>`).join('')}</div>
  <svg id="smooth" role="img" aria-label="Torque pulse chart"></svg>
  <p class="small">Educational approximation: gas-pressure torque only, ignoring the inertia of moving parts; each curve is divided by its own average.</p>
  <div class="two"><div><h3>Advantages</h3><ul>${a.pros.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div><div><h3>Trade-offs</h3><ul>${a.cons.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div></div>
  <h3>Real-world examples</h3>${a.examples.map(x=>`<div class="ex"><b>${esc(x.e)}</b><div class="spec">${esc(x.spec)}. Used in ${esc(x.cars)}.</div><p>${esc(x.why)}</p></div>`).join('')}
  <h3>Sources and accuracy</h3><p class="small">General principles follow standard references such as J. B. Heywood, <i>Internal Combustion Engine Fundamentals</i> (McGraw-Hill), and the Bosch <i>Automotive Handbook</i>. Example specifications are manufacturers\u2019 published figures. Firing orders, cylinder numbering and valvetrain layouts vary between specific engines; this model shows one representative configuration per layout, all with the same bore, stroke and valve timing so the layouts can be compared fairly.</p>`;
  $('#dx').onclick=()=>openDrawer(false);
  $('#drawer').querySelectorAll('[data-cmp]').forEach(b=>b.onclick=()=>{ cmpKey=cmpKey===b.dataset.cmp?null:b.dataset.cmp; renderDrawer(); });
  drawSmooth(); }
function torqueSeries(key){ const e=deriveEngine(key), tot=[], per=e.cyls.map(()=>[]);
  for(let th=0;th<=720;th+=3){ let t=0; e.cyls.forEach((c,i)=>{ const v=cylTorque(c,th); per[i].push(v); t+=v; }); tot.push(t); }
  const mean=tot.reduce((a,b)=>a+b,0)/tot.length; return {tot:tot.map(v=>v/mean),per:per.map(p=>p.map(v=>v/mean))}; }
function drawSmooth(){ const svg=$('#smooth'); if(!svg) return; const W=svg.clientWidth||560, H=190; svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const A=torqueSeries(S.arch), B=cmpKey?torqueSeries(cmpKey):null;
  const all=[...A.tot,...(B?B.tot:[]),...A.per.flat()]; const hi=Math.max(...all)*1.05, lo=Math.min(0,...all)*1.05;
  const X=i=>34+i*3/720*(W-44), Y=v=>10+(hi-v)/(hi-lo)*(H-34);
  const line=arr=>arr.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)).join('');
  let s=`<line x1="34" x2="${W-10}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line2)"/><line x1="34" x2="${W-10}" y1="${Y(1)}" y2="${Y(1)}" stroke="var(--line2)" stroke-dasharray="3 4"/>
    <text x="30" y="${Y(1)+4}" text-anchor="end" font-size="11" fill="var(--muted)">avg</text><text x="30" y="${Y(0)+4}" text-anchor="end" font-size="11" fill="var(--muted)">0</text>`;
  for(const p of A.per) s+=`<path d="${line(p)}" fill="none" stroke="var(--power)" stroke-width="1" opacity=".35"/>`;
  if(B) s+=`<path d="${line(B.tot)}" fill="none" stroke="var(--air)" stroke-width="2.2"/>`;
  s+=`<path d="${line(A.tot)}" fill="none" stroke="var(--power)" stroke-width="2.6"/>`;
  [0,180,360,540,720].forEach(c=>{ s+=`<text x="${X(c/3)}" y="${H-6}" text-anchor="middle" font-size="11" fill="var(--faint)">${c}°</text>`; });
  s+=`<text x="${W-10}" y="14" text-anchor="end" font-size="12" fill="var(--power)">${esc(ARCHS[S.arch].name)}</text>`;
  if(B) s+=`<text x="${W-10}" y="30" text-anchor="end" font-size="12" fill="var(--air)">${esc(ARCHS[cmpKey].name)}</text>`;
  svg.innerHTML=s; }

/* ---- guided tour */
const TOUR=[
 {t:'An engine you can take apart',x:'This is a single-cylinder four-stroke engine, the simplest complete engine. Drag to rotate it and scroll to zoom. Every part can be clicked.',a(){ setArch('single'); setView('full'); setExplode(false); setFlow('off'); setSpeed(.5); play(true); select(null); }},
 {t:'Look inside',x:'Cutaway slices the housings along the cylinder. The hatched ochre faces are where the castings have been cut, like a section in an engineering drawing. Now the piston, rod and crankshaft are visible moving together.',a(){ setExplode(false); setView('cutaway'); select(null); resetView(false); }},
 {t:'Straight line into rotation',x:'The piston can only move up and down. Watch its connecting rod: the top end goes straight, the bottom end circles with the crankshaft. That link is how pushes become rotation.',a(){ setView('cutaway'); select('rod'); setSpeed(.25); play(true); }},
 {t:'Two turns, four strokes',x:'The timeline below is one complete cycle: intake, compression, power, exhaust. It spans 720° because the crankshaft turns twice per cycle. Drag along the timeline to scrub by hand.',a(){ select(null); setSpeed(.25); play(true); setTransport(true); }},
 {t:'Valves and camshafts',x:'The camshafts turn at half crank speed, so each valve opens exactly once per cycle. Watch a lobe press its bucket and push the valve down, then the spring close it.',a(){ select('camshaft'); focusPart('camshaft'); }},
 {t:'Spark and power',x:'Paused just before top dead centre on compression. Both valves are shut. Press → (or the step button) to watch the spark fire and pressure drive the piston down.',a(){ select('plug'); resetView(false); play(false); setTheta(335); setNowMin(false); }},
 {t:'Follow the air',x:'Air runs from the filter through the throttle and manifold, but only rushes into the cylinder while the intake valve is open. When the valve closes, it waits.',a(){ select(null); setNowMin(true); setFlow('air'); setFlowsOpen(true); setSpeed(.5); play(true); }},
 {t:'Take it apart',x:'Explode separates the engine into the layers it is assembled from, and keeps it running so you can see how each layer moves.',a(){ setFlow('off'); setView('full'); setExplode(true); }},
 {t:'More cylinders',x:'An inline-4 repeats the same cylinder four times on one crankshaft. It fires 1-3-4-2, so a power stroke starts every 180°. Watch the firing order below light up.',a(){ setExplode(false); setArch('i4'); setView('cutaway'); setSpeed(.5); play(true); setTransport(true); }},
 {t:'A different architecture',x:'A V8 folds eight cylinders into two banks sharing four crankpins. The Power flow highlights each cylinder as it pushes. Open \u201cWhy this layout?\u201d to compare how smooth each layout is.',a(){ setArch('v8'); setView('cutaway'); setFlow('power'); }},
 {t:'Experiment',x:'The Lab lets you change bore, stroke and rpm and see displacement, piston speed, torque and power respond.',a(){ setFlow('off'); }}
];
let tourI=-1;
function tour(i){ tourI=i; const t=$('#tour'); if(i<0||i>=TOUR.length){ t.hidden=true; tourI=-1; return; }
  setClean(false);
  t.hidden=false; $('#tourStep').textContent=`Step ${i+1} of ${TOUR.length}`; $('#tourTitle').textContent=TOUR[i].t; $('#tourText').textContent=TOUR[i].x;
  $('#tourPrev').disabled=i===0; $('#tourNext').textContent=i===TOUR.length-1?'Open the Lab':'Next'; TOUR[i].a(); }
$('#tourNext').onclick=()=>{ if(tourI===TOUR.length-1){ tour(-1); showTab('lab'); } else tour(tourI+1); };
$('#tourPrev').onclick=()=>tour(tourI-1);
$('#tourExit').onclick=()=>tour(-1);
$('#tourBtn').onclick=()=>{ showTab('engine'); $('#intro').hidden=true; tour(0); };
$('#startTour').onclick=()=>{ $('#intro').hidden=true; tour(0); };
$('#startFree').onclick=()=>{ $('#intro').hidden=true; play(true); };

function showTab(t){ document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  $('#engineView').hidden=t!=='engine'; $('#lab').hidden=t!=='lab'; if(t==='engine') requestAnimationFrame(resize); else labStart(); }
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

/* ---- main loop */
let lastT=performance.now(), uiT=0;
function frame(now){
  const dt=Math.min(.05,(now-lastT)/1000); lastT=now;
  if(!$('#engineView').hidden){
    const th0=S.theta; if(S.playing) S.theta+=dt*BASE_DPS*S.speed;
    const tgt=S.explode?1:0; S.explodeT=RM?tgt:clamp(S.explodeT+(tgt-S.explodeT>0?1:-1)*dt/.9,0,1);
    if(Math.abs(S.theta)>1e6) S.theta=mod(S.theta,720);
    EN.update(engineState(now/1000)); doHover(); updateCamera(dt);
    updateTimelineHead(); uiT+=dt; if(uiT>.07){ uiT=0; updateNow(); updateChips(); }
    render();
  }
  requestAnimationFrame(frame);
}

function boot(){
  initRenderer();
  $('#archSeg').innerHTML=ARCH_ORDER.map(k=>`<button data-arch="${k}" aria-pressed="false">${ARCHS[k].name}</button>`).join('');
  $('#archSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>setArch(b.dataset.arch));
  renderSpeeds(); S.theta=120; setArch('single'); resetView(true); syncTools(); select(null);
  try{ new ResizeObserver(resize).observe(stage); }catch(e){ addEventListener('resize',resize); }
  resize(); requestAnimationFrame(frame);
}
