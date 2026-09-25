/* App scene actions. Every visible control calls these directly. */
const E={mode:'parts',collapsed:false,sheet:'medium',cut:1,explode:1,labels:'selected',instance:null,
  ready:false,visitedScene:false,routeIndex:0,pending:null,returnScene:null,query:'',listScroll:0,listFocus:null,focus:false,returnFocus:null};
const engineRoot=$('#engineView'),inspector=$('#engineInspector'),pane=$('#inspectorContent');
const ASSEMBLIES=[['Structure',['block','liner','head','gasket','cover','pan','tcover']],['Moving assembly',['piston','rings','rod','rodbearing','crank','mainbearing','flywheel']],['Valve train',['intakevalve','exhaustvalve','spring','tappet','camshaft','timing']],['Air, fuel & exhaust',['filter','throttle','intake','injector','plug','exhaust']],['Lubrication',['oilpump']]];
const ALIASES={rod:'connecting conrod',crank:'crankshaft',pan:'sump oil',plug:'spark ignition',tcover:'timing cover',cover:'valve rocker cover',tappet:'bucket lifter',intakevalve:'inlet valve',filter:'air cleaner',rings:'piston rings'};
const SYSTEMS={
 air:{title:'Follow the air',parts:['filter','throttle','intake','intakevalve','piston'],summary:'Fresh charge follows the intake path. Particles are schematic flow cues, not a fluid simulation.'},
 fuel:{title:'From fuel to mixture',parts:['injector','piston','plug'],summary:'Fuel is injected directly into the cylinder, where it joins air. The spark then starts combustion. These are stages in the process, not a fuel pipe through the spark plug.'},
 exhaust:{title:'Make room for fresh charge',parts:['piston','exhaustvalve','exhaust'],summary:'Burned gas leaves through the exhaust valve and manifold. Early opening allows pressure-driven blowdown.'},
 oil:{title:'Lubrication network',parts:['pan','oilpump','mainbearing','rodbearing','camshaft'],summary:'The sump supplies the pump. Galleries branch to the crank bearings and valve train; these destinations are not one serial pipe. This is a simplified network, not a pressure simulation.'},
 power:{title:'A push becomes rotation',parts:['piston','rod','crank','flywheel'],summary:'Gas force reaches the crank through the piston and rod. The flywheel stores rotational energy. This model still animates at prescribed speed.'}
};
const GRAPHS={pressure:'Cylinder pressure',valves:'Valve lift',position:'Piston travel',torque:'Pressure + gas torque',rhythm:'Combined gas torque'};
const FLOW_NAMES={air:'Air',fuel:'Fuel',exhaust:'Exhaust',oil:'Oil',power:'Power'};
/* Status messages are short toasts over the model; the text stays in the live region for assistive technology. */
let toastTimer=0;
function notifyEngine(message){const el=$('#engineSceneStatus');el.textContent=message;el.classList.add('show');if(typeof setTimeout==='function'){clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3400);}}
function partInstances(part){return [...new Set((EN.parts.get(part)?.meshes||[]).map(m=>m.userData.cyl??m.material.userData?.cyl).filter(Number.isInteger))].sort((a,b)=>a-b);}
function flowBlocked(){return S.explode&&E.explode>0&&S.flow!=='off'&&S.flow!=='power';}
function engineState(t){
  const isolated=S.isolate&&!!S.sel;
  // In Cutaway the timing chain runs between the viewer and the cylinder, so it becomes a phantom outline
  // unless the timing drive is what the viewer is looking at.
  const phantomChain=!isolated&&S.view==='cutaway'&&!S.explode&&S.sel!=='timing'&&!relatedSet(S.sel).has('timing');
  return {theta:S.theta,view:isolated?'full':S.view,cut:!isolated&&S.view==='cutaway'?E.cut:0,
    explode:smooth(S.explodeT)*E.explode,
    flow:isolated||flowBlocked()?'off':S.flow,gas:isolated?0:1,
    sel:S.sel,hover:isolated?null:S.hover,isolate:isolated,hidden:S.hidden,pulse:Math.sin(t*3),
    // The shared renderer preserves related components during isolation for film
    // shots. App isolation instead gives only the selected component full opacity.
    ...(isolated?{fade:Object.fromEntries([...EN.parts.keys()].map(part=>[part,part===S.sel?1:.04]))}:{}),
    ...(phantomChain?{fade:{'timing|chain':.3,'timing|link':.3}}:{}),
    // Cylinder scope highlights the chosen instance; dim other cylinders only while isolated.
    ...(E.instance!==null?{focusCyl:E.instance,focus:isolated?1:0,glow:S.sel?[{part:S.sel,cyl:E.instance,amount:.5}]:[]}: {})};
}
function setArch(key){
  if(!ARCHS[key]||!renderer)return;
  const angle=EN?observeCycle(S.arch,S.focusCyl,S.theta).angle:120,selected=S.sel;
  cancelEvent('Engine changed.');S.arch=key;if(EN){scene.remove(EN.root);EN.dispose();}
  EN=createEngine(key,{colors:readColors(),dot:dotTexture(),look:APP_LOOK,fine:true});scene.add(EN.root);applyTheme();SOUND.tune=null;soundConfigure();
  S.focusCyl=0;S.theta=EN.cyl[0].off+angle;S.hidden.clear();S.isolate=false;S.hover=null;
  S.sel=selected&&EN.parts.has(selected)?selected:null;E.instance=S.sel&&partInstances(S.sel).includes(0)?0:null;
  if(D.lesson?.id==='rhythm'&&D.step==='explore')D.layouts.add(key);
  resetView(true);EN.update(engineState(0));syncEnginePage();renderInspector();evaluateDiscovery();rememberScene();
}
function select(part,instance=undefined){
  if(part&&!EN.parts.has(part))return;
  const nextCylinder=Number.isInteger(instance)?instance:S.focusCyl;
  const nextInstance=part&&instance!==null&&partInstances(part).includes(nextCylinder)?nextCylinder:null;
  if(S.sel===part&&S.focusCyl===nextCylinder&&E.instance===nextInstance)return;
  if(E.mode==='parts'&&!S.sel){E.listScroll=pane.scrollTop;E.listFocus=document.activeElement?.dataset?.enginePart||null;}
  if(Number.isInteger(instance)&&instance!==S.focusCyl){cancelEvent('Selected cylinder changed.');S.focusCyl=instance;if($('#benchPlot'))drawBenchPlot();}
  S.sel=part;S.isolate=S.isolate&&!!part;if(part)meetPart(part);
  E.instance=part&&instance!==null&&partInstances(part).includes(S.focusCyl)?S.focusCyl:null;
  if(E.mode==='parts'&&!D.lesson)renderInspector();
  syncEnginePage();updateEngineInspector();rememberScene();
}
function meetPart(part){
  if(notebook.seen.includes(part))return;notebook.seen.push(part);
  if(!pathDone('meet')&&MEET_PARTS.every(k=>notebook.seen.includes(k))){notebook.completed.push('meet');const n=nextStep();notifyEngine('Step 1 complete: you have met the engine.'+(n?' Up next: '+n.title+'.':''));renderPath();}
  persistNotebook();
}
function setIsolate(on){S.isolate=on&&!!S.sel;renderInspector();updateEngineInspector();rememberScene();}
function showAllParts(){S.hidden.clear();syncEnginePage();if(E.mode==='parts'&&!D.lesson)renderInspector();rememberScene();notifyEngine('All hidden parts restored.');}
/** Clear all: drop the selection and every filter, but keep the engine, view, camera and cycle angle. */
function clearFilters(){if(!(S.sel||S.isolate||S.flow!=='off'||S.explode||S.hidden.size||E.cut<.995||E.pending))return;cancelEvent();Object.assign(S,{isolate:false,flow:'off',explode:false});S.hidden.clear();E.cut=1;E.routeIndex=0;select(null);syncEnginePage();renderInspector();rememberScene();notifyEngine('Cleared: whole engine, no selection or filters.');}
function setCylinder(i){if(i===S.focusCyl)return;cancelEvent('Selected cylinder changed; event stop cancelled.');S.focusCyl=i;if(E.instance!==null&&S.sel)E.instance=partInstances(S.sel).includes(S.focusCyl)?S.focusCyl:null;syncEnginePage();if($('#benchPlot'))drawBenchPlot();rememberScene();}
function setChecked(group,key,value){const prop=key.replace(/-(\w)/g,(_,c)=>c.toUpperCase());document.querySelectorAll(`${group} [data-${key}]`).forEach(b=>{const on=b.dataset[prop]===String(value);b.setAttribute('aria-checked',on);b.tabIndex=on?0:-1;});}
/** Arrow keys move between options of a segmented radio group and activate them. */
function radioKeys(group){group.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const all=[...group.querySelectorAll('[role=radio]')],i=all.indexOf(e.target);if(i<0)return;e.preventDefault();const j=e.key==='Home'?0:e.key==='End'?all.length-1:mod(i+(e.key==='ArrowRight'?1:-1),all.length);all[j].click();(group.querySelectorAll('[role=radio]')[j]||all[j]).focus();};}
function backToParts(){select(null);pane.scrollTop=E.listScroll;($('#enginePartResults [data-engine-part="'+E.listFocus+'"]')||$('#enginePartSearch'))?.focus();}
function setView(view){S.view=view;syncEnginePage();rememberScene();}
function setFlow(flow){S.flow=flow;E.routeIndex=0;syncEnginePage();renderInspector();rememberScene();}
function setExplode(on){S.explode=on;if(on&&E.explode===0)E.explode=1;syncEnginePage();if(E.mode==='flow')renderInspector();rememberScene();}
function setExplodeAmount(value){E.explode=clamp(value,0,1);setExplode(value>0);}
function play(on){S.playing=on;$('#playBtn').textContent=on?'Pause':'Play';$('#playBtn').setAttribute('aria-pressed',on);soundGain();}
function setRpm(rpm){S.rpm=RPM_STOPS.reduce((a,b)=>Math.abs(b-rpm)<Math.abs(a-rpm)?b:a);syncSpeed();}
function syncSpeed(){
  const i=RPM_STOPS.indexOf(S.rpm),r=$('#engineRpm');r.value=i;r.setAttribute('aria-valuetext',S.rpm.toLocaleString('en-US')+' rpm'+(realSpeed()?', model shown at '+MODEL_MAX_RPM+' rpm':''));
  $('#engineRpmValue').textContent=S.rpm.toLocaleString('en-US')+' rpm';$('#speedField').classList.toggle('real',realSpeed());syncSound();
}
function syncTools(){syncEnginePage();}
function syncEnginePage(){
  if(!EN)return;
  $('#sceneArchitecture').value=S.arch;$('#sceneArchitecture').title=`${EN.e.N} cylinder${EN.e.N===1?'':'s'} · ${720/EN.e.N}° firing interval`;
  $('#sceneCylinder').innerHTML=EN.cyl.map((c,i)=>`<button role="radio" data-cyl="${i}" aria-label="Cylinder ${c.n}">${c.n}</button>`).join('');setChecked('#sceneCylinder','cyl',S.focusCyl);
  $('#sceneCylinder').querySelectorAll('[data-cyl]').forEach(b=>b.onclick=()=>setCylinder(+b.dataset.cyl));
  $('#cylinderControl').hidden=EN.e.N===1;$('#firingOrder').textContent=EN.e.N>1?'Firing order '+ARCHS[S.arch].firing.join('–'):'';
  setChecked('#sceneView','view',S.view);
  $('#cutControl').hidden=S.view!=='cutaway'||S.explode;$('#sceneCut').value=Math.round(E.cut*100);$('#sceneCutValue').textContent=Math.round(E.cut*100)+'%';
  $('#sceneExplode').setAttribute('aria-pressed',S.explode);
  $('#separationControl').hidden=!S.explode;$('#sceneSeparation').value=Math.round(E.explode*100);$('#sceneSeparationValue').textContent=Math.round(E.explode*100)+'%';
  $('#sceneLabels').setAttribute('aria-pressed',E.labels!=='off');
  play(S.playing);syncSpeed();updateEngineInspector();
}
/* The state row names everything that currently changes what the model shows; each chip undoes one thing. */
let stateKey='';
function syncState(){
  const chips=[];
  if(D.lesson)chips.push({id:'lesson',cls:'lesson',text:'Lesson · '+D.lesson.title,label:'Exit lesson',off:()=>restoreExploration(E.returnScene)});
  if(S.sel)chips.push({id:'sel',text:PARTS_INFO[S.sel].name+(E.instance!==null&&EN.e.N>1?' · cylinder '+EN.cyl[E.instance].n:''),label:'Deselect',off:()=>select(null)});
  if(S.isolate&&S.sel)chips.push({id:'isolate',text:'Isolated',label:'Exit isolation',off:()=>setIsolate(false)});
  if(S.flow!=='off')chips.push({id:'flow',text:FLOW_NAMES[S.flow]+' flow'+(flowBlocked()||S.isolate?' · paused':''),color:'--'+S.flow,label:'Turn off flow',off:()=>setFlow('off')});
  if(S.hidden.size)chips.push({id:'hidden',text:`${S.hidden.size} hidden`,label:'Show all hidden parts',off:showAllParts});
  if(S.explode)chips.push({id:'explode',text:'Exploded',label:'Reassemble',off:()=>setExplode(false)});
  if(S.view==='cutaway'&&E.cut<.995)chips.push({id:'cut',text:`Section ${Math.round(E.cut*100)}%`,label:'Full section depth',off:()=>{E.cut=1;syncEnginePage();rememberScene();}});
  if(E.pending)chips.push({id:'stop',text:'Pausing at '+E.pending.name.toLowerCase(),label:'Cancel event stop',off:()=>cancelEvent('Event stop cancelled.')});
  const key=chips.map(c=>c.id+':'+c.text).join('|');if(key===stateKey)return;stateKey=key;
  $('#sceneState').hidden=!chips.length;$('#clearAll').hidden=!chips.some(c=>c.id!=='lesson');
  $('#stateChips').innerHTML=chips.map(c=>`<span class="state-chip ${c.cls||''}" role="listitem"><span>${c.color?`<i style="--c:var(${c.color})"></i>`:''}${esc(c.text)}</span><button data-chip="${c.id}" aria-label="${c.label}: ${esc(c.text)}" title="${c.label}">×</button></span>`).join('');
  for(const c of chips)$(`[data-chip="${c.id}"]`).onclick=()=>{c.off();syncState();};
}
function setInspector(mode,open=true){
  E.mode=mode;E.collapsed=!open;inspector.hidden=!open;$('#inspectorReopen').hidden=open;
  engineRoot.classList.toggle('inspector-collapsed',!open);engineRoot.classList.toggle('sheet-expanded',E.sheet==='expanded');
  $('#sheetSize').setAttribute('aria-expanded',E.sheet==='expanded');$('#sheetSize').setAttribute('aria-label',E.sheet==='expanded'?'Reduce inspector':'Expand inspector');
  document.querySelectorAll('[data-inspector]').forEach(b=>{const active=b.dataset.inspector===mode;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;});
  renderInspector();rememberScene();
}
function renderInspector(){
  if(!EN)return;
  $('#inspectorTabs').hidden=!!D.lesson;pane.classList.toggle('lesson-mode',!!D.lesson);
  pane.setAttribute('role',D.lesson?'region':'tabpanel');pane.setAttribute('aria-labelledby',D.lesson?'lessonTitle':E.mode+'Tab');
  if(D.lesson)renderLesson();else if(E.mode==='parts')renderParts();else if(E.mode==='flow')renderFlow();else renderCharts();
  updateEngineInspector();
}
function renderParts(){
  if(!S.sel){
    pane.innerHTML=guideCard()+'<label class="section-label" for="enginePartSearch">Find a part</label><input id="enginePartSearch" class="discovery-input" type="search" placeholder="Piston, valve, crank…"><div id="enginePartResults"></div>';
    bindGuide();$('#enginePartSearch').value=E.query;$('#enginePartSearch').oninput=e=>{E.query=e.target.value;renderPartList();};renderPartList();return;
  }
  const d=PARTS_INFO[S.sel],instances=partInstances(S.sel);
  pane.innerHTML=`<button class="btn ghost sm" id="backToParts">← All parts</button><h2>${esc(d.name)}</h2><p class="small" id="partScope"></p>${instances.length>1?`<label class="scope-toggle"><input type="checkbox" id="allInstances" ${E.instance===null?'checked':''}> All instances</label>`:''}<p>${esc(d.simple)}</p><p class="engine-live" id="partLive"></p><div class="part-actions"><button class="btn" id="focusPart" title="Move the camera to this part">Focus</button><button class="btn toggle" id="isolatePart" aria-pressed="${S.isolate}" title="Show only this part">${S.isolate?'Exit isolation':'Isolate'}</button><button class="btn toggle" id="hidePart" aria-pressed="${S.hidden.has(S.sel)}" title="Hide this part to see behind it">${S.hidden.has(S.sel)?'Unhide':'Hide'}</button></div>${S.isolate?'<p class="small">Isolation shows this part solid. Exit to restore the chosen view and flow.</p>':''}<details class="more-detail"><summary>More detail</summary><p>${esc(d.technical)}</p><p>${esc(d.deep)}</p><h3>Why it is needed</h3><p>${esc(d.why)}</p><h3>During the cycle</h3><p>${esc(d.cycle)}</p><h3>If it fails</h3><p>${esc(d.fails)}</p></details><h3>Connected to</h3><div class="related-parts">${d.rel.filter(k=>EN.parts.has(k)).map(k=>`<button class="btn" data-related="${k}">${esc(PARTS_INFO[k].name)}</button>`).join('')}</div>`;
  $('#backToParts').onclick=backToParts;$('#focusPart').onclick=()=>focusPart(S.sel);
  $('#isolatePart').onclick=()=>setIsolate(!S.isolate);
  $('#hidePart').onclick=()=>{S.hidden.has(S.sel)?S.hidden.delete(S.sel):S.hidden.add(S.sel);renderParts();syncEnginePage();rememberScene();};
  $('#allInstances')?.addEventListener('change',e=>{E.instance=e.target.checked?null:S.focusCyl;updateEngineInspector();rememberScene();});
  pane.querySelectorAll('[data-related]').forEach(b=>b.onclick=()=>{select(b.dataset.related);pane.scrollTop=0;});
}
function renderPartList(){
  const q=E.query.trim().toLowerCase();$('#enginePartResults').innerHTML=ASSEMBLIES.map(([title,keys])=>{
    const found=keys.filter(k=>EN.parts.has(k)&&(PARTS_INFO[k].name+' '+(ALIASES[k]||'')).toLowerCase().includes(q));
    return found.length?`<h3>${title}</h3>${found.map(k=>`<button class="part-row" data-engine-part="${k}"><i class="${notebook.seen.includes(k)?'seen':'unseen'}" ${notebook.seen.includes(k)?'title="Already met"':''}></i><span>${esc(PARTS_INFO[k].name)}</span><small>${esc(PARTS_INFO[k].moves)}</small></button>`).join('')}`:'';
  }).join('')||'<p>No matching parts. Try another name.</p>';
  $('#enginePartResults').querySelectorAll('button').forEach(b=>b.onclick=()=>select(b.dataset.enginePart));
}
function livePart(part,o){
  const phase=phaseOf(o.angle).name;
  if(['piston','rings','rod'].includes(part))return `${o.position.toFixed(1)} mm below top dead centre · ${mod(o.angle,360)<180?'downstroke':'upstroke'} · ${phase}.`;
  if(part==='intakevalve')return `Intake lift: ${o.intake.toFixed(1)} mm of 12 mm · ${o.intake>.036?'open':'closed'}.`;
  if(part==='exhaustvalve')return `Exhaust lift: ${o.exhaust.toFixed(1)} mm of 12 mm · ${o.exhaust>.036?'open':'closed'}.`;
  if(['camshaft','timing','spring','tappet'].includes(part))return `Cam angle ${o.cam.toFixed(0)}° · one cam turn for two crank turns. Intake / exhaust lift: ${o.intake.toFixed(1)} / ${o.exhaust.toFixed(1)} mm.`;
  if(['crank','flywheel'].includes(part))return `Crank ${Math.floor(mod(S.theta,360))}° · cylinder ${o.cylinder} gas torque ${o.torque.toFixed(2)} relative units. Animation speed is prescribed.`;
  if(part==='plug')return `${o.angle<VT.SPARK?'Spark ahead at':'Spark fires at'} ${VT.SPARK}° · cylinder pressure ${o.pressure.toFixed(1)} bar.`;
  if(part==='injector')return o.angle>=VT.INJ0&&o.angle<=VT.INJ1?'Injection window active.':'Outside the injection window.';
  return `${PARTS_INFO[part].moves}. ${PARTS_INFO[part].cycle}`;
}
function renderFlow(){
  const sys=SYSTEMS[S.flow];
  pane.innerHTML=`<span class="section-label" id="flowLabel">Follow a flow</span><div class="chips" id="flowSelect" role="radiogroup" aria-labelledby="flowLabel"><button class="chip" role="radio" data-flow="off">Off</button>${Object.keys(SYSTEMS).map(k=>`<button class="chip" role="radio" data-flow="${k}"><i style="--c:var(--${k})"></i>${FLOW_NAMES[k]}</button>`).join('')}</div>${sys?`<h2>${sys.title}</h2><p>${sys.summary}</p>${S.isolate?'<div class="engine-live">Exit isolation to show flow.<button class="btn" id="exitFlowIsolation">Exit isolation</button></div>':''}${flowBlocked()?'<div class="engine-live">Reassemble to show flow.<button class="btn" id="reassembleFlow">Reassemble</button></div>':''}<ol class="flow-route">${sys.parts.map((k,i)=>`<li><button class="btn" data-route="${i}" aria-pressed="${E.routeIndex===i}"><span>${i+1}</span>${esc(PARTS_INFO[k].name)}</button></li>`).join('')}</ol><h3>${esc(PARTS_INFO[sys.parts[E.routeIndex]].name)}</h3><p>${esc(PARTS_INFO[sys.parts[E.routeIndex]].simple)}</p><p class="engine-live" id="systemLive"></p><button class="btn" id="flowFocus">Focus component</button>`:'<h2>Follow what moves through it.</h2><p>Choose air, fuel, exhaust, oil or power to reveal its route through the engine. The rest of the engine fades to outlines while a flow is on.</p>'}`;
  setChecked('#flowSelect','flow',S.flow);pane.querySelectorAll('[data-flow]').forEach(b=>b.onclick=()=>setFlow(b.dataset.flow));radioKeys($('#flowSelect'));
  $('#exitFlowIsolation')?.addEventListener('click',()=>setIsolate(false));
  $('#reassembleFlow')?.addEventListener('click',()=>setExplode(false));
  pane.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{E.routeIndex=+b.dataset.route;select(sys.parts[E.routeIndex]);renderFlow();updateEngineInspector();});
  $('#flowFocus')?.addEventListener('click',()=>{select(sys.parts[E.routeIndex]);focusPart(sys.parts[E.routeIndex]);});
}
const GRAPH_SHORT={pressure:'Pressure',valves:'Valve lift',position:'Piston travel',torque:'Pressure + torque',rhythm:'Firing rhythm'};
function chartMarkup(){return `<span class="section-label" id="chartLabel">Measurement</span><div class="chips" id="chartSelect" role="radiogroup" aria-labelledby="chartLabel">${Object.keys(GRAPHS).map(k=>`<button class="chip" role="radio" data-graph="${k}" title="${GRAPHS[k]}">${GRAPH_SHORT[k]}</button>`).join('')}</div><div id="benchPlot"></div><output class="engine-live" id="chartValue"></output><p class="small" id="benchPlotNote"></p><p class="small">Click a marker on the timeline to jump to an event.</p><details class="more-detail" id="stopDetails"><summary>Pause at next event</summary><p class="small">Plays the engine and pauses exactly at the event you choose.</p><div class="chips">${EVENTS.map(e=>`<button class="chip" data-stop="${e.angle}">${e.name}</button>`).join('')}</div></details><div id="pendingEvent" role="status"></div><details id="graphExplanation" class="more-detail"><summary>Explain this graph</summary><p>Two crank turns make one cam turn. The schematic shows gas force and the crank’s changing leverage.</p><div class="bench-visual" id="benchMechanism"></div></details>`;}
function bindCharts(){
  setChecked('#chartSelect','graph',D.graph);pane.querySelectorAll('[data-graph]').forEach(b=>b.onclick=()=>{D.graph=b.dataset.graph;setChecked('#chartSelect','graph',D.graph);drawBenchPlot();updateEngineInspector();rememberScene();});radioKeys($('#chartSelect'));
  pane.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>armEngineEvent(+b.dataset.stop));
  $('#graphExplanation').ontoggle=()=>{if($('#graphExplanation').open)drawMechanism(observeCycle(S.arch,S.focusCyl,S.theta));};
  drawBenchPlot();renderPending();
}
function renderCharts(){pane.innerHTML=chartMarkup();bindCharts();}
function renderPending(){const el=$('#pendingEvent');if(!el)return;el.innerHTML=E.pending?`<p>Waiting for ${esc(E.pending.name.toLowerCase())} · ${E.pending.angle}°</p><button class="btn" id="cancelEngineStop">Cancel stop</button>`:'';$('#cancelEngineStop')?.addEventListener('click',()=>cancelEvent('Event stop cancelled.'));}
function cancelEvent(message){if(!E.pending)return;E.pending=null;renderPending();if(message)notifyEngine(message);}
function recordObservation(angle){if(D.lesson&&D.step==='explore')for(const a of D.lesson.stops)if(Math.abs(angle-a)<=3)D.visited.add(a);evaluateDiscovery();}
function goAngle(angle){
  cancelEvent();play(false);const a=clamp(angle,0,719);S.theta=EN.cyl[S.focusCyl].off+a;recordObservation(a);updateEngineInspector();rememberScene();
}
function armEngineEvent(angle){const event=EVENTS.find(e=>e.angle===angle);if(!event)return;const local=observeCycle(S.arch,S.focusCyl,S.theta).angle;E.pending={name:event.name,angle,cylinder:S.focusCyl,target:S.theta+(mod(angle-local,720)||720)};play(true);renderPending();notifyEngine(`Will pause at next ${event.name.toLowerCase()}.`);}
function advanceEngine(delta){if(E.pending&&S.theta+delta>=E.pending.target){const event=E.pending;S.theta=event.target;E.pending=null;play(false);recordObservation(event.angle);renderPending();notifyEngine(`Stopped at ${event.name.toLowerCase()} · ${event.angle}°.`);}else S.theta+=delta;}
function updateEngineInspector(){
  if(!EN)return;const o=observeCycle(S.arch,S.focusCyl,S.theta),ph=phaseOf(o.angle);
  const at=EVENTS.find(e=>Math.abs(e.angle-o.angle)<.5);$('#engineCycleReadout').innerHTML=`${Math.floor(o.angle)}° · ${ph.name}${at?`<small>${esc(at.name)}</small>`:''}`;
  $('#timeline').value=Math.min(719,Math.floor(o.angle));$('#timeline').setAttribute('aria-valuetext',`${Math.floor(o.angle)} degrees, ${ph.name}, cylinder ${o.cylinder}`);
  if($('#partScope'))$('#partScope').textContent=E.instance===null?(partInstances(S.sel).length?'All instances':'Shared component'):`Cylinder ${EN.cyl[E.instance].n}`;
  if($('#partLive'))$('#partLive').textContent=(S.hidden.has(S.sel)?'Hidden. Unhide from the part menu. ':'')+livePart(S.sel,o);
  if($('#systemLive')&&SYSTEMS[S.flow])$('#systemLive').textContent=livePart(SYSTEMS[S.flow].parts[E.routeIndex],o);
  if($('#chartValue')){const vals={pressure:`${o.pressure.toFixed(1)} bar`,valves:`Intake ${o.intake.toFixed(1)} mm · Exhaust ${o.exhaust.toFixed(1)} mm`,position:`${o.position.toFixed(1)} mm below TDC`,torque:`${o.pressure.toFixed(1)} bar · ${o.torque.toFixed(2)} relative gas torque`,rhythm:D.graph==='rhythm'?`${plotSeries()[0].values[Math.floor(o.angle)].toFixed(2)}× mean · firing every ${o.interval}°`:''};$('#chartValue').textContent=vals[D.graph];}
  $('#benchCursor')?.setAttribute('transform',`translate(${34+o.angle/720*304},0)`);
  if($('#graphExplanation')?.open)drawMechanism(o);
  renderMarkers();syncState();
}
/* Timeline markers: named cycle events, plus ringed observation stops while a lesson asks for them. */
let markerKey='';
function renderMarkers(){
  const stops=D.lesson&&D.step==='explore'?D.lesson.stops:[],key=stops.join()+'|'+stops.filter(a=>D.visited.has(a)).join();
  if(key===markerKey)return;markerKey=key;
  const marks=EVENTS.filter(e=>!stops.some(a=>Math.abs(a-e.angle)<1)).map(e=>({angle:e.angle,name:`${e.name} · ${e.angle}°`,cls:''}));
  for(const a of stops){const ev=EVENTS.find(e=>Math.abs(e.angle-a)<1);marks.push({angle:a,name:`${ev?ev.name+' · ':'Observe at '}${a}°${D.visited.has(a)?' · observed':''}`,cls:'stop'+(D.visited.has(a)?' visited':'')});}
  $('#timelineMarkers').innerHTML=marks.sort((x,y)=>x.angle-y.angle).map(m=>`<button class="tl-mark ${m.cls}" data-event="${m.angle}" data-name="${esc(m.name)}" aria-label="Go to ${esc(m.name)}" style="left:${(m.angle/719*100).toFixed(2)}%"></button>`).join('');
  $('#timelineMarkers').querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>goAngle(+b.dataset.event));
}
/* The learning-path card at the top of the Parts list: meet the core parts first, then what comes next. */
function guideCard(){
  const next=nextStep();
  if(!pathDone('meet')){const met=MEET_PARTS.filter(k=>notebook.seen.includes(k)).length;
    return `<div class="guide-card"><div class="eyebrow">Step 1 of ${PATH.length} · Learning path</div><h4>Meet the engine</h4><p>Select each of these parts, on the model or below, and read what it does.</p><div class="chips">${MEET_PARTS.map(k=>`<button class="chip" data-meet="${k}" data-done="${notebook.seen.includes(k)}">${esc(PARTS_INFO[k].name)}</button>`).join('')}</div><span class="guide-progress">${met} / ${MEET_PARTS.length} met</span></div>`;}
  if(next)return `<div class="guide-card"><div class="eyebrow">Up next · Step ${PATH.indexOf(next)+1} of ${PATH.length}</div><h4>${esc(next.title)}</h4><p>${esc(next.question)}</p><button class="btn sm primary" data-start-step="${next.id}">Start →</button></div>`;
  return `<div class="guide-card"><div class="eyebrow">Learning path complete</div><h4>Try the numbers</h4><p>Change bore, stroke and RPM in the Lab and watch what responds.</p><button class="btn sm" data-open-lab>Open the Lab →</button></div>`;
}
function bindGuide(){pane.querySelectorAll('[data-meet]').forEach(b=>b.onclick=()=>select(b.dataset.meet));pane.querySelectorAll('[data-start-step]').forEach(b=>b.onclick=()=>startStep(b.dataset.startStep));pane.querySelector('[data-open-lab]')?.addEventListener('click',()=>showTab('lab'));}
function focusPart(part){const box=new THREE.Box3();EN.root.updateMatrixWorld(true);let count=0;for(const m of EN.parts.get(part)?.meshes||[]){const cyl=m.userData.cyl??m.material.userData?.cyl;if(m.visible&&(E.instance===null||cyl==null||cyl===E.instance)){box.expandByObject(m);count++;}}if(!count){notifyEngine('Unhide this part before focusing it.');return;}CAM.tTarget.copy(box.getCenter(V3()));CAM.tRad=clamp(box.getSize(V3()).length()*1.9+1.4,2.4,40);S.follow=false;}
function setCameraPreset(view){S.follow=false;if(view==='home')resetView(false);if(view==='front'){CAM.tAz=0;CAM.tPol=Math.PI/2;}if(view==='side'){CAM.tAz=Math.PI/2;CAM.tPol=Math.PI/2;}if(view==='top'){CAM.tAz=0;CAM.tPol=.05;}if(RM){CAM.az=CAM.tAz;CAM.pol=CAM.tPol;CAM.rad=CAM.tRad;CAM.target.copy(CAM.tTarget);}}
function setFocusView(on){E.focus=on;engineRoot.classList.toggle('focus-view',on);$('#exitFocus').hidden=!on;$('#focusView').setAttribute('aria-pressed',on);if(on)$('#exitFocus').focus();}
function resetEngineScene(quiet=false){
  E.pending=null;E.returnScene=null;D.lesson=null;D.step='predict';E.instance=null;E.query='';E.listScroll=0;E.cut=1;E.explode=1;E.labels='selected';E.routeIndex=0;E.sheet='medium';
  Object.assign(S,{theta:EN.cyl[0].off+120,focusCyl:0,view:'cutaway',flow:'off',explode:false,explodeT:0,sel:null,hover:null,isolate:false,follow:false,playing:false,rpm:15});S.hidden.clear();D.graph='pressure';
  setFocusView(false);setInspector('parts');resetView(true);syncEnginePage();rememberScene();if(!quiet)notifyEngine('Scene reset: paused at 120°, cutaway, all parts visible.');
}
function captureExploration(){return {arch:S.arch,theta:S.theta,view:S.view,flow:S.flow,sel:S.sel,hidden:[...S.hidden],isolate:S.isolate,focusCyl:S.focusCyl,instance:E.instance,playing:S.playing,rpm:S.rpm,explode:S.explode,explodeT:S.explodeT,cut:E.cut,separation:E.explode,mode:E.mode,collapsed:E.collapsed,labels:E.labels,query:E.query,listScroll:E.listScroll,sheet:E.sheet,focus:E.focus,graph:D.graph,camera:{az:CAM.tAz,pol:CAM.tPol,rad:CAM.tRad,target:CAM.tTarget.toArray()}};}
function restoreExploration(s){if(!s)return;D.lesson=null;E.returnScene=null;E.pending=null;setArch(s.arch);Object.assign(S,{theta:s.theta,view:s.view,flow:s.flow,sel:s.sel,hidden:new Set(s.hidden),isolate:s.isolate,focusCyl:s.focusCyl,playing:s.playing,rpm:RPM_STOPS.includes(s.rpm)?s.rpm:Number.isFinite(s.speed)?Math.min(MODEL_MAX_RPM,s.speed*30):15,explode:s.explode,explodeT:s.explodeT});Object.assign(E,{instance:s.instance,cut:s.cut,explode:s.separation,labels:s.labels,query:s.query,listScroll:s.listScroll,sheet:s.sheet});D.graph=s.graph;restoreCamera(s.camera);setInspector(s.mode,!s.collapsed);setFocusView(s.focus===true);syncEnginePage();notifyEngine('Returned to your exploration.');const focus=E.focus?$('#exitFocus'):E.returnFocus?.isConnected&&!E.returnFocus.closest('[hidden]')?E.returnFocus:(E.collapsed?$('#inspectorReopen'):$('#'+E.mode+'Tab'));focus?.focus();}
function restoreCamera(c){if(!c)return;CAM.az=CAM.tAz=c.az;CAM.pol=CAM.tPol=c.pol;CAM.rad=CAM.tRad=c.rad;CAM.target.fromArray(c.target);CAM.tTarget.copy(CAM.target);}
function startLesson(id){
  if(!renderer){showTab('engine');return;}const l=LESSONS.find(x=>x.id===id);if(!l)return;
  const snapshot=E.returnScene||captureExploration(),focus=document.activeElement;resetEngineScene(true);E.returnScene=snapshot;E.returnFocus=focus;
  D.lesson=l;D.step='predict';D.prediction=null;D.visited.clear();D.layouts.clear();D.rpm=3000;D.stroke=86;D.graph=l.graph;
  setArch(l.id==='rhythm'?'i4':'single');S.theta=l.angle;setRpm(7.5);showTab('engine');setInspector('charts');updateEngineInspector();$('#lessonTitle')?.focus();rememberScene();
}
function renderLesson(){
  const l=D.lesson,steps=['predict','explore','explain'],cur=steps.indexOf(D.step),stepNo=PATH.findIndex(p=>p.id===l.id)+1;
  pane.innerHTML=`<div class="lesson-head"><div class="lesson-header"><span class="small">Step ${stepNo} of ${PATH.length} · Investigation</span><button class="btn sm" id="exitLesson">Exit lesson</button></div><h2 id="lessonTitle" tabindex="-1">${l.title}</h2><p class="lesson-steps">${steps.map((s,i)=>`<span class="${i<cur?'done':''}" ${i===cur?'aria-current="step"':''}><b>${i<cur?'✓':i+1}</b>${s}</span>`).join('')}</p>${D.step==='explore'?'<p id="lessonProgress" role="status"></p>':''}</div><div class="lesson-body" id="lessonStep"></div><div class="lesson-foot" id="lessonFoot"></div>`;
  $('#exitLesson').onclick=()=>restoreExploration(E.returnScene);
  const el=$('#lessonStep'),foot=$('#lessonFoot');
  if(D.step==='predict'){
    el.innerHTML=`<p>${l.prompt}</p><div class="bench-choices">${l.choices.map((c,i)=>`<button class="bench-choice" data-prediction="${i}" aria-pressed="${D.prediction===i}">${c}</button>`).join('')}</div>`;
    foot.innerHTML=`<button class="btn primary" id="beginExplore" ${D.prediction===null?'disabled':''}>Explore →</button>`;
    el.querySelectorAll('[data-prediction]').forEach(b=>b.onclick=()=>{D.prediction=+b.dataset.prediction;el.querySelectorAll('[data-prediction]').forEach(x=>x.setAttribute('aria-pressed',x===b));$('#beginExplore').disabled=false;});
    $('#beginExplore').onclick=()=>{D.step='explore';if(l.id==='rhythm')D.layouts.add(S.arch);renderInspector();};
  }else if(D.step==='explore'){
    el.innerHTML=`<p class="bench-instruction">${l.task}</p>${l.id==='rpm'?`<label class="bench-range-label" for="discoveryRpm">Experiment RPM <b id="discoveryRpmValue"></b></label><input id="discoveryRpm" type="range" min="1000" max="9000" step="250" value="${D.rpm}"><label class="bench-range-label" for="discoveryStroke">Stroke <b id="discoveryStrokeValue"></b></label><input id="discoveryStroke" type="range" min="50" max="110" value="${D.stroke}"><div id="rpmComparison"></div><p class="small">A separate numerical experiment. The engine dimensions and animation speed are unchanged.</p>`:chartMarkup()}`;
    foot.innerHTML=`<button class="btn" id="revisePrediction">Revise prediction</button><button class="btn primary" id="explainLesson" disabled>Explain →</button>`;
    if(l.id==='rpm'){$('#discoveryRpm').oninput=e=>{D.rpm=+e.target.value;if(D.rpm===6000)D.visited.add('rpm');renderRpmComparison();evaluateDiscovery();};$('#discoveryStroke').oninput=e=>{D.stroke=+e.target.value;renderRpmComparison();};renderRpmComparison();}else bindCharts();
    $('#revisePrediction').onclick=()=>{D.step='predict';renderInspector();};$('#explainLesson').onclick=()=>{D.step='explain';if(!notebook.completed.includes(l.id)){notebook.completed.push(l.id);persistNotebook();renderPath();}renderInspector();};evaluateDiscovery();
  }else{
    const next=nextStep();
    el.innerHTML=`<div class="bench-feedback"><p><strong>${D.prediction===l.correct?'Your prediction fits the evidence.':'A useful surprise.'}</strong></p><p>${l.explanation}</p></div><p class="small">Keep exploring: ${l.extension}</p>`;
    foot.innerHTML=`<button class="btn" id="revisitEvidence">Revisit evidence</button>${next?`<button class="btn primary" id="nextStep" title="${esc(next.title)}">Next step →</button>`:'<button class="btn primary" id="finishPath">Finish</button>'}`;
    $('#revisitEvidence').onclick=()=>{D.step='explore';renderInspector();};
    $('#nextStep')?.addEventListener('click',()=>startStep(next.id));
    $('#finishPath')?.addEventListener('click',()=>{restoreExploration(E.returnScene);notifyEngine('Learning path complete. Try the numbers in the Lab.');});
  }
}
function evaluateDiscovery(){
  const l=D.lesson;if(!l||D.step!=='explore'||!$('#lessonProgress'))return;
  const ready=l.id==='rpm'?D.visited.has('rpm'):l.id==='rhythm'?D.layouts.has('i4')&&D.layouts.has('i6'):l.stops.every(a=>D.visited.has(a));
  $('#lessonProgress').textContent=l.stops.length?`${l.stops.filter(a=>D.visited.has(a)).length} / ${l.stops.length} observations · ${l.stops.map(a=>(D.visited.has(a)?'✓ ':'')+a+'°').join(', ')}`:l.id==='rpm'?(ready?'6,000 RPM observed.':'Set the experiment to 6,000 RPM.'):`${['i4','i6'].filter(k=>D.layouts.has(k)).length} / 2 layouts compared.`;
  $('#explainLesson').disabled=!ready;
}
function currentScene(){const s=captureExploration();return {v:1,arch:S.arch,cylinder:S.focusCyl,angle:observeCycle(S.arch,S.focusCyl,S.theta).angle,view:S.view,lesson:D.lesson?.id||null,graph:D.graph,engine:{mode:{parts:'inspect',flow:'systems',charts:'measure'}[E.mode],cut:E.cut,separation:E.explode,exploded:S.explode,flow:S.flow,part:S.sel,instance:E.instance,hidden:[...S.hidden],isolate:S.isolate,camera:s.camera}};}
function rememberScene(){if(!EN||!E.ready||!E.visitedScene)return;notebook.resume=currentScene();persistNotebook();}
function restoreScene(input){const s=validScene(input);if(!s||!renderer)return;if(s.lesson)startLesson(s.lesson);else {D.lesson=null;E.returnScene=null;}setArch(s.arch);S.focusCyl=s.cylinder;S.theta=EN.cyl[s.cylinder].off+s.angle;S.view=s.view;D.graph=s.graph;play(false);E.routeIndex=0;const e=s.engine;if(e){E.cut=e.cut;E.explode=e.separation;E.instance=e.instance;S.explode=e.exploded;S.explodeT=e.exploded?1:0;S.flow=e.flow;S.sel=e.part;S.hidden=new Set(e.hidden);S.isolate=e.isolate&&!!e.part;restoreCamera(e.camera);}else{S.flow='off';S.sel=null;S.explode=false;S.explodeT=0;S.isolate=false;E.instance=null;E.cut=1;E.explode=1;}showTab('engine');setInspector(s.lesson?'charts':({inspect:'parts',systems:'flow',measure:'charts'}[e?.mode]||'parts'));syncEnginePage();rememberScene();}
function openDialog(title,html){$('#dialogContent').innerHTML=`<h2 id="dialogTitle">${esc(title)}</h2>${html}`;const d=$('#engineDialog');E.dialogFocus=document.activeElement;d.showModal();$('#closeDialog').focus();}
function showControls(){openDialog('Learn the controls','<p>Start with the cutaway. Drag the engine to rotate; scroll to zoom; right-drag or Shift-drag to pan. Select a component to learn what it does.</p><ul><li><b>Toolbar:</b> choose the engine (ⓘ explains the layout), Full / Cutaway / X-ray, and Explode. Save, Share and Reset sit on the right.</li><li><b>Showing:</b> the row over the model lists what is selected or filtered. × removes one item; Clear all (or Esc) removes them all but keeps your camera and angle.</li><li><b>Parts:</b> search, select, then Focus, Isolate or Hide.</li><li><b>Flow:</b> choose a route, then select a numbered component.</li><li><b>Charts:</b> choose a measurement and scrub the shared timeline. Markers on the timeline jump to named events.</li><li><b>Camera:</b> Fit, Front, Side and Top sit at the bottom right of the model, with Labels and Focus view.</li><li><b>Learning path:</b> the button at the top right shows your progress and what to do next.</li></ul><p>On the timeline, arrow keys move one degree. When the model has focus, arrows move ten degrees; Shift moves one. Space plays or pauses.</p>');}

