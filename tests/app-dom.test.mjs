// Isolated DOM integration tests. The WebGL renderer is replaced; these do not
// assert pixels, layout, or graphics-driver behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';

const source=['prelude.js','ui.js','lab.js','discovery.js','engine-page.js','audio.js','atlas.js','bootstrap.js'].map(f=>fs.readFileSync('app/'+f,'utf8')).join('\n');
const mocked=source.replace('try {boot();}',`
initRenderer=()=>{ if(globalThis.graphicsFail)throw Error('test graphics unavailable'); renderer={}; scene=new THREE.Scene(); camera=new THREE.PerspectiveCamera(34,1,.2,120); };
applyTheme=()=>{}; resize=()=>{};
try {boot();}`)+`
globalThis.appTest={S,D,E,SOUND,AT,ATLAS,CREDITS,restoreHash,notebook,LESSONS,LAB,labUpdate,engineState,currentScene,restoreScene,captureExploration,advanceEngine,updateEngineLabels,updateEngineInspector,updateCamera,CAM,get model(){return EN;},get camera(){return camera;}};`;
fs.mkdirSync('app/.build',{recursive:true}); // the app's imports resolve from here, as in scripts/build-app.mjs; it is git-ignored, so a fresh checkout lacks it
const bundled=await build({stdin:{contents:mocked,resolveDir:process.cwd()+'/app/.build',sourcefile:'test-app.js'},bundle:true,format:'iife',write:false,logLevel:'silent'});

function app({stored=null,storageFails=false,reducedMotion=false,graphicsFail=false,audio=false,sound=null}={}){
  const {window,document}=parseHTML(fs.readFileSync('app/index.html','utf8'));
  // LinkeDOM does not implement the browser select.value setter.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(v){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.value===String(v));}});
  window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
  const saved=new Map(stored?[['engine-lab-discoveries-v1',JSON.stringify(stored)]]:[]);if(sound)saved.set('engine-lab-sound',JSON.stringify(sound));
  // A minimal Web Audio stand-in: no AudioWorklet, so the app takes its ScriptProcessor fallback path.
  // The DOM library shares its window between test apps, so set or clear the stand-in explicitly every time.
  window.AudioContext=audio?class{constructor(){this.sampleRate=48000;this.state='suspended';this.destination={};}resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}createScriptProcessor(){return {connect(){}};}}:undefined;
  const context={document,window,console:{...console,error:(...args)=>{if(!graphicsFail)console.error(...args);}},performance,URL,Set,Map,Float64Array,Float32Array,Uint8Array,Uint16Array,Uint32Array,graphicsFail,
    localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>{if(storageFails)throw Error('storage denied');saved.set(k,v);}},
    navigator:{},location:{href:'https://example.test/engine-lab.html',hash:''},
    matchMedia:()=>({matches:reducedMotion,addEventListener(){}}),getComputedStyle:()=>({getPropertyValue:()=>''}),
    requestAnimationFrame:()=>1,cancelAnimationFrame(){},addEventListener(){},
    ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}}};
  window.innerWidth=1280;window.devicePixelRatio=1;
  vm.runInNewContext(bundled.outputFiles[0].text,context,{timeout:15000});
  const $=q=>document.querySelector(q),click=q=>{const el=$(q);assert.ok(el,`missing ${q}`);assert.equal(!!el.closest('[hidden]'),false,`hidden ${q}`);el.click();},change=(q,value)=>{const el=$(q);el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}));},input=(q,value)=>{const el=$(q);el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));};
  return {api:context.appTest,document,$,click,change,input,saved,window,context};
}

const engine=a=>a.click('[data-tab="engine"]');
const mode=(a,m)=>a.click(`[data-inspector="${m}"]`);
const sceneAction=(a,id)=>a.click('#'+id);
const checked=(a,group)=>a.$(`${group} [aria-checked="true"]`);
const key=(a,q,k,shift=false)=>{const e=new a.window.Event('keydown',{bubbles:true,cancelable:true});e.key=k;e.shiftKey=shift;a.$(q).dispatchEvent(e);};

