/* Exports the resolved film for the audio pipeline and captions:
   build/narration.json (lines to synthesise), build/timeline.json (shots, VO placement, sound events), out/captions.srt */
import fs from 'fs';
import { buildFilm, soundEvents } from '../video/film/timeline';
import { PILOT } from '../video/film/storyboard.pilot';
const manifest = JSON.parse(fs.readFileSync('public/audio/manifest.json', 'utf8'));
const film = buildFilm(PILOT, manifest);
fs.mkdirSync('build', { recursive: true }); fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('build/narration.json', JSON.stringify(PILOT.flatMap(s => (s.lines ?? []).map(l => ({ id: l.id, shot: s.id, text: l.text }))), null, 1));
fs.writeFileSync('build/timeline.json', JSON.stringify({ dur: film.dur, frames: film.frames,
  shots: film.shots.map(s => ({ id: s.id, scene: s.scene, start: +s.start.toFixed(3), dur: +s.dur.toFixed(3), cues: s.cueT })),
  lines: film.lines, events: soundEvents(film) }, null, 1));
// captions: split long lines at natural breaks into ≤ 2 rows of ~42 characters
const ts = (t: number) => { const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
let n = 0, srt = '';
for (const l of film.lines) {
  const words = l.text.split(' '); const chunks: string[] = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 84 && cur) { chunks.push(cur.trim()); cur = ''; } cur += ' ' + w; } if (cur.trim()) chunks.push(cur.trim());
  const total = chunks.reduce((a, c) => a + c.length, 0); let t = l.start;
  for (const c of chunks) { const d = (l.end - l.start) * c.length / total; const wrap = c.length > 42 ? c.replace(new RegExp(`^(.{1,42})\\s`), '$1\n') : c;
    srt += `${++n}\n${ts(t)} --> ${ts(t + d)}\n${wrap}\n\n`; t += d; }
}
fs.writeFileSync('out/captions.srt', srt);
console.log(`film ${film.dur.toFixed(1)} s, ${film.frames} frames`);
for (const s of film.shots) console.log(`  ${s.id.padEnd(14)} start ${s.start.toFixed(2).padStart(6)}  dur ${s.dur.toFixed(2).padStart(5)}  frame ${Math.round(s.start * 30)}  cues ${Object.entries(s.cueT).map(([k, v]) => k + '@' + (v as number).toFixed(1)).join(' ')}`);
