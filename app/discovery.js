/* App-only discovery state, activities and views. Shared simulation stays unchanged. */
import { LESSONS, PATH, MEET_PARTS, GLOSSARY, EVENTS, CYCLE, observeCycle, nextEvent, pistonMetrics, validScene } from '../discovery/model.js';

const NOTE_KEY='engine-lab-discoveries-v1';
let notebook={completed:[],seen:[],scenes:[],resume:null}, storageOK=true;
try {
  const raw=JSON.parse(localStorage.getItem(NOTE_KEY)||'null');
  if(raw && typeof raw==='object') {
    notebook.completed=Array.isArray(raw.completed)?raw.completed.filter(id=>PATH.some(s=>s.id===id)):[];
    notebook.seen=Array.isArray(raw.seen)?raw.seen.filter(k=>Object.hasOwn(PARTS_INFO,k)):[];
    notebook.scenes=Array.isArray(raw.scenes)?raw.scenes.map(validScene).filter(Boolean).slice(0,12):[];
    notebook.resume=validScene(raw.resume);
  }
} catch { storageOK=false; }
const D={lesson:null,step:'predict',graph:'pressure',prediction:null,visited:new Set(),layouts:new Set(),rpm:3000,stroke:86};
function persistNotebook(){
  try { localStorage.setItem(NOTE_KEY,JSON.stringify(notebook)); return true; }
  catch { storageOK=false; return false; }
}
/* Learning path: a recommended order; every step stays open. */
const pathDone=id=>notebook.completed.includes(id);
function nextStep(){return PATH.find(s=>!pathDone(s.id))||null;}
function startStep(id){
  $('#pathMenu').open=false;
  if(id!=='meet'){startLesson(id);return;}
  if(D.lesson)restoreExploration(E.returnScene);
  showTab('engine');if(!renderer)return;
  select(null);setInspector('parts');$('#inspectorContent').scrollTop=0;notifyEngine('Select the listed parts to meet the engine.');
}
function renderPath(){
  const done=PATH.filter(s=>pathDone(s.id)).length,next=nextStep();
  $('#pathDots').innerHTML=PATH.map(s=>`<i class="${pathDone(s.id)?'done':s===next?'next':''}"></i>`).join('');
  $('#pathCount').textContent=`${done} / ${PATH.length}`;
  $('#pathButton').setAttribute('aria-label',`Learning path, ${done} of ${PATH.length} steps done`);
  $('#pathBody').innerHTML=`<h2>Learning path</h2><p>A suggested order: each step builds on the ones before it. Every step stays open.</p><ol class="path-steps">${PATH.map((s,i)=>`<li><button class="path-step ${pathDone(s.id)?'done':''}" data-path-step="${s.id}" ${s===next?'aria-current="step"':''}><span class="num">${pathDone(s.id)?'✓':i+1}</span><span>${esc(s.title)}<br><small>${esc(s.topic)} · ${esc(s.duration)}</small></span></button></li>`).join('')}</ol>${next?`<button class="btn primary" id="pathContinue">${done?'Continue':'Start'}: ${esc(next.title)} →</button>`:'<p class="small">Path complete. Revisit any step, or try the numbers in the Lab.</p>'}<div class="path-foot"><span class="small">Saved in this browser only</span>${hasProgress()?'<button class="link-btn" id="pathReset">Reset progress…</button>':''}</div>`;
  $('#pathBody').querySelectorAll('[data-path-step]').forEach(b=>b.onclick=()=>startStep(b.dataset.pathStep));
  $('#pathContinue')?.addEventListener('click',()=>startStep(next.id));
  $('#pathReset')?.addEventListener('click',confirmResetProgress);
  if(!$('#discover').hidden&&$('.discovery-page'))renderDiscover();
}
const hasProgress=()=>notebook.completed.length>0||notebook.seen.length>0;
/** Start the learning path over. Saved scenes, the last scene and settings are kept; nothing leaves this browser. */
function confirmResetProgress(){
  $('#pathMenu').open=false;
  const n=notebook.completed.length,parts=notebook.seen.length;
  openDialog('Reset learning progress?',`<p>This marks all ${PATH.length} steps as not done${n?` (${n} currently done)`:''} and forgets the ${parts} part${parts===1?'':'s'} you have met, so the path starts again at step 1.</p><p class="small">Your saved scenes, your last scene and your theme are kept. Progress is stored only in this browser.</p><div class="dialog-actions"><button class="btn" id="cancelReset">Cancel</button><button class="btn primary" id="confirmReset">Reset progress</button></div>`);
  $('#cancelReset').onclick=()=>$('#engineDialog').close();
  $('#confirmReset').onclick=()=>{resetProgress();$('#engineDialog').close();};
}
function resetProgress(){
  notebook.completed=[];notebook.seen=[];persistNotebook();renderPath();
  if(EN&&!D.lesson&&E.mode==='parts'&&!S.sel)renderInspector();
  notifyEngine('Learning progress reset. The path starts again at step 1.');
}
function sceneLabel(s){ const l=LESSONS.find(l=>l.id===s.lesson); return `${l?.title||'Free investigation'} · ${ARCHS[s.arch].name} · ${Math.round(s.angle)}°`; }

