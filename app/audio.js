/* =====================================================================
   ENGINE SOUND
   One synthesizer (app/audio/synth.js) driven by the engine model's own timing.
   The mode follows the engine speed (S.rpm):
   cycle: up to MODEL_MAX_RPM, follows the animation's crank angle, so every event is heard when it is seen.
   real:  above it, the same engine and firing order at that rpm while the model plays; the animation holds MODEL_MAX_RPM.
   Off on every load (browsers also require a click before playing sound). Volume is remembered in this browser.
   ===================================================================== */
import { EngineSynth } from '../audio/synth.js';
import { SOUND_TUNE, soundConfig } from '../audio/tune.js';
const SOUND_KEY='engine-lab-sound';
const SOUND={on:false,mode:'cycle',rpm:0,volume:.7,ctx:null,send:null,level:0,active:true,starting:null,suspendTimer:0,tune:null,lastTheta:null,lastResume:-1e9,preview:null};
try{ const p=JSON.parse(localStorage.getItem(SOUND_KEY)||'null');
  if(p&&typeof p==='object'&&Number.isFinite(p.volume))SOUND.volume=clamp(p.volume,0,1); }catch(e){}
function saveSoundPrefs(){ try{ localStorage.setItem(SOUND_KEY,JSON.stringify({volume:SOUND.volume})); }catch(e){} }
const WORKLET_SRC=`const EngineSynth=(${EngineSynth.toString()});
class EngineSynthProcessor extends AudioWorkletProcessor{constructor(){super();this.s=new EngineSynth(sampleRate);this.k=0;this.port.onmessage=e=>this.s.message(e.data);}
process(inputs,outputs){const o=outputs[0],L=o[0],R=o[1]||o[0];this.s.process(L,R,L.length);if(++this.k%24===0)this.port.postMessage(this.s.level);return true;}}
registerProcessor('engine-synth',EngineSynthProcessor);`;

