/* =====================================================================
   PILOT STORYBOARD — cold open → the basic job → inside the engine →
   straight line into rotation → start of the four-stroke cycle.

   Edit this file to re-time, re-frame or re-cast shots:
   • durations follow the narration (plus lead/tail/minDur);
   • every visual event is keyed to a narration cue ('CUE+0.5');
   • crank-angle keys land mechanical events on cues (cycle 360 = firing TDC);
   • camera: az (0 = rear, 90 = exhaust side, 180 = front), pol (90 = level), rad, target, mm (35 mm-equiv. lens),
     dof (depth-of-field strength, px of blur at infinity; 0 = deep focus), focus (anchor / point kept sharp).
     Keys are joined by one continuous monotone spline across the whole film (no hard cuts, no stop-start),
     and a slow orbital micro-drift runs on top of every frame.
   • look: lighting / post cues per shot — key / fill / rim multipliers on the camera-relative three-point rig,
     bloom strength (heat & energy glows), AO strength.
   Lens language: 50–56 mm hero & establishing · 45 mm balanced wides for exploded views ·
   65 mm "diagram" telephoto for the sectioned mechanism (flat, near-orthographic) · 85 mm macro for key interactions.
   Engine coordinates for the inline-4: cylinder 1 sits at world z = −1.5.
   ===================================================================== */
import { Shot, ramp, pulse } from './timeline';
import { PALETTE } from './theme';

const C1 = -1.5;                      // world z of cylinder 1 (inline-4)
const SLICE_Z = -0.1;                 // section plane just in front of cylinder 1's rod (engine z)
const EXP = .8;                       // exploded-view scale for the film (80% of the app's spacing)
const up = (cue: string, off: number, dur = 1.5) => ramp(cue, off, dur, 0, EXP);
const down = (cue: string, off: number, dur = 1.25) => ramp(cue, off, dur, EXP, 0);

