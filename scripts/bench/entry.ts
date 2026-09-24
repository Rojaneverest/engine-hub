import * as THREE from 'three';
import { createEngine } from '../../src/engine3d/engine';
const W=1920,H=1080; const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); r.setSize(W,H);
r.outputEncoding=THREE.sRGBEncoding; r.toneMapping=THREE.ACESFilmicToneMapping; r.localClippingEnabled=true;
const SH=(window as any).SHADOW; if(SH){ r.shadowMap.enabled=true; r.shadowMap.type=THREE.PCFSoftShadowMap; }
document.body.appendChild(r.domElement);
const s=new THREE.Scene(); s.background=new THREE.Color(0x101318);
const cam=new THREE.PerspectiveCamera(30,W/H,.2,100); cam.position.set(7,4,-8); cam.lookAt(0,1.5,0);
s.add(new THREE.HemisphereLight(0xdfe8f2,0x2a2622,.5)); const k=new THREE.DirectionalLight(0xffffff,1.6); k.position.set(6,10,-7); if(SH){k.castShadow=true; k.shadow.mapSize.set(2048,2048); const c=k.shadow.camera as any; c.left=-6;c.right=6;c.top=6;c.bottom=-6;c.far=40;} s.add(k);
const cols={air:'#5ec3f5',fuel:'#f0c94a',comp:'#9d8dff',power:'#ff6b3b',exhaust:'#aba297',oil:'#d08a3c',brass:'#d8b56e',section:'#9b4a3e'};
const E=createEngine('i4',{colors:cols as any,shadows:!!SH}); s.add(E.root);
const fl=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.ShadowMaterial({opacity:.4})); fl.rotation.x=-Math.PI/2; fl.position.y=-1.5; fl.receiveShadow=true; s.add(fl);
(window as any).go=(n:number)=>{ const t=performance.now(); for(let i=0;i<n;i++){ E.update({theta:i*7,cut:1}); r.render(s,cam); r.getContext().finish(); } return (performance.now()-t)/n; };
