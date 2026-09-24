/* =====================================================================
   Timeline: storyboard (data) + narration durations  →  resolved film.
   evaluate(frame) is a pure function: the same frame always yields the
   same engine state, camera and graphics — so frames render independently.
   ===================================================================== */
import { mod, clamp, lerp, DEG, crankPhi, cycleAngle, deriveEngine, VT } from '../../src/core/sim';
import { FPS, mmToFov } from './theme';

export type TimeRef = number | string;            // seconds, 'CUE', 'CUE+1.5', 'CUE-0.4', 'end', 'end-2'
export type Ease = 'linear' | 'inOut' | 'in' | 'out' | 'in2' | 'out2';
export type Key = { t: TimeRef; v: number; ease?: Ease };
export type Track = number | Key[];
export type ThetaKey = { t: TimeRef; run?: boolean; hold?: boolean; theta?: number; cycle?: number; phi?: number; cyl?: number; ease?: Ease; after?: number };
/** Camera key. `mm` = 35 mm-equivalent focal length (preferred over `fov`); `dof` = depth-of-field strength
    (max blur in px at infinity, 0 = deep focus); `focus` = what stays sharp (anchor / point / distance; default: target). */
export type CamKey = { t: TimeRef; az: number; pol: number; rad: number; target: [number, number, number] | string; fov?: number; mm?: number;
  dof?: number; focus?: string | [number, number, number] | number; ease?: Ease;
  /** lens shift: moves the subject across the frame without re-aiming, as fractions of frame width / height (+x right, +y up) */
  shift?: [number, number] };
/** Per-shot lighting / post cues (tracks): AO strength, bloom strength, key / fill / rim multipliers,
    shade (0 = pure ink line drawing on paper, 1 = fully shaded), grid (drafting dots), ink (line-work strength). */
export type LookSpec = { ao?: Track; bloom?: Track; key?: Track; fill?: Track; rim?: Track; shade?: Track; grid?: Track; ink?: Track };
export type Line = { id: string; text: string; cue?: string; cueEnd?: string; pause?: number };
export type Overlay = { type: string; from: TimeRef; to?: TimeRef; [k: string]: any };
export type EngineSpec = {
  explode?: Track | Record<string, Track>; cut?: Track; xray?: Track; slice?: { z: number; amount: Track };
  focusCyl?: number; focus?: Track; flow?: string; flowAmt?: Track; flowDim?: Track;
  charge?: { cyl: number; amount: Track }; gas?: Track;   // gas: in-cylinder gas volumes (film default 0 — shown only where narrated)
  fade?: Record<string, Track>; glow?: { part: string; cyl?: number; color?: string; amount: Track }[];
};
export type Shot = {
  id: string; scene: string; arch: string; lead?: number; tail?: number; minDur?: number;
  lines?: Line[]; cues?: Record<string, TimeRef>; dps?: number; startTheta?: number; theta?: ThetaKey[];
  camera: CamKey[]; engine?: EngineSpec; overlays?: Overlay[]; exposure?: Track;
  transition?: { type: 'dip' | 'cut'; dur?: number }; look?: LookSpec; drift?: number;
  audio?: { ambience?: Track; mech?: boolean; valveTicks?: number };
};
export type Manifest = { voice?: string; lines?: Record<string, { dur: number; file: string }> };
export type RLine = { id: string; text: string; start: number; end: number; file?: string };
export type RShot = Shot & { index: number; start: number; dur: number; cueT: Record<string, number>; lineT: RLine[];
  thetaKeys: { t: number; theta: number; m: number }[]; thetaAfter: number; theta0: number; eng: any };
export type GCamKey = { gt: number; az: number; pol: number; rad: number; fov: number; dof: number; target: any; focus: any; sx: number; sy: number };
export type Film = { shots: RShot[]; dur: number; frames: number; lines: RLine[]; cam: GCamKey[] };

/* ---------- easing & tracks ---------- */
export function ease(u: number, e: Ease = 'inOut') { u = clamp(u, 0, 1);
  switch (e) { case 'linear': return u; case 'in2': return u * u; case 'out2': return 1 - (1 - u) * (1 - u);
    case 'in': return u * u * u; case 'out': return 1 - Math.pow(1 - u, 3);
    default: return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; } }