/* Labels use named model anchors and clear annotation lanes. */
const LABEL_ANCHORS={piston:'piston',rod:'rod',crank:'crank',intakevalve:'ivalve',exhaustvalve:'evalve',plug:'plug',camshaft:'cams',timing:'timing',pan:'pan',head:'head',block:'block',intake:'intake',exhaust:'exhaust',flywheel:'flywheel',gasket:'gasket',cover:'cover',tcover:'tcover'};
let labelKey='';
function updateEngineLabels(){
  const layer=$('#engineLabels'),w=stage.clientWidth,h=stage.clientHeight;
  const moving=drag||pinch||S.playing||Math.abs(CAM.az-CAM.tAz)>.002||Math.abs(CAM.pol-CAM.tPol)>.002||Math.abs(CAM.rad-CAM.tRad)>.01||CAM.target.distanceTo(CAM.tTarget)>.01||Math.abs(S.explodeT-(S.explode?1:0))>.01;
  const key=[w,h,S.sel,S.theta,S.view,E.cut,E.labels,E.instance,S.focusCyl,[...S.hidden],S.isolate,CAM.az,CAM.pol,CAM.rad,...CAM.target.toArray(),S.explodeT,E.explode,!!moving].join(':');if(key===labelKey)return;labelKey=key;layer.replaceChildren();
  if(!EN||E.labels==='off'||moving||w<300||h<180)return;
  EN.root.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const box=new THREE.Box3();for(const group of EN.parts.values())for(const m of group.meshes)if(visibleChain(m))box.expandByObject(m);
  if(box.isEmpty())return;const corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(V3(x,y,z).project(camera));
  const left=Math.min(...corners.map(p=>(p.x+1)*w/2)),right=Math.max(...corners.map(p=>(p.x+1)*w/2));
  const names=E.labels==='selected'?(S.sel?[S.sel]:[]):['piston','rod','crank'],used=[];let svg='';
  for(const part of names){
    const anchor=LABEL_ANCHORS[part];if(!anchor||S.hidden.has(part))continue;
    const cy=E.instance??S.focusCyl,inst=['piston','rod','ivalve','evalve','plug'].includes(anchor),point=EN.anchor(inst?anchor+':'+cy:anchor);if(!point)continue;
    const group=EN.parts.get(part),meshes=group?.meshes.filter(m=>visibleChain(m)&&(!inst||m.userData.cyl===cy));if(!meshes?.length||meshes.every(m=>m.material.clippingPlanes?.some(p=>p.distanceToPoint(point)<0)))continue;
    const p=point.clone().project(camera),x=(p.x+1)*w/2,y=(1-p.y)*h/2;if(p.z< -1||p.z>1||x<0||x>w||y<20||y>h-20)continue;
    ray.set(camera.position,point.clone().sub(camera.position).normalize());const hit=ray.intersectObject(EN.root,true).find(hit=>visibleChain(hit.object)&&hit.object.userData.part&&EN.parts.get(hit.object.userData.part)?.op>.8&&!hit.object.material.clippingPlanes?.some(p=>p.distanceToPoint(hit.point)<0));if(hit&&hit.object.userData.part!==part&&hit.distance<camera.position.distanceTo(point)-.1)continue;
    const title=PARTS_INFO[part].name+(inst&&EN.e.N>1?' · '+EN.cyl[cy].n:''),width=Math.min(210,title.length*7+14),side=right+width+28<w?'right':left-width-28>0?'left':null;if(!side)continue;
    let ly=clamp(y,24,h-24);while(used.some(v=>Math.abs(v-ly)<32))ly+=32;if(ly>h-24)continue;used.push(ly);
    const tx=side==='right'?right+20:left-width-20,edge=side==='right'?tx-5:tx+width+5,bend=side==='right'?right+10:left-10;
    svg+=`<path d="M${x},${y}L${bend},${ly}H${edge}"/><circle cx="${x}" cy="${y}" r="2.5"/><rect x="${tx}" y="${ly-12}" width="${width}" height="24" rx="3"/><text x="${tx+7}" y="${ly+4}">${esc(title)}</text>`;
  }
  layer.innerHTML=svg?`<svg viewBox="0 0 ${w} ${h}">${svg}</svg>`:'';
}

