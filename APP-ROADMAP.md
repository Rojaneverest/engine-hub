# Engine Lab: app audit and development plan

Date: 2026-09-25. Scope: interactive app only. No video, rendering pipeline, narration, or film work.

## Implementation update

The first discovery release is implemented:

- Discover landing page with six investigations, glossary, progress and notebook.
- A coordinated workbench with prediction/observation/explanation activities; computed event stops; cylinder-relative pressure, gas torque, lift, travel and combined torque plots; and a schematic force/leverage/crank/cam diagram.
- Searchable part explanations, scene saving/restoration, resume, validated scene links and session fallback when local storage is unavailable.
- Lab baseline comparisons; autoscaled piston-speed chart; clarified independent experiment settings and educational wording.
- Keyboard tabs/timeline, explicit manual activity control, reduced-motion tour behavior, closed-drawer inert state and WebGL failure fallback.
- Responsive workbench split: engine above, one scrollable explanation panel below on mobile.

Validation: all 12 numerical and isolated DOM integration tests pass; production HTML builds successfully. The DOM harness substitutes WebGL, so this does not establish visual or GPU correctness. Live browser visual QA remains blocked by the local-file browser policy in this session. No video or shared simulation files were changed.

Still planned: true 3D force annotations, movable sections/layers, constrained design challenges, firing audio, new system models, broader sourced content review and observational usability testing. The force diagram shipped in this release is a schematic, not an overlay anchored to the 3D engine.

## Direction

Make an interactive engine museum and experiment bench: something visitors can understand in two minutes and keep investigating for an hour. The central loop should be **ask → predict → manipulate → observe → explain → try another case**.

Preserve the engineering-drawing identity: warm paper, ink outlines, hatched sections, restrained functional colors. Invest in visual explanations and meaningful consequences before adding engine layouts.

Assumed audience: curious beginners and enthusiasts, with optional technical depth. Keep free exploration available; activities should invite discovery rather than require a rigid sequence.

## Audit: what exists

| Area | Current implementation | Opportunity |
|---|---|---|
| Engine explorer | Single, inline-4, inline-6, V6, cross-plane V8, flat-6 | Enough architecture coverage for the next release |
| Inspection | Orbit/pan/zoom, full/cutaway/x-ray, explode, follow piston, hide/isolate/focus | Turn inspection controls into purposeful investigations |
| Parts | 27 part categories; simple, technical and deep explanations; purpose, cycle behavior, failure, related parts | Attach demonstrations to explanations; provide a searchable part list |
| Systems | Air, fuel, exhaust and oil particles; power-path highlighting | Explain a complete journey through each system; cooling is not implemented |
| Time | Play/pause, speeds, stepping, scrubbing, valve-lift timeline, cylinder phases and firing sequence | Event snapping, pressure/torque plots, one shared cursor |
| Context | Live cycle narration, approximate pressure, architecture drawer, pros/cons, real examples | More direct entry points through questions |
| Comparison | Normalized gas-torque pulse chart in architecture drawer | Expose comparison more clearly; separate torque ripple from balance |
| Learning | Eleven-step guided tour | Short thematic activities with actions and feedback |
| Lab | Displacement, RPM/piston speed, torque/power, three illustrative engine curves | Save A/B cases, graph measurements, challenges, links to explorer |
| Presentation | Paper/ink theme, automatic dark mode, responsive CSS, some keyboard controls and reduced-motion handling | Progressive disclosure, accessible inspection, mobile panel coordination |

Evidence: `app/index.html`, `app/ui.js`, `app/lab.js`, `app/prelude.js`, `src/core/content.ts`, `src/core/sim.ts`, `src/engine3d/engine.ts`, `src/engine3d/ink.ts`.

Build verification: `npm run build:app` succeeds, producing a roughly 672 KB HTML bundle. No app implementation was changed during this audit. Live visual testing was not completed: the headless browser failed to launch, and the browser tool blocked the local-file URL. Responsive overlap concerns below are code-review risks, not screenshot-confirmed defects.

## Important gaps and limits