export function T(shot: RShot | { cueT: Record<string, number>; dur: number }, ref: TimeRef): number {
  if (typeof ref === 'number') return ref;
  const m = /^([A-Za-z0-9_]+)\s*([+-]\s*[\d.]+)?$/.exec(ref.trim()); if (!m) throw new Error('Bad time ref ' + ref);
  const base = m[1] === 'end' ? shot.dur : m[1] === 'start' ? 0 : shot.cueT[m[1]];
  if (base == null) throw new Error(`Unknown cue "${m[1]}" in shot`); return base + (m[2] ? parseFloat(m[2].replace(/\s/g, '')) : 0);
}
export function track(shot: RShot, tr: Track | undefined, t: number, dflt = 0): number {
  if (tr == null) return dflt; if (typeof tr === 'number') return tr; if (!tr.length) return dflt;
  const ks = tr.map(k => ({ t: T(shot, k.t), v: k.v, e: k.ease }));
  if (t <= ks[0].t) return ks[0].v;
  for (let i = 1; i < ks.length; i++) if (t <= ks[i].t) { const a = ks[i - 1], b = ks[i]; const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1; return lerp(a.v, b.v, ease(u, b.e)); }
  return ks[ks.length - 1].v;
}
/** Helper: a 0→1 (or custom) ramp starting at `cue`+off, lasting dur. */
export const ramp = (cue: string, off: number, dur: number, from = 0, to = 1, e: Ease = 'inOut'): Key[] =>
  [{ t: `${cue}${off >= 0 ? '+' : '-'}${Math.abs(off)}`, v: from }, { t: `${cue}${off + dur >= 0 ? '+' : '-'}${Math.abs(off + dur)}`, v: to, ease: e }];
/** Helper: rise then fall (e.g. a glow while a word is spoken). */
export const pulse = (cue: string, off: number, hold: number, peak = 1, fade = .45): Key[] =>
  [{ t: `${cue}${off >= 0 ? '+' : '-'}${Math.abs(off)}`, v: 0 }, { t: `${cue}+${off + fade}`, v: peak }, { t: `${cue}+${off + fade + hold}`, v: peak }, { t: `${cue}+${off + 2 * fade + hold}`, v: 0 }];

/* ---------- building the film ---------- */
const estimate = (text: string) => .35 + text.split(/\s+/).length / 2.55;
export function buildFilm(storyboard: Shot[], manifest: Manifest): Film {
  let start = 0, theta = storyboard[0]?.startTheta ?? 0, vin = storyboard[0]?.dps ?? 90; const shots: RShot[] = []; const all: RLine[] = [];
  storyboard.forEach((s, index) => {
    const eng = deriveEngine(s.arch);
    const cueT: Record<string, number> = {}; const lineT: RLine[] = []; let t = s.lead ?? .6;
    for (const ln of s.lines ?? []) {
      const m = manifest.lines?.[ln.id]; const d = m?.dur ?? estimate(ln.text);
      if (ln.cue) cueT[ln.cue] = t; lineT.push({ id: ln.id, text: ln.text, start: t, end: t + d, file: m?.file });
      t += d; if (ln.cueEnd) cueT[ln.cueEnd] = t; t += ln.pause ?? .45;
    }
    const dur = Math.max(s.minDur ?? 0, t - (s.lines?.length ? (s.lines[s.lines.length - 1].pause ?? .45) : 0) + (s.tail ?? 1.2));
    const r: RShot = { ...s, index, start, dur, cueT, lineT, thetaKeys: [], thetaAfter: s.dps ?? 90, theta0: s.startTheta ?? theta, eng };
    for (const k in s.cues ?? {}) cueT[k] = T(r, s.cues![k]);
    resolveTheta(r, vin); theta = thetaAt(r, dur); vin = (thetaAt(r, dur) - thetaAt(r, dur - .01)) / .01;
    for (const l of lineT) all.push({ ...l, start: l.start + start, end: l.end + start });
    shots.push(r); start += dur;
  });
  // One continuous camera path for the whole film: keys from every shot on a single global timeline.
  const cam: GCamKey[] = [];
  for (const s of shots) for (const k of s.camera) {
    const g = { gt: s.start + T(s, k.t), az: k.az, pol: k.pol, rad: k.rad, fov: k.mm ? mmToFov(k.mm) : (k.fov ?? 30), dof: k.dof ?? 0, target: k.target, focus: k.focus ?? null, sx: k.shift?.[0] ?? 0, sy: k.shift?.[1] ?? 0 };
    const last = cam[cam.length - 1]; if (last && g.gt - last.gt < 1e-3) cam[cam.length - 1] = g; else cam.push(g);
  }
  return { shots, dur: start, frames: Math.round(start * FPS), lines: all, cam };
}