$('#sceneArchitecture').innerHTML=ARCH_ORDER.map(k=>`<option value="${k}">${ARCHS[k].full}</option>`).join('');
$('#sceneArchitecture').onchange=e=>setArch(e.target.value);
radioKeys($('#sceneCylinder'));
document.querySelectorAll('#sceneView [data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));radioKeys($('#sceneView'));
$('#engineRpm').max=RPM_STOPS.length-1;$('#engineRpm').parentElement.style.setProperty('--split',(MODEL_STOPS-.5)/(RPM_STOPS.length-1)*100+'%');$('#engineRpm').oninput=e=>setRpm(RPM_STOPS[+e.target.value]);
document.querySelectorAll('[data-inspector]').forEach((b,i,all)=>{b.onclick=()=>setInspector(b.dataset.inspector);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const j=e.key==='Home'?0:e.key==='End'?2:mod(i+(e.key==='ArrowRight'?1:-1),3);setInspector(all[j].dataset.inspector);all[j].focus();};});
$('#sceneExplode').onclick=()=>setExplode(!S.explode);$('#sceneCut').oninput=e=>{E.cut=+e.target.value/100;$('#sceneCutValue').textContent=Math.round(E.cut*100)+'%';updateEngineInspector();rememberScene();};$('#sceneSeparation').oninput=e=>setExplodeAmount(+e.target.value/100);
$('#sceneLabels').onclick=()=>{E.labels=E.labels==='off'?'selected':'off';syncEnginePage();rememberScene();};document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>setCameraPreset(b.dataset.camera));$('#fitEngine').onclick=()=>resetView(false);
$('#clearAll').onclick=clearFilters;
$('#inspectorCollapse').onclick=()=>{setInspector(E.mode,false);$('#inspectorReopen').focus();};$('#inspectorReopen').onclick=()=>{setInspector(E.mode);($('#'+E.mode+'Tab')).focus();};
$('#sheetSize').onclick=()=>{E.sheet=E.sheet==='medium'?'expanded':'medium';$('#sheetSize').setAttribute('aria-expanded',E.sheet==='expanded');$('#sheetSize').setAttribute('aria-label',E.sheet==='expanded'?'Reduce inspector':'Expand inspector');engineRoot.classList.toggle('sheet-expanded',E.sheet==='expanded');};
$('#focusView').onclick=()=>setFocusView(!E.focus);$('#exitFocus').onclick=()=>{setFocusView(false);$('#focusView').focus();};
$('#playBtn').onclick=()=>play(!S.playing);$('#timeline').oninput=e=>goAngle(+e.target.value);
$('#timeline').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))return;e.preventDefault();const a=observeCycle(S.arch,S.focusCyl,S.theta).angle;goAngle(e.key==='Home'?0:e.key==='End'?719:a+(['ArrowLeft','ArrowDown','PageDown'].includes(e.key)?-1:1)*(e.key.startsWith('Page')?10:1));};
$('#sceneReset').onclick=()=>resetEngineScene();$('#sceneAbout').onclick=()=>openAtlas(S.arch);
$('#sceneSave').onclick=()=>{notebook.scenes.unshift(currentScene());notebook.scenes=notebook.scenes.slice(0,12);notifyEngine(persistNotebook()?'Scene saved to your notebook (Discover → Your notebook).':'Saved for this session; browser storage is unavailable.');};
$('#sceneCopy').onclick=async()=>{const url=new URL(location.href);url.hash='scene='+encodeURIComponent(JSON.stringify(currentScene()));try{await navigator.clipboard.writeText(url.href);notifyEngine('Scene link copied.');}catch{openDialog('Copy scene link','<label for="sceneLinkText">Copy this link. Recipients need access to this app URL.</label><input id="sceneLinkText" class="discovery-input" readonly>');$('#sceneLinkText').value=url.href;$('#sceneLinkText').select();}};
$('#closeDialog').onclick=()=>$('#engineDialog').close();$('#engineDialog').addEventListener('close',()=>E.dialogFocus?.focus());
document.addEventListener('click',e=>{for(const id of ['pathMenu','soundMenu'])if(!$('#'+id).contains(e.target))$('#'+id).open=false;});
document.addEventListener('keydown',e=>{if((e.key==='m'||e.key==='M')&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!engineRoot.hidden&&!e.target.closest?.('input[type=search],input[type=text],textarea,[contenteditable]')){e.preventDefault();setSound(!SOUND.on);return;}if(e.key==='Escape'){if($('#pathMenu').open){$('#pathMenu').open=false;$('#pathButton').focus();return;}if($('#soundMenu').open){$('#soundMenu').open=false;$('#soundMenu summary').focus();return;}if($('#engineDialog').open)return;if(E.focus){setFocusView(false);return;}
  if(!engineRoot.hidden&&!e.target.closest?.('input,textarea,select'))clearFilters();return;}if(engineRoot.hidden||e.target.closest?.('input,select,textarea,button,summary,dialog')||e.target.closest?.('#engineInspector'))return;const a=observeCycle(S.arch,S.focusCyl,S.theta).angle;if(e.key===' '){e.preventDefault();play(!S.playing);}if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();goAngle(mod(a+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:10),720));}});
