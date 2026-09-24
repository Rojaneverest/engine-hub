/* Motion-graphics kit. Every component is a pure function of (frame state, overlay spec, local time).
   3D-anchored graphics read positions from the world, which has already been posed for this frame.

   House style: Inter (bold headers / light-to-medium body), ultra-thin 1px gold leaders with small
   circular terminals, line-draw reveals, and a 15-frame fade-slide-up-unblur entrance for all text.
   HUD panels are semi-transparent glass over the 3D frame. */
import React from 'react';
import * as THREE from 'three';
import { PALETTE, TYPE, SIZE, SAFE, FPS } from '../film/theme';
import { ease, T, FrameState } from '../film/timeline';
import { World } from '../three/world';
import { G, DEG, mod, clamp, dsdphi, cycleAngle, intakeLift, exhaustLift, VT, PHASES } from '../../src/core/sim';

type OV = { ov: any; t: number; alpha: number; from: number; to: number };
type P = { o: OV; fs: FrameState; world: World };
const ENTER = 15 / FPS;                                                    // 15-frame entrance
const k01 = (t: number, d = ENTER) => ease(clamp(t / d, 0, 1), 'out');
const at = (fs: FrameState, ref: any) => T(fs.shot, ref);
const GOLD = PALETTE.gold, INK = PALETTE.ink, HEAT = PALETTE.flow.power;
const TXT_SHADOW = '0 1px 2px rgba(2,6,23,.9), 0 4px 18px rgba(2,6,23,.65)';
const SVG_SHADOW = 'drop-shadow(0 1px 1.5px rgba(2,6,23,.95)) drop-shadow(0 3px 10px rgba(2,6,23,.6))';

/** Fade + slide up + un-blur over 15 frames (optionally delayed). */
const enter = (t: number, delay = 0, dist = 14): React.CSSProperties => { const k = k01(t - delay);
  return { opacity: k, transform: `translateY(${(1 - k) * dist}px)`, filter: k < 1 ? `blur(${(1 - k) * 8}px)` : undefined }; };
/** SVG line-draw: dash a path of approximate length `len` so it draws on as k goes 0 → 1. */
const draw = (k: number, len: number) => ({ strokeDasharray: `${len} ${len}`, strokeDashoffset: (1 - k) * len });
const glass = (extra: React.CSSProperties = {}): React.CSSProperties => ({ background: PALETTE.glass, border: `1px solid ${PALETTE.glassEdge}`, borderRadius: 14,
  backdropFilter: 'blur(16px) saturate(140%)', WebkitBackdropFilter: 'blur(16px) saturate(140%)', boxShadow: '0 10px 40px rgba(2,6,23,.45), inset 0 1px 0 rgba(255,255,255,.06)', ...extra });
const eyebrow: React.CSSProperties = { fontFamily: TYPE.text, fontWeight: 500, fontSize: 15, letterSpacing: 2.6, textTransform: 'uppercase', color: PALETTE.muted };

export const Title: React.FC<P> = ({ o }) => { const t = o.t, rule = k01(t - .25, .9);
  return <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', opacity: o.alpha,
    background: 'radial-gradient(ellipse 50% 34% at 50% 50%, rgba(2,6,23,.62) 0%, rgba(2,6,23,.3) 55%, rgba(2,6,23,0) 100%)' }}>
    <div style={{ ...enter(t), fontFamily: TYPE.text, fontWeight: 300, fontSize: 26, color: GOLD, letterSpacing: 9, textTransform: 'uppercase', textShadow: TXT_SHADOW, paddingLeft: 9 }}>{o.ov.kicker}</div>
    <svg width={520} height={24} style={{ margin: '18px 0 22px', overflow: 'visible' }}>
      <line x1={260 - 260 * rule} y1={12} x2={260 + 260 * rule} y2={12} stroke={GOLD} strokeWidth={1} opacity={.85} />
      <circle cx={260} cy={12} r={2.5} fill={GOLD} opacity={rule} />
    </svg>
    <div style={{ ...enter(t, .2, 18), fontFamily: TYPE.display, fontWeight: 700, fontSize: 92, lineHeight: 1.02, color: INK, letterSpacing: -2.2, textShadow: TXT_SHADOW, textAlign: 'center', maxWidth: 1400 }}>{o.ov.title}</div>
  </div>; };

