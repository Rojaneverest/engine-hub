/* Interactive app — built from the shared core (src/core) and engine (src/engine3d). */
import * as THREE from 'three';
import { DEG, mod, clamp, lerp, smooth, G, pistonS, dsdphi, sweptFrac, intakeLift, exhaustLift, IC, EC, pressure, burnFrac, phaseOf,
  deriveEngine, cylTorque, gasTorque, VT, PHASES } from '../../src/core/sim';
import { PARTS_INFO, ARCHS, ARCH_ORDER } from '../../src/core/content';
import { createEngine, relatedSet } from '../../src/engine3d/engine';
const S = { arch:'single', theta:0, playing:false, speed:.5, view:'full', explode:false, explodeT:0, flow:'off',
  sel:null, hover:null, isolate:false, hidden:new Set(), focusCyl:0, follow:false, level:'simple', hintDone:false };
let renderer, scene, camera, EN=null, env=null;
const V3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z), TMPV=new THREE.Vector3(), TMPV2=new THREE.Vector3();
const lin=hex=>new THREE.Color(hex).convertSRGBToLinear();
function cssVar(n){ try{ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }catch(err){ return ''; } }
function readColors(){ const o={}; for(const k of ['air','fuel','comp','power','exhaust','oil','brass','section']) o[k]=cssVar('--'+k)||'#888'; return o; }
let DOTTEX;
function dotTexture(){ if(DOTTEX!==undefined) return DOTTEX; try{ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); if(!x) return DOTTEX=null;
  const g=x.createRadialGradient(32,32,0,32,32,32); g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.4,'rgba(255,255,255,.7)'); g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g; x.fillRect(0,0,64,64); return DOTTEX=new THREE.CanvasTexture(c); }catch(err){ return DOTTEX=null; } }
function applyVisual(){}   // appearance is derived from S on every frame by EN.update()
function engineState(t){ return {theta:S.theta, explode:smooth(S.explodeT), view:S.view, flow:S.flow, sel:S.sel, hover:S.hover, isolate:S.isolate, hidden:S.hidden, pulse:Math.sin(t*3)}; }
