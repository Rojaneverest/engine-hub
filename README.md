# Engine Lab — interactive app + deterministic video pipeline

## Interactive app

Run `npm run build:app`, then open `dist/engine-lab.html` (Atlas images are copied next to it in `dist/atlas/`) in a WebGL-capable desktop browser. The build is one self-contained HTML file; no server is needed.
Every push to `main` runs the tests, builds the file and publishes it to GitHub Pages (`.github/workflows/pages.yml`).
The app opens on **Discover**, with a seven-step learning path, a glossary and a local notebook.
The **Engine** page has one **Parts / Flow / Charts** inspector and one shared timeline.
It starts paused at 120° in cutaway view. The app targets desktop; phone layouts are not a goal.

- **Toolbar:** engine picker with an ⓘ About button, Full / Cutaway / X-ray, an Explode toggle, and one contextual slider (Section in Cutaway, Spread while exploded). Save, Share and Reset sit on the right. Only the engine picker is a dropdown, custom-styled so it renders the same in Safari and Chrome; every other choice is a visible segmented control or chip (32px controls, 6px radius).
- **Showing row:** over the model, one chip per active selection or filter (part, isolation, flow, hidden parts, exploded, section depth, pending event stop, lesson). × undoes one; **Clear all** or **Esc** clears them all but keeps the engine, view, camera and cycle angle. **Reset** restores the whole default scene.
- **Camera cluster:** Fit, Front, Side, Top, Labels and Focus view at the bottom right of the model.
- **Transport:** Play, an rpm **Speed** slider, cylinder buttons with the firing order, and a timeline with clickable event markers. During a lesson, the stops to observe appear as rings that fill in once visited.
- **Parts** uses a searchable list → detail view with Focus, Isolate and Hide. Parts you have already met are marked with a dot.
- **Flow** and **Charts** use chips (flows carry their colour). Charts shows one larger graph, live values, and an optional exact event stop.
- **Learning path:** Meet the engine (select the piston, rod, crankshaft, intake valve and camshaft), then the six investigations in teaching order: four strokes → half-speed cam → spark timing → strongest twist → rhythm of power → double the revs. The top-bar **Learning path** button shows progress and continues; the Parts panel shows the next step; a finished lesson offers **Next step**. Every step stays open.
- Lessons keep their title, progress and actions pinned while the body scrolls. Predict → Explore → Explain; deliberate scrubbing, markers, keyboard steps, graph dragging and completed event stops count as observations; autoplay does not. Exit lesson restores the exploration snapshot.
- Status messages appear as short toasts over the model.
- **Engine sound** (transport, off on every load; **M** toggles it). One synthesizer driven by the model's own timing: spark, combustion, exhaust opening, valves seating and intake, per cylinder at its firing offset, with exhaust pulses run through a pipe-and-muffler model per bank (after Baldan et al. 2015). The Speed slider sets both: from 5 to 60 rpm the model turns at that speed and the sound follows it event by event (scrubbing plays what the timeline passes); from 700 to 6,500 rpm the sound is the same engine and firing order at real speed while the model holds 60 rpm, and a note under the transport says the two are not synced. The real-speed engine runs only while the model plays. The cross-plane V8's uneven beat comes from its firing order, not a recording. Volume is remembered. Open the app with `?tune` for a live tuning panel whose values go into `app/audio/tune.js`.
- The top bar has a light/dark toggle. The choice is remembered in this browser; with no choice made, the app follows the system setting.
- Learning progress (steps done, parts met) lives only in this browser, with no account. **Reset progress…** in the Learning path menu, or **Reset progress** on Discover, starts the path over after a confirmation; saved scenes and the theme are kept.
- **Atlas** (fourth tab; links `#atlas` and `#atlas/<story>`): magazine features on each layout plus an opening story on the four-stroke cycle. Each feature has a cutaway and an exploded illustration rendered from this app's model, a sourced timeline (every dated claim links its source), "At a glance" facts taken from the same `ARCHS` data as the Engine page, a Legends gallery of freely licensed photographs with credits, **Listen** (the layout at real speed through the same synthesizer, without touching the Engine page's sound) and **Explore in 3D**. The Engine toolbar's ⓘ opens the matching feature. Content: `app/atlas/content.js`. Photos: list them in `app/atlas/photos.json`, then `node scripts/fetch-atlas-images.mjs` downloads them from Wikimedia Commons, converts them to WebP and writes `app/atlas/credits.json`. Illustrations: `npm run build:app`, then `ENGINE_LAB_BROWSER=… node scripts/render-atlas.mjs`.
- Saved scenes retain camera, instance, section depth, separation and visibility. Older scene links remain supported. Progress (steps done, parts met) and up to 12 scenes are stored locally; storage failure falls back to the current session.
- Lab experiments remain independent of the 3D dimensions. WebGL failure leaves Lab and the Discover glossary available.

`app/engine-page.js` owns scene actions, the Showing row, inspector rendering and lesson sessions;
`app/engine-page.css` owns the control system and layout. `app/audio.js` owns the sound controls and audio graph; `app/audio/synth.js` is the self-contained synthesizer (it runs in an AudioWorklet, and in Node for `tests/audio.test.mjs`). `app/ui.js` contains the renderer,
camera and pointer interaction. `app/discovery.js` owns the landing page, learning path, notebook
and reusable charts. Shared simulation and video behavior are unchanged.