/* Monotone cubic (Fritsch–Carlson) through the camera keys: continuous velocity through every key,
   no overshoot, and a natural ease-in/ease-out wherever the motion reverses or holds. */
function monoSpline(ts: number[], vs: number[], t: number) {
  const n = ts.length; if (n === 1 || t <= ts[0]) return vs[0]; if (t >= ts[n - 1]) return vs[n - 1];
  let i = 0; while (i < n - 2 && t > ts[i + 1]) i++;
  const d = (j: number) => (vs[j + 1] - vs[j]) / Math.max(1e-6, ts[j + 1] - ts[j]);
  const tan = (j: number) => { if (j === 0 || j === n - 1) return 0; const a = d(j - 1), b = d(j); if (a * b <= 0) return 0;
    const m = (a + b) / 2; return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.min(Math.abs(a), Math.abs(b))); };
  const h = ts[i + 1] - ts[i], u = (t - ts[i]) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * tan(i) + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * tan(i + 1);
}
/** Continuous micro-drift: a slow, never-repeating orbital float so no frame is ever locked off. */
function drift(gt: number, amt: number) {
  const s = (p: number, ph: number) => Math.sin(2 * Math.PI * gt / p + ph);
  return { az: amt * (1.1 * s(23, 0) + .45 * s(9.7, 1.3)), pol: amt * (.5 * s(17, 2.1) + .2 * s(7.3, .4)), rad: 1 + amt * (.011 * s(13, .8) + .004 * s(5.9, 2.6)) };
}
export function cameraAt(film: Film, gt: number, driftAmt = 1) {
  const K = film.cam, ts = K.map(k => k.gt), ch = (f: (k: GCamKey) => number) => monoSpline(ts, K.map(f), gt);
  let i = 0; while (i < K.length - 2 && gt > K[i + 1].gt) i++;
  const a = K[i], b = K[Math.min(i + 1, K.length - 1)], u = clamp((gt - a.gt) / Math.max(1e-6, b.gt - a.gt), 0, 1);
  const arr = K.every(k => Array.isArray(k.target));
  const target = arr ? [0, 1, 2].map(j => ch(k => (k.target as number[])[j])) : null;
  const dr = drift(gt, driftAmt);
  return { az: ch(k => k.az) + dr.az, pol: ch(k => k.pol) + dr.pol, rad: ch(k => k.rad) * dr.rad, fov: ch(k => k.fov), dof: Math.max(0, ch(k => k.dof)), shift: [ch(k => k.sx), ch(k => k.sy)] as [number, number],
    target, ta: a.target, tb: b.target, u: ease(u), fa: a.focus, fb: b.focus };
}

/* Crank angle: keys either "run" at the shot's speed, "hold", or land exactly on a mechanical event
   (a cycle angle / crank angle of a given cylinder) at a given time or cue. Among the occurrences of
   that event the one nearest the natural running position is chosen. Between keys θ(t) is a monotone
   cubic Hermite spline (Fritsch–Carlson): speed is continuous, including across shot boundaries,
   and the engine never runs backwards. */