1. **The Lab and explorer have separate state.** Changing bore or stroke changes SVG experiments, not the 3D engine. The 3D geometry uses fixed dimensions. Make the distinction explicit; shared geometry customization is a separate project.
2. **Speed is prescribed.** The explorer advances crank angle at a fixed animation rate. Pressure is conceptual, with fixed compression ratio and timing. There is no throttle/load equilibrium, stall, friction, thermal system or dynamic flywheel model. A throttle slider cannot honestly promise these behaviors yet.
3. **Good content is buried.** Parts require picking geometry; deeper comparisons sit behind “Why this layout?”; the tour explains tools but does not evaluate understanding.
4. **The piston-speed chart clips data.** `drawRpmStatic()` caps values at 30 m/s. At 110 mm stroke and 9,500 rpm the underlying calculation reaches about 57.1 m/s. Autoscale or clearly indicate overflow.
5. **Some educational wording needs qualification.** Review claims about long stroke inherently producing more torque, power determining acceleration, and “smoothness.” Hold comparison variables constant and distinguish combustion torque ripple from inertial balance. Review the flat-six balance text and verify real-engine examples against specific references.
6. **Narration and animated flows are not perfectly equivalent.** Air/fuel particle progression includes a baseline even outside events, while tour language can imply a complete stop. Keep explanatory language aligned with what is actually modeled.
7. **Accessibility is partial.** The canvas offers no equivalent keyboard part browser. The SVG scrubber lacks slider semantics and direct keyboard focus. Tab roles lack a complete tab interaction model. Drawers need focus/closed-state review. Reduced motion changes camera/explode behavior but does not prevent the tour starting engine playback.
8. **Small-screen panel management needs visual QA.** Tour and explanation panels share top positions in mobile CSS. Inspector, tools and expanded transport compete for space. Use one coordinated bottom sheet rather than independent overlays.
9. **No saved discoveries or session continuity.** App state has no persistence, bookmarks, shareable scenes or activity progress.
10. **Maintenance and performance will matter as scope grows.** The build concatenates three scripts into one shared scope. The Lab rewrites SVG markup during animation. Add clear module boundaries as new features arrive; measure performance before extensive rendering optimization. The supposedly self-contained HTML still requests Google Fonts.

## Recommended next release: “Why does it do that?”

One cohesive vertical slice, reusing the current single-cylinder engine and existing layouts.

### 1. Question launcher

Add a small collection of question cards to the entry screen and explorer:

- Why does the spark happen before the piston reaches the top?
- Why doesn't maximum cylinder pressure mean maximum crank torque?
- Why does the camshaft turn at half speed?
- Why are there two crank turns per cycle?
- Why does doubling RPM increase inertial load so much?
- Why do more cylinders change the rhythm of power delivery?

Each card opens a prepared scene, asks a simple prediction, and offers one useful action. Keep answers exploratory: show the evidence and allow another try without punishing mistakes.

### 2. Synchronized cycle workbench

Keep the engine as the main subject. Add a collapsible graph strip for pressure, valve lift, piston position and gas torque; all use the selected cylinder and shared 0–720° cursor.

Add “previous/next event” and named stops: intake closes, spark, firing TDC, peak pressure, exhaust opens. Event values must come from the model; derive extrema rather than hard-code them in prose. Clearly identify local cylinder angle versus global crank angle.

Show a short observation at the cursor. Example: at dead centre, a large gas force has little instantaneous leverage on the crank. Use model-consistent arrows and a lever-arm annotation to explain this visually.

### 3. Six short discovery activities

Use the questions above as the initial pack. Each activity defines setup, prompt, action, observation, explanation and an optional extension. Completion should depend on the relevant interaction or response, not pressing Next.

Concrete example: “Find the strongest twist.” Ask the user to mark where torque will peak, scrub the cycle, then reveal the pressure and torque curves together. Show the difference between their marked angle and the model's maximum, and explain the role of geometry. Exact and near-correct answers both receive useful feedback.

### 4. Continuity and access

Add a searchable parts list, inline glossary, reset experiment, and local progress. Save a small, versioned scene state for bookmarks/links: layout, selected cylinder, angle, view, activity and graph choice. Validate restored values and fall back safely when a part or activity is unavailable.

First-release acceptance criteria:

