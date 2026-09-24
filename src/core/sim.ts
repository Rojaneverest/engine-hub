/* =====================================================================
   Engine simulation core — pure, deterministic functions.
   Shared by the interactive app and the video. Everything is a function
   of crank angle; nothing depends on wall-clock time or Math.random.
   ===================================================================== */
import { ARCHS, VT, PHASES } from './content';
export { ARCHS, VT, PHASES };

export const DEG = Math.PI / 180;
export const mod = (a: number, n: number) => ((a % n) + n) % n;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);

/* Scene geometry (1 unit ≈ 100 mm). Stroke 86 mm, rod 145 mm. */
export const G: any = { r: .43, L: 1.45, crown: .22, skirt: .24, pistonR: .405, boreR: .42, deck: 2.12, headBot: 2.15, headTop: 2.52,
  coverTop: 3.42, valveX: .24, camBase: .1, maxLift: .12, stemTop: 2.87, tappetH: .1 };
G.camY = G.stemTop + G.tappetH + G.camBase;

/** Slider-crank: distance crank centre → wrist pin at crank angle phi (deg, 0 = TDC). */
export function pistonS(phi: number, r = G.r, L = G.L) { const p = phi * DEG, sn = Math.sin(p); return r * Math.cos(p) + Math.sqrt(L * L - r * r * sn * sn); }
/** ds/dφ per radian (negative while the piston moves down). Its magnitude is the effective lever arm. */
export function dsdphi(phi: number, r = G.r, L = G.L) { const p = phi * DEG, sn = Math.sin(p), cs = Math.cos(p); return -r * sn - (r * r * sn * cs) / Math.sqrt(L * L - r * r * sn * sn); }
/** Rod angle from the cylinder axis (radians). */
export function rodAngle(phi: number, r = G.r, L = G.L) { return Math.asin(r * Math.sin(phi * DEG) / L); }
export function sweptFrac(c: number) { return ((G.r + G.L) - pistonS(c)) / (2 * G.r); }

/** Normalised valve lift 0..1 for an event from o to cl (cycle degrees, wraps through 720). */
export function liftN(c: number, o: number, cl: number) { const dur = mod(cl - o, 720), t = mod(c - o, 720); if (t >= dur) return 0; const s = Math.sin(Math.PI * t / dur); return s * s; }
export const intakeLift = (c: number) => liftN(c, VT.IVO, VT.IVC);
export const exhaustLift = (c: number) => liftN(c, VT.EVO, VT.EVC);
export const IC = mod(VT.IVO + mod(VT.IVC - VT.IVO, 720) / 2, 720);
export const EC = mod(VT.EVO + mod(VT.EVC - VT.EVO, 720) / 2, 720);

/* Conceptual cylinder pressure (bar, full throttle): polytropic compression + Wiebe-style burn. */
export const CR = 10.5, VCL = 1 / (CR - 1);
export function burnFrac(c: number) { if (c < VT.SPARK) return 0; const x = (c - VT.SPARK) / 60; return x >= 1 ? 1 : 1 - Math.exp(-5 * x * x * x); }
const V_IVC = VCL + sweptFrac(VT.IVC);
export const cylVolume = (c: number) => VCL + sweptFrac(c);           // relative (swept = 1)
const motored = (c: number) => Math.pow(V_IVC / cylVolume(c), 1.3);
export function pressure(c: number) { c = mod(c, 720);
  if (c < VT.IVC) return 1;
  if (c < VT.EVO) return motored(c) * (1 + 3 * burnFrac(c));
  if (c < 540) { const pe = motored(VT.EVO) * 4; return 1.1 + (pe - 1.1) * Math.exp(-(c - VT.EVO) / 10); }
  return 1.1; }
export const phaseOf = (c: number) => PHASES[Math.floor(mod(c, 720) / 180)];

/** Derive a runnable engine: firing offsets from the firing order; crankpin angles forced by geometry. */
export function deriveEngine(key: string) {
  const a = ARCHS[key], N = a.cyl.length;
  const cyls = a.cyl.map((c: any) => { const k = a.firing.indexOf(c.n), off = 720 * k / N, bank = a.banks[c.b];
    return { n: c.n, b: c.b, z: c.z, bank, off, throw: mod(bank - off, 360) }; }).sort((x: any, y: any) => x.n - y.n);
  const zs = cyls.map((c: any) => c.z);
  return { key, a, cyls, N, zmin: Math.min(...zs), zmax: Math.max(...zs), banks: a.banks } as any;
}
export const cycleAngle = (cyl: any, theta: number) => mod(theta - cyl.off, 720);
export const crankPhi = (cyl: any, theta: number) => theta + cyl.throw - cyl.bank;
export function cylTorque(c: any, theta: number) { const cc = mod(theta - c.off, 720), phi = theta + c.throw - c.bank; return (pressure(cc) - 1) * (-dsdphi(phi)); }
export function gasTorque(eng: any, theta: number) { let T = 0; for (const c of eng.cyls) T += cylTorque(c, theta); return T; }

/* ---- Determinism helpers ---- */
export function rng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hash01(x: number) { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

/** Cumulative integral of a 720°-periodic function f over cycle angle, as a closed form F(θ) usable for any θ
    (including negative / multiple cycles). Lets flow particles be a pure function of crank angle. */
export function cumulative(f: (c: number) => number, step = 1) {
  const n = 720 / step, tab = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) tab[i] = tab[i - 1] + (f((i - .5) * step)) * step;
  const total = tab[n];
  return (theta: number) => { const k = Math.floor(theta / 720), c = theta - k * 720, i = Math.floor(c / step), fr = (c - i * step) / step;
    return k * total + tab[i] + (tab[Math.min(i + 1, n)] - tab[i]) * fr; };
}
export const intakeLiftInt = cumulative(intakeLift);
export const exhaustLiftInt = cumulative(c => exhaustLift(c) * (c > VT.EVO && c < 560 ? 1.8 : 1));
export const injectInt = cumulative(c => (c >= VT.INJ0 && c <= VT.INJ1 ? 1 : 0));