export const Chapter: React.FC<P> = ({ o }) => { const t = o.t, rule = k01(t - .15, .6);
  return <div style={{ position: 'absolute', left: SAFE.x, top: SAFE.y, opacity: o.alpha, display: 'flex', alignItems: 'center', gap: 18, ...glass({ padding: '14px 26px 14px 22px' }), ...enter(t) }}>
    <span style={{ fontFamily: TYPE.text, fontWeight: 600, fontSize: 22, color: GOLD, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>{String(o.ov.num).padStart(2, '0')}</span>
    <svg width={44} height={2}><line x1={0} y1={1} x2={44 * rule} y2={1} stroke={GOLD} strokeWidth={1} /></svg>
    <span style={{ fontFamily: TYPE.text, fontWeight: 600, fontSize: 30, color: INK, letterSpacing: -.3 }}>{o.ov.title}</span>
  </div>; };

export const Chain: React.FC<P> = ({ o, fs }) => {
  const items = o.ov.items.map((it: any) => ({ ...it, lt: fs.t - at(fs, it.at) }));
  return <div style={{ position: 'absolute', left: SAFE.x, bottom: SAFE.y + 18, display: 'flex', alignItems: 'center', opacity: o.alpha }}>
    {items.map((it: any, i: number) => { const k = k01(it.lt, .5);
      return <React.Fragment key={i}>
        {i > 0 && <svg width={64} height={20} style={{ margin: '0 14px', overflow: 'visible', filter: SVG_SHADOW }}>
          <line x1={2} y1={10} x2={2 + 52 * k} y2={10} stroke={GOLD} strokeWidth={1.25} />
          <path d={`M${50 * k - 3},4 L${54 * k + 2},10 L${50 * k - 3},16`} fill="none" stroke={GOLD} strokeWidth={1.25} opacity={k} />
          <circle cx={2} cy={10} r={2} fill={GOLD} opacity={k} />
        </svg>}
        <span style={{ ...enter(it.lt), fontFamily: TYPE.display, fontWeight: 600, fontSize: 42, letterSpacing: -.6, color: it.color ?? INK, textShadow: TXT_SHADOW, display: 'inline-block' }}>{it.text}</span>
      </React.Fragment>; })}
  </div>; };

/** Callout pinned to a 3D anchor: circular terminal → 1px elbow leader that draws on → text entrance. */
export const Label: React.FC<P> = ({ o, world }) => {
  const p = world.project(o.ov.anchor); if (!p || !p.visible) return null;
  const t = o.t, side = o.ov.side === 'left' ? -1 : (o.ov.side === 'right' ? 1 : (p.x > SIZE.w * .62 ? -1 : 1));
  const ex = p.x + side * 64, ey = p.y - 54, tx = ex + side * 120;
  const kT = k01(t, .3), kL = k01(t - .08, .55), len = Math.hypot(ex - p.x, ey - p.y) + 120;
  return <>
    <svg width={SIZE.w} height={SIZE.h} style={{ position: 'absolute', inset: 0, opacity: o.alpha, overflow: 'visible', filter: SVG_SHADOW }}>
      <circle cx={p.x} cy={p.y} r={5.5 * (.6 + .4 * kT)} fill="none" stroke={GOLD} strokeWidth={1} opacity={kT} />
      <circle cx={p.x} cy={p.y} r={1.8} fill={GOLD} opacity={kT} />
      <polyline points={`${p.x + side * 5.5 * .7},${p.y - 5.5 * .7} ${ex},${ey} ${tx},${ey}`} fill="none" stroke={GOLD} strokeWidth={1} style={draw(kL, len)} />
      <circle cx={tx} cy={ey} r={1.6} fill={GOLD} opacity={kL > .98 ? 1 : 0} />
    </svg>
    <div style={{ position: 'absolute', top: ey - 22, ...(side > 0 ? { left: tx + 14 } : { right: SIZE.w - tx + 14 }), opacity: o.alpha, whiteSpace: 'nowrap',
      fontFamily: TYPE.text, fontWeight: 500, fontSize: 30, letterSpacing: -.2, color: INK, textShadow: TXT_SHADOW, ...enter(t, .3, 10) }}>{o.ov.text}</div>
  </>; };

/** Slider-crank explainer drawn over the sectioned cylinder, in exact registration with the 3D mechanism. */
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
  // stroke bracket beside the bore (world +x side)
  const tdcY = C.y + G.r + G.L + G.crown, bdcY = C.y - G.r + G.L + G.crown, bx = .66;
  const bT = pr(new THREE.Vector3(C.x + bx, tdcY, C.z)), bB = pr(new THREE.Vector3(C.x + bx, bdcY, C.z));
  // lever arm: perpendicular distance from crank centre to the rod's line of action (screen space)
  const dx = p.x - w.x, dy = p.y - w.y, L2 = dx * dx + dy * dy, u = ((c.x - w.x) * dx + (c.y - w.y) * dy) / L2, fx = w.x + u * dx, fy = w.y + u * dy;
  const rScreen = Math.hypot(p.x - c.x, p.y - c.y), lev = Math.abs(dsdphi(phi)) / G.r;              // 0 at TDC, ~1 near 75°
  const p2 = pr(pinW(A + DEG)), dir = Math.sign((p2.x - c.x) * (p.y - c.y) - (p2.y - c.y) * (p.x - c.x)) || 1;
  const arcR = rScreen * .55, a0 = Math.atan2(p.y - c.y, p.x - c.x), sweep = dir * (.25 + 1.4 * lev);
  const arc = (r: number, s: number, e2: number) => { let d = ''; for (let i = 0; i <= 24; i++) { const a = s + (e2 - s) * i / 24; d += (i ? 'L' : 'M') + (c.x + r * Math.cos(a)).toFixed(1) + ',' + (c.y + r * Math.sin(a)).toFixed(1); } return d; };
  const aEnd = a0 + sweep, tip = { x: c.x + arcR * Math.cos(aEnd), y: c.y + arcR * Math.sin(aEnd) }, tang = { x: -Math.sin(aEnd) * dir, y: Math.cos(aEnd) * dir };
  const aTorque = Math.max(aPush * (lev > .06 ? 1 : 0), aLever) * clamp(lev * 3, 0, 1);
  const fTop = pr(crownW.clone().add(new THREE.Vector3(0, .62, 0))), fBot = pr(crownW.clone().add(new THREE.Vector3(0, .06, 0)));
  const txt = (x: number, y: number, s: string, a: number, col = INK, anchor = 'start', size = 26, weight = 500) =>
    <text x={x} y={y} textAnchor={anchor as any} fontFamily={TYPE.text} fontWeight={weight} fontSize={size} letterSpacing={-.2} fill={col} opacity={a}>{s}</text>;
  const tick = (q: any, i: number) => <g key={i}><line x1={q.x - 12} y1={q.y} x2={q.x + 12} y2={q.y} stroke={GOLD} strokeWidth={1} /><circle cx={q.x} cy={q.y} r={2.2} fill={GOLD} /></g>;
  return <svg width={SIZE.w} height={SIZE.h} style={{ position: 'absolute', inset: 0, opacity: o.alpha, filter: SVG_SHADOW }}>
    <defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,1 L9,5 L0,9z" fill={HEAT} /></marker></defs>
    <g opacity={aTravel}>
      <line x1={bT.x} y1={bT.y} x2={bB.x} y2={bB.y} stroke={GOLD} strokeWidth={1} strokeDasharray="3 5" />
      {[bT, bB].map(tick)}
      {txt(bT.x + 22, bT.y + 8, 'Top dead centre', aTravel)}
      {txt(bB.x + 22, bB.y + 8, 'Bottom dead centre', aTravel)}
    </g>
    <g opacity={aCircle}>
      <path d={circ} fill="none" stroke={GOLD} strokeWidth={1} style={draw(k01(since(o.ov.circleAt), .9), clen + 2)} />
      <line x1={c.x} y1={c.y} x2={p.x} y2={p.y} stroke={GOLD} strokeWidth={2} strokeLinecap="round" />
      <circle cx={c.x} cy={c.y} r={3.5} fill={GOLD} /><circle cx={p.x} cy={p.y} r={7} fill="none" stroke={GOLD} strokeWidth={1.25} /><circle cx={p.x} cy={p.y} r={2} fill={GOLD} />
      {txt(c.x - rScreen - 26, c.y + 8, 'Crankpin path', aCircle, INK, 'end')}
    </g>
    <g opacity={aRod}>
      <line x1={w.x} y1={w.y} x2={p.x} y2={p.y} stroke={GOLD} strokeWidth={2} strokeLinecap="round" style={draw(k01(since(o.ov.rodAt), .6), Math.sqrt(L2) + 2)} />
      <circle cx={w.x} cy={w.y} r={7} fill="none" stroke={GOLD} strokeWidth={1.25} /><circle cx={w.x} cy={w.y} r={2} fill={GOLD} />
    </g>
    <g opacity={aPush}>
      <line x1={fTop.x} y1={fTop.y} x2={fBot.x} y2={fBot.y - 8} stroke={HEAT} strokeWidth={3} markerEnd="url(#ah)" />
      {txt(fTop.x + 20, fTop.y + 6, 'Gas pressure', aPush, HEAT, 'start', 26, 600)}
    </g>
    <g opacity={aTdc}>{txt(c.x + rScreen + 40, c.y - 8, 'Rod and crank in line', aTdc)}{txt(c.x + rScreen + 40, c.y + 26, 'No leverage', aTdc, HEAT, 'start', 26, 600)}</g>
    <g opacity={aLever * clamp(lev * 4, 0, 1)}>
      <line x1={c.x} y1={c.y} x2={fx} y2={fy} stroke={INK} strokeWidth={1} strokeDasharray="3 4" />
      <rect x={fx - 5} y={fy - 5} width={10} height={10} fill="none" stroke={INK} strokeWidth={1} transform={`rotate(${Math.atan2(dy, dx) / DEG} ${fx} ${fy})`} />
      {txt((c.x + fx) / 2 + 16, (c.y + fy) / 2 + 34, 'Lever arm', aLever)}
    </g>
    <g opacity={aTorque}>
      <path d={arc(arcR, a0, aEnd)} fill="none" stroke={HEAT} strokeWidth={3} strokeLinecap="round" />
      <line x1={tip.x - tang.x * 2} y1={tip.y - tang.y * 2} x2={tip.x + tang.x * 6} y2={tip.y + tang.y * 6} stroke={HEAT} strokeWidth={3} markerEnd="url(#ah)" />
      {txt(c.x - rScreen - 26, c.y + 46, 'Turning force', aTorque * (aLever > .5 ? 1 : 0), HEAT, 'end', 26, 600)}
    </g>
  </svg>; };

/** 720° cycle ring on a glass panel: strokes, valve events, and where cylinder N is right now. */
export const StrokeRing: React.FC<P> = ({ o, fs, world }) => {
  const cyl = world.engine!.cyl[o.ov.cyl ?? 0], c = cycleAngle(cyl, fs.theta);
  const W = 340, H = 380, cx = W / 2, cy = 206, R = 118;
  const ang = (d: number) => (-90 + d / 2) * DEG; const pt = (d: number, r: number) => [cx + r * Math.cos(ang(d)), cy + r * Math.sin(ang(d))];
  const arc = (d0: number, d1: number, r: number) => { let s = ''; const n = Math.max(2, Math.ceil(Math.abs(d1 - d0) / 6)); for (let i = 0; i <= n; i++) { const [x, y] = pt(d0 + (d1 - d0) * i / n, r); s += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1); } return s; };
  const ph = PHASES[Math.floor(c / 180)], col = (v: string) => (PALETTE.flow as any)[v.replace('--', '')] ?? INK;
  const [mx, my] = pt(c, R), li = intakeLift(c) > .003, le = exhaustLift(c) > .003;
  return <div style={{ position: 'absolute', right: SAFE.x, bottom: SAFE.y, width: W, height: H, opacity: o.alpha, ...glass(), ...enter(o.t) }}>
    <div style={{ ...eyebrow, position: 'absolute', left: 24, top: 20 }}>Four-stroke cycle</div>
    <div style={{ ...eyebrow, position: 'absolute', right: 24, top: 20, color: GOLD }}>Cyl {cyl.n}</div>
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={PALETTE.line} strokeWidth={1} />
      {PHASES.map((p: any) => <path key={p.key} d={arc(p.from + 2, p.to - 2, R)} fill="none" stroke={col(p.color)} strokeWidth={p.key === ph.key ? 7 : 3} opacity={p.key === ph.key ? 1 : .4} strokeLinecap="round" />)}
      <path d={arc(VT.IVO - 720, VT.IVC, R - 18)} fill="none" stroke={PALETTE.flow.air} strokeWidth={li ? 2.5 : 1} opacity={li ? 1 : .45} />
      <path d={arc(VT.EVO, VT.EVC + 720, R - 26)} fill="none" stroke={PALETTE.flow.exhaust} strokeWidth={le ? 2.5 : 1} opacity={le ? 1 : .45} />
      {[0, 180, 360, 540].map(d => { const [x1, y1] = pt(d, R - 34), [x2, y2] = pt(d, R + 10); return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke={PALETTE.line} strokeWidth={1} />; })}
      <line x1={cx} y1={cy} x2={mx} y2={my} stroke={GOLD} strokeWidth={1} opacity={.7} />
      <circle cx={mx} cy={my} r={7} fill={GOLD} stroke="#020617" strokeWidth={2} />
      <text x={cx} y={cy + 2} textAnchor="middle" fontFamily={TYPE.display} fontWeight={700} fontSize={34} letterSpacing={-.6} fill={col(ph.color)}>{ph.name}</text>
      <text x={cx} y={cy + 32} textAnchor="middle" fontFamily={TYPE.text} fontWeight={400} fontSize={19} fill={PALETTE.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.floor(c)}° of 720°</text>
    </svg>
  </div>; };