- All six activities work with mouse, touch and keyboard; a beginner can finish one without knowing the controls beforehand.
- Engine pose, plots, labels and event stops agree at the same angle, including a non-first cylinder and the 720° boundary.
- Pressure and gas torque are identified as illustrative model output; normalized torque is not labeled N·m.
- Opening an activity produces a predictable state; exit/reset behavior is explicit and does not leave hidden parts or stale flows behind.
- Mobile shows one primary explanation panel at a time; essential controls remain reachable at 390 × 844.
- Reduced-motion users can advance manually through every activity.
- Charts show the full selected range; no silent clamping.
- Returning users can resume or restart without an account.

## Further ideas, in priority order

| Feature | What the visitor does | Why it is valuable | Effort / dependencies |
|---|---|---|---|
| Force and motion lens | Toggle gas force, rod direction, leverage and piston velocity | Connect movement to work | Medium; consistent units and sign conventions |
| Movable section / layer slider | Drag a cut through housings or separate assembly layers | Makes spatial relationships tangible | Medium; renderer already exposes slice and per-layer explosion state; picking needs review |
| Saved A/B experiments | Freeze a baseline, vary one slider, compare diagrams and delta values | Makes cause and effect visible | Medium; shared experiment state and chart scaling |
| Design challenges | Meet a displacement target, minimize piston speed, match a desired power at an RPM | Gives existing sliders a purpose | Small–medium; explicit constraints and multiple valid solutions |
| Assembly bench | Put a simplified set of layers in order, inspect what each needs | Teaches dependencies and architecture | Medium; begin with click-to-place, optional dragging, no tiny fasteners |
| Firing rhythm instrument | Hear and see each cylinder's pulse, solo a bank, compare layouts | Adds a memorable sensory explanation | Medium; user-enabled audio; label synthesized pulses as schematic, not authentic exhaust |
| Balance bench | See reciprocating-force vectors sum while changing layout/RPM | Explains vibration separately from power smoothness | Large; masses, inertia and rocking moments require a new model |
| Gearing playground | Change gear ratio, wheel size and load in a simple drivetrain diagram | Connects engine output to vehicle behavior | Medium–large; explicit losses and traction assumptions |
| Flywheel experiment | Change inertia, compare speed ripple under identical load | Makes stored energy visible | Large; time-based angular dynamics; cannot use prescribed-speed animation alone |
| Cooling and lubrication journeys | Trace pump → galleries/bearings or jacket → thermostat → radiator | Expands content beyond combustion | Medium for explanatory diagrams; large for predictive temperature behavior |
| Diagnosis cases | Compare healthy and faulty traces, choose an inspection, explain a fault | Reuses failure content as investigations | Medium for authored cases; large for modeled faults |
| Breathing and timing bench | Compare valve timing, spark timing, throttle or boost | Strong enthusiast depth | Large; parameterized pressure/flow model and bounded valid settings |
| Energy budget | Follow energy into shaft work, exhaust and cooling | Explains efficiency and why heat management matters | Medium for labeled illustrative cases; large for calculated predictions |
| Material and manufacturing lens | Inspect cast, forged and machined parts and section details | Adds engineering context without another engine | Medium; curated illustrations and sourced content |

Use authored diagnosis cases first if prioritizing that feature: show a specified symptom and provided traces, rather than implying the current model generates overheating or bearing failure. A single-cylinder misfire model is a possible later first dynamic fault; realistic idle/stall behavior still needs angular dynamics.

## Content structure

Organize around questions rather than a longer engine catalog:

1. **Movement:** slider-crank geometry, dead centres, rod angle, leverage, cam ratio, flywheel energy.
2. **Breathing and burning:** valve overlap, injection, flame duration, spark advance, compression ratio, boost and knock.
3. **Staying alive:** oil films, cooling circuits, sealing, thermal expansion, friction and wear.
4. **Delivering useful work:** torque/power, gearing, load, firing pulses, balance and efficiency.
5. **Engineering trade-offs:** packaging, displacement versus RPM, manufacturing, materials and service access.

Each topic gets a short explanation, a “show me” scene/action, an optional experiment and sourced technical detail. Add a searchable glossary with TDC, BDC, displacement, compression ratio, torque, power, load, overlap, knock and volumetric efficiency. Preserve the existing three explanation depths.

