/* Per-layout sound settings and the config message the synthesizer expects.
   Shared by the app, the tests and the offline render harness. Pipe lengths are metres of exhaust per bank;
   body is the block's main thump frequency (Hz); tone is the final low-pass cutoff (Hz). */
export const SOUND_TUNE = {
  single: { pipes: [1.25], refl: -0.74, body: 58, tone: 2300, exhaust: 1.9, fire: 1.8, intake: 1.4 },
  i4:     { pipes: [0.95], refl: -0.70, body: 96, tone: 3200, exhaust: 1, fire: 0.9, intake: 1 },
  i6:     { pipes: [1.05], refl: -0.70, body: 84, tone: 3000, exhaust: 1, fire: 0.85, intake: 1 },
  v6:     { pipes: [0.9, 0.95], refl: -0.70, body: 90, tone: 3000, width: 0.5, exhaust: 1, fire: 0.85, intake: 1 },
  v8:     { pipes: [1.05, 1.1], refl: -0.72, body: 70, tone: 2600, width: 0.6, exhaust: 1.05, fire: 0.9, intake: 1 },
  flat6:  { pipes: [0.72, 0.75], refl: -0.68, body: 104, tone: 3600, width: 0.6, exhaust: 0.95, fire: 0.8, intake: 1 },
};
/** Config message for an engine from deriveEngine(): firing offsets, exhaust bank and stereo position per cylinder. */
export function soundConfig(engine, vt) {
  const cyls = engine.cyls, zs = cyls.map(c => c.z), z0 = Math.min(...zs), z1 = Math.max(...zs), twoBanks = engine.banks.length > 1;
  return {
    type: 'config', vt: { IVO: vt.IVO, IVC: vt.IVC, EVO: vt.EVO, EVC: vt.EVC, SPARK: vt.SPARK }, tune: SOUND_TUNE[engine.key],
    cyls: cyls.map(c => ({ off: c.off, bank: twoBanks ? c.b : 0,
      pan: twoBanks ? (c.b ? 0.45 : -0.45) : (z1 > z0 ? ((c.z - z0) / (z1 - z0) - 0.5) * 0.6 : 0) })),
  };
}