function cardArt(id){
  const start='<svg viewBox="0 0 260 80" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">';
  const art={
    meet:'<path d="M96 8v34m36-34v34"/><rect x="99" y="12" width="30" height="16" rx="2"/><path d="M114 22l12 26" stroke-width="4"/><circle cx="114" cy="56" r="15"/><circle cx="126" cy="48" r="3" fill="currentColor"/><path d="M170 20h40M170 36h52M170 52h34" stroke-dasharray="2 4"/><circle cx="160" cy="20" r="3" fill="var(--power)" stroke="none"/><circle cx="160" cy="36" r="3" fill="var(--power)" stroke="none"/><circle cx="160" cy="52" r="3" fill="var(--power)" stroke="none"/>',
    spark:'<path d="M16 64H246M24 64C60 64 97 62 114 43S135 0 150 24S174 62 236 62"/><path d="M111 8l-8 16h10l-7 17" stroke="var(--power)" stroke-width="2.5"/><path d="M126 9V68" stroke-dasharray="3 4"/><circle cx="146" cy="20" r="4" fill="var(--power)"/>',
    torque:'<circle cx="127" cy="49" r="23"/><path d="M127 49l18-14-10-24" stroke-width="4"/><rect x="116" y="4" width="37" height="12" rx="2"/><path d="M198 12v35m-6-7 6 7 6-7" stroke="var(--power)" stroke-width="3"/><path d="M157 62a35 35 0 0 0 0-37" stroke-dasharray="3 3"/>',
    cam:'<circle cx="99" cy="42" r="29"/><circle cx="160" cy="42" r="15"/><path d="M99 42V18m61 24 11-7" stroke-width="3"/><path d="M69 19Q120-13 175 28M70 64Q122 93 174 55" stroke-dasharray="3 3"/>',
    strokes:'<path d="M25 15v47h40V15M80 15v47h40V15M135 15v47h40V15M190 15v47h40V15"/><path d="M27 43h36M82 30h36M137 43h36M192 30h36" stroke-width="7"/><path d="M45 21v13m55 13V36m55-15v13m55 13V36" stroke="var(--power)" stroke-width="2"/>',
    rpm:'<path d="M20 65H242M32 65V50h35v15M89 65V35h35v30M146 65V5h35v60"/><path d="M32 50 89 35 146 5" stroke="var(--power)" stroke-dasharray="3 4"/><text x="200" y="42" fill="currentColor" stroke="none" font-size="29">4×</text>',
    rhythm:'<path d="M15 54H245M20 50V20m45 30V20m45 30V20m45 30V20m45 30V20"/><path d="M15 68Q30 30 45 68T105 68T165 68T225 68" stroke="var(--power)"/>'
  };
  return start+art[id]+'</svg>';
}
function renderDiscover(){
  const done=new Set(notebook.completed),next=nextStep();
  $('#discover').innerHTML=`<div class="discovery-page">
    <header class="discovery-hero"><div><div class="eyebrow">Engine Lab / The discovery bench</div>
      <h1>A little curiosity.<br>A lot going on inside.</h1>
      <p>Take an engine apart. Follow a spark. Find out why a bigger push doesn’t always make a bigger twist.</p>
      <div class="discovery-actions"><button class="btn primary" id="firstDiscovery">${!done.size?'Start the learning path →':next?'Continue: '+esc(next.title)+' →':'Revisit the path →'}</button><button class="btn" id="freeEngine">Explore the engine</button><button class="btn ghost" id="learnControls">Learn the controls</button>${notebook.resume?'<button class="btn" id="resumeDiscovery">Resume last scene</button>':''}</div>
    </div><svg viewBox="0 0 260 260" fill="none" aria-hidden="true"><circle cx="130" cy="175" r="54" stroke="var(--line2)"/><circle cx="130" cy="175" r="75" stroke="var(--line2)" stroke-dasharray="3 6"/><path d="M89 30v110m82-110v110" stroke="var(--text)" stroke-width="3"/><path d="M130 175l35-31-35-75" stroke="var(--muted)" stroke-width="11" stroke-linecap="round"/><rect x="95" y="49" width="70" height="39" rx="4" fill="var(--bg2)" stroke="var(--text)" stroke-width="2"/><path d="M96 58h68M96 66h68" stroke="var(--muted)"/><circle cx="165" cy="144" r="6" fill="var(--brass)"/><circle cx="130" cy="175" r="8" fill="var(--brass)"/><path d="M204 35v60m-6-8 6 8 6-8" stroke="var(--power)" stroke-width="3"/><text x="28" y="251" font-size="11" fill="var(--muted)" letter-spacing="2">FIG. 01 — PUSH INTO ROTATION</text></svg></header>
    <div class="discovery-section-head"><div><h2>Your learning path</h2><p class="small">Seven short steps, in the order that builds understanding. Every step stays open.</p></div><div class="discovery-progress"><progress max="${PATH.length}" value="${done.size}" aria-label="Learning path steps completed"></progress><span>${done.size} / ${PATH.length} done</span>${hasProgress()?'<button class="link-btn" id="discoverReset">Reset progress</button>':''}</div></div>
    <div class="discovery-grid">${PATH.map((l,i)=>`<button class="discovery-card${l===next?' next':''}${done.has(l.id)?' done':''}" ${l.id==='meet'?'data-step':'data-lesson'}="${l.id}"><div class="card-top"><span>STEP ${i+1}</span><span>${l.topic}</span></div>${cardArt(l.id)}<h3>${l.title}</h3><p>${l.question}</p><div class="card-bottom"><span>${done.has(l.id)?'✓ Done · revisit':l===next?'Up next · '+l.duration:l.duration}</span><span aria-hidden="true">↗</span></div></button>`).join('')}</div>
    <div class="discovery-bottom"><section><div class="eyebrow">Keep something interesting</div><h2>Your notebook</h2><p class="small">Save a scene from the Scene menu to come back to it. Stored in this browser, without an account.</p>
      <div id="notebookList">${notebook.scenes.length?notebook.scenes.map((s,i)=>`<div class="notebook-item"><button class="btn ghost" data-restore="${i}">${esc(sceneLabel(s))}</button><button class="btn sm" data-remove="${i}" aria-label="Remove saved scene ${i+1}">×</button></div>`).join(''):'<p class="small">Your first discovery belongs here. Open the Engine and choose Scene → Save scene.</p>'}</div>
      ${!storageOK?'<p class="small">Browser storage is unavailable. Scenes will last for this session only; use a scene link to keep one.</p>':''}
      <h2 style="margin-top:26px">Read the Atlas</h2><p class="small">Magazine features on each layout: how it works, its history and the machines that made it famous.</p><button class="btn" id="discoverAtlas">Open the Atlas →</button>
      <h2 style="margin-top:26px">Try the numbers</h2><p class="small">Explore displacement, piston speed, torque and power in separate adjustable experiments.</p><button class="btn" id="discoverLab">Open the Lab →</button>
    </section><section><div class="eyebrow">A pocket reference</div><h2>Small words, big ideas</h2><label class="small" for="glossarySearch">Find a term</label><input class="discovery-input" id="glossarySearch" type="search" placeholder="Torque, overlap, displacement…"><div id="glossaryList"></div></section></div>
    <p class="small" style="margin-top:32px">An illustrated teaching model of a four-stroke gasoline engine. Pressure, timing and gas torque are conceptual. Animation is slowed for inspection.</p>
  </div>`;
  $('#learnControls').onclick=showControls;
  $('#firstDiscovery').onclick=()=>startStep(next?.id||'meet');
  $('#discover').querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>startStep(b.dataset.step));
  $('#discoverReset')?.addEventListener('click',confirmResetProgress);
  $('#freeEngine').onclick=()=>{showTab('engine');if(E.returnScene)restoreExploration(E.returnScene);play(false);};
  $('#resumeDiscovery')?.addEventListener('click',()=>restoreScene(notebook.resume));
  $('#discoverLab').onclick=()=>showTab('lab');$('#discoverAtlas').onclick=()=>openAtlas(null);
  $('#discover').querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>startLesson(b.dataset.lesson));
  $('#discover').querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>restoreScene(notebook.scenes[+b.dataset.restore]));
  $('#discover').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{notebook.scenes.splice(+b.dataset.remove,1);persistNotebook();renderDiscover();});
  $('#glossarySearch').oninput=renderGlossary; renderGlossary();
}
function renderGlossary(){
  const q=$('#glossarySearch').value.toLowerCase(), terms=GLOSSARY.filter(t=>t.join(' ').toLowerCase().includes(q));
  $('#glossaryList').innerHTML=terms.map(([term,meaning])=>`<details class="glossary-item"><summary>${esc(term)}</summary><p>${esc(meaning)}</p></details>`).join('')||'<p class="small">No matching term. Try another word.</p>';
}

