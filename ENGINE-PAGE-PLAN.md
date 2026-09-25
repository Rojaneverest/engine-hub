# Engine page: an interactive inspection bench

Next iteration: [ENGINE-UX-SPEC.md](ENGINE-UX-SPEC.md) supersedes this document's interface recommendations following the screenshot and interaction audit. The implementation history below is retained for context.

## Objective

Make the main Engine page the best place to freely explore the engine. Keep the model large, make its current behavior legible, and let visitors move naturally between parts, systems and measurements. Preserve the paper/ink style and existing engine layouts.

## Implementation status

Implemented the coordinated header/stage/inspector/timeline, Inspect / Systems / Measure modes, assembly search, cylinder-instance selection, previous-part navigation, camera presets, adjustable cutaway/explosion, sparse anchored labels with basic occlusion rejection, selectable system routes, live valve/phase context, exact next-event stops, investigation return snapshots and extended notebook scene restoration. Mobile has collapsed/medium/expanded inspector states and a shared transport. Hidden/isolation state has a visible restore control.

The implementation reuses existing simulation and rendering APIs; video and shared simulation files remain unchanged. The architecture, part and activity content now render within the inspector rather than independent floating surfaces.

Validation: 20 numerical and isolated DOM tests cover activities, mode continuity, camera snapshots, selected instances across all six architectures, cut/explosion state, flow restoration, event crossing, notebook round trips, invalid links and WebGL fallback. Production HTML builds successfully. DOM tests substitute the WebGL renderer; pixel-level layout, mobile sizing and GPU rendering remain unverified due to the session's local-file browser restriction. Individual-layer explosion and a transverse section remain future enhancements; the current controls expose global explosion and the existing cutaway sweep.

## Current problems identified in code

- Layout selection and view controls occupy opposite top corners without a shared layout container. Their widths can compete.
- Cycle explanation, selected-part inspector, architecture drawer, tour and workbench have separate placement rules. Several obscure or hide each other.
- The main inspector overlays the stage rather than reserving room. The workbench reserves room, creating two inconsistent inspection experiences.
- The collapsed timeline hides cylinder selection and firing order, which are central to understanding multi-cylinder engines.
- Searchable parts and synchronized graphs are available inside the workbench but not naturally integrated into ordinary exploration.
- Full / cutaway / x-ray, explode, follow, flows and investigate appear as equal-priority actions despite serving different purposes.
- Clicking a part selects a part category, potentially across multiple cylinders. It does not consistently mean one specific instance.
- The Inspect → Investigate transition currently resets view state. Entering a measurement panel should instead preserve the user's scene.

These are source-based findings; screenshot-level verification remains outstanding.

## Proposed desktop structure

1. **Scene header:** current architecture picker, short layout summary, About layout, save scene and reset scene.
2. **Large model stage:** fit camera to the space actually available. Quiet ground plane/grid, generous model scale, a few optional labels, no persistent tutorial paragraph covering the model.
3. **Compact view toolbar:** Full / Cutaway / X-ray, then a contextual Section or Explode control. Camera presets and label visibility live together. Separate geometric viewing controls from the system being studied.
4. **One inspector:** Inspect / Systems / Measure. Part details, system explanations, architecture facts and activity prompts share this region. Users can collapse it for a clean model view.
5. **Persistent transport:** play/pause, explicitly labeled animation speed, 720° cycle, selected cylinder and event stepping. Expanded mode adds measurements instead of a second independent timeline.

Keep Discover for choosing questions and Lab for independent numerical experiments. Their content can open within the same Engine inspector without inventing another engine-page interface.

## Inspector behaviors

### Inspect

- Empty selection: a compact searchable list organized by assembly (structure, moving assembly, valve train, intake/exhaust, lubrication).
- Selected part: name, one-sentence purpose, current-cycle behavior and direct actions: Focus, Isolate, Hide, Show in assembly.
- Keep Simple / Technical / Deep dive, with failure and relationship content expandable below the essential explanation.
- Introduce instance-aware picking: select a particular piston and its cylinder first; offer “all pistons” explicitly. The keyboard list provides the same choice.
- Related-part actions preserve a short breadcrumb and provide Back to previous part / Whole engine.

### Systems

