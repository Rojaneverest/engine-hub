/* =====================================================================
   PILOT STORYBOARD — cold open → the basic job → inside the engine →
   straight line into rotation → start of the four-stroke cycle.

   Visual idea: "the engineering drawing that comes alive". The film opens on a pure ink line drawing on
   drafting paper that shades into a solid machine; sections are hatched; every annotation is ink in the
   margins, pointing in; the film closes by returning the engine to line art.

   Edit this file to re-time, re-frame or re-cast shots:
   • durations follow the narration (plus lead/tail/minDur);
   • every visual event is keyed to a narration cue ('CUE+0.5');
   • crank-angle keys land mechanical events on cues (cycle 360 = firing TDC);
   • camera: az (0 = rear, 90 = exhaust side, 180 = front), pol (90 = level), rad, target, mm (35 mm-equiv. lens),
     dof (depth-of-field strength, px of blur at infinity; 0 = deep focus — the illustration look keeps it at 0), focus.
     Keys are joined by one continuous monotone spline across the whole film (no hard cuts, no stop-start),
     and a slow orbital micro-drift runs on top of every frame.
   • look: lighting / post cues per shot — key / fill / rim multipliers, bloom, AO, and
     shade (0 = ink line drawing, 1 = fully shaded), grid (drafting dots), ink (line strength).
   • engine.gas: in-cylinder gas volumes are hidden unless a shot asks for them (one idea on screen at a time).
   Lens language: 50 mm hero & establishing · 42–45 mm balanced wides for exploded views ·
   65 mm "diagram" telephoto for the sectioned mechanism (flat, near-orthographic) · 85 mm macro for key interactions.
   Engine coordinates for the inline-4: cylinder 1 sits at engine z = 0, world z = −1.5.
   ===================================================================== */
import { Shot, ramp, pulse } from './timeline';
import { PALETTE } from './theme';

const C1 = -1.5;                      // world z of cylinder 1 (inline-4)
const SLICE_Z = 0;                    // section plane through cylinder 1's axis (engine z)
const EXP = .8;                       // exploded-view scale for the film (80% of the app's spacing)
const up = (cue: string, off: number, dur = 1.5) => ramp(cue, off, dur, 0, EXP);
const down = (cue: string, off: number, dur = 1.25) => ramp(cue, off, dur, EXP, 0);
/** Cold-open assembly: a layer starts exploded and lands 1.2 s after TITLE+off (so off = −1.3 lands just before the title). */
const build = (off: number) => [{ t: 0, v: EXP }, ...ramp('TITLE', off, 1.2, EXP, 0)];
const SECTION_FADE = { timing: 0, oilpump: 0, exhaust: .1, intake: .2, throttle: .2, filter: .2, injector: .35 };