Run `npm run test:app` for numerical and isolated DOM integration tests (41 tests, real model
geometry, substituted WebGL renderer). They do **not** establish rendered visual quality.
For rendered checks, run `scripts/smoke-app.mjs` with `ENGINE_LAB_URL` set; set
`ENGINE_LAB_BROWSER` to a local desktop browser (for example Google Chrome on macOS).
It captures 1440/1280/1180-wide light and dark states, checks that the toolbar never clips
and that the stage never overlaps the inspector, and walks a lesson from the learning path.

## Layout
- `src/core/`      shared simulation (kinematics, valve timing, pressure, firing) + content
- `src/engine3d/`  deterministic, instance-based Three.js engine (used by app AND video)
- `app/`           interactive app → `npm run build:app` → `dist/engine-lab.html`
- `video/`         Remotion film: `film/storyboard.pilot.ts` (shots, narration, cues, camera), `film/timeline.ts`, `components/`, `three/world.ts`
- `audio/tts.py`   narration → `public/audio/vo/*.wav` + `public/audio/manifest.json` (durations drive shot timing)
- `audio/mix.py`   sound design + mix → `public/audio/mix.wav`
- `scripts/`       `export-timeline.ts`, `render.mjs`, `check-timing.ts`

## Setup (macOS)
    npm i
    python3 -m pip install numpy scipy        # + `pip install piper-tts` only if you want the local fallback voice
    cp .env.example .env                      # then fill in FISH_API_KEY / FISH_REFERENCE_ID

## Audio (what's left to do)
    npx tsx scripts/export-timeline.ts        # writes build/narration.json
    TTS_PROVIDER=fish python3 audio/tts.py    # Fish Audio → per-line wavs + manifest (real durations)
    npx tsx scripts/export-timeline.ts        # re-time film + captions to the new voice
    python3 audio/mix.py                      # → public/audio/mix.wav, registered in manifest
    npx tsx scripts/check-timing.ts           # sanity: crank speed + events at each cue

Fish request is in `synth_fish()` in audio/tts.py (POST https://api.fish.audio/v1/tts, header `model: s1`,
body {text, reference_id, format:"wav"}). Untested against the live API — verify the response format.

## Preview / render
    npm run studio                            # Remotion Studio, scrub any frame
    npm run render -- --shot slider-crank --preview
    npm run render -- --all                   # full pilot → out/Pilot.mp4 (+ soft subtitles from out/captions.srt)
Shot ids: cold-open, the-job, apart, mechanism, slider-crank, four-stroke.

## Current workflow (voice recorded in the Fish web app)
    # per-line clips live in audio/manual/<line id>.mp3 (a1 … f4)
    npx tsx scripts/export-timeline.ts
    TTS_PROVIDER=manual python3 audio/tts.py  # trims + normalises clips, writes the manifest
    npx tsx scripts/export-timeline.ts        # re-time shots + captions to the voice
    python3 audio/mix.py                      # calm music bed + transition SFX, ducked under the voice
    REMOTION_BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" RENDER_GL=angle npm run render -- --all

Remotion's downloaded headless Chrome has an invalid code signature on recent macOS (killed on launch),
so renders point REMOTION_BROWSER at the installed Google Chrome.

## Look: "the engineering drawing that comes alive"
Film and app share one visual system: warm drafting paper, ink line work, hatched section faces, low-chroma
hardware, and strict functional colour (cerulean = air, vermilion = combustion / force, amber = fuel).
- `src/engine3d/engine.ts` — housings are closed solids with real cavities (bores with liners, hollow crankcase with
  main-bearing bulkheads, ported heads with pent-roof chambers, hollow cam cover, sump tray, timing cover), so any clip
  plane shows a true section; cut faces are hatched in world space on the plane that made the cut.
- `src/engine3d/ink.ts` — ID pass + edge shader for the ink outlines (silhouettes, part boundaries, section outlines, creases).
- `app/ui.js` — the app's composite: ink ID passes at 2× (antialiased outlines, drawing buffer capped at ~3.2 MP),
  faded parts (X-ray housings, isolation, flow focus, the Cutaway timing chain) drawn as phantom outlines instead of
  translucent fills, and `APP_LOOK` tones for small repeated parts. The app builds the engine with `fine: true`
  (denser spring/ring/chain geometry, round gear bores, soft fuel spray); the film keeps the defaults.
- `video/film/theme.ts` — palette, type (Barlow Condensed / Barlow), light rig, ink strength.
- `video/three/world.ts` — render pipeline: scene → SSAO → bloom → DoF → ACES subject composited over procedural paper
  (dot grid, contact shadow) → ink. `look.shade` fades between pure line drawing (0) and fully shaded (1).
- `video/components/overlays.tsx` — ink-on-paper graphics: "Fig. 0n" chapter marks, numbered margin callouts that
  never collide, slider-crank annotations in the margins, the cycle ring.

Per-shot camera (lens, lens `shift` for off-centre framing), look cues and engine state are in `video/film/storyboard.pilot.ts`.
