/* Visual identity of the film — "the engineering drawing that comes alive".
   Warm drafting paper, ink line work, hatched section faces, low-chroma hardware, and strict functional
   colour: cerulean = air/intake, vermilion = combustion/pressure/force, amber = fuel. Annotation is ink;
   vermilion doubles as the single brand accent (figure numbers, rules). */
export const PALETTE = {
  paper: '#F1EEE7', paperEdge: '#E2DDD3', grid: '#23211E',
  ink: '#23211E', muted: '#6B665E', faint: '#9A948A', line: 'rgba(35,33,30,.16)',
  accent: '#E4502A', section: '#E2BD73', hatch: '#3A2E1C',
  flow: { air: '#1D8FD6', fuel: '#E3A21A', comp: '#6E5BD0', power: '#E4502A', exhaust: '#8C857E', oil: '#B8742B', brass: '#B7862F', section: '#E2BD73' },
};
/** Barlow Condensed for display and callouts (engineering-drawing feel), Barlow for reading text. */
export const TYPE = {
  display: "'Barlow Condensed', 'Barlow', sans-serif",
  text: "'Barlow', sans-serif",
};
/** Studio light rig, camera-relative (degrees around the camera→subject axis): a soft, bright
    illustration setup — broad warm key high on the left, generous cool fill, gentle rim. */
export const RIG = {
  key: { color: '#FFF1E0', intensity: 1.45, az: 42, el: 55 },
  fill: { color: '#E8EEF8', intensity: .36, az: -65, el: 18 },
  rim: { color: '#FFFFFF', intensity: .8, az: 160, el: 40 },
  ambient: .26, env: .7,
};
/** Ink line work: outline (silhouettes, part boundaries, section outlines) and crease strength. */
export const INK = { outline: .88, crease: .42, idScale: 2 };
export const FPS = 30;
export const SIZE = { w: 1920, h: 1080 };
/** Safe margins for graphics (title-safe ≈ 5%). */
export const SAFE = { x: 120, y: 84 };
/** Convert a 35 mm-equivalent focal length to the camera's vertical field of view (24 mm sensor height). */
export const mmToFov = (mm: number) => 2 * Math.atan(12 / mm) * 180 / Math.PI;