canvas.addEventListener('pointerdown',()=>{CAM.tAz=CAM.az;CAM.tPol=CAM.pol;CAM.tRad=CAM.rad;CAM.tTarget.copy(CAM.target);});canvas.addEventListener('pointercancel',e=>{ptr.delete(e.pointerId);drag=null;pinch=null;canvas.classList.remove('dragging');});
function showTab(t){if(t==='engine')E.visitedScene=true;if(EN&&!engineRoot.hidden&&t!=='engine')rememberScene();document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===t;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;});engineRoot.hidden=t!=='engine';setSoundActive(t==='engine'&&!document.hidden);$('#discover').hidden=t!=='discover';$('#lab').hidden=t!=='lab';$('#atlas').hidden=t!=='atlas';if(t==='atlas')renderAtlas();else stopListening();if(t==='engine'&&renderer)requestAnimationFrame(resize);if(t==='lab')labStart();if(t==='discover')renderDiscover();}
document.querySelectorAll('[data-tab]').forEach((b,i,all)=>{b.id='tab-'+b.dataset.tab;b.setAttribute('aria-controls',b.dataset.tab==='engine'?'engineView':b.dataset.tab);b.onclick=()=>showTab(b.dataset.tab);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const j=e.key==='Home'?0:e.key==='End'?all.length-1:mod(i+(e.key==='ArrowRight'?1:-1),all.length);all[j].focus();showTab(all[j].dataset.tab);};});
for(const id of ['engineView','atlas','lab','discover']){$('#'+id).setAttribute('role','tabpanel');$('#'+id).setAttribute('aria-labelledby','tab-'+(id==='engineView'?'engine':id));}
function restoreHash(){try{if(location.hash.startsWith('#atlas')){const id=decodeURIComponent(location.hash.slice(7))||null;if(id!==AT.story||$('#atlas').hidden)openAtlas(id);return;}if(location.hash.startsWith('#scene=')){const s=validScene(JSON.parse(decodeURIComponent(location.hash.slice(7))));if(s)restoreScene(s);}}catch{/* malformed links are ignored */}}
addEventListener('hashchange',restoreHash);addEventListener('pagehide',rememberScene);
let lastT=performance.now(),uiT=0;
function frame(now){const dt=Math.min(.05,(now-lastT)/1000);lastT=now;if(!engineRoot.hidden&&!document.hidden&&EN){if(S.playing)advanceEngine(dt*modelDps());const target=S.explode?1:0;S.explodeT=RM?target:clamp(S.explodeT+Math.sign(target-S.explodeT)*dt/.9,0,1);if(Math.abs(target-S.explodeT)<dt/.9)S.explodeT=target;EN.update(engineState(now/1000));soundFrame();doHover();updateCamera(dt);updateEngineLabels();uiT+=dt;if(uiT>.08){uiT=0;updateEngineInspector();}render();}requestAnimationFrame(frame);}
function boot(){initRenderer();S.view='cutaway';S.theta=120;setArch('single');resetView(true);syncEnginePage();setInspector('parts');try{new ResizeObserver(resize).observe(stage);}catch{addEventListener('resize',resize);}resize();E.ready=true;requestAnimationFrame(frame);}