/** Telemetry HUD: crank-angle counter + mini dial on a glass card (top right). */
export const Hud: React.FC<P> = ({ o, fs, world }) => {
  const cyl = world.engine!.cyl[o.ov.cyl ?? 0], crank = mod(fs.theta + cyl.throw - cyl.bank, 360), c = cycleAngle(cyl, fs.theta);
  const r = 26, a = (crank - 90) * DEG;
  return <div style={{ position: 'absolute', right: SAFE.x, top: SAFE.y, opacity: o.alpha, display: 'flex', alignItems: 'center', gap: 20, ...glass({ padding: '16px 24px 16px 20px' }), ...enter(o.t) }}>
    <svg width={2 * r + 8} height={2 * r + 8}>
      <circle cx={r + 4} cy={r + 4} r={r} fill="none" stroke={PALETTE.line} strokeWidth={1} />
      {[0, 90, 180, 270].map(d => <line key={d} x1={r + 4 + (r - 5) * Math.cos((d - 90) * DEG)} y1={r + 4 + (r - 5) * Math.sin((d - 90) * DEG)} x2={r + 4 + r * Math.cos((d - 90) * DEG)} y2={r + 4 + r * Math.sin((d - 90) * DEG)} stroke={PALETTE.muted} strokeWidth={1} />)}
      <line x1={r + 4} y1={r + 4} x2={r + 4 + (r - 3) * Math.cos(a)} y2={r + 4 + (r - 3) * Math.sin(a)} stroke={GOLD} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={r + 4} cy={r + 4} r={2.5} fill={GOLD} />
    </svg>
    <div>
      <div style={eyebrow}>Crank angle · Cyl {cyl.n}</div>
      <div style={{ fontFamily: TYPE.text, fontWeight: 600, fontSize: 40, color: INK, letterSpacing: -1, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{crank.toFixed(1).padStart(5, '0')}°</div>
      <div style={{ fontFamily: TYPE.text, fontWeight: 300, fontSize: 17, color: PALETTE.muted, fontVariantNumeric: 'tabular-nums' }}>Cycle {Math.floor(c)}° / 720°</div>
    </div>
  </div>; };

export const EndCard: React.FC<P> = ({ o }) => { const t = o.t, rule = k01(t - .3, .9);
  return <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', opacity: o.alpha, background: `rgba(2,6,23,${.6 * k01(t, 1)})` }}>
    <div style={{ ...enter(t), fontFamily: TYPE.text, fontWeight: 300, fontSize: 24, letterSpacing: 8, textTransform: 'uppercase', color: GOLD, paddingLeft: 8 }}>{o.ov.kicker}</div>
    <svg width={360} height={24} style={{ margin: '14px 0 18px' }}><line x1={180 - 180 * rule} y1={12} x2={180 + 180 * rule} y2={12} stroke={GOLD} strokeWidth={1} /></svg>
    <div style={{ ...enter(t, .25, 16), fontFamily: TYPE.display, fontWeight: 700, fontSize: 70, letterSpacing: -1.6, color: INK, textAlign: 'center', maxWidth: 1300, lineHeight: 1.05 }}>{o.ov.title}</div>
  </div>; };

export const Caption: React.FC<{ fs: FrameState }> = ({ fs }) => { const l = fs.line; if (!l) return null;
  const a = clamp(Math.min((fs.t - l.start) / .2, (l.end + .25 - fs.t) / .2), 0, 1);
  return <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, display: 'flex', justifyContent: 'center', opacity: a }}>
    <div style={{ maxWidth: 1300, fontFamily: TYPE.text, fontWeight: 400, fontSize: 34, lineHeight: 1.32, color: '#fff', ...glass({ borderRadius: 10, padding: '8px 18px', background: 'rgba(2,6,23,.6)' }), textAlign: 'center' }}>{l.text}</div></div>; };

export const OVERLAYS: Record<string, React.FC<P>> = { title: Title, chapter: Chapter, chain: Chain, label: Label, sliderCrank: SliderCrank, strokeRing: StrokeRing, hud: Hud, endCard: EndCard };
