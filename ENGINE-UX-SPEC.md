# Engine page: UX audit and replacement specification

Status: implemented in the app. Functional verification passes; browser visual verification remains outstanding.
Evidence: two user screenshots, current source, and targeted isolated DOM probes.
This specification supersedes overlapping UI recommendations in ENGINE-PAGE-PLAN.md.

## 1. Diagnosis

The page has accumulated several interfaces for the same work. The original explorer, architecture drawer, guided tour, discovery workbench and new inspector adapter still retain separate controls and state. Moving them into one column reduced visual overlap but did not resolve the information architecture. Another cosmetic layer would preserve that confusion.

The next version should answer three questions clearly:

1. What am I looking at? Engine, selected component and selected cylinder.
2. What can I change? View, selection and cycle position, each controlled in one place.
3. What happened? A visible change in the model with a short, relevant explanation.

## 2. Findings and evidence

| Priority | Finding | Evidence | Required correction |
|---|---|---|---|
| High | Engine menu looks oversized and unrelated to other controls | Screenshot 1. `#sceneArchitecture` is a 25px select; native OS menus can inherit the enlarged control typography. Screenshot pixel size is not proof of CSS size because display scaling is unknown. | Separate heading typography from inputs. Engine selector uses standard control typography. Test the actual native menu on macOS. |
| High | Labels obscure the parts they identify | Screenshot 2. `.engine-anchor` begins at the projected point and extends right; its 23px pseudo-element is not a routed leader. | Labels go outside the mechanism, with real endpoint dots and leader lines. Default to selected-part labels, not three permanent tags. |
| High | Navigation combines multiple competing models | Code: assembly disclosures, part buttons, instance selector, previous-part stack, depth tabs, related chips, modes, About, Tour and lesson return paths. | Use list → detail in Parts; route → node in Flow; chart selection in Charts. No nested inspector modes or independent navigation histories. |
| High | “Reset scene” inside Measure is ineffective | DOM probe: at 410°, click `#benchReset`; angle remains 410°. It calls the revised non-resetting `openWorkbench()`. | One Reset scene action with one defined state contract; remove the duplicate. |
| High | Some legitimate lesson interactions do not count | DOM probe: cam lesson, choose prediction, Home and End on shared timeline; angle reaches 719° but visited checkpoints remain empty. | All user angle changes pass through one observation/lesson event path. Do not require a particular button to earn the same observation. |
| Medium | Apparent active system differs from rendered system | DOM probe: enter Systems; Air is selected, `S.flow` is off. | Selected flow and visible flow must be the same state, with an explicit Off option. |
| Medium | Selecting a part unexpectedly changes inspector mode | DOM probe: Measure → select piston → Inspect. | Model selection updates context without changing the user's chosen mode. |
| Medium | Assembly browsing loses its position | DOM probe: open a group and select a part; group rerenders closed. Detail is appended beneath the browser. | Replace list with detail, then restore prior query and scroll position with Back to parts. |
| Medium | Multiple ways to move time have unclear differences | Code: ±10° buttons, arrows, graph scrub, timeline scrub, event back/forward, checkpoint buttons and Stop at next. | One timeline; direct named event jumps in Charts; one advanced auto-stop control. Keep keyboard precision without another permanent button group. |
| Medium | Exit and reset labels have overlapping scope | Whole engine clears selection, isolation and hidden parts and resets camera; Home also resets camera; Reset scene does more; Reset investigation is elsewhere. | Replace with explicitly scoped actions: Back to parts, Fit engine, Show all, Reset scene, Exit lesson. |
| Medium | Labels button has no visible effect on coarse pointers | CSS hides `.engine-anchor` for all coarse pointers while leaving Labels available. | Selected labels must work on touch, or the option must be omitted with an equivalent accessible detail view. |
| Medium | Live explanation is insufficiently part-specific | `updateEngineInspector()` adds valve state to every selected part, including unrelated parts. | Show facts relevant to the selected part; use general cycle context separately. |
| Medium | Advanced UI crowds basic viewing | Permanent save/reset/about/inspector controls, camera picker, labels, view controls, event controls, two cylinder scopes. | Apply the placement inventory below. |
| Structural | New interfaces wrap old functions and hide duplicate controls | `engineOriginal`, function reassignment, reparented old panels, hidden workbench inputs and cumulative CSS overrides. | Replace this adapter with explicit state actions and purpose-built components. Delete obsolete UI paths when migrating. |

The probes exercise real app handlers with a substituted WebGL renderer. They establish behavior, not visual layout or GPU correctness. Prior passing tests did not establish the quality of the actual UI; several used controls that the new page hides.

## 3. The page to build

### Stable desktop layout

