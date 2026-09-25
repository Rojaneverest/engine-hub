import { mod, pressure, intakeLift, exhaustLift, sweptFrac, dsdphi, deriveEngine, cylTorque, VT } from '../../src/core/sim';
import { PARTS_INFO } from '../../src/core/content';

export function observeCycle(arch, cylinder, theta) {
  const engine = deriveEngine(arch), cy = engine.cyls[cylinder] || engine.cyls[0];
  const angle = mod(theta - cy.off, 720);
  return { angle, cylinder: cy.n, cam: angle / 2, pressure: pressure(angle),
    intake: intakeLift(angle) * 12, exhaust: exhaustLift(angle) * 12,
    position: sweptFrac(angle) * 86, torque: cylTorque(cy, theta),
    leverage: -dsdphi(angle), interval: 720 / engine.N };
}
export const CYCLE = Array.from({length:721}, (_,angle) => observeCycle('single', 0, angle));
export const peakAt = key => CYCLE.reduce((best,p) => p[key] > best[key] ? p : best, CYCLE[0]).angle;
export const EVENTS = [
  {name:'Intake TDC', angle:0}, {name:'Intake closes', angle:VT.IVC},
  {name:'Spark', angle:VT.SPARK}, {name:'Firing TDC', angle:360},
  {name:'Peak pressure', angle:peakAt('pressure')}, {name:'Peak gas torque', angle:peakAt('torque')},
  {name:'Exhaust opens', angle:VT.EVO}, {name:'Exhaust TDC / overlap', angle:VT.IVO}
].sort((a,b)=>a.angle-b.angle);
export function nextEvent(angle, direction) {
  return direction > 0 ? EVENTS.find(e=>e.angle > angle+.5) || EVENTS[0]
    : [...EVENTS].reverse().find(e=>e.angle < angle-.5) || EVENTS.at(-1);
}
export function pistonMetrics(rpm, stroke) {
  const r=stroke/2000, rod=r*1.45/.43, omega=rpm*Math.PI/30;
  let peak=0;
  for(let a=0;a<360;a++) peak=Math.max(peak, Math.abs(dsdphi(a,r,rod))*omega);
  return {mean:2*stroke/1000*rpm/60, peak, load:(rpm/3000)**2};
}
export const LESSONS = [
// Ordered as a learning path: each investigation builds on the ones before it.
  {id:'strokes', number:'01', title:'Same place, different job', question:'Why does a cycle take two crank turns?',
    topic:'Four-stroke cycle', duration:'2 min', graph:'position', angle:90,
    prompt:'At 90° and 450° the piston is in the same position. What is different?', choices:['Nothing: the engine repeats every turn','The valves and gases are doing different jobs','The crank turns backwards'], correct:1,
    stops:[90,270,450,630], task:'Visit the middle of each stroke: 90°, 270°, 450° and 630°. The ringed timeline markers take you there.',
    explanation:'The mechanism repeats its position every 360°, but the working cycle takes 720°. At 90° the cylinder is taking in charge; at 450° expanding burned gas is delivering work.',
    extension:'Compare 270° with 630°: both move upward, but one compresses trapped charge and the other expels exhaust.'},
  {id:'cam', number:'02', title:'Half speed, perfect timing', question:'Why does the camshaft turn at half speed?',
    topic:'Valve train', duration:'2 min', graph:'valves', angle:0,
    prompt:'For two complete crankshaft turns, how many turns should the camshaft make?', choices:['One turn','Two turns','Four turns'], correct:0,
    stops:[0,360,719], task:'Visit 0°, 360° and 719°: click the ringed markers on the timeline, or scrub to them. Open “Explain this graph” to compare the crank and cam dials.',
    explanation:'The crank turns twice during the four-stroke cycle. The cam turns once, opening each valve once per cycle. At 719° the cam is just short of its full 360° turn.',
    extension:'Look near 0°: intake and exhaust lift briefly overlap. Real valves do not switch instantly at stroke boundaries.'},
  {id:'spark', number:'03', title:'A spark ahead of time', question:'Why fire before the piston reaches the top?',
    topic:'Combustion', duration:'2 min', graph:'pressure', angle:320,
    prompt:'When should the spark fire so pressure can build during the useful part of the stroke?',
    choices:['A little before top dead centre','Exactly at top dead centre','Halfway down the power stroke'], correct:0,
    stops:[VT.SPARK,peakAt('pressure')], task:'Visit Spark and Peak pressure using the ringed timeline markers. Watch how far the crank turns between them.',
    explanation:`The spark starts a burn that takes time. In this illustrative model it fires at ${VT.SPARK}°, and pressure peaks at ${peakAt('pressure')}°, after firing TDC at 360°. Timing varies with engine and operating conditions.`,
    extension:'Try stepping back to 335°. Both valves are closed, but combustion has not started yet.'},
  {id:'torque', number:'04', title:'Find the strongest twist', question:'Does the biggest push make the biggest twist?',
    topic:'Force & motion', duration:'3 min', graph:'torque', angle:360,
    prompt:'Where would you expect the largest gas torque?', choices:['At top dead centre','At peak pressure','After peak pressure, with more leverage'], correct:2,
    stops:[360,peakAt('pressure'),peakAt('torque')], task:'Visit Firing TDC, Peak pressure and Peak gas torque using the ringed timeline markers. Compare the force diagram and traces.',
    explanation:`At dead centre the crank has no instantaneous leverage. Pressure peaks at ${peakAt('pressure')}°, but gas torque peaks at ${peakAt('torque')}° in this model. Torque depends on both gas force and geometry. The traces have separate scales; their heights cannot be compared directly.`,
    extension:'Scrub into compression: the negative gas torque takes energy back from the crank.'},
  {id:'rhythm', number:'05', title:'A rhythm of power', question:'What changes when more cylinders share the work?',
    topic:'Engine character', duration:'3 min', graph:'rhythm', angle:380,
    prompt:'An evenly firing inline-six has one firing event every…', choices:['90°','120°','180°'], correct:1,
    stops:[], task:'Compare Inline-4 and Inline-6 using the engine picker above the model. Watch the firing intervals and combined torque trace.',
    explanation:'A four-stroke cycle spans 720°. Dividing by four gives 180° between evenly spaced firings; dividing by six gives 120°. More frequent pushes change torque delivery. This graph shows gas torque only, not inertial balance or realistic sound.',
    extension:'Open the architecture comparison later to explore packaging. A smooth torque trace and a balanced engine describe different things.'},
  {id:'rpm', number:'06', title:'Double the revs', question:'How much harder does the piston have to work?',
    topic:'Speed & loads', duration:'2 min', graph:'position', angle:90,
    prompt:'With the same stroke and moving mass, doubling RPM does what to inertial load?', choices:['Doubles it','Quadruples it','Leaves it unchanged'], correct:1,
    stops:[], task:'Move the experiment RPM to 6,000. Compare against the fixed 3,000 RPM baseline.',
    explanation:'At unchanged geometry and mass, speed doubles but acceleration and inertial force scale with RPM squared. From 3,000 to 6,000 RPM the inertial load becomes 4×. The engine animation stays slowed for inspection.',
    extension:'Try a longer stroke at the same RPM. Mean and peak piston speed increase. These sliders describe a separate experiment; they do not resize the 3D engine.'}
];
export const GLOSSARY = [
  ['TDC / BDC','Top / bottom dead centre: the ends of piston travel, where it reverses direction.'],
  ['Torque','A turning effect: force acting through a perpendicular lever arm.'],
  ['Power','The rate of doing work. For a rotating shaft, power is torque multiplied by angular speed.'],
  ['Displacement','The volume swept by all pistons, excluding the space left above them at TDC.'],
  ['Compression ratio','The cylinder volume at BDC divided by its volume at TDC.'],
  ['Valve overlap','The interval when intake and exhaust valves are both open around exhaust TDC.'],
  ['Load','The demand placed on the engine. Engine speed alone does not specify load.'],
  ['Gas torque','Torque due to cylinder gas pressure acting through the piston, rod and crank. It excludes inertia and friction here.'],
  ['Knock','Abnormal autoignition of unburned mixture, causing rapid pressure oscillations; not the same as normal spark-initiated combustion.'],
  ['Volumetric efficiency','A measure of how effectively an engine fills its cylinders relative to a reference air density and swept volume.']
];
export function validScene(value) {
  if(!value || value.v!==1 || !['single','i4','i6','v6','v8','flat6'].includes(value.arch)) return null;
  const n=deriveEngine(value.arch).N;
  const extras={};
  if(value.engine && typeof value.engine==='object'){
    const e=value.engine,range=(v,lo,hi,fallback)=>Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):fallback;
    extras.engine={mode:['inspect','systems','measure'].includes(e.mode)?e.mode:'inspect',
      cut:range(e.cut,0,1,1),separation:range(e.separation,0,1,1),exploded:e.exploded===true,
      flow:['off','air','fuel','exhaust','oil','power'].includes(e.flow)?e.flow:'off',
      part:Object.hasOwn(PARTS_INFO,e.part)?e.part:null,
      instance:Number.isInteger(e.instance)&&e.instance>=0&&e.instance<n?e.instance:null,
      hidden:Array.isArray(e.hidden)?e.hidden.filter(k=>Object.hasOwn(PARTS_INFO,k)).slice(0,27):[],
      isolate:e.isolate===true};
    const c=e.camera;
    if(c && Array.isArray(c.target)&&c.target.length===3&&c.target.every(v=>Number.isFinite(v)&&Math.abs(v)<=100))
      extras.engine.camera={az:range(c.az,-1e6,1e6,Math.PI*.75),pol:range(c.pol,.05,Math.PI-.05,1.1),rad:range(c.rad,2,60,9),target:c.target};
  }
  return {v:1, arch:value.arch, angle:Number.isFinite(value.angle)?mod(value.angle,720):0,
    cylinder:Number.isInteger(value.cylinder)&&value.cylinder>=0&&value.cylinder<n?value.cylinder:0,
    view:['full','cutaway','xray'].includes(value.view)?value.view:'cutaway',
    lesson:LESSONS.some(l=>l.id===value.lesson)?value.lesson:null,
    graph:['pressure','torque','valves','position','rhythm'].includes(value.graph)?value.graph:'pressure',...extras};
}
/** The learning path: a short hands-on introduction, then the investigations in teaching order. */
export const MEET_PARTS = ['piston','rod','crank','intakevalve','camshaft'];
export const PATH = [{id:'meet', title:'Meet the engine', question:'What are the main moving parts, and what does each one do?', topic:'Getting started', duration:'3 min'}, ...LESSONS];