test('default page has one transport, a paused cutaway, and no legacy controls',()=>{
 const a=app();engine(a);assert.equal(a.api.S.playing,false);assert.equal(a.api.S.theta,120);assert.equal(a.api.S.view,'cutaway');assert.equal(a.api.E.mode,'parts');assert.equal(a.api.E.labels,'selected');assert.equal(a.$('#cylinderControl').hidden,true);
 for(const id of ['bench','info','tour','benchReset','partInstance','archSeg'])assert.equal(a.$('#'+id),null);
 assert.equal(a.document.querySelectorAll('#timeline').length,1);
});
test('parts list replaces detail and restores query, scope follows the shared cylinder',()=>{
 const a=app();engine(a);a.change('#sceneArchitecture','i4');a.input('#enginePartSearch','conrod');a.click('[data-engine-part="rod"]');assert.equal(a.$('#enginePartSearch'),null);assert.match(a.$('#partScope').textContent,/Cylinder 1/);a.click('[data-cyl="2"]');assert.match(a.$('#partScope').textContent,/Cylinder 3/);
 a.click('#backToParts');assert.equal(a.$('#enginePartSearch').value,'conrod');assert.equal(a.document.querySelectorAll('[data-engine-part]').length,1);
 a.click('[data-engine-part="rod"]');a.click('#hidePart');assert.equal(a.api.S.hidden.has('rod'),true);assert.match(a.$('#hidePart').textContent,/Unhide/);assert.equal(a.api.S.sel,'rod');a.click('[data-chip="hidden"]');assert.equal(a.api.S.hidden.size,0);
});
test('tab changes and model selection preserve camera, scene and tab',()=>{
 const a=app();engine(a);a.input('#timeline','410');a.click('[data-engine-part="piston"]');const before=a.api.currentScene();mode(a,'charts');assert.equal(a.api.S.sel,'piston');assert.equal(a.api.S.theta,410);assert.deepEqual(a.api.currentScene().engine.camera,before.engine.camera);
 mode(a,'flow');a.click('[data-flow="air"]');a.click('[data-route="2"]');assert.equal(a.api.E.mode,'flow');assert.equal(a.api.S.sel,'intake');assert.deepEqual(a.api.currentScene().engine.camera,before.engine.camera);
});
test('flow starts Off, keeps chosen route while exploded, and explicitly reassembles',()=>{
 const a=app();engine(a);mode(a,'flow');assert.equal(checked(a,'#flowSelect').dataset.flow,'off');a.click('[data-flow="air"]');assert.equal(a.api.engineState(0).flow,'air');a.click('#sceneExplode');assert.equal(a.api.S.explode,true);assert.equal(checked(a,'#flowSelect').dataset.flow,'air');assert.equal(a.api.engineState(0).flow,'off');assert.ok(a.$('#reassembleFlow'));a.click('[data-flow="oil"]');assert.equal(a.api.S.explode,true);a.click('#reassembleFlow');assert.equal(a.api.engineState(0).flow,'oil');a.click('[data-flow="off"]');assert.equal(a.api.engineState(0).flow,'off');
});
test('one reset has the same contract from every tab and preserves notebook',()=>{
 const a=app();engine(a);a.change('#sceneArchitecture','v8');sceneAction(a,'sceneSave');
 for(const m of ['parts','flow','charts']){mode(a,m);a.input('#timeline','410');a.click('#sceneExplode');a.click('[data-cyl="3"]');a.click('[data-view="xray"]');sceneAction(a,'sceneReset');assert.equal(a.api.S.arch,'v8');assert.equal(a.api.S.theta,120);assert.equal(a.api.S.focusCyl,0);assert.equal(a.api.S.view,'cutaway');assert.equal(a.api.S.explode,false);assert.equal(a.api.S.flow,'off');assert.equal(a.api.S.playing,false);assert.equal(a.api.E.mode,'parts');assert.equal(a.api.notebook.scenes.length,1);}
});
test('all six lessons use bounded steps, require deliberate evidence, and exit restores exploration',()=>{
 const a=app();engine(a);a.change('#sceneArchitecture','v8');a.input('#timeline','410');mode(a,'flow');a.click('[data-flow="oil"]');const before=a.api.captureExploration();
 for(const l of a.api.LESSONS){a.click('[data-tab="discover"]');a.click(`[data-lesson="${l.id}"]`);assert.equal(a.api.D.step,'predict');assert.equal(a.$('#inspectorTabs').hidden,true);assert.equal(a.$('#beginExplore').disabled,true);a.click(`[data-prediction="${l.correct}"]`);a.click('#beginExplore');assert.equal(a.$('#explainLesson').disabled,true);
 if(l.id==='rpm')a.input('#discoveryRpm','6000');else if(l.id==='rhythm')a.change('#sceneArchitecture','i6');else for(const angle of l.stops)a.input('#timeline',String(angle));
 assert.equal(a.$('#explainLesson').disabled,false,l.id);a.click('#explainLesson');assert.equal(a.api.D.step,'explain');assert.ok(a.api.notebook.completed.includes(l.id));assert.equal(a.$('#chartSelect'),null);a.click('#exitLesson');assert.equal(a.api.D.lesson,null);assert.deepEqual(a.api.captureExploration(),before);}
});
test('range, keyboard stepping, event jump and graph dragging use the observation path',()=>{
 const a=app();a.click('[data-lesson="cam"]');a.click('[data-prediction="0"]');a.click('#beginExplore');a.api.advanceEngine(719);assert.equal(a.api.D.visited.size,0);key(a,'#timeline','Home');a.click('[data-event="360"]');a.input('#timeline','709');key(a,'#gl','ArrowRight');assert.equal(a.api.D.visited.has(719),true);assert.equal(a.$('#explainLesson').disabled,false);
 a.click('#exitLesson');a.click('[data-tab="discover"]');a.click('[data-lesson="spark"]');a.click('[data-prediction="1"]');a.click('#beginExplore');a.click('[data-stop="345"]');a.api.advanceEngine(1000);assert.equal(a.api.S.theta,345);assert.equal(a.api.S.playing,false);assert.equal(a.api.D.visited.has(345),true);
 const g=a.$('#benchGraph');g.getBoundingClientRect=()=>({left:0,width:370});g.setPointerCapture=()=>{};g.onpointerdown({pointerId:1,clientX:34+379/719*304});g.onpointerup();assert.equal(a.api.D.visited.has(379),true);a.click('#explainLesson');assert.match(a.$('.bench-feedback').textContent,/useful surprise/);
});
test('revise prediction preserves observations and autoplay never earns them',()=>{
 const a=app();a.click('[data-lesson="strokes"]');a.click('[data-prediction="0"]');a.click('#beginExplore');a.input('#timeline','90');a.click('#revisePrediction');a.click('[data-prediction="1"]');a.click('#beginExplore');assert.equal(a.api.D.visited.has(90),true);a.api.advanceEngine(600);assert.equal(a.api.D.visited.size,1);
});
test('event stop is exact and cancels on cylinder, angle, or architecture change',()=>{
 const a=app();engine(a);a.change('#sceneArchitecture','v8');mode(a,'charts');a.click('[data-cyl="3"]');a.input('#timeline','340');a.click('[data-stop="345"]');const target=a.api.E.pending.target;a.api.advanceEngine(200);assert.equal(a.api.S.theta,target);assert.equal(a.api.S.playing,false);
 a.click('[data-stop="345"]');a.click('[data-cyl="2"]');assert.equal(a.api.E.pending,null);a.click('[data-stop="345"]');a.input('#timeline','300');assert.equal(a.api.E.pending,null);a.click('[data-stop="345"]');a.change('#sceneArchitecture','i6');assert.equal(a.api.E.pending,null);assert.equal(a.api.E.mode,'charts');assert.equal(a.$('#timeline').value,'300');
});
test('all charts, saved scene migration and selected cylinder remain synchronized',()=>{
 const a=app();engine(a);a.change('#sceneArchitecture','v8');a.click('[data-cyl="5"]');mode(a,'charts');
 for(const graph of ['pressure','torque','valves','position','rhythm']){a.click(`[data-graph="${graph}"]`);a.input('#timeline','392');assert.ok(a.$('#benchGraph'));assert.ok(a.$('#chartValue').textContent.length>5);}
 a.click('[data-graph="torque"]');sceneAction(a,'sceneSave');const saved=a.api.notebook.scenes[0];assert.equal(saved.engine.mode,'measure');sceneAction(a,'sceneReset');a.api.restoreScene(saved);assert.equal(a.api.E.mode,'charts');assert.equal(checked(a,'#sceneCylinder').dataset.cyl,'5');assert.equal(a.$('#timeline').value,'392');assert.match(a.$('#benchPlotNote').textContent,/Independent scales/);
});
test('storage failure, glossary, Lab baseline and graphics fallback remain usable',()=>{
 const a=app({storageFails:true});a.input('#glossarySearch','overlap');assert.equal(a.document.querySelectorAll('.glossary-item').length,1);engine(a);sceneAction(a,'sceneSave');assert.match(a.$('#engineSceneStatus').textContent,/session/);a.click('[data-tab="lab"]');a.click('#labSaveBaseline');a.input('#rR','6000');assert.match(a.$('#labComparison').textContent,/\+8.6 m\/s/);a.click('#labRestoreBaseline');assert.equal(a.api.LAB.rpm,3000);
 const f=app({graphicsFail:true});f.click('[data-lesson="spark"]');assert.match(f.$('#stage').textContent,/3D view could not start/);f.click('#fallbackLab');assert.equal(f.$('#lab').hidden,false);
});
test('reduced motion, accessible navigation, menus and collapsed inspector',()=>{
 const a=app({reducedMotion:true});a.click('#freeEngine');assert.equal(a.api.S.playing,false);a.click('#inspectorCollapse');assert.equal(a.$('#engineInspector').hidden,true);a.click('#inspectorReopen');assert.equal(a.$('#engineInspector').hidden,false);key(a,'#partsTab','ArrowRight');assert.equal(a.api.E.mode,'flow');key(a,'#tab-engine','ArrowRight');assert.equal(a.$('#atlas').hidden,false);key(a,'#tab-atlas','ArrowRight');assert.equal(a.$('#lab').hidden,false);a.click('[data-tab="discover"]');a.click('#learnControls');assert.match(a.$('#dialogTitle').textContent,/Learn/);
});
test('existing resume scene survives boot and native timeline keys count even at the endpoint',()=>{
 const resume={v:1,arch:'i6',angle:430,cylinder:2,view:'xray',graph:'valves'};
 const a=app({stored:{resume}});assert.equal(a.api.notebook.resume.angle,430);a.click('#resumeDiscovery');assert.equal(a.$('#timeline').value,'430');assert.equal(a.api.S.arch,'i6');
 a.click('[data-tab="discover"]');a.click('[data-lesson="cam"]');a.click('[data-prediction="0"]');a.click('#beginExplore');key(a,'#timeline','Home');assert.equal(a.api.D.visited.has(0),true);key(a,'#timeline','End');assert.equal(a.api.D.visited.has(719),true);
});
test('selected label uses a leader outside the projected engine and is suppressed during playback',()=>{
 const a=app();engine(a);a.click('[data-view="xray"]');a.click('[data-engine-part="piston"]');
 Object.defineProperties(a.$('#stage'),{clientWidth:{value:1800},clientHeight:{value:600}});a.api.camera.aspect=3;a.api.camera.updateProjectionMatrix();a.api.model.update(a.api.engineState(0));a.api.updateCamera(1);a.api.updateEngineLabels();
 assert.equal(a.document.querySelectorAll('#engineLabels text').length,1);assert.ok(a.$('#engineLabels path').getAttribute('d').includes('H'));assert.ok(a.$('#engineLabels circle'));assert.match(a.$('#engineLabels text').textContent,/Piston/);
 a.click('#playBtn');a.api.updateEngineLabels();assert.equal(a.$('#engineLabels').children.length,0);
});
test('isolation makes the selected block solid rather than its related crankshaft, then restores the view',()=>{
 const a=app();engine(a);a.change('#sceneArchitecture','v6');a.click('[data-view="xray"]');a.click('[data-engine-part="block"]');a.click('#isolatePart');
 let state=a.api.engineState(0);a.api.model.update(state);
 assert.equal(a.api.model.parts.get('block').op,1);
 assert.ok(a.api.model.parts.get('crank').op<.05);
 for(const m of a.api.model.parts.get('block').mats)assert.equal(m.clippingPlanes.length,0);
 assert.equal(state.gas,0);assert.equal(a.api.S.view,'xray');
 a.click('#isolatePart');state=a.api.engineState(0);a.api.model.update(state);
 assert.ok(a.api.model.parts.get('block').op<.1);assert.equal(a.api.model.parts.get('crank').op,1);
 a.click('[data-view="cutaway"]');a.click('#isolatePart');a.api.model.update(a.api.engineState(0));assert.equal(a.api.model.parts.get('block').op,1);assert.equal(a.api.engineState(0).cut,0);
 mode(a,'flow');a.click('[data-flow="oil"]');assert.equal(a.api.engineState(0).flow,'off');a.click('#exitFlowIsolation');assert.equal(a.api.engineState(0).flow,'oil');assert.equal(a.api.engineState(0).cut,1);
});
test('every part restores material opacity, depth and clipping after isolation across all layouts and views',()=>{
 const a=app();engine(a);
 // The Cutaway phantom timing chain follows selection by design; it has its own test below.
 const materials=()=>[...a.api.model.parts].flatMap(([part,p])=>[...p.mats].filter(m=>!(part==='timing'&&['chain','link'].includes(m.userData.key))).map(m=>({part,cylinder:m.userData.cyl,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite,planes:(m.clippingPlanes||[]).map(p=>[...p.normal.toArray(),p.constant])})));
 for(const arch of ['single','i4','i6','v6','v8','flat6']){
  a.change('#sceneArchitecture',arch);
  for(const view of ['full','cutaway','xray']){
   a.click(`[data-view="${view}"]`);a.api.model.update(a.api.engineState(0));const baseline=materials();
   for(const part of [...a.api.model.parts.keys()]){
    if(a.$('#backToParts'))a.click('#backToParts');a.click(`[data-engine-part="${part}"]`);
    a.api.model.update(a.api.engineState(0));assert.deepEqual(materials(),baseline,`${arch}/${view}/${part}: ordinary selection must not fade cylinders`);
    a.click('#isolatePart');a.api.model.update(a.api.engineState(0));a.click('#isolatePart');a.api.model.update(a.api.engineState(0));
    assert.deepEqual(materials(),baseline,`${arch}/${view}/${part}: exit must restore all material properties`);
    assert.equal(a.api.S.view,view);assert.equal(a.api.engineState(0).gas,1);
   }
   a.click('#backToParts');
  }
 }
});