- Keep the app navigation: Discover / Engine / Lab.
- One compact scene header: **Engine [Single cylinder ▾]**, a short factual subtitle, and **Scene ⋯**.
- One stage toolbar: **Full | Cutaway | X-ray**, **Explode**, **View options**.
- Large engine canvas on the left; a 336px inspector on the right at typical desktop widths. Canvas never extends underneath it.
- Inspector has three plainly named tabs: **Parts / Flow / Charts**. Rename the current Inspect / Systems / Measure controls.
- One transport below the canvas: **Play/Pause**, **Animation speed**, **Cylinder** (only for multiple cylinders), current phase/angle, and a 0–720° timeline.
- Inspector has a single collapse button in its own header. Do not add another Hide inspector action to the scene header.
- Popovers are anchored to their initiating control. Opening options must not repeatedly resize/reframe the model.

The initial state is a paused single-cylinder cutaway at 120°, with Parts active and a short “Select a part or search” prompt. No automatic tour, expanded group tree, open graph or unrequested scene labels. The cutaway makes the mechanism discoverable immediately. Existing saved scenes override this default.

### Parts: exactly two screens

**Browser:** search field plus a flat part list, separated by quiet assembly headings. No accordion tree and no subcategories. Search includes component names and common aliases. Rows can carry small motion/static descriptions without becoming cards.

**Detail:** replaces the browser. Show Back to parts, component name, Cylinder N or All instances, one-sentence purpose, a relevant current-state line, and two immediate actions: Focus and Isolate. Hide lives in a small part action menu. A single More detail disclosure contains the extended explanation and failure notes. Related components update this detail screen directly.

- Back to parts restores the last search, scroll position and browser focus.
- Remove Previous part history. Related parts do not build another stack.
- Clicking the same part again is idempotent.
- The cylinder selector in the shared transport is authoritative. The part header identifies the selected cylinder; an All instances switch only changes selection scope, never creates a second cylinder picker.
- Parts with no per-cylinder instance omit that switch.
- Isolate is a toggle labeled Isolate / Exit isolation. When parts are hidden, show a small persistent **N hidden · Show all** control.

### Flow: choose once, see the route

Use one selector: Off / Air / Fuel / Exhaust / Oil / Power. Selecting a non-Off value both shows the route and enables its overlay. Off removes the overlay and leaves a short empty state.

Below the selector: a short overview, a numbered route, and the currently selected node's explanation. Clicking a node highlights that component without moving the camera. Offer Focus only when wanted.

- Remove Previous / Next component: the route itself is the navigation.
- Remove separate Show flow / Hide flow buttons: the selector owns flow state.
- Do not change tabs when a route node or a component is selected.
- For incompatible exploded states: show the route, but replace the flow animation with “Reassemble to show flow” and one Reassemble action. Do not silently reassemble or silently resume a previously hidden flow.
- The overview must say when a route is simplified. Oil destinations, for example, must not falsely imply all bearings form one serial pipe.

### Charts: one question at a time

Show a measurement selector, one graph, the cursor value with units, and a short explanation. Use the existing numerical model and chart data.

- Available: Pressure, Valve lift, Piston travel, Pressure + gas torque, Combined gas torque.
- The shared timeline controls every graph. Direct graph dragging uses the same action and pause behavior.
- Named event markers on the timeline/graph jump directly to that event and pause. A dropdown fallback exposes the same events accessibly when space is limited.
- Put **Pause at next event** here as an advanced control. It starts playback explicitly, shows “Waiting for spark · Cancel”, and pauses exactly at the event.
- Remove checkpoint button walls, duplicate playback/layout/cylinder controls, duplicate Save/Reset links, and the always-visible second mechanism diagram.
- The schematic mechanism can be opened with **Explain this graph**, only when relevant. It must not compete with the real model by default.

### Lessons: a bounded session

Discover owns lesson entry. While a lesson runs, the inspector shows its title, one current task and the relevant evidence. It does not embed another page with its own navigation or all three prediction/experiment/result sections expanded at once.

- Predict → Explore → Explain uses one current step at a time. User can revise a prediction without losing observations.
- One **Exit lesson** restores the pre-lesson exploration snapshot. No competing All investigations / Return to exploration / End tour / Reset scene controls inside the lesson.
- Move the old guided tour entry into Discover as “Learn the controls”; remove it from the Engine header and retire the separate tour UI after equivalent onboarding is covered.
- A lesson cannot persist invisibly and unexpectedly reappear when Charts is opened.

## 4. Control placement inventory