function resolveTheta(s: RShot, vin: number) {
  const dps = s.dps ?? 90; const keys: { t: number; theta: number; m: number }[] = [{ t: 0, theta: s.theta0, m: 0 }];
  const spec = (s.theta ?? []).map(k => ({ ...k, tt: T(s, k.t) })).sort((a, b) => a.tt - b.tt);
  let v = vin, after = dps;
  spec.forEach((k, j) => {
    const prev = keys[keys.length - 1], dt = Math.max(0, k.tt - prev.t);
    const vout = spec[j + 1]?.hold || k.hold || k.after === 0 ? 0 : dps, natural = prev.theta + (v + vout) / 2 * dt;
    let th: number;
    if (k.hold) th = prev.theta;
    else if (k.run) th = natural;
    else if (k.theta != null) th = k.theta;
    else {
      const c = s.eng.cyls[k.cyl ?? 0]; const period = k.cycle != null ? 720 : 360; const want = k.cycle != null ? k.cycle : k.phi!;
      const cur = k.cycle != null ? (x: number) => cycleAngle(c, x) : (x: number) => mod(crankPhi(c, x), 360);
      const base = natural - mod(cur(natural) - want, period);
      const cands = [base, base + period].filter(x => x >= prev.theta - 1e-6);
      th = cands.length ? cands.reduce((a, b) => Math.abs(a - natural) <= Math.abs(b - natural) ? a : b) : base + period;
    }
    keys.push({ t: k.tt, theta: th, m: 0 }); v = vout; after = k.after ?? (k.hold ? 0 : dps);
  });
  if (!spec.length && Math.abs(vin - dps) > 1) { const tb = Math.min(2.5, s.dur / 2); keys.push({ t: tb, theta: s.theta0 + (vin + dps) / 2 * tb, m: 0 }); after = dps; }
  // tangents: incoming speed at the start, outgoing speed at the end, Fritsch–Carlson in between
  const n = keys.length; if (n > 1) {
    const d = keys.slice(1).map((k, i) => (k.theta - keys[i].theta) / Math.max(1e-6, k.t - keys[i].t));
    keys[0].m = vin; keys[n - 1].m = after;
    for (let i = 1; i < n - 1; i++) keys[i].m = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { keys[i].m = 0; keys[i + 1].m = 0; continue; }
      const a = keys[i].m / d[i], b = keys[i + 1].m / d[i], h = a * a + b * b; if (h > 9) { const tau = 3 / Math.sqrt(h); keys[i].m = tau * a * d[i]; keys[i + 1].m = tau * b * d[i]; } }
  } else keys[0].m = after;
  s.thetaKeys = keys as any; s.thetaAfter = after;
}
export function thetaAt(s: RShot, t: number) {
  const ks = s.thetaKeys as any as { t: number; theta: number; m: number }[];
  for (let i = 1; i < ks.length; i++) if (t <= ks[i].t) { const a = ks[i - 1], b = ks[i], h = b.t - a.t; if (h <= 1e-9) return b.theta;
    const u = (t - a.t) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a.theta + (u3 - 2 * u2 + u) * h * a.m + (-2 * u3 + 3 * u2) * b.theta + (u3 - u2) * h * b.m; }
  const l = ks[ks.length - 1]; return l.theta + s.thetaAfter * (t - l.t);
}

/* ---------- evaluating one frame ---------- */
export type FrameState = {
  shot: RShot; t: number; gt: number; frame: number; theta: number;
  engine: any; cam: ReturnType<typeof cameraAt>; look: { ao: number; bloom: number; key: number; fill: number; rim: number; shade: number; grid: number; ink: number };
  overlays: { ov: Overlay; t: number; alpha: number; from: number; to: number }[];
  dip: number; exposure: number; floorDrop: number; line?: RLine;
};
export function evaluate(film: Film, frame: number): FrameState {
  const gt = frame / FPS; let s = film.shots[film.shots.length - 1];
  for (const sh of film.shots) if (gt < sh.start + sh.dur) { s = sh; break; }
  const t = gt - s.start, theta = thetaAt(s, t), E = s.engine ?? {};
  let explode: any = 0;
  if (E.explode != null) { if (typeof E.explode === 'number' || Array.isArray(E.explode)) explode = track(s, E.explode as Track, t);
    else { explode = {}; for (const k in E.explode) explode[k] = track(s, (E.explode as any)[k], t); } }
  const fade: Record<string, number> = {}; for (const k in E.fade ?? {}) fade[k] = track(s, E.fade![k], t, 1);
  const engine = {
    theta, explode, cut: track(s, E.cut, t), xray: track(s, E.xray, t),
    slice: E.slice ? { z: E.slice.z, amount: track(s, E.slice.amount, t) } : null,
    focusCyl: E.focusCyl, focus: track(s, E.focus, t), flow: E.flow ?? 'off', flowAmt: track(s, E.flowAmt, t, 1), flowDim: track(s, E.flowDim, t, 0),
    charge: E.charge ? { cyl: E.charge.cyl, amount: track(s, E.charge.amount, t) } : null, gas: track(s, E.gas, t, 0),
    fade, glow: (E.glow ?? []).map(g => ({ part: g.part, cyl: g.cyl, color: g.color, amount: track(s, g.amount, t) })).filter(g => g.amount > .001),
  };
  // camera
  const cam = cameraAt(film, gt, s.drift ?? 1);
  const Lk = s.look ?? {};
  const look = { ao: track(s, Lk.ao, t, 1), bloom: track(s, Lk.bloom, t, .2), key: track(s, Lk.key, t, 1), fill: track(s, Lk.fill, t, 1), rim: track(s, Lk.rim, t, 1),
    shade: track(s, Lk.shade, t, 1), grid: track(s, Lk.grid, t, 1), ink: track(s, Lk.ink, t, 1) };
  // overlays
  const overlays = (s.overlays ?? []).map(ov => { const from = T(s, ov.from), to = ov.to != null ? T(s, ov.to) : s.dur; const f = ov.fade ?? .45;
    return { ov, t: t - from, from, to, alpha: clamp(Math.min((t - from) / f, (to - t) / f), 0, 1) }; }).filter(o => o.t >= -.001 && t <= o.to);
  // dips to black between shots and at the film edges
  let dip = 0; const nx = film.shots[s.index + 1];
  if (s.transition?.type === 'dip') { const d = (s.transition.dur ?? 1) / 2; if (t < d) dip = Math.max(dip, 1 - t / d); }
  if (nx?.transition?.type === 'dip') { const d = (nx.transition.dur ?? 1) / 2; if (t > s.dur - d) dip = Math.max(dip, (t - (s.dur - d)) / d); }
  if (s.index === 0) dip = Math.max(dip, 1 - t / 1.2); if (!nx) dip = Math.max(dip, (t - (s.dur - 1.4)) / 1.4);
  const line = s.lineT.find(l => t >= l.start && t <= l.end + .25);
  const floorDrop = typeof explode === 'number' ? explode * 2.6 : (explode.pan ?? 0) * 2.6;
  return { shot: s, t, gt, frame, theta, engine, cam, look, overlays, dip: clamp(dip, 0, 1), exposure: track(s, s.exposure, t, 1), floorDrop, line };
}