test('Cutaway draws the timing chain as a phantom until the timing drive is being inspected',()=>{
 const a=app();engine(a);
 const chain=()=>[...a.api.model.parts.get('timing').mats].filter(m=>['chain','link'].includes(m.userData.key)).map(m=>m.opacity);
 const settle=()=>a.api.model.update(a.api.engineState(0));
 for(const arch of ['single','v8']){
  a.change('#sceneArchitecture',arch);
  a.click('[data-view="cutaway"]');settle();assert.deepEqual(chain(),[.3,.3],`${arch}: phantom chain in cutaway`);
  a.click('[data-engine-part="timing"]');settle();assert.deepEqual(chain(),[1,1],`${arch}: selected timing drive is solid`);
  a.click('#backToParts');a.click('[data-engine-part="camshaft"]');settle();assert.deepEqual(chain(),[1,1],`${arch}: related part keeps the chain solid`);
  a.click('#backToParts');a.click('[data-engine-part="piston"]');settle();assert.deepEqual(chain(),[.3,.3],`${arch}: unrelated selection keeps the phantom`);
  a.click('#backToParts');
  for(const view of ['full','xray']){ a.click(`[data-view="${view}"]`);settle();assert.deepEqual(chain(),[1,1],`${arch}/${view}: chain is solid outside cutaway`); }
 }
});

