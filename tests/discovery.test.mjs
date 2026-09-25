import test from 'node:test';
import assert from 'node:assert/strict';
import { observeCycle, CYCLE, EVENTS, nextEvent, pistonMetrics, validScene, LESSONS } from '../app/discovery/model.js';
import { deriveEngine, VT } from '../src/core/sim.ts';

test('observations follow cylinder-local angle across layouts and cycle boundaries',()=>{
  for(const arch of ['single','i4','i6','v6','v8','flat6']){
    const e=deriveEngine(arch);
    e.cyls.forEach((c,i)=>{
      for(const angle of [0,90,220,345,379,540,719]){
        const actual=observeCycle(arch,i,c.off+angle+1440),reference=observeCycle('single',0,angle);
        for(const field of ['angle','pressure','intake','exhaust','position','torque','cam'])assert.ok(Math.abs(actual[field]-reference[field])<1e-8,`${arch}/${i}/${angle}/${field}`);
      }
    });
  }
  assert.equal(observeCycle('single',0,-1).angle,719);
});
test('event navigation wraps and computed peaks agree with sampled model',()=>{
  assert.equal(nextEvent(719,1).angle,0);
  assert.equal(nextEvent(0,-1).angle,708);
  assert.equal(nextEvent(VT.SPARK,1).angle,360);
  for(const [name,key] of [['Peak pressure','pressure'],['Peak gas torque','torque']]){
    const e=EVENTS.find(e=>e.name===name);
    assert.equal(CYCLE[e.angle][key],Math.max(...CYCLE.map(p=>p[key])));
  }
  assert.ok(EVENTS.find(e=>e.name==='Peak gas torque').angle>EVENTS.find(e=>e.name==='Peak pressure').angle);
});
test('RPM doubles speed and quadruples inertial load, including values beyond old chart limit',()=>{
  const a=pistonMetrics(3000,86),b=pistonMetrics(6000,86);
  assert.equal(b.mean,2*a.mean);assert.equal(b.peak,2*a.peak);assert.equal(b.load,4*a.load);
  assert.ok(pistonMetrics(9500,110).peak>57);
});
test('untrusted saved scenes are validated and bounded',()=>{
  assert.equal(validScene(null),null);assert.equal(validScene({v:2,arch:'single'}),null);
  assert.equal(validScene({v:1,arch:'constructor'}),null);
  const result=validScene({v:1,arch:'i4',angle:-1,cylinder:8,view:'fake',graph:'script',lesson:'unknown'});
  assert.deepEqual(result,{v:1,arch:'i4',angle:719,cylinder:0,view:'cutaway',graph:'pressure',lesson:null});
  assert.equal(validScene({v:1,arch:'single',angle:Infinity}).angle,0);
});
test('lesson checkpoints and answer keys are well-formed',()=>{
  assert.equal(new Set(LESSONS.map(l=>l.id)).size,6);
  for(const lesson of LESSONS){
    assert.ok(lesson.correct>=0&&lesson.correct<lesson.choices.length);
    assert.ok(lesson.stops.every(a=>a>=0&&a<720));
    assert.ok(validScene({v:1,arch:'single',lesson:lesson.id,graph:lesson.graph}));
  }
});

test('scene links reject unsafe engine options and clamp camera/section settings',()=>{
  const result=validScene({v:1,arch:'i4',engine:{cut:90,separation:-1,mode:'bad',part:'__proto__',instance:99,hidden:['piston','bad'],camera:{az:Infinity,pol:-1,rad:999,target:[1,2,3]}}});
  assert.equal(result.engine.cut,1);assert.equal(result.engine.separation,0);assert.equal(result.engine.part,null);assert.equal(result.engine.instance,null);
  assert.deepEqual(result.engine.hidden,['piston']);assert.equal(result.engine.camera.rad,60);assert.equal(result.engine.camera.pol,.05);
});