/** Create the audio graph on first use. Prefers an AudioWorklet (audio thread); falls back to a ScriptProcessor. */
async function soundStart(){
  if(SOUND.ctx)return true;
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
  const ctx=new AC();let node;
  try{
    if(!ctx.audioWorklet||typeof AudioWorkletNode==='undefined')throw Error('no worklet');
    const url=URL.createObjectURL(new Blob([WORKLET_SRC],{type:'application/javascript'}));
    await ctx.audioWorklet.addModule(url);URL.revokeObjectURL(url);
    node=new AudioWorkletNode(ctx,'engine-synth',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
    node.port.onmessage=e=>{SOUND.level=+e.data||0;};SOUND.send=m=>node.port.postMessage(m);
  }catch(err){
    const synth=new EngineSynth(ctx.sampleRate);node=ctx.createScriptProcessor(1024,0,2);
    node.onaudioprocess=e=>{synth.process(e.outputBuffer.getChannelData(0),e.outputBuffer.getChannelData(1),e.outputBuffer.length);SOUND.level=synth.level;};
    SOUND.send=m=>synth.message(m);
  }
  node.connect(ctx.destination);SOUND.ctx=ctx;soundConfigure();soundSendMode(true);return true;
}
function soundConfigure(){ if(!SOUND.send||!EN||SOUND.preview)return; const c=soundConfig(EN.e,VT); if(SOUND.tune)c.tune=Object.assign({},c.tune,SOUND.tune); SOUND.send(c); }
/** Derive the sound mode from the engine speed; tell the synthesizer only when it changes. */
function soundSendMode(force){
  if(SOUND.preview)return;
  const mode=realSpeed()?'real':'cycle',rpm=S.rpm;if(!force&&mode===SOUND.mode&&rpm===SOUND.rpm)return;
  SOUND.mode=mode;SOUND.rpm=rpm;if(SOUND.send)SOUND.send({type:'mode',mode,rpm});soundGain();
}
/** A real-speed engine only runs while the model plays; in cycle mode a paused model is already silent, but scrubbing plays. */
function soundGain(){ if(SOUND.send&&!SOUND.preview)SOUND.send({type:'gain',value:SOUND.on&&SOUND.active&&(SOUND.mode==='cycle'||S.playing)?SOUND.volume:0}); }
/** Atlas "Listen": play one layout at real speed on its own, leaving the Engine page's sound settings untouched. */
async function soundPreview(arch,rpm){
  SOUND.starting=soundStart();const ok=await SOUND.starting;SOUND.starting=null;if(!ok)return false;
  if(typeof clearTimeout==='function')clearTimeout(SOUND.suspendTimer);try{await SOUND.ctx.resume();}catch(e){}
  SOUND.preview={arch,rpm};SOUND.send(soundConfig(deriveEngine(arch),VT));SOUND.send({type:'mode',mode:'real',rpm});SOUND.send({type:'gain',value:SOUND.volume||.7});
  return true;
}
function soundPreviewStop(){
  if(!SOUND.preview)return;SOUND.preview=null;soundConfigure();soundSendMode(true);soundGain();
  if(!SOUND.on&&SOUND.ctx&&typeof setTimeout==='function'){clearTimeout(SOUND.suspendTimer);SOUND.suspendTimer=setTimeout(()=>{if(!SOUND.on&&!SOUND.preview)SOUND.ctx.suspend().catch(()=>{});},400);}
}
async function setSound(on){
  if(on===SOUND.on&&!SOUND.starting)return;
  if(on){
    SOUND.starting=soundStart();const ok=await SOUND.starting;SOUND.starting=null;
    if(!ok){notifyEngine('Sound is not available in this browser.');syncSound();return;}
    if(typeof clearTimeout==='function')clearTimeout(SOUND.suspendTimer);try{await SOUND.ctx.resume();}catch(e){}
    SOUND.on=true;soundFrame();
    notifyEngine(SOUND.mode==='cycle'?'Sound on: each event plays as the animation reaches it.':`Sound on: a real engine at ${S.rpm.toLocaleString('en-US')} rpm while the model plays, not synced to it.`);
  }else{
    SOUND.on=false;
    if(SOUND.ctx&&typeof setTimeout==='function'){clearTimeout(SOUND.suspendTimer);SOUND.suspendTimer=setTimeout(()=>{if(!SOUND.on)SOUND.ctx.suspend().catch(()=>{});},400);}
  }
  soundGain();syncSound();
}
function setSoundVolume(v){ SOUND.volume=clamp(v,0,1);saveSoundPrefs();soundGain();syncSound(); }
/** Sound follows the Engine page: it fades out on other tabs and when the window is hidden. */
function setSoundActive(active){ if(SOUND.active===active)return; SOUND.active=active;soundGain(); }
/** Called every animation frame while the Engine page is visible: hands the synthesizer the crank angle and speed. */
function soundFrame(){
  if(!SOUND.on||!SOUND.send)return;
  // If the browser has suspended the audio context (for example after a stretch of silence, or when the output
  // device changes), wake it when there is something to hear: playing or scrubbing. At most once a second.
  const moving=S.playing||S.theta!==SOUND.lastTheta,now=performance.now();SOUND.lastTheta=S.theta;
  if(SOUND.ctx&&SOUND.ctx.state==='suspended'&&SOUND.active&&moving&&now-SOUND.lastResume>1000){
    SOUND.lastResume=now;SOUND.ctx.resume().catch(()=>{});}
  SOUND.send({type:'state',theta:S.theta,rate:S.playing?modelDps():0});
  const m=$('#soundMeter');if(m)m.style.transform=`scaleX(${Math.min(1,Math.sqrt(SOUND.level)*6).toFixed(3)})`;
}
function syncSound(){
  soundSendMode();
  const b=$('#soundToggle');b.setAttribute('aria-pressed',SOUND.on);$('#soundLabel').textContent=SOUND.on?'Sound on':'Sound off';
  b.title=SOUND.on?'Turn engine sound off (M)':'Turn engine sound on (M)';
  $('#soundVolume').value=Math.round(SOUND.volume*100);
  // Above the model's range the animation and the sound run at different speeds: say so wherever the speed is set.
  const rpm=S.rpm.toLocaleString('en-US');$('#soundSyncNote').hidden=!realSpeed();
  $('#soundSyncText').textContent=SOUND.on
    ?`Not synced: you hear a real engine at ${rpm} rpm, but the model is slowed to ${MODEL_MAX_RPM} rpm so you can follow it.`
    :`The model can’t turn at ${rpm} rpm without flickering, so it’s shown at ${MODEL_MAX_RPM} rpm. Turn on sound to hear ${rpm} rpm (not synced to the model).`;
}
$('#soundToggle').onclick=()=>setSound(!SOUND.on);
$('#soundSyncFix').onclick=()=>setRpm(MODEL_MAX_RPM);
$('#soundVolume').oninput=e=>setSoundVolume(+e.target.value/100);
try{ document.addEventListener('visibilitychange',()=>setSoundActive(!document.hidden&&!engineRoot.hidden)); }catch(e){}
syncSound();
/* Hidden tuning panel (open the app with ?tune): adjust the current layout live and copy the values into app/audio/tune.js. */
if(String(location.search||'').includes('tune')){
  const F=[['pipeScale','Pipe length ×',.5,2,.05],['refl','Pipe reflection',-.95,-.3,.01],['body','Body thump (Hz)',40,160,1],['tone','Tone cutoff (Hz)',1200,6000,50],['exhaust','Exhaust level',0,3,.05],['fire','Combustion level',0,3,.05],['intake','Intake level',0,3,.05]];
  const box=document.createElement('div');box.className='sound-tune';box.innerHTML='<h3>Tuning · <span id="tuneArch"></span></h3>'+F.map(([k,l,a,b,st])=>`<label>${l} <output id="tuneV-${k}"></output><input type="range" data-tune="${k}" min="${a}" max="${b}" step="${st}"></label>`).join('')+'<div class="dialog-actions"><button class="btn sm ghost" id="tuneReset">Reset</button><button class="btn sm" id="tuneCopy">Copy values</button></div>';
  $('#soundMenu .popover-body').appendChild(box);
  const base=()=>SOUND_TUNE[S.arch],cur=()=>Object.assign({},base(),SOUND.tune||{});
  const fill=()=>{const t=cur();$('#tuneArch').textContent=S.arch;for(const [k] of F){const v=k==='pipeScale'?(SOUND.tune?.pipeScale??1):t[k]??0;box.querySelector(`[data-tune="${k}"]`).value=v;$('#tuneV-'+k).textContent=(+v).toFixed(2);}};
  box.querySelectorAll('[data-tune]').forEach(el=>el.oninput=()=>{const k=el.dataset.tune,v=+el.value;SOUND.tune=Object.assign({},SOUND.tune||{},{[k]:v});
    if(k==='pipeScale')SOUND.tune.pipes=base().pipes.map(p=>+(p*v).toFixed(3));soundConfigure();fill();});
  $('#tuneCopy').onclick=()=>{const t=cur();delete t.pipeScale;const txt=`${S.arch}: ${JSON.stringify(t)}`;try{navigator.clipboard.writeText(txt);}catch(e){}notifyEngine('Copied tuning for '+S.arch+'.');console.log(txt);};
  $('#tuneReset').onclick=()=>{SOUND.tune=null;soundConfigure();fill();};
  $('#soundMenu').addEventListener('toggle',fill);
}