| Control today | Decision | New location / behavior |
|---|---|---|
| Engine architecture dropdown | Keep, restyle | Scene header; 14px text, 36px control height |
| THE ENGINE BENCH heading | Remove | Engine Lab and selected engine already establish context |
| About layout | Move | Scene menu → modal with title and Close; not an unlabelled fourth inspector mode |
| Save scene / Copy scene link | Merge entry point | Scene menu → Save scene / Copy link |
| Reset scene | Keep once | Scene menu; reset this architecture to documented default, preserve notebook |
| Full / Cutaway / X-ray | Keep | Single segmented stage control |
| Section depth | Contextual | View options, enabled in Cutaway |
| Explode | Keep | Stage toolbar toggle; separation adjustment in View options |
| Camera picker / Reset view / Home | Consolidate | View options has Front / Side / Top; visible Fit engine action within that popover |
| Labels | Change | View options: Off / Selected / Assembly; default Selected |
| Clean view / Hide inspector | Consolidate | Inspector collapse for ordinary use; Focus view in View options for presentation |
| Part-instance dropdown | Replace | Shared Cylinder selector + contextual All instances toggle |
| Simple / Technical / Deep dive | Simplify | One concise default + More detail disclosure; retain content, remove depth mode choice |
| Previous part / Whole engine | Remove | Back to parts; Fit engine and Show all have separate, explicit meanings |
| Related components | Keep | Direct detail replacement within Parts; no navigation stack |
| Flow type buttons + Show/Hide | Consolidate | One selector with Off |
| Route nodes + Previous/Next | Keep nodes only | Route is directly selectable |
| ±10°, previous/next event, checkpoints | Reduce | Timeline + named event jumps; keyboard arrows for precision |
| Stop at next | Move | Charts advanced event control |
| Multiple save/reset/home buttons in Measure | Remove | Scene actions only in scene menu |
| Guided tour + lessons within Engine | Consolidate | Discover entry and one explicit active lesson session |

## 5. Visual specification

### Typography and controls

- Use Barlow for body/controls at 14px; Barlow Condensed for non-interactive 22–26px component headings only.
- Native selectors inherit the control font, never the heading font. Desktop height 36px; coarse-pointer targets at least 44px. Mobile editable/select text at least 16px.
- One consistent 6–8px control radius, 1px border, 8px spacing rhythm. Neutral inactive state; restrained brass selected state.
- Use one 24px component title, 14px explanation and 12px metadata hierarchy. Do not stack several competing eyebrow labels and section headings.
- Keep native dropdowns initially: normalizing their typography is lower-risk than inventing a custom select. Verify popup appearance in macOS Chrome and Safari before choosing a custom listbox.

### Labels: correction for screenshot 2

- Default Selected mode renders at most one label. Assembly mode may render up to three, and is explicitly opt-in.
- Use stable component anchors, not the center of the first arbitrary mesh in a part category. Include cylinder number when relevant.
- Place labels in left/right annotation lanes within the stage, outside the projected mechanism silhouette where possible. Connect an endpoint dot to the label using a thin two-segment leader.
- Check text bounds against the model, other labels, toolbar, inspector and transport. If no clear position exists, suppress the label; the inspector remains the accessible source of its name.
- While orbiting or playing, keep the selected label stable or suppress it temporarily. Do not recreate and jitter three text boxes ten times a second.
- Use a small opaque paper backing only around the text; no oversized floating cards on top of pistons or rods.
- Touch users get the same selected-label behavior. Keyboard selection reveals the equivalent part information.

### Canvas and background

- Reduce the dot-grid contrast so the model's edge lines dominate.
- Reserve an inner model-safe region for annotation lanes; fit the whole engine on first entry and explicit Fit engine only.
- Avoid auto-camera movement on part selection or tab changes. Focus is deliberate. Resizing preserves orientation and target while fitting the available region.
- Do not force space for long architecture metadata: hide secondary metadata before shrinking or wrapping essential controls.

### Mobile

- One model region, one reachable transport and one bottom sheet. No additional drawer inside the sheet.
- Sheet has collapsed, medium and expanded stops with visible button controls; dragging is optional.
- Keep the engine selector, view selector and play/scrub accessible. Move secondary stage controls into View options.
- Do not hide Save or Reset entirely: both remain in Scene menu.
- At short heights and 200% zoom, let the inspector content scroll; prevent fixed percentage rows from clipping controls. Native selects must stay normal-sized.

## 6. Interaction contract

| User action | Must change | Must preserve |
|---|---|---|
| Switch Parts / Flow / Charts | Inspector contents only | Camera, engine, angle, active cylinder, visibility and selected component |
| Select a part on model | Selection, relevant label and contextual detail | Current tab, camera, playback state |
| Focus a part | Camera target/distance | Angle, engine, tab and visibility |
| Select cylinder | Shared cylinder context and instance selection where applicable; cancel pending stop with visible notice | Global crank angle, camera, graph type |
| Scrub / keyboard step / graph drag / event jump | Cycle angle; pause playback; cancel pending stop; evaluate explicit observation | Engine and component selection |
| Play through a lesson checkpoint | Model motion | Do not auto-complete an observation merely because time passed; completing a stop or deliberate scrub counts |
| Change architecture | Model; clear incompatible selection/visibility; cancel pending stop | View mode, normalized cycle angle, chosen inspector tab; fit new model |
| Hide a part | Visibility plus N hidden indicator | Part identity in detail, so Unhide remains available |
| Reset scene | Paused 120°, cutaway, assembled, no flow, all visible, default camera, Parts browser, first cylinder | Current architecture, saved scenes and completed lessons |
| Exit lesson | Restore captured exploration and focus | Notebook and completed work |

