/* Motion-graphics kit — "the engineering drawing that comes alive".
   Every component is a pure function of (frame state, overlay spec, local time).
   3D-anchored graphics read positions from the world, which has already been posed for this frame.

   House style: ink on drafting paper. Barlow Condensed for display and callouts, Barlow for reading text.
   Hairline ink leaders with a ringed terminal, numbered callouts in a margin column beside the subject
   (laid out so they never collide), vermilion reserved for figure numbers and force/heat. Text never sits
   on the hardware: annotations live in the margins and point in. Entrances are short draw-ons + fade-rise. */
import React from 'react';
import * as THREE from 'three';
import { PALETTE, TYPE, SIZE, SAFE, FPS } from '../film/theme';
import { ease, T, FrameState } from '../film/timeline';
import { World } from '../three/world';
import { G, DEG, mod, clamp, dsdphi, cycleAngle, intakeLift, exhaustLift, VT, PHASES } from '../../src/core/sim';

type OV = { ov: any; t: number; alpha: number; from: number; to: number };
type P = { o: OV; fs: FrameState; world: World };
const ENTER = 14 / FPS;
const k01 = (t: number, d = ENTER) => ease(clamp(t / d, 0, 1), 'out');
const at = (fs: FrameState, ref: any) => T(fs.shot, ref);
const INK = PALETTE.ink, MUTED = PALETTE.muted, ACC = PALETTE.accent, HEAT = PALETTE.flow.power, PAPER = PALETTE.paper;
/** A paper-coloured halo keeps ink text legible wherever it crosses a line. */
const HALO = `0 0 3px ${PAPER}, 0 0 6px ${PAPER}, 0 0 10px ${PAPER}`;
const SVG_HALO: React.CSSProperties = { paintOrder: 'stroke', stroke: PAPER, strokeWidth: 6, strokeLinejoin: 'round' } as any;

/** Fade + rise over 14 frames (optionally delayed). */
const enter = (t: number, delay = 0, dist = 12): React.CSSProperties => { const k = k01(t - delay);
  return { opacity: k, transform: `translateY(${(1 - k) * dist}px)` }; };
/** SVG line-draw: dash a path of approximate length `len` so it draws on as k goes 0 → 1. */
const draw = (k: number, len: number) => ({ strokeDasharray: `${len} ${len}`, strokeDashoffset: (1 - k) * len });
const kicker: React.CSSProperties = { fontFamily: TYPE.display, fontWeight: 600, fontSize: 22, letterSpacing: 5, textTransform: 'uppercase' };
const fig = (n: number) => 'Fig. ' + String(n).padStart(2, '0');

/* ------------------------------------------------------------------ titles */
export const Title: React.FC<P> = ({ o }) => { const t = o.t, rule = k01(t - .2, .9), lines: string[] = o.ov.lines ?? [o.ov.title];
  return <div style={{ position: 'absolute', left: SAFE.x + 20, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: o.alpha, whiteSpace: 'nowrap' }}>
    <div style={{ ...enter(t), ...kicker, color: ACC, display: 'flex', alignItems: 'center', gap: 16 }}>
      <span style={{ width: 12, height: 12, background: ACC, display: 'inline-block' }} />{o.ov.kicker}</div>
    <svg width={560} height={18} style={{ margin: '20px 0 18px', overflow: 'visible' }}><line x1={0} y1={9} x2={560 * rule} y2={9} stroke={INK} strokeWidth={1.5} /></svg>
    {lines.map((l, i) => <div key={i} style={{ ...enter(t, .18 + i * .1, 18), fontFamily: TYPE.display, fontWeight: 700, fontSize: 106, lineHeight: .98, color: INK, letterSpacing: -1.5, textShadow: HALO }}>{l}</div>)}
    {o.ov.sub && <div style={{ ...enter(t, .55), fontFamily: TYPE.text, fontWeight: 500, fontSize: 28, color: MUTED, marginTop: 26, letterSpacing: .2, textShadow: HALO }}>{o.ov.sub}</div>}
  </div>; };