test('toolbar controls are visible choices that stay in sync with the scene',()=>{
 const a=app();engine(a);
 assert.equal(checked(a,'#sceneView').dataset.view,'cutaway');assert.equal(a.$('#cutControl').hidden,false);assert.equal(a.$('#separationControl').hidden,true);
 a.click('[data-view="xray"]');assert.equal(a.api.S.view,'xray');assert.equal(checked(a,'#sceneView').dataset.view,'xray');assert.equal(a.$('#cutControl').hidden,true);
 a.click('[data-view="cutaway"]');a.click('#sceneExplode');assert.equal(a.$('#sceneExplode').getAttribute('aria-pressed'),'true');assert.equal(a.$('#separationControl').hidden,false);assert.equal(a.$('#cutControl').hidden,true,'one contextual slider at a time');
 a.input('#engineRpm','7');assert.equal(a.api.S.rpm,60);assert.equal(a.$('#engineRpmValue').textContent,'60 rpm');assert.equal(a.$('#soundSyncNote').hidden,true,'the model can show 60 rpm');
 a.change('#sceneArchitecture','i4');assert.equal(a.$('#cylinderControl').hidden,false);assert.equal(a.document.querySelectorAll('#sceneCylinder [data-cyl]').length,4);assert.match(a.$('#firingOrder').textContent,/1–3–4–2/);
 a.click('[data-cyl="2"]');assert.equal(a.api.S.focusCyl,2);assert.equal(checked(a,'#sceneCylinder').dataset.cyl,'2');
 a.click('#sceneLabels');assert.equal(a.api.E.labels,'off');a.click('#sceneLabels');assert.equal(a.api.E.labels,'selected');
 a.click('#sceneAbout');assert.equal(a.$('#atlas').hidden,false,'ⓘ opens the Atlas');assert.match(a.$('#storyTitle').textContent,/everyday life/);a.click('[data-tab="engine"]');
 for(const id of ['sceneMenu','viewOptions','sceneCamera','eventJump'])assert.equal(a.$('#'+id),null,id);
 assert.equal(a.document.querySelectorAll('#engineView select').length,1,'only the engine picker remains a dropdown');
});
test('the Showing row names every active filter; × undoes one, Clear all and Esc undo all but keep the view',()=>{
 const a=app();engine(a);assert.equal(a.$('#sceneState').hidden,true);
 a.input('#timeline','410');a.click('[data-view="xray"]');const camera=a.api.currentScene().engine.camera;
 a.click('[data-engine-part="rod"]');a.click('#hidePart');a.click('#backToParts');a.click('[data-engine-part="piston"]');a.click('#isolatePart');mode(a,'flow');a.click('[data-flow="air"]');a.click('#sceneExplode');
 a.api.updateEngineInspector();
 const chips=()=>[...a.document.querySelectorAll('[data-chip]')].map(b=>b.dataset.chip);
 assert.deepEqual(chips(),['sel','isolate','flow','hidden','explode']);assert.equal(a.$('#sceneState').hidden,false);assert.match(a.$('#stateChips').textContent,/Air flow · paused/);
 a.click('[data-chip="explode"]');assert.equal(a.api.S.explode,false);assert.deepEqual(chips(),['sel','isolate','flow','hidden']);
 a.click('[data-chip="isolate"]');assert.equal(a.api.S.isolate,false);assert.equal(a.api.S.sel,'piston');
 a.click('#clearAll');assert.equal(a.api.S.sel,null);assert.equal(a.api.S.flow,'off');assert.equal(a.api.S.hidden.size,0);assert.equal(a.$('#sceneState').hidden,true);
 assert.equal(a.api.S.view,'xray');assert.equal(a.api.S.theta,410);assert.deepEqual(a.api.currentScene().engine.camera,camera);
 a.click('[data-view="cutaway"]');a.input('#sceneCut','60');a.click('[data-flow="oil"]');a.api.updateEngineInspector();assert.deepEqual(chips(),['flow','cut']);
 key(a,'#gl','Escape');assert.equal(a.api.S.flow,'off');assert.equal(a.api.E.cut,1);assert.equal(a.api.S.view,'cutaway');
 a.click('#sceneReset');assert.equal(a.api.S.theta,120);assert.match(a.$('#engineSceneStatus').textContent,/Scene reset/);
});
test('the learning path orders the steps, tracks meeting the parts and leads from one step to the next',()=>{
 const a=app();
 assert.equal(a.api.LESSONS.map(l=>l.id).join(),'strokes,cam,spark,torque,rhythm,rpm');
 assert.equal(a.$('#pathCount').textContent,'0 / 7');assert.equal(a.$('.discovery-card').dataset.step,'meet');assert.match(a.$('#firstDiscovery').textContent,/Start the learning path/);
 a.click('#firstDiscovery');assert.equal(a.$('#engineView').hidden,false);assert.equal(a.api.E.mode,'parts');assert.match(a.$('.guide-card').textContent,/Meet the engine/);
 for(const part of ['piston','rod','crank','intakevalve']){a.click(`[data-meet="${part}"]`);a.click('#backToParts');}
 assert.match(a.$('.guide-progress').textContent,/4 \/ 5/);assert.equal(a.$('[data-engine-part="piston"] .seen')!=null,true);
 a.click('[data-engine-part="camshaft"]');assert.ok(a.api.notebook.completed.includes('meet'));assert.equal(a.$('#pathCount').textContent,'1 / 7');assert.match(a.$('#engineSceneStatus').textContent,/Up next: Same place, different job/);
 a.click('#backToParts');assert.match(a.$('.guide-card').textContent,/Up next · Step 2 of 7/);a.click('[data-start-step="strokes"]');
 assert.equal(a.api.D.lesson.id,'strokes');assert.match(a.$('.lesson-head').textContent,/Step 2 of 7/);assert.match(a.$('[data-chip="lesson"]').parentElement.textContent,/Lesson · Same place/);
 a.click('[data-prediction="1"]');a.click('#beginExplore');
 assert.equal(a.document.querySelectorAll('#timelineMarkers .tl-mark.stop').length,4);
 a.click('[data-event="90"]');a.api.updateEngineInspector();assert.equal(a.document.querySelectorAll('#timelineMarkers .tl-mark.visited').length,1);
 for(const angle of [270,450,630])a.click(`[data-event="${angle}"]`);
 a.click('#explainLesson');assert.equal(a.$('#pathCount').textContent,'2 / 7');a.click('#nextStep');assert.equal(a.api.D.lesson.id,'cam');
 a.$('#pathMenu').open=true;assert.match(a.$('#pathContinue').textContent,/Continue: Half speed/);a.click('[data-path-step="meet"]');assert.equal(a.api.D.lesson,null);assert.equal(a.api.E.mode,'parts');
 const stored=JSON.parse(a.saved.get('engine-lab-discoveries-v1'));assert.deepEqual(stored.completed,['meet','strokes']);assert.ok(stored.seen.includes('camshaft'));
 const b=app({stored});assert.equal(b.$('#pathCount').textContent,'2 / 7');assert.match(b.$('#firstDiscovery').textContent,/Continue: Half speed/);
});
test('timeline markers jump to named events and the readout names the event',()=>{
 const a=app();engine(a);assert.equal(a.document.querySelectorAll('#timelineMarkers .tl-mark').length,8);
 a.click('[data-event="360"]');assert.equal(a.$('#timeline').value,'360');assert.match(a.$('#engineCycleReadout').textContent,/360° · .*Firing TDC/);
});
test('the theme toggle switches light and dark, remembers the choice and follows the system until used',()=>{
 const a=app();const root=a.document.documentElement,btn=a.$('#themeToggle');
 assert.equal(root.dataset.theme,undefined);assert.equal(btn.getAttribute('aria-pressed'),'false');assert.match(btn.getAttribute('aria-label'),/dark mode/);
 a.click('#themeToggle');assert.equal(root.dataset.theme,'dark');assert.equal(btn.getAttribute('aria-pressed'),'true');assert.match(btn.getAttribute('aria-label'),/light mode/);assert.equal(a.saved.get('engine-lab-theme'),'dark');
 a.click('#themeToggle');assert.equal(root.dataset.theme,'light');assert.equal(a.saved.get('engine-lab-theme'),'light');
 const failing=app({storageFails:true});failing.click('#themeToggle');assert.equal(failing.document.documentElement.dataset.theme,'dark','works without storage');
});
test('learning progress can be reset from the path menu and Discover, keeping saved scenes',()=>{
 const scene={v:1,arch:'i4',angle:90,cylinder:0,view:'full',graph:'pressure'};
 const a=app({stored:{completed:['meet','strokes','cam'],seen:['piston','rod','crank','intakevalve','camshaft'],scenes:[scene]}});
 assert.equal(a.$('#pathCount').textContent,'3 / 7');assert.ok(a.$('#discoverReset'));
 a.$('#pathMenu').open=true;a.click('#pathReset');assert.equal(a.$('#engineDialog').open,true);assert.match(a.$('#dialogContent').textContent,/3 currently done/);
 a.click('#cancelReset');assert.equal(a.$('#engineDialog').open,false);assert.equal(a.api.notebook.completed.length,3);
 a.click('#discoverReset');a.click('#confirmReset');
 assert.equal(a.api.notebook.completed.length,0);assert.equal(a.api.notebook.seen.length,0);assert.equal(a.api.notebook.scenes.length,1);
 assert.equal(a.$('#pathCount').textContent,'0 / 7');assert.equal(a.$('#discoverReset'),null);assert.match(a.$('#firstDiscovery').textContent,/Start the learning path/);
 const stored=JSON.parse(a.saved.get('engine-lab-discoveries-v1'));assert.equal(stored.completed.length+stored.seen.length,0);assert.equal(stored.scenes.length,1);
 engine(a);assert.match(a.$('.guide-card').textContent,/0 \/ 5 met/);assert.equal(a.$('#pathReset'),null);
});
const settle=()=>new Promise(r=>setImmediate(r));
test('engine sound starts muted, explains when audio is unavailable, and follows the engine speed',async()=>{
 const none=app();engine(none);assert.equal(none.api.SOUND.on,false);assert.equal(none.$('#soundLabel').textContent,'Sound off');assert.equal(none.$('#soundToggle').getAttribute('aria-pressed'),'false');
 none.click('#soundToggle');await settle();assert.equal(none.api.SOUND.on,false);assert.match(none.$('#engineSceneStatus').textContent,/not available/);
 const a=app({audio:true});engine(a);assert.equal(a.api.SOUND.on,false,'muted on every load');assert.equal(a.api.S.rpm,15);assert.equal(a.$('#soundSyncNote').hidden,true);
 a.click('#soundToggle');await settle();assert.equal(a.api.SOUND.on,true);assert.equal(a.api.SOUND.ctx.state,'running');assert.equal(a.$('#soundLabel').textContent,'Sound on');assert.match(a.$('#engineSceneStatus').textContent,/each event plays/);
 assert.equal(a.api.SOUND.mode,'cycle','within the model range the sound follows the animation');
 const sent=[],send=a.api.SOUND.send;a.api.SOUND.send=m=>{sent.push(m);send(m);};const last=type=>sent.filter(m=>m.type===type).at(-1);
 a.input('#engineRpm',String(17));assert.equal(a.api.S.rpm,3000);assert.equal(a.api.SOUND.mode,'real');assert.equal(JSON.stringify(last('mode')),JSON.stringify({type:'mode',mode:'real',rpm:3000}));
 assert.equal(a.$('#engineRpmValue').textContent,'3,000 rpm');assert.equal(a.$('#soundSyncNote').hidden,false,'says the sound is not synced');assert.match(a.$('#soundSyncText').textContent,/Not synced.*3,000 rpm.*60 rpm/);
 assert.equal(last('gain').value,0,'a real-speed engine is silent while the model is paused');
 a.click('#playBtn');assert.ok(last('gain').value>0,'and runs while it plays');
 a.click('#soundSyncFix');assert.equal(a.api.S.rpm,60);assert.equal(a.api.SOUND.mode,'cycle');assert.equal(a.$('#soundSyncNote').hidden,true);
 a.input('#soundVolume','30');assert.equal(a.api.SOUND.volume,.3);assert.deepEqual(JSON.parse(a.saved.get('engine-lab-sound')),{volume:.3});
 a.click('#soundToggle');await settle();a.input('#engineRpm','20');assert.match(a.$('#soundSyncText').textContent,/shown at 60 rpm.*Turn on sound/,'the note also explains the capped model with sound off');a.click('#soundToggle');await settle();
 a.click('[data-tab="discover"]');assert.equal(a.api.SOUND.active,false,'fades out off the Engine page');a.click('[data-tab="engine"]');assert.equal(a.api.SOUND.active,true);
 key(a,'#gl','m');await settle();assert.equal(a.api.SOUND.on,false,'M switches sound off');key(a,'#gl','M');await settle();assert.equal(a.api.SOUND.on,true);
 const b=app({audio:true,sound:{mode:'real',rpm:5200,volume:.4}});engine(b);assert.equal(b.api.SOUND.on,false,'remembered settings never auto-play');assert.equal(b.api.S.rpm,15,'old sound prefs do not change the engine speed');assert.equal(b.$('#soundVolume').value,'40');
});