## Visual and interaction direction

- Preserve the current paper/ink identity. Use functional color consistently across engine, graph, legend and explanation.
- Add numbered leader lines anchored to parts, dim unrelated hardware, and keep only a few labels visible at once.
- Use adjustable exploded layers with small part cards and connection lines; labels should move with the assembly.
- Provide clear front/side/top camera presets and a home view. Avoid forced camera motion while the visitor is manipulating the model.
- Prefer one contextual inspector with Learn / Measure / Try sections over more floating panels.
- Use delta readouts and ghosted baselines in experiments. Show units and explain what is being held constant.
- Offer optional subtle sound for events, always user-enabled and independently mutable.
- Use a discovery notebook for saved scenes and completed investigations; avoid unrelated points, streaks or compulsory quizzes.
- Start with question cards plus Engine and Lab navigation. Add a dedicated Challenges destination only when there is enough content to justify it.

## Delivery sequence

| Stage | Deliverable | Exit condition |
|---|---|---|
| 0: Trust and access | Fix clipped chart, qualify copy, clarify animation speed versus RPM, parts list, keyboard timeline, mobile panel rules | Accurate labels and usable core controls verified on desktop/mobile |
| 1: Shared observation | Cycle readout selector, synchronized pressure/torque graph, event stops, force overlay | All observations agree with one selected cylinder and angle |
| 2: Discovery release | Question launcher, six activities, glossary, local progress/bookmarks | Complete a beginner journey from entry to saved discovery |
| 3: Replay value | Saved A/B cases, constrained design challenges, section/layer controls, firing pulse audio | Users can compare and explain a changed result |
| 4: Deeper systems | Choose one of gearing, cooling/lubrication, authored diagnosis or dynamic flywheel | Each addition has a defined model, limitations and validation cases |

Effort labels are relative scope, not calendar estimates. Stage 0–2 is the recommended next milestone. Avoid bundling all later systems into it.

## Implementation approach

- Keep app lessons and progress outside shared content used by other consumers. Do not modify video code or pipelines.
- Introduce app modules incrementally for state, observations, activities, plots and persistence. Preserve the single-file export if useful; a framework rewrite is unnecessary for this milestone.
- Create one derived observation object keyed by architecture, cylinder and crank angle. Use it for graphs, narration, event navigation and activity evaluation.
- Define activities as data plus named actions/evaluators rather than arbitrary text and scattered UI callbacks. Keep entry, exit, reset and restore explicit.
- Reuse renderer hooks: `focusCyl`/`focus`, `slice`, layered `explode`, `glow` and anchors. The app currently exposes only part of these capabilities. Verify each hook in interactive use before promising it.
- Keep model extensions opt-in, with existing defaults preserved. UI claims must match the simulation fidelity; use separate conceptual diagrams where necessary.
- Check computation invariants (periodicity, cylinder offsets, event wrapping, unit conversion), then browser-test one complete activity and scene restoration. Check touch, keyboard, contrast, reduced motion and WebGL failure fallback.
- Measure render cost for the single and V8 models. Update SVG geometry only when inputs change; animate cursors/transforms where possible. Suspend unnecessary work while hidden.

## How to judge success

In a small moderated usability pass, observe whether a newcomer can discover cutaway, select a part, scrub to spark and complete an activity without coaching. Ask them to explain one relationship in their own words. Check whether they voluntarily try a second case. Use these observations to revise the experience before adding more features; no analytics backend is required for this first evaluation.

## Reference direction

- [PhET science activity design](https://phet.colorado.edu/el/teaching-resources/virtual-workshop/science-activity-design): supports learner autonomy and exploratory questions. This informs the proposed activity structure, not a claim that this app has demonstrated learning outcomes.
- [PhET guided-inquiry guide](https://phet.colorado.edu/files/guides/UG-Guide-HW_en.pdf): cautions that excessive step-by-step direction can narrow exploration.
- [MIT Internal Combustion Engines lecture notes](https://ocw.mit.edu/courses/2-61-internal-combustion-engines-spring-2017/pages/lecture-notes/): a primary teaching reference for reviewing operating characteristics, combustion, heat transfer and future model scope. A claim-by-claim engineering fact-check remains implementation work.