export const EndCard: React.FC<P> = ({ o }) => { const t = o.t, rule = k01(t - .3, .9), lines: string[] = o.ov.lines ?? [o.ov.title];
  return <div style={{ position: 'absolute', inset: 0, opacity: o.alpha, background: `rgba(241,238,231,${.78 * k01(t, 1)})` }}>
    <div style={{ position: 'absolute', left: SAFE.x + 20, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', whiteSpace: 'nowrap' }}>
      <div style={{ ...enter(t), ...kicker, color: ACC, display: 'flex', alignItems: 'center', gap: 16 }}><span style={{ width: 12, height: 12, background: ACC, display: 'inline-block' }} />{o.ov.kicker}</div>
      <svg width={560} height={18} style={{ margin: '20px 0 18px', overflow: 'visible' }}><line x1={0} y1={9} x2={560 * rule} y2={9} stroke={INK} strokeWidth={1.5} /></svg>
      {lines.map((l, i) => <div key={i} style={{ ...enter(t, .25 + i * .1, 16), fontFamily: TYPE.display, fontWeight: 700, fontSize: 88, lineHeight: 1, color: INK, letterSpacing: -1 }}>{l}</div>)}
    </div>
  </div>; };

/** Figure marker, top-left: "FIG. 02 ——— Inside the engine". */
export const Chapter: React.FC<P> = ({ o }) => { const t = o.t, rule = k01(t - .12, .6);
  return <div style={{ position: 'absolute', left: SAFE.x, top: SAFE.y, opacity: o.alpha, display: 'flex', alignItems: 'baseline', gap: 18, ...enter(t) }}>
    <span style={{ ...kicker, fontSize: 24, color: ACC, letterSpacing: 3 }}>{fig(o.ov.num)}</span>
    <svg width={56} height={2} style={{ alignSelf: 'center' }}><line x1={0} y1={1} x2={56 * rule} y2={1} stroke={INK} strokeWidth={1.5} /></svg>
    <span style={{ fontFamily: TYPE.display, fontWeight: 600, fontSize: 44, color: INK, letterSpacing: -.3, textShadow: HALO }}>{o.ov.title}</span>
  </div>; };

/** Cause → effect chain in the top margin (or the bottom one with `position: 'bottom'`). */
export const Chain: React.FC<P> = ({ o, fs }) => {
  const items = o.ov.items.map((it: any) => ({ ...it, lt: fs.t - at(fs, it.at) }));
  const pos: React.CSSProperties = o.ov.position === 'bottom' ? { bottom: SAFE.y + 6 } : { top: SAFE.y - 8 };
  return <div style={{ position: 'absolute', left: SAFE.x, ...pos, display: 'flex', alignItems: 'center', opacity: o.alpha }}>
    {items.map((it: any, i: number) => { const k = k01(it.lt, .5);
      return <React.Fragment key={i}>
        {i > 0 && <svg width={70} height={22} style={{ margin: '0 16px', overflow: 'visible' }}>
          <line x1={2} y1={11} x2={2 + 58 * k} y2={11} stroke={INK} strokeWidth={1.75} />
          <path d={`M${56 * k - 4},4 L${60 * k + 3},11 L${56 * k - 4},18`} fill="none" stroke={INK} strokeWidth={1.75} opacity={k} />
        </svg>}
        <span style={{ ...enter(it.lt), fontFamily: TYPE.display, fontWeight: 600, fontSize: 50, letterSpacing: -.4, color: it.color ?? INK, textShadow: HALO, display: 'inline-block' }}>{it.text}</span>
      </React.Fragment>; })}
  </div>; };

/* ------------------------------------------------------------------ margin annotation layout */
type Note = { key: string; ax: number; ay: number; text: string; side: 1 | -1; alpha: number; color?: string; num?: number; dim?: boolean; draw?: number; size?: number };
/** Lay out notes in two margin columns beside the subject's screen box, resolving vertical overlaps per column
    (order follows the anchors, so notes never cross), then draw leaders anchor → elbow → text. */
function MarginNotes({ notes, box, gap = 62, colPad = 70 }: { notes: Note[]; box: { x0: number; x1: number; y0: number; y1: number }; gap?: number; colPad?: number }) {
  const out: React.ReactNode[] = [];
  for (const side of [-1, 1] as const) {
    const col = notes.filter(n => n.side === side).sort((a, b) => a.ay - b.ay);
    if (!col.length) continue;
    const cx = side > 0 ? Math.min(box.x1 + colPad, SIZE.w - SAFE.x - 360) : Math.max(box.x0 - colPad, SAFE.x + 360);
    const ys = col.map(n => n.ay);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
    const over = ys[ys.length - 1] - (SIZE.h - SAFE.y - 20); if (over > 0) for (let i = 0; i < ys.length; i++) ys[i] -= over;
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
    const top = SAFE.y + 90 - ys[0]; if (top > 0) for (let i = 0; i < ys.length; i++) ys[i] += top;
    col.forEach((n, i) => {
      const y = ys[i], ex = cx - side * 34, k = n.draw ?? 1, a = n.alpha * (n.dim ? .42 : 1), col2 = n.color ?? INK;
      const len = Math.hypot(ex - n.ax, y - n.ay) + 34;
      out.push(<g key={n.key} opacity={a}>
        <circle cx={n.ax} cy={n.ay} r={6} fill="none" stroke={col2} strokeWidth={1.5} style={SVG_HALO as any} />
        <circle cx={n.ax} cy={n.ay} r={2.2} fill={col2} />
        <polyline points={`${n.ax + side * 6},${n.ay} ${ex},${y} ${cx},${y}`} fill="none" stroke={col2} strokeWidth={1.5} style={draw(k, len)} />
        {n.num != null && <g opacity={k > .98 ? 1 : 0}>
          <circle cx={cx + side * 18} cy={y} r={17} fill={PAPER} stroke={col2} strokeWidth={1.5} />
          <text x={cx + side * 18} y={y + 7} textAnchor="middle" fontFamily={TYPE.display} fontWeight={600} fontSize={21} fill={col2}>{n.num}</text></g>}
        <text x={cx + side * (n.num != null ? 46 : 12)} y={y + 10} textAnchor={side > 0 ? 'start' : 'end'} fontFamily={TYPE.display} fontWeight={600} fontSize={n.size ?? 34}
          letterSpacing={-.2} fill={col2} opacity={k01((k - .7) / .3 * ENTER)} style={SVG_HALO as any}>{n.text}</text>
      </g>);
    });
  }
  return <>{out}</>;
}

/** Numbered callouts for a set of parts. Items: { text, anchor, at, side? }. Only the newest is at full strength. */
export const Callouts: React.FC<P> = ({ o, fs, world }) => {
  const box = world.screenBox(), mid = (box.x0 + box.x1) / 2;
  const items = o.ov.items.map((it: any, i: number) => ({ ...it, i, st: at(fs, it.at) }));
  const shown = items.filter((it: any) => fs.t >= it.st); const newest = shown.reduce((m: number, it: any) => Math.max(m, it.st), -1e9);
  const notes: Note[] = [];
  for (const it of items) { const p = world.project(it.anchor); if (!p || !p.visible) continue; const lt = fs.t - it.st;
    notes.push({ key: it.anchor + it.i, ax: p.x, ay: p.y, text: it.text, side: it.side === 'left' ? -1 : it.side === 'right' ? 1 : (p.x > mid ? 1 : -1),
      alpha: lt < 0 ? 0 : 1, draw: k01(lt, .6), num: o.ov.numbered === false ? undefined : it.i + 1, dim: o.ov.focus !== false && it.st < newest - .01 }); }
  return <svg width={SIZE.w} height={SIZE.h} style={{ position: 'absolute', inset: 0, opacity: o.alpha, overflow: 'visible' }}>
    <MarginNotes notes={notes} box={box} gap={o.ov.gap ?? 64} />
  </svg>; };
/** Single callout (legacy spec shape): { text, anchor, side? }. */
export const Label: React.FC<P> = ({ o, fs, world }) => {
  const p = world.project(o.ov.anchor); if (!p || !p.visible) return null; const box = world.screenBox();
  const side = o.ov.side === 'left' ? -1 : o.ov.side === 'right' ? 1 : (p.x > (box.x0 + box.x1) / 2 ? 1 : -1);
  return <svg width={SIZE.w} height={SIZE.h} style={{ position: 'absolute', inset: 0, opacity: o.alpha, overflow: 'visible' }}>
    <MarginNotes notes={[{ key: 'l', ax: p.x, ay: p.y, text: o.ov.text, side, alpha: 1, draw: k01(o.t, .6), color: o.ov.color }]} box={box} />
  </svg>; };

/* ------------------------------------------------------------------ slider-crank */
/** Slider-crank explainer drawn over the sectioned cylinder, in exact registration with the 3D mechanism.
    Geometry (crank circle, rod line, lever arm, force arrows) sits on the mechanism; every word sits in the margins. */
export const SliderCrank: React.FC<P> = ({ o, fs, world }) => {
  const e = world.engine!; const cyl = e.cyl[o.ov.cyl ?? 0]; const t = fs.t;
  const C = e.anchor('crankcenter:' + cyl.i, new THREE.Vector3())!; const pr = (v: THREE.Vector3) => world.project(v)!;
  const A = (fs.theta + cyl.throw) * DEG, pinW = (a: number) => C.clone().add(new THREE.Vector3(G.r * Math.sin(a), G.r * Math.cos(a), 0));
  const c = pr(C), p = pr(pinW(A)), w = world.project('wristpin:' + cyl.i)!, crownW = e.anchor('piston:' + cyl.i, new THREE.Vector3())!;
  const vis = (from: any, to?: any) => { const f = at(fs, from); const tt = to != null ? at(fs, to) : 1e9; return clamp(Math.min((t - f) / ENTER, (tt - t) / ENTER), 0, 1); };
  const since = (from: any) => t - at(fs, from);
  const aTravel = vis(o.ov.travelAt), aCircle = vis(o.ov.circleAt), aRod = vis(o.ov.rodAt);
  const phi = mod(fs.theta + cyl.throw - cyl.bank, 360), down = phi > 4 && phi < 176;
  const aPush = Math.max(vis(o.ov.pushFrom, o.ov.pushTo) * (down ? 1 : 0), vis(o.ov.tdcFrom), 0);
  const aTdc = vis(o.ov.tdcFrom, o.ov.tdcTo), aLever = vis(o.ov.leverFrom);
  // crank circle as a projected polyline (exact under perspective); draws on
  let circ = '', clen = 0, prev: any = null; for (let i = 0; i <= 64; i++) { const q = pr(pinW(i / 64 * Math.PI * 2)); circ += (i ? 'L' : 'M') + q.x.toFixed(1) + ',' + q.y.toFixed(1); if (prev) clen += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
  // stroke bracket just outside the block on the intake side
  const tdcY = C.y + G.r + G.L + G.crown, bdcY = C.y - G.r + G.L + G.crown, bxW = C.clone().setX(C.x + cyl.is * .9);
  const bT = pr(bxW.clone().setY(tdcY)), bB = pr(bxW.clone().setY(bdcY));
  // lever arm: perpendicular distance from crank centre to the rod's line of action (screen space)
  const dx = p.x - w.x, dy = p.y - w.y, L2 = dx * dx + dy * dy, u = ((c.x - w.x) * dx + (c.y - w.y) * dy) / L2, fx = w.x + u * dx, fy = w.y + u * dy;
  const rScreen = Math.hypot(p.x - c.x, p.y - c.y), lev = Math.abs(dsdphi(phi)) / G.r;              // 0 at TDC, ~1 near 75°
  const p2 = pr(pinW(A + DEG)), dir = Math.sign((p2.x - c.x) * (p.y - c.y) - (p2.y - c.y) * (p.x - c.x)) || 1;
  const arcR = rScreen * 1.45, a0 = Math.atan2(p.y - c.y, p.x - c.x), sweep = dir * (.25 + 1.2 * lev);
  const arc = (r: number, s: number, e2: number) => { let d = ''; for (let i = 0; i <= 24; i++) { const a = s + (e2 - s) * i / 24; d += (i ? 'L' : 'M') + (c.x + r * Math.cos(a)).toFixed(1) + ',' + (c.y + r * Math.sin(a)).toFixed(1); } return d; };
  const aEnd = a0 + sweep, tip = { x: c.x + arcR * Math.cos(aEnd), y: c.y + arcR * Math.sin(aEnd) }, tang = { x: -Math.sin(aEnd) * dir, y: Math.cos(aEnd) * dir };
  const aTorque = Math.max(aPush * (lev > .06 ? 1 : 0), aLever) * clamp(lev * 3, 0, 1);
  const fTop = pr(crownW.clone().add(new THREE.Vector3(0, .6, 0))), fBot = pr(crownW.clone().add(new THREE.Vector3(0, .06, 0)));
  const tick = (q: any, i: number) => <g key={i}><line x1={q.x - 14} y1={q.y} x2={q.x + 14} y2={q.y} stroke={INK} strokeWidth={1.5} /><circle cx={q.x} cy={q.y} r={2.6} fill={INK} /></g>;
  // margin notes (the intake side is on screen-right in the face-on view; words go where the metal isn't)
  const box = world.screenBox(), sideOf = (x: number) => (x > (box.x0 + box.x1) / 2 ? 1 : -1) as 1 | -1, out = sideOf(bT.x);
  const notes: Note[] = [];
  const add = (key: string, a: number, ax: number, ay: number, text: string, side: 1 | -1, color?: string, drawK = 1) => { if (a > .001) notes.push({ key, ax, ay, text, side, alpha: a, color, draw: drawK }); };
  add('tdc', aTravel, bT.x, bT.y, 'Top dead centre', out, INK, k01(since(o.ov.travelAt), .5));
  add('bdc', aTravel, bB.x, bB.y, 'Bottom dead centre', out, INK, k01(since(o.ov.travelAt) - .2, .5));
  const pathPt = pr(pinW(-dir * Math.PI / 2 + Math.PI));
  add('path', aCircle, pathPt.x, pathPt.y, 'Crankpin path', sideOf(pathPt.x) as any, INK, k01(since(o.ov.circleAt) - .4, .5));
  add('rod', aRod * (1 - aLever), (w.x + p.x) / 2, (w.y + p.y) / 2, 'Connecting rod', -out as any, INK, k01(since(o.ov.rodAt) - .3, .5));
  add('gas', aPush, fTop.x, (fTop.y + fBot.y) / 2, 'Gas pressure', -out as any, HEAT, k01(since(o.ov.pushFrom) - .6, .5));
  add('tdcnote', aTdc, c.x, c.y - rScreen * .5, 'In line: no leverage', out, HEAT, k01(since(o.ov.tdcFrom), .5));
  add('lever', aLever * clamp(lev * 4, 0, 1), (c.x + fx) / 2, (c.y + fy) / 2, 'Lever arm', out, INK, k01(since(o.ov.leverFrom), .5));
  add('torque', aTorque * (aLever > .5 ? 1 : 0), tip.x, tip.y, 'Turning force', -out as any, HEAT, k01(since(o.ov.leverFrom) - .4, .5));
  return <svg width={SIZE.w} height={SIZE.h} style={{ position: 'absolute', inset: 0, opacity: o.alpha, overflow: 'visible' }}>
    <defs><marker id="ahH" markerWidth="12" markerHeight="12" refX="7" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,1 L11,6 L0,11z" fill={HEAT} /></marker></defs>
    <g opacity={aTravel}>
      <line x1={bT.x} y1={bT.y} x2={bB.x} y2={bB.y} stroke={INK} strokeWidth={1.5} strokeDasharray="4 5" style={draw(k01(since(o.ov.travelAt), .6), 400)} />
      {[bT, bB].map(tick)}
    </g>
    <g opacity={aCircle}>
      <path d={circ} fill="none" stroke={INK} strokeWidth={1.75} strokeDasharray="7 6" style={draw(k01(since(o.ov.circleAt), .9), clen + 2)} />
      <line x1={c.x} y1={c.y} x2={p.x} y2={p.y} stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={c.x} cy={c.y} r={4} fill={INK} /><circle cx={p.x} cy={p.y} r={8} fill="none" stroke={INK} strokeWidth={2} /><circle cx={p.x} cy={p.y} r={2.5} fill={INK} />
    </g>
    <g opacity={aRod}>
      <line x1={w.x} y1={w.y} x2={p.x} y2={p.y} stroke={INK} strokeWidth={2.5} strokeLinecap="round" style={draw(k01(since(o.ov.rodAt), .6), Math.sqrt(L2) + 2)} />
      <circle cx={w.x} cy={w.y} r={8} fill="none" stroke={INK} strokeWidth={2} /><circle cx={w.x} cy={w.y} r={2.5} fill={INK} />
    </g>
    <g opacity={aPush}>
      <line x1={fTop.x} y1={fTop.y} x2={fBot.x} y2={fBot.y - 10} stroke={HEAT} strokeWidth={4} markerEnd="url(#ahH)" />
    </g>
    <g opacity={aLever * clamp(lev * 4, 0, 1)}>
      <line x1={c.x} y1={c.y} x2={fx} y2={fy} stroke={INK} strokeWidth={1.75} strokeDasharray="4 4" />
      <rect x={fx - 6} y={fy - 6} width={12} height={12} fill="none" stroke={INK} strokeWidth={1.5} transform={`rotate(${Math.atan2(dy, dx) / DEG} ${fx} ${fy})`} />
    </g>
    <g opacity={aTorque}>
      <path d={arc(arcR, a0, aEnd)} fill="none" stroke={HEAT} strokeWidth={4} strokeLinecap="round" />
      <line x1={tip.x - tang.x * 2} y1={tip.y - tang.y * 2} x2={tip.x + tang.x * 6} y2={tip.y + tang.y * 6} stroke={HEAT} strokeWidth={4} markerEnd="url(#ahH)" />
    </g>
    <MarginNotes notes={notes} box={box} gap={58} colPad={60} />
  </svg>; };

/* ------------------------------------------------------------------ cycle ring */
/** 720° cycle ring drawn straight onto the paper: four strokes, valve events, and where cylinder N is right now. */
export const StrokeRing: React.FC<P> = ({ o, fs, world }) => {
  const cyl = world.engine!.cyl[o.ov.cyl ?? 0], c = cycleAngle(cyl, fs.theta);
  const W = 360, H = 400, cx = W / 2, cy = 216, R = 124;
  const ang = (d: number) => (-90 + d / 2) * DEG; const pt = (d: number, r: number) => [cx + r * Math.cos(ang(d)), cy + r * Math.sin(ang(d))];
  const arc = (d0: number, d1: number, r: number) => { let s = ''; const n = Math.max(2, Math.ceil(Math.abs(d1 - d0) / 6)); for (let i = 0; i <= n; i++) { const [x, y] = pt(d0 + (d1 - d0) * i / n, r); s += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1); } return s; };
  const ph = PHASES[Math.floor(c / 180)], col = (v: string) => (PALETTE.flow as any)[v.replace('--', '')] ?? INK;
  const [mx, my] = pt(c, R), li = intakeLift(c) > .003, le = exhaustLift(c) > .003, k = k01(o.t, .8);
  return <div style={{ position: 'absolute', right: SAFE.x - 20, bottom: SAFE.y - 20, width: W, height: H, opacity: o.alpha, ...enter(o.t) }}>
    <div style={{ ...kicker, fontSize: 19, letterSpacing: 3.5, color: MUTED, position: 'absolute', left: 0, right: 0, top: 18, textAlign: 'center', textShadow: HALO }}>
      Four-stroke cycle · <span style={{ color: ACC }}>Cyl {cyl.n}</span></div>
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <circle cx={cx} cy={cy} r={R} fill={PAPER} fillOpacity={.72} stroke={PALETTE.line} strokeWidth={1.5} />
      {PHASES.map((p: any) => <path key={p.key} d={arc(p.from + 2, p.to - 2, R)} fill="none" stroke={col(p.color)} strokeWidth={p.key === ph.key ? 9 : 3.5} opacity={p.key === ph.key ? 1 : .35} strokeLinecap="round" style={draw(k, 400)} />)}
      <path d={arc(VT.IVO - 720, VT.IVC, R - 20)} fill="none" stroke={PALETTE.flow.air} strokeWidth={li ? 3 : 1.5} opacity={li ? 1 : .4} />
      <path d={arc(VT.EVO, VT.EVC + 720, R - 29)} fill="none" stroke={PALETTE.flow.exhaust} strokeWidth={le ? 3 : 1.5} opacity={le ? 1 : .4} />
      {[0, 180, 360, 540].map(d => { const [x1, y1] = pt(d, R - 38), [x2, y2] = pt(d, R + 12); return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeOpacity={.3} strokeWidth={1.5} />; })}
      <line x1={cx} y1={cy} x2={mx} y2={my} stroke={INK} strokeWidth={1.5} opacity={.7} />
      <circle cx={mx} cy={my} r={8} fill={INK} stroke={PAPER} strokeWidth={2.5} />
      <text x={cx} y={cy + 6} textAnchor="middle" fontFamily={TYPE.display} fontWeight={700} fontSize={44} letterSpacing={-.4} fill={col(ph.color)}>{ph.name}</text>
      <text x={cx} y={cy + 38} textAnchor="middle" fontFamily={TYPE.text} fontWeight={500} fontSize={20} fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.floor(c)}° of 720°</text>
    </svg>
  </div>; };

/* ------------------------------------------------------------------ captions */
export const Caption: React.FC<{ fs: FrameState }> = ({ fs }) => { const l = fs.line; if (!l) return null;
  const a = clamp(Math.min((fs.t - l.start) / .2, (l.end + .25 - fs.t) / .2), 0, 1);
  return <div style={{ position: 'absolute', left: 0, right: 0, bottom: 48, display: 'flex', justifyContent: 'center', opacity: a }}>
    <div style={{ maxWidth: 1300, fontFamily: TYPE.text, fontWeight: 500, fontSize: 36, lineHeight: 1.3, color: INK, background: 'rgba(241,238,231,.9)', borderRadius: 8, padding: '8px 20px',
      boxShadow: `0 0 0 1px ${PALETTE.line}`, textAlign: 'center' }}>{l.text}</div></div>; };

export const OVERLAYS: Record<string, React.FC<P>> = { title: Title, chapter: Chapter, chain: Chain, label: Label, callouts: Callouts, sliderCrank: SliderCrank, strokeRing: StrokeRing, endCard: EndCard };