test('Atlas content: every photo is credited and on disk, every render exists, every dated claim has a source',()=>{
 const a=app(),{ATLAS,CREDITS}=a.api,licence=/^(CC0|Public domain|CC BY(-SA)? [0-9.]+)/;
 const used=new Set();
 for(const s of ATLAS){
  assert.ok(s.title&&s.dek&&s.body.length>=3&&s.quote,`${s.id}: story text`);
  assert.ok(s.timeline.length>=4,`${s.id}: timeline`);for(const t of s.timeline)assert.match(t.src,/^https:\/\/en\.wikipedia\.org\/wiki\//,`${s.id} ${t.year}: sourced`);
  for(const id of [s.photo,...s.legends.map(l=>l.photo)]){used.add(id);const c=CREDITS[id];assert.ok(c,`${id}: credited`);assert.match(c.license,licence,`${id}: free licence`);assert.ok(c.author&&c.source.startsWith('https://commons.wikimedia.org/'),`${id}: author and source`);assert.ok(fs.existsSync(`app/atlas/img/${id}.webp`),`${id}: image on disk`);}
  if(s.arch)for(const kind of ['hero','exploded'])for(const t of ['light','dark'])assert.ok(fs.existsSync(`app/atlas/render/${s.arch}-${kind}-${t}.webp`),`${s.arch} ${kind} ${t} render`);
 }
 assert.deepEqual([...ATLAS.filter(s=>s.arch).map(s=>s.arch)].join(),'single,i4,i6,v6,v8,flat6');
 for(const id of Object.keys(CREDITS))assert.ok(used.has(id),`${id}: credited photo is used`);
});
test('Atlas pages: cover, stories, facts from the engine data, navigation, links, credits and the ⓘ button',()=>{
 const a=app();a.click('[data-tab="atlas"]');
 assert.equal(a.document.querySelectorAll('#atlas .atlas-card').length,6);assert.ok(a.$('#atlas .atlas-lead'));
 a.click('[data-story="v8"]');assert.match(a.$('#storyTitle').textContent,/Two banks, one beat/);assert.equal(a.api.AT.story,'v8');
 assert.match(a.$('.glance').textContent,/1–8–4–3–6–5–7–2/,'firing order comes from the engine data');
 assert.equal(a.document.querySelectorAll('.story-timeline li').length,a.api.ATLAS.find(s=>s.id==='v8').timeline.length);
 assert.equal(a.document.querySelectorAll('.atlas-legend .photo-credit').length,a.document.querySelectorAll('.atlas-legend').length,'every legend photo is credited');
 assert.equal(a.document.querySelectorAll('.atlas-render .r-light').length,2);assert.equal(a.document.querySelectorAll('.atlas-render .r-dark').length,2);
 a.click('.atlas-next');assert.equal(a.api.AT.story,'flat6');a.click('[data-story=""]');assert.equal(a.api.AT.story,null);assert.ok(a.$('.atlas-mast'));
 a.click('[data-story="origins"]');assert.ok(a.$('.story-lead-photo'));assert.equal(a.$('[data-explore]'),null,'the opening story has no engine to explore');
 a.click('[data-story=""]');a.click('[data-story="credits"]');assert.equal(a.document.querySelectorAll('.credits tbody tr').length,Object.keys(a.api.CREDITS).length);
 a.click('[data-story=""]');a.click('[data-story="i6"]');a.click('[data-explore="i6"]');assert.equal(a.$('#engineView').hidden,false);assert.equal(a.api.S.arch,'i6');
 a.change('#sceneArchitecture','flat6');a.click('#sceneAbout');assert.equal(a.api.AT.story,'flat6');assert.match(a.$('#storyTitle').textContent,/Low, wide/);
 const b=app();b.context.location.hash='#atlas/v6';b.api.restoreHash();assert.equal(b.$('#atlas').hidden,false);assert.equal(b.api.AT.story,'v6');
});
test('Atlas Listen plays a layout at real speed without touching the Engine page sound, and stops on leaving',async()=>{
 const none=app();none.click('[data-tab="atlas"]');none.click('[data-story="i4"]');none.click('#atlasListen');await settle();assert.equal(none.$('#atlasListen').getAttribute('aria-pressed'),'false');assert.match(none.$('#atlasListenNote').textContent,/not available/);
 const a=app({audio:true});a.click('[data-tab="atlas"]');a.click('[data-story="v8"]');
 a.click('[data-listen-rpm="6000"]');a.click('#atlasListen');await settle();
 assert.equal(a.$('#atlasListen').getAttribute('aria-pressed'),'true');assert.deepEqual({...a.api.SOUND.preview},{arch:'v8',rpm:6000});assert.equal(a.api.SOUND.on,false,'Engine sound stays off');assert.match(a.$('#atlasListenNote').textContent,/cross-plane v8 at 6,000 rpm/);
 a.click('[data-tab="discover"]');assert.equal(a.api.SOUND.preview,null,'leaving the Atlas stops it');
});