Choose one observation action in code for every deliberate time change. Fix the current lesson checkpoint bypass as part of this change, not by adding another special-case handler.

## 7. Implementation order and boundaries

1. **Freeze scope.** Build this specification; add no new engines, physical models, scoring systems, audio or extra navigation modes.
2. **Static design pass.** Produce complete desktop and mobile states: default, selected part, active Flow, Charts, engine menu open, View options open and active lesson. Review actual control density and typography before motion.
3. **Replace state/navigation.** One explicit inspector state; one authoritative scene state; one lesson session. Remove legacy hidden workbench inputs and wrapper-based control ownership. Preserve old saved-scene compatibility through a small decoder.
4. **Build the three inspector screens and single transport.** Implement the control inventory and interaction contract, then migrate explanations and charts.
5. **Fix labels and rendering layout.** Implement stable anchors, annotation lanes, collision rules and deliberate camera fitting. Tune the grid and control proportions against the supplied screenshots.
6. **Verify full journeys visually and functionally.** Test visible controls, not hidden legacy selectors. Keep GPU-independent tests but do not use them as evidence of visual quality.

## 8. Release criteria

- At a glance the visitor can identify engine, current phase and how to play/pause.
- One canonical control per operation; no nested tabs and no nested accordion navigation.
- Opening a part replaces the list; Back restores it. Browser query/position are retained.
- A complete task needs at most: choose part → Focus, choose flow → choose node, or choose chart → scrub.
- Reset from every mode produces the same documented scene. No visible reset control is ineffective.
- Timeline, chart dragging, event jump and keyboard stepping award equivalent lesson observations.
- Flow selection always matches rendered flow, or shows a plainly stated blocked condition with its resolution.
- Menus, tooltips and labels do not cover essential machinery or escape their viewport.
- No unexpected inspector-tab switches, stale lesson prompts or silent architecture/assembly changes.
- Visually inspect at 1440×900, 1024×768, 390×844 and 844×390; light/dark themes; 100%/200% zoom; mouse, touch and keyboard. Test actual macOS native menu appearance.
- Test both the single cylinder and V8 with part selected, cutaway, exploded, active flow, hidden parts, inspector collapsed and active lesson.
- If live browser access remains blocked, mark visual acceptance incomplete. The previous UI should not be considered visually approved solely because unit/DOM tests pass.

## 9. What stays

Keep the engineering-drawing identity, existing 3D assets, six layouts, simulation functions, educational content, accessible input support, graphs and notebook data. This work simplifies how those capabilities are presented and controlled. Video remains out of scope.

## Implementation verification — 2026-09-25

The replacement removes the wrapper adapter and old hidden workbench/tour markup.
Parts, Flow, Charts and the bounded lesson session now call scene actions directly.
The app build succeeds and all 20 numerical/DOM tests pass, including real model
geometry for projected annotation leaders. Tests exercise the current visible controls.

The local browser access restriction prevented rendered visual QA. No alternate browser
or URL was used to bypass it. The native macOS select popup, responsive pixel layout,
color themes, zoom and GPU rendering still require the release checks above.

### Compact toolbar follow-up

The screenshot review showed excessive height from three stacked bars. The app now
uses a slimmer navigation row and a single engine command bar. Architecture and
Full/Cutaway/X-ray are native selects; Explode and other secondary controls live
in View options, closed by default. Options opens as an overlay without adding a
grid row. Inspector tabs align with the command bar on desktop. The same controls
remain available on narrow screens with shorter option text and flexible sizing.

## Superseded — 2026-09-25 control and guidance pass

A later audit found that global filters were invisible from other tabs, there was no quick
way back to a clean view, native dropdowns rendered inconsistently (Safari ignores
`min-height` on selects), the Scene ⋯ and View options menus mixed unrelated actions, and
the investigations were not in teaching order. The app now has: one control system
(segmented buttons and chips; only the engine picker is a dropdown), a Showing row with
per-item × plus Clear all / Esc, visible Save / Share / Reset and ⓘ About, a camera cluster
on the model, timeline event markers, toasts instead of a status strip, pinned lesson
header and actions, and a seven-step learning path. Mobile is no longer a target.
The README describes the current behavior; sections 3–5 above describe the previous design.