/* ---------- events for sound design (sampled from the same pure functions) ---------- */
export function soundEvents(film: Film) {
  const ev: any[] = []; const step = 1 / 240;
  for (const s of film.shots) {
    const mech = s.audio?.mech !== false;
    for (let t = 0; t < s.dur; t += step) {
      const t2 = Math.min(s.dur, t + step), a = thetaAt(s, t), b = thetaAt(s, t2); if (b <= a) continue;
      for (const c of s.eng.cyls) {
        const ca = a - c.off, cb = b - c.off; const cross = (ang: number) => Math.floor((cb - ang) / 720) > Math.floor((ca - ang) / 720);
        if (mech && cross(VT.SPARK)) ev.push({ type: 'fire', t: s.start + t2, cyl: c.n, rate: (b - a) / step });
        if (s.audio?.valveTicks != null && c === s.eng.cyls[s.audio.valveTicks] && (cross(VT.IVO) || cross(VT.IVC) || cross(VT.EVO) || cross(VT.EVC))) ev.push({ type: 'valve', t: s.start + t2 });
      }
    }
    const E = s.engine ?? {};
    const scan = (tr: any, name: string) => { if (!Array.isArray(tr)) return; const ks = tr.map((k: Key) => ({ t: T(s, k.t), v: k.v }));
      for (let i = 1; i < ks.length; i++) { const d = ks[i].v - ks[i - 1].v; if (Math.abs(d) < .5) continue;
        ev.push({ type: d > 0 ? 'lift' : 'land', t: s.start + (d > 0 ? ks[i - 1].t : ks[i].t), dur: ks[i].t - ks[i - 1].t, layer: name }); } };
    if (E.explode && !Array.isArray(E.explode) && typeof E.explode === 'object') for (const k in E.explode) scan((E.explode as any)[k], k); else scan(E.explode, 'all');
    if (Array.isArray(E.cut)) scan(E.cut, 'cut'); if (E.slice) scan(E.slice.amount, 'slice');
    for (const ov of s.overlays ?? []) { const t0 = s.start + T(s, ov.from);
      if (ov.type === 'label') ev.push({ type: 'tick', t: t0 }); else if (ov.type === 'title' || ov.type === 'endCard') ev.push({ type: 'hit', t: t0 });
      else if (ov.type === 'chain' || ov.type === 'callouts') for (const it of ov.items) ev.push({ type: 'tick', t: s.start + T(s, it.at) }); }
    for (let t = 0; t < s.dur; t += .1) ev.push({ type: 'amb', t: s.start + t, v: track(s, s.audio?.ambience, t, .4) });
  }
  return ev.sort((x, y) => x.t - y.t);
}
