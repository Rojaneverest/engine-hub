# Engine Lab — interactive app + deterministic video pipeline

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
- `video/film/theme.ts` — palette, type (Barlow Condensed / Barlow), light rig, ink strength.
- `video/three/world.ts` — render pipeline: scene → SSAO → bloom → DoF → ACES subject composited over procedural paper
  (dot grid, contact shadow) → ink. `look.shade` fades between pure line drawing (0) and fully shaded (1).
- `video/components/overlays.tsx` — ink-on-paper graphics: "Fig. 0n" chapter marks, numbered margin callouts that
  never collide, slider-crank annotations in the margins, the cycle ring.

Per-shot camera (lens, lens `shift` for off-centre framing), look cues and engine state are in `video/film/storyboard.pilot.ts`.
