/* Visual identity of the film: a deep slate studio, graphite and brushed-steel hardware,
   and strict functional colour — cyan = air/intake, amber-orange = combustion/pressure/heat,
   gold = callouts and highlights. */
export const PALETTE = {
  // backdrop: slate gradient with a soft radial key glow behind the subject
  bg0: '#020617', bg1: '#0F172A', bgGlow: '#1E293B',
  ink: '#F8FAFC', muted: '#94A3B8', faint: '#64748B', line: 'rgba(248,250,252,.14)',
  gold: '#FFD600', brass: '#FFD600', section: '#5B6573',
  glass: 'rgba(15,23,42,.42)', glassEdge: 'rgba(248,250,252,.14)',
  flow: { air: '#00E5FF', fuel: '#FFAB00', comp: '#9d8dff', power: '#FF6D00', exhaust: '#9aa3ad', oil: '#d08a3c', brass: '#FFD600', section: '#5B6573' },
};
export const TYPE = {
  display: "'Inter', 'SF Pro Display', sans-serif",
  text: "'Inter', 'SF Pro Display', sans-serif",
};
/** Film-specific materials [colour, metalness, roughness]: matte graphite housings, brushed-steel moving parts. */
export const LOOK: Record<string, [string, number, number]> = {
  block: ['#4a5058', .35, .62], head: ['#555b63', .4, .56], liner: ['#8a9199', .7, .34], gasket: ['#3a3f46', .6, .5],
  cover: ['#24282e', .55, .42], pan: ['#383d44', .5, .52], intake: ['#262a30', .25, .55], filter: ['#1b1e22', .1, .8],
  piston: ['#d4d9de', .85, .26], rod: ['#a3abb4', .92, .24], crank: ['#b9c0c7', .95, .2], camshaft: ['#a8b0b8', .92, .24],
  intakevalve: ['#d6dce2', .9, .22], exhaustvalve: ['#b09a86', .8, .32], flywheel: ['#4d535b', .85, .3], exhaust: ['#6d625a', .6, .5],
};
/** Studio light rig, camera-relative (degrees around the camera→subject axis). Colour temperatures:
    key ≈ 4500 K warm neutral, fill ≈ 6500 K cool, rim = crisp white backlight. */
export const RIG = {
  key: { color: '#FFDBBA', intensity: 1.55, az: 38, el: 52 },
  fill: { color: '#E6EEFF', intensity: .32, az: -62, el: 12 },
  rim: { color: '#FFFFFF', intensity: 2.4, az: 158, el: 38 },
  ambient: .08, env: .55,
};
export const FPS = 30;
export const SIZE = { w: 1920, h: 1080 };
/** Safe margins for graphics (title-safe ≈ 5%). */
export const SAFE = { x: 110, y: 72 };
/** Convert a 35 mm-equivalent focal length to the camera's vertical field of view (24 mm sensor height). */
export const mmToFov = (mm: number) => 2 * Math.atan(12 / mm) * 180 / Math.PI;
