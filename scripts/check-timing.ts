/* Sanity report: crank speed at shot boundaries and the engine state at each narration cue. */
import fs from 'fs';
import { buildFilm, thetaAt } from '../video/film/timeline';
import { PILOT } from '../video/film/storyboard.pilot';
import { cycleAngle, crankPhi, mod } from '../src/core/sim';
const film = buildFilm(PILOT, JSON.parse(fs.readFileSync('public/audio/manifest.json', 'utf8')));
const v = (s: any, t: number) => (thetaAt(s, t + .05) - thetaAt(s, t - .05)) / .1;
for (const s of film.shots) {
  const c0 = s.eng.cyls[0]; let vmax = 0, vmin = 1e9; for (let t = .05; t < s.dur - .05; t += .05) { const x = v(s, t); vmax = Math.max(vmax, x); vmin = Math.min(vmin, x); }
  console.log(`${s.id.padEnd(13)} speed in ${v(s, .06).toFixed(0).padStart(4)}°/s  out ${v(s, s.dur - .06).toFixed(0).padStart(4)}°/s  range ${vmin.toFixed(0)}..${vmax.toFixed(0)}`);
  for (const [k, t] of Object.entries(s.cueT)) { const th = thetaAt(s, t as number); console.log(`     ${k.padEnd(9)} t=${(t as number).toFixed(1).padStart(5)}  cyl1 cycle ${cycleAngle(c0, th).toFixed(0).padStart(3)}°`); }
}