export const PILOT: Shot[] = [
  /* ------------------------------------------------------------------ 0 · COLD OPEN */
  { id: 'cold-open', scene: 'Cold open', arch: 'i4', lead: 1.8, tail: 4.4, dps: 60, startTheta: 40,
    lines: [
      { id: 'a1', text: 'Inside this block of metal, fuel is burning, in a steady rhythm of small, controlled bursts.', pause: .6 },
      { id: 'a2', text: 'So how does fire, trapped inside a cylinder, become smooth and useful rotation?', cueEnd: 'TITLE', pause: 0 },
    ],
    exposure: [{ t: 0, v: .12 }, { t: 3.6, v: 1, ease: 'out' }, { t: 'TITLE', v: 1 }, { t: 'TITLE+1.2', v: .5 }],
    /* Low hero three-quarter from the front, 56 mm, slow push-in and orbit while the engine runs.
       Light: starts as a rim-only silhouette (edges only), key fades up as the exposure opens,
       key dips under the title so the type reads; shallow focus keeps the block crisp against a soft rear. */
    camera: [
      { t: 0, az: 166, pol: 84, rad: 15.5, target: [0, 1.5, -.6], mm: 56, dof: 3 },
      { t: 'TITLE-1', az: 146, pol: 78, rad: 11.6, target: [0, 1.5, -.35], mm: 52, dof: 2.5 },
      { t: 'end', az: 134, pol: 74, rad: 10.2, target: [0, 1.5, -.2], mm: 50, dof: 2 },
    ],
    look: { key: [{ t: 0, v: .25 }, { t: 4.5, v: 1 }, { t: 'TITLE', v: 1 }, { t: 'TITLE+1.2', v: .75 }],
      rim: [{ t: 0, v: 1.5 }, { t: 5, v: 1.2 }], fill: [{ t: 0, v: .4 }, { t: 5, v: 1 }], bloom: .55 },
    overlays: [{ type: 'title', from: 'TITLE+0.25', to: 'end-0.2', fade: .7, kicker: 'Engine Lab', title: 'How an engine turns fire into motion' }],
    audio: { ambience: [{ t: 0, v: 1 }, { t: 'end', v: .8 }], mech: true } },

  /* ------------------------------------------------------------------ 1 · THE BASIC JOB */
  { id: 'the-job', scene: 'The basic job', arch: 'i4', lead: .5, tail: 1.3, dps: 90,
    lines: [
      { id: 'b1', cue: 'CUT', text: 'Every piston engine does the same basic job.', pause: .5 },
      { id: 'b2', cue: 'C1', text: 'Burning gas pushes a piston.' },
      { id: 'b3', cue: 'C2', text: 'The piston turns a crankshaft.' },
      { id: 'b4', cue: 'C3', text: 'And the crankshaft, through the gearbox, turns the wheels.' },
    ],
    engine: {
      cut: [{ t: 'CUT-0.2', v: 0 }, { t: 'CUT+2.8', v: 1, ease: 'inOut' }],
      fade: { exhaust: ramp('CUT', -.2, 1.8, 1, .1) },
      glow: [
        { part: 'piston', color: PALETTE.flow.power, amount: pulse('C1', .1, 1.2, .3) },
        { part: 'crank', color: PALETTE.flow.power, amount: pulse('C2', .1, 1.2, .35) },
        { part: 'flywheel', color: PALETTE.flow.power, amount: pulse('C3', .5, 1.4, .5) },
      ],
    },
    /* Continues the orbit round to the exhaust side as the cutaway sweeps open (50 → 45 mm).
       Focus racks down the power path with the narration: piston (C1) → crank (C2) → flywheel (C3).
       Light: key back to full; bloom lifts with the orange power glow on each part. */
    camera: [
      { t: 0, az: 134, pol: 74, rad: 10.2, target: [0, 1.5, -.2], mm: 50, dof: 2 },
      { t: 'CUT+3.2', az: 112, pol: 72, rad: 9.4, target: [0, 1.35, 0], mm: 45, dof: 3, focus: 'piston:0' },
      { t: 'C2+0.4', az: 107, pol: 71, rad: 9.4, target: [0, 1.15, .2], mm: 45, dof: 3, focus: 'crank' },
      { t: 'end', az: 104, pol: 70, rad: 9.8, target: [0, 1.3, 0], mm: 45, dof: 2.5, focus: 'flywheel' },
    ],
    look: { key: [{ t: 0, v: .75 }, { t: 'CUT+1', v: 1 }], rim: 1.2, bloom: [{ t: 'C1', v: .55 }, { t: 'C1+0.8', v: .8 }, { t: 'C3+2.4', v: .8 }, { t: 'end', v: .5 }] },
    overlays: [
      { type: 'chapter', num: 1, title: 'The basic job', from: .3, to: 'C1' },
      { type: 'chain', from: 'C1-0.2', to: 'end-0.1', items: [
        { text: 'Burning gas', at: 'C1', color: PALETTE.flow.power }, { text: 'Piston', at: 'C1+0.9' },
        { text: 'Crankshaft', at: 'C2+0.8' }, { text: 'Wheels', at: 'C3+1.5' }] },
    ],
    audio: { ambience: .7, mech: true } },

  /* ------------------------------------------------------------------ 2 · INSIDE THE ENGINE */
  { id: 'apart', scene: 'Inside the engine', arch: 'i4', lead: .2, tail: 1.9, dps: 40,
    lines: [
      { id: 'c1', cue: 'EXPLODE', text: "To see how it does that, let's take one apart.", pause: .9 },
      { id: 'c2', cue: 'L_CAMS', text: 'At the top, the camshafts and valves control how the engine breathes.', pause: .6 },
      { id: 'c3', cue: 'L_HEAD', text: 'The cylinder head seals the top of every cylinder.', pause: .7 },
      { id: 'c4', cue: 'L_PIST', text: 'And below it sits the moving heart of the engine: four pistons, their connecting rods, and the crankshaft they all turn.' },
    ],
    engine: {
      cut: [{ t: 0, v: 1 }, { t: 'EXPLODE+0.6', v: 0 }],
      fade: { exhaust: [{ t: 0, v: .1 }, { t: 'EXPLODE+0.6', v: 1 }] },
      explode: {
        cover: up('EXPLODE', 1.1), intake: up('EXPLODE', 1.4), tm: up('EXPLODE', 1.7),
        cams: up('L_CAMS', -.3), valves: up('L_CAMS', .9),
        exh: up('L_HEAD', -.3), head: up('L_HEAD', 0), gasket: up('L_HEAD', .5),
        pist: up('L_PIST', 0, 1.7), crank: up('L_PIST', 2.0), mb: up('L_PIST', 2.2), fw: up('L_PIST', 2.4), pan: up('L_PIST', 2.7), op: up('L_PIST', 2.8),
      },
    },
    /* Exploded view: balanced 45 mm wide that cranes up with each layer as it lifts off, then settles
       back into a symmetrical overview of the whole stack. Deep focus (every part is being named).
       Light: rim pushed so each floating layer is outlined against the slate; AO grounds the stack. */
    camera: [
      { t: 0, az: 104, pol: 70, rad: 9.8, target: [0, 1.3, 0], mm: 45, dof: 2.5, focus: 'flywheel' },
      { t: 'EXPLODE+1.2', az: 108, pol: 71, rad: 10.2, target: [0, 3.4, 0], mm: 45, dof: .5 },
      { t: 'L_CAMS+0.6', az: 116, pol: 73, rad: 14, target: [0, 5.4, 0], mm: 45, dof: 0 },
      { t: 'L_HEAD+1.2', az: 121, pol: 72, rad: 16, target: [0, 4.3, 0], mm: 45, dof: 0 },
      { t: 'L_PIST+2', az: 127, pol: 72, rad: 21.5, target: [0, 3.3, 0], mm: 45, dof: 0 },
      { t: 'end', az: 132, pol: 71, rad: 23.5, target: [0, 2.7, 0], mm: 45, dof: 0 },
    ],
    look: { key: 1, rim: [{ t: 0, v: 1.2 }, { t: 'EXPLODE+1.5', v: 1.45 }], bloom: .5 },
    overlays: [
      { type: 'chapter', num: 2, title: 'Inside the engine', from: 'EXPLODE+0.4', to: 'L_HEAD' },
      { type: 'label', text: 'Camshafts', anchor: 'cams', from: 'L_CAMS+1.1', to: 'end-0.3' },
      { type: 'label', text: 'Valves', anchor: 'valves', from: 'L_CAMS+2.3', to: 'end-0.3' },
      { type: 'label', text: 'Cylinder head', anchor: 'head', from: 'L_HEAD+1.2', to: 'end-0.3' },
      { type: 'label', text: 'Pistons and connecting rods', anchor: 'pistons', from: 'L_PIST+1.5', to: 'end-0.3' },
      { type: 'label', text: 'Crankshaft', anchor: 'crank', from: 'L_PIST+3.4', to: 'end-0.3' },
    ],
    audio: { ambience: .45, mech: true } },

  /* ------------------------------------------------------------------ 3 · STRAIGHT LINE INTO ROTATION (setup) */
  { id: 'mechanism', scene: 'Straight line into rotation', arch: 'i4', lead: .3, tail: 1, minDur: 8.2, dps: 60,
    lines: [{ id: 'd1', cue: 'ASSEMBLE', text: 'Everything else exists to support one remarkably simple mechanism.', pause: 0 }],
    engine: {
      explode: {
        pan: down('ASSEMBLE', .2), op: down('ASSEMBLE', .25), fw: down('ASSEMBLE', .35), mb: down('ASSEMBLE', .45), crank: down('ASSEMBLE', .5),
        pist: down('ASSEMBLE', .8), gasket: down('ASSEMBLE', 1.0), head: down('ASSEMBLE', 1.1), exh: down('ASSEMBLE', 1.15),
        valves: down('ASSEMBLE', 1.3), cams: down('ASSEMBLE', 1.4), tm: down('ASSEMBLE', 1.45), intake: down('ASSEMBLE', 1.5), cover: down('ASSEMBLE', 1.6),
      },
      slice: { z: SLICE_Z, amount: ramp('ASSEMBLE', 3.4, 2.4) },
      fade: { timing: ramp('ASSEMBLE', 3.0, 1.2, 1, 0), oilpump: ramp('ASSEMBLE', 3.0, 1.2, 1, 0), exhaust: ramp('ASSEMBLE', 3.2, 1.4, 1, .12), intake: ramp('ASSEMBLE', 3.2, 1.4, 1, .35) },
      focusCyl: 0, focus: ramp('ASSEMBLE', 3.8, 1.6),
    },
    /* The stack reassembles, then one long bezier sweep swings round to face cylinder 1 dead-on while the
       lens lengthens 45 → 65 mm: the perspective flattens into a near-orthographic "diagram" view.
       Focus lands on the section plane; the three cylinders behind fall soft.
       Light: fill drops for a moodier section; rim holds the edge of the cut. */
    camera: [
      { t: 0, az: 132, pol: 71, rad: 23.5, target: [0, 2.7, 0], mm: 45, dof: 0 },
      { t: 'ASSEMBLE+3.2', az: 158, pol: 77, rad: 13.6, target: [0, 1.45, C1], mm: 52, dof: 2, focus: 'piston:0' },
      { t: 'end', az: 180, pol: 88, rad: 13.4, target: [0, 1.35, C1], mm: 65, dof: 5, focus: 'piston:0' },
    ],
    look: { key: 1, rim: [{ t: 0, v: 1.45 }, { t: 'end', v: 1.25 }], fill: [{ t: 'ASSEMBLE+3', v: 1 }, { t: 'end', v: .6 }], bloom: .5 },
    overlays: [{ type: 'chapter', num: 3, title: 'Straight line into rotation', from: 'ASSEMBLE+3.4', to: 'end' }],
    audio: { ambience: [{ t: 0, v: .45 }, { t: 'end', v: .25 }], mech: true } },

  /* ------------------------------------------------------------------ 3 · SLIDER-CRANK */
  { id: 'slider-crank', scene: 'Straight line into rotation', arch: 'i4', lead: .5, tail: 2.0, dps: 60,
    lines: [
      { id: 'e1', cue: 'SLIDE', text: 'The piston can only slide up and down inside its cylinder.', pause: .5 },
      { id: 'e2', cue: 'CIRCLE', text: 'The crankpin can only travel around a circle.', pause: .5 },
      { id: 'e3', cue: 'ROD', text: 'The connecting rod joins the two, hinged at both ends.', pause: .5 },
      { id: 'e4', cue: 'PUSH', text: 'So when burning gas forces the piston down, the rod has no choice but to swing the crank around.', pause: .7 },
      { id: 'e5', cue: 'TDC', text: 'But timing matters. At the very top of the stroke, the rod and the crank line up. Push here, and nothing turns.', pause: .9 },
      { id: 'e6', cue: 'LEVER', text: 'A moment later, the crank has swung aside, and the same push now has leverage.' },
    ],
    theta: [
      { t: 'TDC+1.2', cycle: 360, cyl: 0, ease: 'out2' },        // firing TDC lands on "at the very top"
      { t: 'LEVER', hold: true, ease: 'linear' },
      { t: 'LEVER+2.2', cycle: 425, cyl: 0, after: 0 },
    ],
    engine: {
      slice: { z: SLICE_Z, amount: 1 }, fade: { timing: 0, oilpump: 0, exhaust: .12, intake: .35 }, focusCyl: 0, focus: 1,
      glow: [{ part: 'rod', cyl: 0, amount: pulse('ROD', .2, 1.6, .45) }, { part: 'piston', cyl: 0, amount: pulse('SLIDE', .2, 1.8, .3) }],
    },
    /* 65 mm diagram view, face-on, with a slow creep-in through the explanation (micro-drift keeps it alive).
       On "leverage" the camera pushes into an 85 mm macro on the crankpin — the leverage point — with a
       shallow focus pulled onto the pin so the rod top and block behind soften.
       Light: bloom swells with the orange gas-pressure push; key eases down at TDC ("nothing turns"). */
    camera: [
      { t: 0, az: 180, pol: 88, rad: 13.4, target: [0, 1.35, C1], mm: 65, dof: 5, focus: 'piston:0' },
      { t: 'PUSH', az: 180, pol: 88, rad: 13.0, target: [0, 1.3, C1], mm: 65, dof: 4.5, focus: 'rod:0' },
      { t: 'TDC', az: 180, pol: 88, rad: 12.8, target: [0, 1.3, C1], mm: 65, dof: 4.5, focus: 'rod:0' },
      { t: 'LEVER+0.2', az: 180, pol: 88, rad: 12.6, target: [0, 1.25, C1], mm: 65, dof: 4.5, focus: 'rod:0' },
      { t: 'LEVER+2.6', az: 181, pol: 88, rad: 11.8, target: [0, .95, C1], mm: 85, dof: 7, focus: 'crankpin:0' },
      { t: 'end', az: 181, pol: 88, rad: 11.6, target: [0, .95, C1], mm: 85, dof: 7, focus: 'crankpin:0' },
    ],
    look: { key: [{ t: 'TDC', v: 1 }, { t: 'TDC+1.5', v: .85 }, { t: 'LEVER', v: .85 }, { t: 'LEVER+1', v: 1 }], rim: 1.25, fill: .6,
      bloom: [{ t: 'PUSH', v: .5 }, { t: 'PUSH+0.8', v: .85 }, { t: 'TDC', v: .6 }, { t: 'LEVER+0.5', v: .6 }, { t: 'LEVER+1.5', v: .8 }] },
    overlays: [
      { type: 'chapter', num: 3, title: 'Straight line into rotation', from: -1, to: 'SLIDE+1' },
      { type: 'sliderCrank', cyl: 0, from: 'SLIDE', to: 'end-0.1', travelAt: 'SLIDE+0.3', circleAt: 'CIRCLE+0.3', rodAt: 'ROD+0.3',
        pushFrom: 'PUSH+0.6', pushTo: 'TDC+0.4', tdcFrom: 'TDC+1.6', tdcTo: 'LEVER+0.3', leverFrom: 'LEVER+0.3' },
      { type: 'hud', cyl: 0, from: 'SLIDE+0.6', to: 'end' },
    ],
    audio: { ambience: .2, mech: false } },

  /* ------------------------------------------------------------------ 4 · THE FOUR-STROKE CYCLE (opening) */
  { id: 'four-stroke', scene: 'The four-stroke cycle', arch: 'i4', lead: .6, tail: 4.2, dps: 42,
    lines: [
      { id: 'f1', cue: 'FOUR', text: 'That push comes from the four-stroke cycle, and one complete cycle takes two full turns of the crank.', pause: .6 },
      { id: 'f2', cue: 'IVO', text: 'First, the intake valve opens,', pause: .15 },
      { id: 'f3', cue: 'INTAKE', text: 'and the falling piston draws a fresh charge of air into the cylinder.', pause: .5 },
      { id: 'f4', cue: 'BDC', text: 'By the bottom of the stroke, the cylinder is full, and the intake valve is about to close. Next comes compression.' },
    ],
    theta: [
      { t: 'IVO+0.3', cycle: 708, cyl: 0, ease: 'inOut' },         // intake valve starts to open on "opens"
      { t: 'BDC+0.9', cycle: 180, cyl: 0 },                        // bottom dead centre on "bottom of the stroke"
      { t: 'BDC+5', cycle: 250, cyl: 0, after: 0 },                // intake valve closes, piston starts compressing, engine comes to rest
    ],
    engine: {
      slice: { z: SLICE_Z, amount: 1 }, fade: { timing: 0, oilpump: 0, exhaust: .12, injector: .2, intake: ramp('FOUR', 0, 2, .35, 1) }, focusCyl: 0, focus: 1,
      charge: { cyl: 0, amount: ramp('IVO', -.2, 1) },
      flow: 'air', flowAmt: ramp('IVO', -.4, 1.4), flowDim: 0,
      glow: [{ part: 'intakevalve', cyl: 0, color: PALETTE.flow.air, amount: pulse('IVO', 0, 2.2, .6) }],
    },
    /* Pull out of the crankpin macro to the full cylinder while the cycle ring comes up, then crane up and
       orbit over the intake side into a 65 mm close-up of the intake valve as it opens; focus racks from the
       valve head (IVO) down into the cylinder as the cyan charge fills it.
       Light: key full, fill low; bloom lifted so the cyan intake charge glows. */
    camera: [
      { t: 0, az: 181, pol: 88, rad: 11.6, target: [0, .95, C1], mm: 85, dof: 7, focus: 'crankpin:0' },
      { t: 'FOUR+1.2', az: 186, pol: 85, rad: 13.0, target: [0, 1.35, C1], mm: 65, dof: 4, focus: 'piston:0' },
      { t: 'IVO', az: 205, pol: 71, rad: 8.4, target: [0, 1.85, C1], mm: 65, dof: 7, focus: 'ivalve:0' },
      { t: 'INTAKE+1', az: 210, pol: 69, rad: 8.0, target: [0, 1.75, C1], mm: 65, dof: 7, focus: 'piston:0' },
      { t: 'end', az: 214, pol: 68, rad: 7.7, target: [0, 1.7, C1], mm: 65, dof: 6, focus: 'piston:0' },
    ],
    look: { key: 1, rim: 1.25, fill: [{ t: 0, v: .6 }, { t: 'IVO', v: .8 }], bloom: [{ t: 0, v: .8 }, { t: 'IVO', v: .75 }, { t: 'INTAKE', v: .9 }] },
    overlays: [
      { type: 'chapter', num: 4, title: 'The four-stroke cycle', from: 'FOUR', to: 'IVO+1' },
      { type: 'strokeRing', cyl: 0, from: 'FOUR+0.8', to: 'end-0.4' },
      { type: 'hud', cyl: 0, from: -1, to: 'end-3.8' },           // continues from the previous shot (no re-entrance)
      { type: 'label', text: 'Intake valve', anchor: 'ivalve:0', from: 'IVO+0.4', to: 'BDC-0.2', side: 'right' },
      { type: 'endCard', from: 'end-3.6', kicker: 'End of pilot', title: 'Next: compression, combustion and power' },
    ],
    audio: { ambience: .22, mech: false, valveTicks: 0 } },
];