function plotSeries(){
  if(D.graph==='rhythm'){
    const eng=deriveEngine(S.arch),cy=eng.cyls[S.focusCyl], values=CYCLE.map(p=>eng.cyls.reduce((s,c)=>s+cylTorque(c,p.angle+cy.off),0));
    const mean=values.slice(0,720).reduce((s,v)=>s+v,0)/720;
    return [{name:'Combined gas torque / mean',color:'--power',values:values.map(v=>v/mean),unit:'× mean'}];
  }
  const configs={pressure:[['pressure','Pressure','--power','bar']],torque:[['pressure','Pressure','--comp','bar'],['torque','Gas torque','--power','relative']],valves:[['intake','Intake lift','--air','mm'],['exhaust','Exhaust lift','--exhaust','mm']],position:[['position','Piston travel','--air','mm']]};
  return configs[D.graph].map(([key,name,color,unit])=>({name,color,unit,values:CYCLE.map(p=>p[key])}));
}
function drawBenchPlot(){
  const series=plotSeries(), W=370,H=180,x=a=>34+a/720*304;
  let paths='', labels='', grid='';
  const separate=D.graph==='torque';
  const sharedMax=Math.max(...series.flatMap(s=>s.values)),sharedMin=Math.min(0,...series.flatMap(s=>s.values));
  series.forEach((s,i)=>{
    const max=(separate?Math.max(...s.values):sharedMax)*1.08,min=Math.min(0,separate?Math.min(...s.values):sharedMin)*1.08;
    const y=v=>145-(v-min)/(max-min||1)*125;
    paths+=`<path d="${s.values.filter((_,j)=>j%3===0).map((v,j)=>(j?'L':'M')+x(j*3).toFixed(1)+','+y(v).toFixed(1)).join('')}" fill="none" stroke="var(${s.color})" stroke-width="2"/>`;
    if(i===0||separate){const side=i===1?W-1:29;const anchor=i===1?'end':'end';for(const v of [min,0,max])labels+=`<text x="${side}" y="${y(v)+4}" text-anchor="${anchor}" font-size="11" fill="var(${s.color})">${v.toFixed(max<10?1:0)}</text>`;grid+=`<line x1="34" x2="338" y1="${y(0)}" y2="${y(0)}" stroke="var(--line2)" stroke-dasharray="3 4"/>`;}
  });
  for(const a of [0,180,360,540,720])grid+=`<line x1="${x(a)}" x2="${x(a)}" y1="20" y2="145" stroke="var(--line)"/><text x="${x(a)}" y="166" text-anchor="middle" font-size="11" fill="var(--muted)">${a}°</text>`;
  $('#benchPlot').innerHTML=`<div class="bench-legend">${series.map(s=>`<span><i style="--c:var(${s.color})"></i>${s.name} (${s.unit})</span>`).join('')}</div><svg id="benchGraph" viewBox="0 0 370 180" role="img" aria-label="${esc(series.map(s=>s.name).join(' and '))} over one cycle. Use the shared cycle slider for keyboard control.">${grid}${paths}${labels}<g id="benchCursor"><line y1="14" y2="150" stroke="var(--brass)" stroke-width="1.5"/><circle cy="150" r="3" fill="var(--brass)"/></g></svg>`;
  $('#benchPlotNote').textContent= D.graph==='torque'?'Independent scales: pressure on the left, relative gas torque on the right. Compare timing, not line heights.':D.graph==='rhythm'?'Normalized by this layout’s mean. Gas torque only; this is not an inertial balance model.':'Selected cylinder angle. Pressure and valve timing follow an illustrative full-throttle model.';
  let dragging=false;
  const graph=$('#benchGraph'),scrub=e=>{const r=graph.getBoundingClientRect();goAngle(Math.round(clamp(((e.clientX-r.left)/r.width*370-34)/304,0,1)*719));};
  graph.onpointerdown=e=>{dragging=true;graph.setPointerCapture(e.pointerId);scrub(e);};graph.onpointermove=e=>{if(dragging)scrub(e);};graph.onpointerup=graph.onpointercancel=()=>{dragging=false;};
}
function drawMechanism(o){
  const phi=o.angle*DEG,r=28,L=94,cx=84,cy=139,px=cx+r*Math.sin(phi),py=cy-r*Math.cos(phi),sy=cy-pistonS(o.angle,r,L);
  const lever=Math.abs(o.leverage)/.43,force=clamp((o.pressure-1)/36,0,1);
  const dial=(x,y,angle,label)=>`<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="var(--line2)"/><line x1="${x}" y1="${y}" x2="${x+16*Math.sin(angle*DEG)}" y2="${y-16*Math.cos(angle*DEG)}" stroke="var(--brass)" stroke-width="2"/><text x="${x}" y="${y+36}" text-anchor="middle" fill="var(--muted)" font-size="10">${label}</text>`;
  $('#benchMechanism').innerHTML=`<svg viewBox="0 0 350 185" role="img" aria-label="Schematic crank and rod; gas force ${force<.01?'near zero':'shown in orange'}. Crank ${Math.round(mod(o.angle,360))} degrees, cam ${Math.round(o.cam)} degrees."><path d="M60 9v88M108 9v88" stroke="var(--line2)" fill="none"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line2)"/><path d="M${cx} ${cy}L${px} ${py}L${cx} ${sy}" fill="none" stroke="var(--muted)" stroke-width="5" stroke-linejoin="round"/><rect x="62" y="${sy-8}" width="44" height="16" rx="2" fill="var(--faint)"/><circle cx="${cx}" cy="${cy}" r="4" fill="var(--brass)"/>${force>.01?`<path d="M126 ${sy-35*force}V${sy}m-4-6 4 6 4-6" fill="none" stroke="var(--power)" stroke-width="3"/>`:''}
      ${dial(190,45,mod(o.angle,360),'crank '+Math.floor(o.angle/360+1)+'/2 turns')}${dial(285,45,o.cam,'cam · half speed')}
      <text x="160" y="114" fill="var(--muted)" font-size="11">Gas force (relative)</text><rect x="160" y="121" width="${force*166}" height="5" fill="var(--power)"/><text x="160" y="146" fill="var(--muted)" font-size="11">Effective leverage (magnitude)</text><rect x="160" y="153" width="${Math.min(1,lever/1.1)*166}" height="5" fill="var(--brass)"/><text x="14" y="179" fill="var(--muted)" font-size="10">Schematic · fixed geometry · not to scale</text></svg>`;
}
function renderRpmComparison(){
  const m=pistonMetrics(D.rpm,D.stroke),b=pistonMetrics(3000,D.stroke);
  $('#discoveryRpmValue').textContent=fmt(D.rpm)+' rpm';$('#discoveryStrokeValue').textContent=D.stroke+' mm';
  $('#rpmComparison').innerHTML=`<div class="bench-readouts"><div><small>Mean speed</small><b>${m.mean.toFixed(1)} <span>m/s</span></b></div><div><small>Peak speed</small><b>${m.peak.toFixed(1)} <span>m/s</span></b></div><div><small>Inertial load</small><b>${m.load.toFixed(2)}<span>×</span></b></div></div><p class="small">At 3,000 RPM: ${b.mean.toFixed(1)} m/s mean, ${b.peak.toFixed(1)} m/s peak, 1× inertial load.</p><svg viewBox="0 0 350 70" role="img" aria-label="Load compared with baseline: ${m.load.toFixed(2)} times"><text x="0" y="18" font-size="11" fill="var(--muted)">3,000 RPM</text><rect x="88" y="7" width="26" height="12" fill="var(--faint)"/><text x="0" y="48" font-size="11" fill="var(--muted)">${D.rpm} RPM</text><rect x="88" y="37" width="${26*m.load}" height="12" fill="var(--power)"/></svg>`;
}
renderPath();