export const PILOT: Shot[] = [
  /* ------------------------------------------------------------------ 0 · COLD OPEN */
  { id: 'cold-open', scene: 'Cold open', arch: 'i4', lead: 1.8, tail: 4.4, dps: 60, startTheta: 40,
    lines: [
      { id: 'a1', text: 'Inside this block of metal, fuel is burning, in a steady rhythm of small, controlled bursts.', pause: .6 },
      { id: 'a2', text: 'So how does fire, trapped inside a cylinder, become smooth and useful rotation?', cueEnd: 'TITLE', pause: 0 },
    ],
    /* Opens on the engine exploded into its build layers, drawn in ink on the paper, while the camera orbits it from
       the rear-exhaust quarter round to the broadside (45 mm). The drawing shades in under the first line of narration; then the engine
       builds itself up in assembly order, one layer landing after another, pushing in as it closes. The last part (the
       timing cover) lands just as the question ends; the camera then pushes in, easing the finished engine right as the title arrives. */
    engine: {
      explode: {
        crank: build(-8.0), mb: build(-7.5), pist: build(-7.0), op: build(-6.5), pan: build(-6.0), fw: build(-5.5),
        gasket: build(-5.0), head: build(-4.5), valves: build(-4.0), cams: build(-3.5), tm: build(-3.0), cover: build(-2.5),
        exh: build(-2.1), intake: build(-1.7), tcov: build(-1.3),
      },
    },
    camera: [
      { t: 0, az: 28, pol: 80, rad: 26, target: [0, 2.5, 0], mm: 45 },
      { t: 'TITLE-8.5', az: 62, pol: 76, rad: 25, target: [0, 2.45, 0], mm: 45 },
      { t: 'TITLE-4', az: 92, pol: 75, rad: 25, target: [0, 2.7, 0], mm: 45 },
      { t: 'TITLE-1', az: 106, pol: 76, rad: 21.5, target: [0, 2.2, -.2], mm: 46, shift: [.05, 0] },
      { t: 'TITLE+1.2', az: 118, pol: 77, rad: 13, target: [0, 1.35, -.25], mm: 50, shift: [.27, 0] },
      { t: 'end', az: 122, pol: 76, rad: 12.4, target: [0, 1.35, -.2], mm: 50, shift: [.25, 0] },
    ],
    look: { shade: [{ t: 0, v: 0 }, { t: 1.8, v: 0 }, { t: 6, v: 1, ease: 'inOut' }], bloom: .15 },
    overlays: [{ type: 'title', from: 'TITLE+0.2', to: 'end-0.2', fade: .7, kicker: 'Engine Lab · Pilot', lines: ['How an engine turns', 'fire into motion'] }],
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
      fade: { exhaust: ramp('CUT', -.2, 1.8, 1, .08), timing: ramp('CUT', .8, 1.5, 1, .25) },
      glow: [
        { part: 'piston', color: PALETTE.flow.power, amount: pulse('C1', .1, 1.4, .3) },
        { part: 'crank', color: PALETTE.flow.power, amount: pulse('C2', .1, 1.4, .3) },
        { part: 'flywheel', color: PALETTE.flow.power, amount: pulse('C3', .5, 1.6, .35) },
      ],
    },
    /* Continues the orbit round to the exhaust side as the cutaway sweeps open (50 → 45 mm), settling into a
       square-on longitudinal section that reads like a textbook plate. The chain of cause and effect runs along
       the bottom margin, under the engine. */
    camera: [
      { t: 0, az: 122, pol: 76, rad: 12.4, target: [0, 1.35, -.2], mm: 50, shift: [.25, 0] },
      { t: 'CUT+3.2', az: 102, pol: 78, rad: 11.2, target: [0, 1.55, 0], mm: 45 },
      { t: 'C2+0.4', az: 99, pol: 79, rad: 11.2, target: [0, 1.5, .1], mm: 45 },
      { t: 'end', az: 97, pol: 80, rad: 11.6, target: [0, 1.5, 0], mm: 45 },
    ],
    look: { key: 1, bloom: .2 },
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
      fade: { exhaust: [{ t: 0, v: .08 }, { t: 'EXPLODE+0.6', v: 1 }], timing: [{ t: 0, v: .25 }, { t: 'EXPLODE+0.6', v: 1 }] },
      explode: {
        tcov: up('EXPLODE', .7), cover: up('EXPLODE', 1.1), intake: up('EXPLODE', 1.4), tm: up('EXPLODE', 1.7),
        cams: up('L_CAMS', -.3), valves: up('L_CAMS', .9),
        exh: up('L_HEAD', -.3), head: up('L_HEAD', 0), gasket: up('L_HEAD', .5),
        pist: up('L_PIST', 0, 1.7), crank: up('L_PIST', 2.0), mb: up('L_PIST', 2.2), fw: up('L_PIST', 2.4), pan: up('L_PIST', 2.7), op: up('L_PIST', 2.8),
      },
    },
    /* Exploded view: a balanced 45 mm wide that cranes up with each layer as it lifts off, then settles into a
       symmetrical overview of the whole stack, held left of centre so the numbered callouts get a clean right margin. */
    camera: [
      { t: 0, az: 97, pol: 80, rad: 11.6, target: [0, 1.5, 0], mm: 45 },
      { t: 'EXPLODE+1.2', az: 104, pol: 76, rad: 14, target: [0, 3, 0], mm: 45, shift: [-.08, 0] },
      { t: 'L_CAMS+0.6', az: 112, pol: 74, rad: 19.5, target: [0, 3.7, .4], mm: 45, shift: [-.1, 0] },
      { t: 'L_HEAD+1.2', az: 118, pol: 73, rad: 21, target: [0, 3.8, .6], mm: 45, shift: [-.1, 0] },
      { t: 'L_PIST+2', az: 124, pol: 73, rad: 25.5, target: [0, 2.9, .8], mm: 45, shift: [-.1, 0] },
      { t: 'end', az: 128, pol: 72, rad: 26.5, target: [0, 2.7, .8], mm: 45, shift: [-.1, 0] },
    ],
    look: { key: 1, bloom: .15 },
    overlays: [
      { type: 'chapter', num: 2, title: 'Inside the engine', from: 'EXPLODE+0.4', to: 'L_HEAD' },
      { type: 'callouts', from: 'L_CAMS', to: 'end-0.3', items: [
        { text: 'Camshafts', anchor: 'cams', at: 'L_CAMS+1.1', side: 'right' },
        { text: 'Valves', anchor: 'valves', at: 'L_CAMS+2.3', side: 'right' },
        { text: 'Cylinder head', anchor: 'head', at: 'L_HEAD+1.2', side: 'right' },
        { text: 'Pistons and connecting rods', anchor: 'pistons', at: 'L_PIST+1.5', side: 'right' },
        { text: 'Crankshaft', anchor: 'crank', at: 'L_PIST+3.4', side: 'right' },
      ] },
    ],
    audio: { ambience: .45, mech: true } },

  /* ------------------------------------------------------------------ 3 · STRAIGHT LINE INTO ROTATION (setup) */
  { id: 'mechanism', scene: 'Straight line into rotation', arch: 'i4', lead: .3, tail: 1, minDur: 8.2, dps: 60,
    lines: [{ id: 'd1', cue: 'ASSEMBLE', text: 'Everything else exists to support one remarkably simple mechanism.', pause: 0 }],
    engine: {
      explode: {
        pan: down('ASSEMBLE', .2), op: down('ASSEMBLE', .25), fw: down('ASSEMBLE', .35), mb: down('ASSEMBLE', .45), crank: down('ASSEMBLE', .5),
        pist: down('ASSEMBLE', .8), gasket: down('ASSEMBLE', 1.0), head: down('ASSEMBLE', 1.1), exh: down('ASSEMBLE', 1.15),
        valves: down('ASSEMBLE', 1.3), cams: down('ASSEMBLE', 1.4), tm: down('ASSEMBLE', 1.45), intake: down('ASSEMBLE', 1.5), cover: down('ASSEMBLE', 1.6), tcov: down('ASSEMBLE', 1.75),
      },
      slice: { z: SLICE_Z, amount: ramp('ASSEMBLE', 3.4, 2.4) },
      fade: { timing: ramp('ASSEMBLE', 3.0, 1.2, 1, 0), oilpump: ramp('ASSEMBLE', 3.0, 1.2, 1, 0), exhaust: ramp('ASSEMBLE', 3.2, 1.4, 1, SECTION_FADE.exhaust),
        intake: ramp('ASSEMBLE', 3.2, 1.4, 1, SECTION_FADE.intake), throttle: ramp('ASSEMBLE', 3.2, 1.4, 1, SECTION_FADE.throttle),
        filter: ramp('ASSEMBLE', 3.2, 1.4, 1, SECTION_FADE.filter), injector: ramp('ASSEMBLE', 3.2, 1.4, 1, SECTION_FADE.injector) },
      focusCyl: 0, focus: ramp('ASSEMBLE', 3.8, 1.6),
    },
    /* The stack reassembles, then one long sweep swings round to face cylinder 1 dead-on while the lens
       lengthens 45 → 65 mm: the perspective flattens into a near-orthographic "diagram" view as the section
       plane slides back through the block and stops on the cylinder's axis. */
    camera: [
      { t: 0, az: 128, pol: 72, rad: 26.5, target: [0, 2.7, .8], mm: 45, shift: [-.1, 0] },
      { t: 'ASSEMBLE+3.2', az: 158, pol: 78, rad: 14.5, target: [0, 1.5, C1], mm: 52 },
      { t: 'end', az: 180, pol: 88, rad: 14.2, target: [0, 1.4, C1], mm: 65 },
    ],
    look: { key: 1, fill: [{ t: 'ASSEMBLE+3', v: 1 }, { t: 'end', v: .8 }], bloom: .15 },
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
      slice: { z: SLICE_Z, amount: 1 }, fade: SECTION_FADE, focusCyl: 0, focus: 1,
      gas: [{ t: 'PUSH-0.4', v: 0 }, { t: 'PUSH+0.6', v: 1 }, { t: 'end-1', v: 1 }, { t: 'end', v: 0 }],
      glow: [{ part: 'rod', cyl: 0, amount: pulse('ROD', .2, 1.6, .5) }, { part: 'piston', cyl: 0, amount: pulse('SLIDE', .2, 1.8, .35) }],
    },
    /* 65 mm diagram view, face-on, with a slow creep-in through the explanation (micro-drift keeps it alive).
       The words live in the margins either side of the section; the mechanism stays clean.
       On "leverage" the camera pushes into an 85 mm view of the crank — the leverage point. */
    camera: [
      { t: 0, az: 180, pol: 88, rad: 14.2, target: [0, 1.4, C1], mm: 65 },
      { t: 'PUSH', az: 180, pol: 88, rad: 13.8, target: [0, 1.35, C1], mm: 65 },
      { t: 'TDC', az: 180, pol: 88, rad: 13.6, target: [0, 1.3, C1], mm: 65 },
      { t: 'LEVER+0.2', az: 180, pol: 88, rad: 13.4, target: [0, 1.25, C1], mm: 65 },
      { t: 'LEVER+2.6', az: 181, pol: 88, rad: 13.2, target: [0, .75, C1], mm: 85 },
      { t: 'end', az: 181, pol: 88, rad: 13, target: [0, .75, C1], mm: 85 },
    ],
    look: { key: [{ t: 'TDC', v: 1 }, { t: 'TDC+1.5', v: .9 }, { t: 'LEVER', v: .9 }, { t: 'LEVER+1', v: 1 }], fill: .8,
      bloom: [{ t: 'PUSH', v: .15 }, { t: 'PUSH+0.8', v: .3 }, { t: 'TDC', v: .2 }] },
    overlays: [
      { type: 'chapter', num: 3, title: 'Straight line into rotation', from: -1, to: 'SLIDE+1' },
      { type: 'sliderCrank', cyl: 0, from: 'SLIDE', to: 'end-0.1', travelAt: 'SLIDE+0.3', circleAt: 'CIRCLE+0.3', rodAt: 'ROD+0.3',
        pushFrom: 'PUSH+0.6', pushTo: 'TDC+0.4', tdcFrom: 'TDC+1.6', tdcTo: 'LEVER+0.3', leverFrom: 'LEVER+0.3' },
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
      slice: { z: SLICE_Z, amount: 1 }, fade: { ...SECTION_FADE, intake: ramp('FOUR', 0, 2, SECTION_FADE.intake, 1), throttle: ramp('FOUR', 0, 2, SECTION_FADE.throttle, 1), filter: ramp('FOUR', 0, 2, SECTION_FADE.filter, 1) },
      focusCyl: 0, focus: 1,
      charge: { cyl: 0, amount: ramp('IVO', -.2, 1) },
      flow: 'air', flowAmt: ramp('IVO', -.4, 1.4), flowDim: 0,
      glow: [{ part: 'intakevalve', cyl: 0, color: PALETTE.flow.air, amount: pulse('IVO', 0, 2.2, .6) }],
    },
    /* Pull back from the crank to the full cylinder while the cycle ring draws on, then crane up and orbit
       over the intake side into a 65 mm view of the intake valve as it opens, with the cyan charge filling the bore.
       The film closes by fading the shading back out to the ink drawing under the end card. */
    camera: [
      { t: 0, az: 181, pol: 88, rad: 13, target: [0, .75, C1], mm: 85 },
      { t: 'FOUR+1.2', az: 186, pol: 85, rad: 14.2, target: [0, 1.45, C1], mm: 65, shift: [-.12, 0] },
      { t: 'IVO', az: 204, pol: 73, rad: 9.8, target: [0, 1.9, C1], mm: 60, shift: [-.12, -.02] },
      { t: 'INTAKE+1', az: 209, pol: 71, rad: 9.4, target: [0, 1.8, C1], mm: 60, shift: [-.12, -.02] },
      { t: 'end', az: 213, pol: 70, rad: 9.2, target: [0, 1.75, C1], mm: 60, shift: [-.12, -.02] },
    ],
    look: { key: 1, fill: .85, bloom: .2, shade: [{ t: 'end-3.4', v: 1 }, { t: 'end-1.2', v: 0, ease: 'inOut' }] },
    overlays: [
      { type: 'chapter', num: 4, title: 'The four-stroke cycle', from: 'FOUR', to: 'IVO+1' },
      { type: 'strokeRing', cyl: 0, from: 'FOUR+0.8', to: 'end-3.8' },
      { type: 'label', text: 'Intake valve', anchor: 'ivalve:0', from: 'IVO+0.4', to: 'BDC-0.2', color: PALETTE.flow.air },
      { type: 'endCard', from: 'end-3.6', kicker: 'End of pilot', lines: ['Next: compression,', 'combustion and power'] },
    ],
    audio: { ambience: .22, mech: false, valveTicks: 0 } },
];