- Choose Air / Fuel / Exhaust / Oil / Power.
- Display a short labeled route. Selecting a route node highlights its component and explains its role.
- Put a compact legend and one current-state sentence next to the engine: for example “Intake valve closed — cylinder sealed.” Derive statements from model state.
- Offer a guided “follow this path” sequence using deliberate steps; do not move the camera continually while the user is orbiting.
- Identify particles as schematic flow cues, not simulated fluid dynamics. Cooling should wait until its route and explanatory content exist.

### Measure

- Reuse the new observation model and graph implementations.
- Preserve architecture, selected cylinder, angle, camera, part and visibility when opening a graph.
- One shared cursor drives engine pose, graph, phase label and selected-part state.
- Let users pin two related measurements, such as pressure and gas torque; retain explicit units and independent-scale warnings.
- Move investigation prompts into this same inspector. Starting a prepared lesson is an explicit scene reset; merely opening Measure is not.

## High-value visual interactions

### Adjustable section

Replace the all-or-nothing feeling of cutaway with a labeled depth slider and a few meaningful stops. Start with the existing cut mechanism; evaluate a transverse section as a follow-up. Picking, cap surfaces and labels must agree with the visible section. Restore the previous depth when toggling back on.

### Exploded assembly

Add an explode amount slider with assembled/intermediate/fully separated states. Show a few leader labels and connection guides. Start with global separation; individual-layer control is a later enhancement. Disable incompatible flow display with an explicit explanation and restore it when reassembling if appropriate.

### Camera presets

Provide Home, Front, Side and Top, with selected-part focus and an obvious return to the whole engine. Fit each architecture to the remaining viewport after opening an inspector. Reduced-motion mode switches immediately; ordinary transitions stop when the user takes control.

### Labels and selected-cylinder focus

Use thin leader lines, restrained highlighting and optional labels. Show at most a handful of relevant labels, not every component. Hide occluded/back-facing anchors and resolve collisions against the inspector and transport. Selecting a cylinder can gently fade unrelated moving parts without implying they stopped working.

### See an event

Let the visitor choose “Stop at next spark,” “Stop when intake closes,” or an ordinary next-event step. An event stop pauses at the exact model angle, highlights the relevant component, and explains what changed. It should work even when a frame would have crossed the event.

## State and accessibility rules

- Use one authoritative scene state and one inspector mode. Remove competing old panel state gradually as panels migrate.
- Distinguish camera reset from full scene reset. Preserve unrelated choices when switching mode.
- Keep a scene-return snapshot when starting a guided activity; Exit offers return to the prior exploration.
- Hidden parts, isolation and flow state remain visibly discoverable, with a one-click restore action.
- Keyboard parts navigation, labeled native sliders, focus return and coarse-pointer targets are core requirements.
- Do not announce every animation frame to screen readers. Announce deliberate selections and event stops.
- On mobile, keep the model above one bottom sheet. Use collapsed/medium/expanded sheet controls available as buttons, not drag-only gestures. Keep play/pause and the cycle slider reachable.
- A clean view is temporary and has an obvious exit. Respect reduced motion and suspend work when not visible.

## Delivery order

| Stage | Changes | Completion check |
|---|---|---|
| 1: Layout and continuity | Scene header, one inspector shell, stage-aware camera, integrated part search, shared transport; migrate workbench without resets | Open/close Inspect and Measure without losing the scene; no panel collisions |
| 2: Tactile inspection | Section depth, explode amount, camera presets, instance-aware picking and selected-cylinder focus | Controls work across all six layouts and visible clipped geometry matches picking |
| 3: Explain in place | Systems routes, sparse anchored labels, live part behavior and exact event stops | Follow air through the engine and stop at spark without leaving the page |
| 4: Polish | Mobile sheet, keyboard parity, state restore, performance and usability verification | Same core exploration journey works at desktop and 390 × 844, with reduced motion |

Implement keyboard and mobile structure alongside each stage; stage 4 is verification and refinement, not the first accessibility pass. Relative effort: stage 1 medium, stage 2 medium-to-large, stage 3 medium-to-large. Do not add new physical models in this redesign.

## First implementation slice

Build stage 1 plus camera presets and explode amount. This produces a visible improvement immediately, establishes the permanent page structure, and avoids implementing advanced annotations against a layout that is about to change.

Acceptance journey: choose V8 → find piston 3 → focus it → open Measure → stop at spark → show Air → return to the same selected part → collapse inspector → restore the whole engine. Check scene continuity, readable labels, correct cylinder angles, keyboard access and mobile reachability throughout.

The inline planning sketch is schematic and tests information placement and mode switching. It is not a screenshot or a rendered replacement engine model.
